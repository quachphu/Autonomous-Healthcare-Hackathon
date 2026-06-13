import { useEffect, useRef, useState } from 'react'
import type { AgentSummary } from '../../lib/api'

export type AgentStatus = 'connecting' | 'listening' | 'speaking' | 'thinking' | 'error' | 'ended'

export interface TranscriptLine {
  role: 'agent' | 'patient'
  text: string
}

interface Props {
  /** Ephemeral OpenAI Realtime client secret from /checkup/realtime/start. */
  token: string
  model: string
  /** Stop + tear down the connection when this flips to false. */
  active: boolean
  onStatus: (s: AgentStatus) => void
  onLine: (line: TranscriptLine) => void
  onSummary: (summary: AgentSummary) => void
  onEmergency: (reason: string) => void
  onError: (message: string) => void
}

const REALTIME_BASE = 'https://api.openai.com/v1/realtime'

// Pull a {"action":"emergency_call","reason":"..."} object out of an agent message.
function detectEmergency(text: string): string | null {
  const m = text.match(/\{[^{}]*"action"\s*:\s*"emergency_call"[^{}]*\}/)
  if (!m) return null
  try {
    const obj = JSON.parse(m[0])
    return obj.reason || 'patient_request'
  } catch {
    return 'patient_request'
  }
}

// Pull the <SUMMARY>{...}</SUMMARY> JSON block out of the agent's closing message.
function detectSummary(text: string): AgentSummary | null {
  const m = text.match(/<SUMMARY>([\s\S]*?)<\/SUMMARY>/)
  if (!m) return null
  try {
    return JSON.parse(m[1].trim()) as AgentSummary
  } catch {
    return null
  }
}

export default function MaternaVoiceWidget({
  token,
  model,
  active,
  onStatus,
  onLine,
  onSummary,
  onEmergency,
  onError,
}: Props) {
  const [status, setStatus] = useState<AgentStatus>('connecting')
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const dcRef = useRef<RTCDataChannel | null>(null)
  const micRef = useRef<MediaStream | null>(null)
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const agentBufferRef = useRef('')
  const emittedSummaryRef = useRef(false)

  const setBoth = (s: AgentStatus) => {
    setStatus(s)
    onStatus(s)
  }

  // Tear down everything (idempotent).
  const teardown = () => {
    dcRef.current?.close()
    pcRef.current?.getSenders().forEach((s) => s.track?.stop())
    pcRef.current?.close()
    micRef.current?.getTracks().forEach((t) => t.stop())
    dcRef.current = null
    pcRef.current = null
    micRef.current = null
  }

  useEffect(() => {
    if (!active) {
      teardown()
      return
    }
    let cancelled = false

    async function connect() {
      try {
        const pc = new RTCPeerConnection()
        pcRef.current = pc

        // Remote audio (the agent's voice).
        const audioEl = new Audio()
        audioEl.autoplay = true
        audioElRef.current = audioEl
        pc.ontrack = (e) => {
          audioEl.srcObject = e.streams[0]
        }

        // Local mic.
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          mic.getTracks().forEach((t) => t.stop())
          return
        }
        micRef.current = mic
        mic.getTracks().forEach((t) => pc.addTrack(t, mic))

        // Events channel.
        const dc = pc.createDataChannel('oai-events')
        dcRef.current = dc
        dc.onopen = () => {
          // Enable user-speech transcription + server VAD, then ask the agent to greet first.
          dc.send(
            JSON.stringify({
              type: 'session.update',
              session: {
                input_audio_transcription: { model: 'whisper-1' },
                turn_detection: { type: 'server_vad', silence_duration_ms: 700 },
              },
            }),
          )
          dc.send(JSON.stringify({ type: 'response.create' }))
        }
        dc.onmessage = (e) => handleEvent(e.data)

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)

        const resp = await fetch(`${REALTIME_BASE}?model=${encodeURIComponent(model)}`, {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/sdp',
          },
        })
        if (!resp.ok) {
          throw new Error(`Realtime handshake failed (${resp.status})`)
        }
        const answer = { type: 'answer' as const, sdp: await resp.text() }
        await pc.setRemoteDescription(answer)
        if (!cancelled) setBoth('listening')
      } catch (err) {
        if (cancelled) return
        setBoth('error')
        onError(err instanceof Error ? err.message : 'Voice connection failed')
        teardown()
      }
    }

    function handleEvent(raw: string) {
      let evt: Record<string, unknown>
      try {
        evt = JSON.parse(raw)
      } catch {
        return
      }
      const type = evt.type as string

      switch (type) {
        case 'input_audio_buffer.speech_started':
          setBoth('listening')
          break
        case 'response.created':
          setBoth('thinking')
          break
        case 'response.audio.delta':
        case 'output_audio_buffer.started':
          setBoth('speaking')
          break
        case 'response.audio_transcript.delta':
          agentBufferRef.current += (evt.delta as string) || ''
          break
        case 'response.audio_transcript.done': {
          const text = (evt.transcript as string) || agentBufferRef.current
          agentBufferRef.current = ''
          handleAgentMessage(text)
          break
        }
        case 'conversation.item.input_audio_transcription.completed': {
          const text = (evt.transcript as string) || ''
          if (text.trim()) onLine({ role: 'patient', text: text.trim() })
          break
        }
        case 'error':
          // Non-fatal — the model surfaces recoverable errors here too.
          break
        default:
          break
      }
    }

    function handleAgentMessage(text: string) {
      const reason = detectEmergency(text)
      if (reason) onEmergency(reason)

      const summary = detectSummary(text)
      if (summary && !emittedSummaryRef.current) {
        emittedSummaryRef.current = true
        onSummary(summary)
      }

      // Show a cleaned version (strip the machine blocks) in the transcript.
      const display = text
        .replace(/<SUMMARY>[\s\S]*?<\/SUMMARY>/g, '')
        .replace(/\{[^{}]*"action"\s*:\s*"emergency_call"[^{}]*\}/g, '')
        .trim()
      if (display) onLine({ role: 'agent', text: display })
      setBoth('listening')
    }

    connect()
    return () => {
      cancelled = true
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, token, model])

  return <StatusOrb status={status} />
}

function StatusOrb({ status }: { status: AgentStatus }) {
  const cfg: Record<AgentStatus, { label: string; ring: string; dot: string }> = {
    connecting: { label: 'Connecting…', ring: 'border-nn-periwinkle', dot: 'bg-nn-periwinkle' },
    listening: { label: 'Listening — speak naturally', ring: 'border-emerald-300', dot: 'bg-emerald-500' },
    speaking: { label: 'Materna is speaking', ring: 'border-nn-deep-blue', dot: 'bg-nn-deep-blue' },
    thinking: { label: 'Thinking…', ring: 'border-amber-300', dot: 'bg-amber-400' },
    error: { label: 'Voice unavailable', ring: 'border-red-300', dot: 'bg-red-400' },
    ended: { label: 'Conversation complete', ring: 'border-emerald-300', dot: 'bg-emerald-500' },
  }
  const c = cfg[status]
  const animate = status === 'listening' || status === 'speaking' || status === 'thinking'
  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative flex h-20 w-20 items-center justify-center rounded-full border-4 ${c.ring}`}>
        {animate && (
          <span className={`absolute inset-0 rounded-full ${c.dot} opacity-20 animate-ping`} />
        )}
        <span className={`h-10 w-10 rounded-full ${c.dot} ${animate ? 'animate-pulse' : ''}`} />
      </div>
      <p className="text-xs font-semibold text-nn-navy">{c.label}</p>
    </div>
  )
}
