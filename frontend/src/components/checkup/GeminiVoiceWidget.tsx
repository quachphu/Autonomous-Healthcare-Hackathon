/**
 * GeminiVoiceWidget  (now powered by xAI Grok Voice Agent)
 *
 * Connects to /api/checkup/xai-voice/ws — a FastAPI WebSocket proxy that
 * relays audio to wss://api.x.ai/v1/realtime (grok-voice-latest).
 *
 * Data flow (per xAI Voice Agent docs):
 *   Mic → ScriptProcessor → downsample 16 kHz → Int16 → raw bytes → WS backend → xAI
 *   xAI response.output_audio.delta (base64 PCM) → backend decodes → raw bytes → AudioContext
 *   JSON events: setupComplete / turnComplete / inputText / outputText
 *
 * Fallback: text Gemini API + backend edge-tts + SpeechRecognition
 *   (activates automatically if xAI WebSocket fails)
 */

import { useEffect, useRef } from 'react'
import type { AgentStatus, TranscriptLine } from './MaternaVoiceWidget'
import type { AgentSummary } from '../../lib/api'

// ── Audio constants ────────────────────────────────────────────────────────────
const MIC_RATE = 16_000   // xAI input: 16 kHz
const OUT_RATE = 24_000   // xAI output: 24 kHz

// ── PCM helpers ────────────────────────────────────────────────────────────────

/** Downsample Float32 from device rate → 16 kHz (averaging). */
function downsample(input: Float32Array, fromRate: number): Float32Array {
  if (fromRate === MIC_RATE) return input
  const ratio     = fromRate / MIC_RATE
  const newLength = Math.floor(input.length / ratio)
  const out       = new Float32Array(newLength)
  for (let i = 0; i < newLength; i++) {
    const lo = Math.round(i * ratio)
    const hi = Math.round((i + 1) * ratio)
    let accum = 0, count = 0
    for (let j = lo; j < hi && j < input.length; j++) { accum += input[j]; count++ }
    out[i] = count ? accum / count : 0
  }
  return out
}

/** Float32 PCM → Int16 ArrayBuffer. */
function toInt16Buffer(samples: Float32Array): ArrayBuffer {
  const buf = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++)
    buf[i] = Math.min(1, Math.max(-1, samples[i])) * (samples[i] < 0 ? 0x8000 : 0x7fff)
  return buf.buffer
}

/** Play a raw 24 kHz Int16 PCM ArrayBuffer through an AudioContext.
 *  Awaits context.resume() before scheduling so audio doesn't play silently
 *  when the context was created after the browser's autoplay window. */
function playPCM(buf: ArrayBuffer, ctx: AudioContext, nextRef: { current: number }) {
  const schedule = () => {
    const pcm = new Int16Array(buf)
    const f32 = new Float32Array(pcm.length)
    for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768
    const ab = ctx.createBuffer(1, f32.length, OUT_RATE)
    ab.getChannelData(0).set(f32)
    const src = ctx.createBufferSource()
    src.buffer = ab
    src.connect(ctx.destination)
    const now   = ctx.currentTime
    const start = Math.max(now + 0.02, nextRef.current)
    src.start(start)
    nextRef.current = start + ab.duration
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().then(schedule)
  } else {
    schedule()
  }
}

// ── Minimal SpeechRecognition types (fallback) ────────────────────────────────
interface ISRResult { isFinal: boolean; [i: number]: { transcript: string } }
interface ISREvent  { resultIndex: number; results: ISRResult[] }
interface ISR extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean
  onresult: ((e: ISREvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void; stop(): void
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  apiKey: string          // Kept for interface compat; key stays server-side
  systemPrompt: string
  sessionId: string       // Used to look up prompt server-side (avoids URL length limits)
  active: boolean
  onStatus: (s: AgentStatus) => void
  onLine: (l: TranscriptLine) => void
  onSummary: (s: AgentSummary) => void
  onError: (msg: string) => void
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function GeminiVoiceWidget({
  systemPrompt, sessionId, active, onStatus, onLine, onSummary, onError,
}: Props) {
  const onStatusRef  = useRef(onStatus)
  const onLineRef    = useRef(onLine)
  const onSummaryRef = useRef(onSummary)
  const onErrorRef   = useRef(onError)
  const promptRef    = useRef(systemPrompt)
  const sessionIdRef = useRef(sessionId)

  useEffect(() => { onStatusRef.current  = onStatus  }, [onStatus])
  useEffect(() => { onLineRef.current    = onLine    }, [onLine])
  useEffect(() => { onSummaryRef.current = onSummary }, [onSummary])
  useEffect(() => { onErrorRef.current   = onError   }, [onError])
  useEffect(() => { promptRef.current    = systemPrompt }, [systemPrompt])
  useEffect(() => { sessionIdRef.current = sessionId  }, [sessionId])

  const startedRef = useRef(false)

  useEffect(() => {
    console.log('[xAI] useEffect fired — active:', active, 'started:', startedRef.current)
    if (!active || startedRef.current) return
    startedRef.current = true
    console.log('[xAI] Starting voice session, sessionId:', sessionIdRef.current)

    // ── session-scoped mutable state ─────────────────────────────────────────
    let stopped       = false
    let ws: WebSocket | null    = null
    let micCtx: AudioContext | null  = null
    let micStream: MediaStream | null = null
    let playCtx: AudioContext | null  = null
    const nextStart = { current: 0 }

    // Accumulated transcript for summary extraction.
    const transcript: { role: string; text: string }[] = []

    const authHeader = `Bearer ${localStorage.getItem('token') ?? ''}`
    const st  = (s: AgentStatus) => { if (!stopped) onStatusRef.current(s) }
    const ln  = (l: TranscriptLine) => { if (!stopped) onLineRef.current(l) }

    // ── Summary extraction (reuses the Gemini text endpoint) ─────────────────
    const extractSummary = async () => {
      if (transcript.length < 2) return
      try {
        const r = await fetch('/api/checkup/gemini/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: authHeader },
          body: JSON.stringify({
            message:
              'Based on our conversation, return ONLY valid JSON (no markdown):\n' +
              '{"mood_label":"<word>","mood_score":<1-100>,"edinburgh_score":<0-30>,' +
              '"symptom_flags":["back_pain"|"fatigue"|"headache"|"swelling"|"nausea"|"anxiety"|"mood_concern"|"sleep_disturbance"],' +
              '"urgency_level":"<normal|monitor|elevated|urgent>",' +
              '"patient_quote":"<short quote>","plain_summary":"<2-3 sentences>",' +
              '"clinical_note":"<brief note>","hospital_note":"<triage summary>"}',
            history: transcript,
            system_prompt: 'Extract structured data from this maternal health conversation.',
          }),
        })
        if (!r.ok) return
        const d = (await r.json()) as { response: string }
        const m = d.response?.match(/\{[\s\S]*\}/)
        if (m) onSummaryRef.current(JSON.parse(m[0]) as AgentSummary)
      } catch { /* ignore */ }
    }

    // ── Mic → WebSocket (raw 16 kHz Int16 PCM bytes) ──────────────────────────
    const startMic = async (socket: WebSocket) => {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        micCtx    = new AudioContext()
        const source    = micCtx.createMediaStreamSource(micStream)
        const processor = micCtx.createScriptProcessor(4096, 1, 1)
        processor.onaudioprocess = (e) => {
          if (stopped || socket.readyState !== WebSocket.OPEN) return
          const raw = e.inputBuffer.getChannelData(0)
          const ds  = downsample(new Float32Array(raw), micCtx!.sampleRate)
          socket.send(toInt16Buffer(ds))   // raw binary — backend encodes as base64 for xAI
        }
        const mute = micCtx.createGain(); mute.gain.value = 0
        processor.connect(mute); mute.connect(micCtx.destination)
        source.connect(processor)
      } catch {
        onErrorRef.current('Microphone access failed.')
      }
    }

    // ── xAI Grok Voice Agent (via backend proxy) ──────────────────────────────
    const tryXAI = (): Promise<boolean> =>
      new Promise((resolve) => {
        // Connect directly to backend port 8000 (bypasses Vite proxy which drops WS)
        const sid    = sessionIdRef.current
        // In dev: connect directly to localhost (bypasses Vite proxy).
        // In production: use VITE_WS_URL env var (wss://your-backend.railway.app).
        const wsBase = import.meta.env.VITE_WS_URL
          || (import.meta.env.VITE_API_URL
              ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws')
              : 'ws://localhost:8000')
        const wsUrl  = `${wsBase}/api/checkup/xai-voice/ws${sid ? `?session_id=${sid}` : ''}`
        console.log('[xAI] Connecting to backend:', wsUrl)
        const socket = new WebSocket(wsUrl)
        socket.binaryType = 'arraybuffer'
        ws = socket

        let ready     = false
        let resolved  = false
        const done = (val: boolean) => { if (!resolved) { resolved = true; resolve(val) } }

        // If we don't get setupComplete within 20 s, fall back.
        const timeout = setTimeout(() => { if (!ready) { socket.close(); done(false) } }, 20_000)

        socket.onerror = (e) => { console.error('[xAI] WebSocket error', e); clearTimeout(timeout); done(false) }

        socket.onclose = (e) => {
          clearTimeout(timeout)
          console.log('[xAI] WebSocket closed', e.code, e.reason)
          if (!ready) done(false)
          else void extractSummary()
        }

        socket.onmessage = (event) => {
          // Binary frame → PCM audio from xAI (24 kHz Int16)
          if (event.data instanceof ArrayBuffer) {
            // playCtx should already exist from setupComplete; create fallback if not
            if (!playCtx) {
              playCtx = new AudioContext({ sampleRate: OUT_RATE })
              void playCtx.resume()
            }
            playPCM(event.data, playCtx, nextStart)
            st('speaking')
            return
          }

          // Text frame → JSON event from backend
          let msg: Record<string, string>
          try { msg = JSON.parse(event.data as string) as Record<string, string> }
          catch { return }

          switch (msg.type) {
            case 'setupComplete':
              ready = true
              done(true)
              // Create playback context eagerly here (close to user gesture)
              // so the browser's autoplay policy doesn't block later audio.
              if (!playCtx) {
                playCtx = new AudioContext({ sampleRate: OUT_RATE })
                void playCtx.resume()
              }
              void startMic(socket)
              st('listening')
              break
            case 'turnComplete':
              st('listening')
              break
            case 'speechStarted':
              // User started speaking → clear upcoming queued audio (barge-in)
              nextStart.current = 0
              st('listening')
              break
            case 'outputText':
              if (msg.outputText) {
                ln({ role: 'agent', text: msg.outputText })
                transcript.push({ role: 'model', text: msg.outputText })
              }
              break
            case 'inputText':
              if (msg.inputText) {
                ln({ role: 'patient', text: msg.inputText })
                transcript.push({ role: 'patient', text: msg.inputText })
              }
              break
            case 'emergency':
              // Real-time emergency: Twilio call + email already firing on backend
              onErrorRef.current(
                '🚨 Emergency detected — calling your support contact and sending alert email now.'
              )
              break
            case 'error':
              onErrorRef.current(msg.message ?? 'xAI voice error')
              break
          }
        }

        st('connecting')
      })

    // ── Text fallback (Gemini text + edge-tts + SpeechRecognition) ───────────
    const runTextFallback = async () => {
      const speak = async (text: string) => {
        if (stopped) return
        st('speaking'); ln({ role: 'agent', text })
        transcript.push({ role: 'model', text })
        try {
          const r = await fetch('/api/tts/speak', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({ text, voice: 'en-US-AvaNeural' }),
          })
          if (r.ok) {
            const blob  = await r.blob()
            const url   = URL.createObjectURL(blob)
            const audio = new Audio(url)
            await Promise.race([
              new Promise<void>((res) => {
                audio.onended = () => { URL.revokeObjectURL(url); res() }
                audio.onerror = () => { URL.revokeObjectURL(url); res() }
                void audio.play().catch(() => res())
              }),
              new Promise<void>((res) => setTimeout(res, 20_000)),
            ])
          }
        } catch { /* ignore */ }
        // 600 ms gap: Chrome flushes audio pipeline before SpeechRecognition starts.
        await new Promise<void>((res) => setTimeout(res, 600))
        if (!stopped) st('listening')
      }

      const listen = (): Promise<string> =>
        new Promise((resolve) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const w = window as any
          const SR = (w.SpeechRecognition ?? w.webkitSpeechRecognition) as ((new () => ISR) | undefined)
          if (!SR) { resolve(''); return }
          const rec = new SR()
          rec.lang = 'en-US'; rec.continuous = true; rec.interimResults = true
          let gathered = '', silenceTimer: ReturnType<typeof setTimeout> | undefined, done = false
          const finish = () => {
            if (done) return; done = true
            clearTimeout(silenceTimer)
            try { rec.stop() } catch { /* ignore */ }
            resolve(gathered.trim())
          }
          rec.onresult = (e) => {
            let interim = ''
            for (let i = e.resultIndex; i < e.results.length; i++) {
              if (e.results[i].isFinal) gathered += e.results[i][0].transcript + ' '
              else interim += e.results[i][0].transcript
            }
            const preview = (gathered + interim).trim()
            if (preview) ln({ role: 'patient', text: preview })
            clearTimeout(silenceTimer)
            silenceTimer = setTimeout(finish, 2000)
          }
          rec.onerror = () => finish()
          rec.onend   = () => finish()
          try { rec.start() } catch { resolve(''); return }
          setTimeout(finish, 12_000)
        })

      const askGemini = async (msg: string): Promise<string> => {
        try {
          const r = await fetch('/api/checkup/gemini/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: authHeader },
            body: JSON.stringify({
              message: msg,
              history: transcript.map((h) => ({ role: h.role, text: h.text })),
              system_prompt: promptRef.current,
            }),
          })
          if (!r.ok) return "I'm here — tell me how you're feeling today."
          const d = (await r.json()) as { response: string }
          return d.response ?? "I didn't catch that. How are you feeling?"
        } catch { return "I'm having trouble connecting. How are you feeling?" }
      }

      await speak("Good morning! I'm Materna, your wellness companion. How are you feeling today?")
      let silenceCount = 0
      while (!stopped) {
        const userText = (await listen()).trim()
        if (stopped) break
        if (!userText) {
          silenceCount++
          if (silenceCount >= 2) { await speak("I'm still here — take your time. How are you feeling?"); silenceCount = 0 }
          continue
        }
        silenceCount = 0
        if (/\b(done|finish|stop|that'?s all|goodbye|bye)\b/i.test(userText)) break
        transcript.push({ role: 'patient', text: userText })
        ln({ role: 'patient', text: userText })
        const reply = await askGemini(userText)
        if (stopped) break
        await speak(reply)
      }
      void extractSummary()
    }

    // ── Entry: try xAI first, fall back to text ───────────────────────────────
    void (async () => {
      const ok = await tryXAI()
      if (!ok && !stopped) void runTextFallback()
    })()

    return () => {
      stopped = true
      startedRef.current = false  // allow restart if component remounts
      ws?.close(1000, 'session_ended')
      micStream?.getTracks().forEach((t) => t.stop())
      micCtx?.close()
      playCtx?.close()
    }
  }, [active])

  return null
}
