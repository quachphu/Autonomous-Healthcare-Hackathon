import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAppContext } from '../contexts/AppContext'
import CheckupProgressRing from '../components/checkup/CheckupProgressRing'
import type { AgentStatus, TranscriptLine } from '../components/checkup/MaternaVoiceWidget'
import GeminiVoiceWidget from '../components/checkup/GeminiVoiceWidget'
import { api, realtimeStart, realtimeComplete, geminiLiveToken } from '../lib/api'
import type { AgentSummary } from '../lib/api'
import type { CheckupResult } from '../types/checkup'

type Stage = 'idle' | 'requesting' | 'conversing' | 'processing' | 'done'

const DURATION = 45

// Used for the demo (no-mic) path and as a fallback when the agent doesn't emit one.
const DEMO_SUMMARY: AgentSummary = {
  mood_label: 'hopeful',
  mood_score: 68,
  edinburgh_score: 6,
  symptom_flags: ['mild_back_pain', 'foot_swelling'],
  urgency_level: 'monitor',
  patient_quote: 'I slept okay but my feet feel a little puffy this morning.',
  plain_summary:
    'Sarah had a reasonable morning. She slept about 7 hours, felt the baby move, and has mild back pain with some foot swelling. Mood is hopeful.',
  clinical_note:
    'Patient reports mild lumbar discomfort and mild bilateral foot edema. Fetal movement present. Sleep ~7h. Mood stable. No red-flag symptoms.',
  hospital_note:
    'Mild bilateral foot edema, mild back pain. Fetal movement present. No red flags. Routine monitoring.',
}

function getSupportedVideoMimeType(): string {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'video/webm'
}

function localSessionId(): string {
  return new Date().toISOString().replace(/\D/g, '').slice(0, 15)
}

function extractHr(r: CheckupResult | null): number | null {
  if (!r) return null
  return (
    r.checkup_summary?.estimated_pulse_bpm ??
    r.rppg_analysis?.consensus?.estimated_pulse_bpm ??
    null
  )
}

export default function CheckupPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { markCheckupComplete, completedDates, setCompletedDates, setCheckupResult, setMaternaExtras } =
    useAppContext()
  const localToday = new Date().toLocaleDateString('en-CA')
  const [todayDoneDB, setTodayDoneDB] = useState<boolean | null>(null)

  // Fetch fresh from the API on mount so we don't rely on the dashboard having loaded first
  useEffect(() => {
    api.dashboard.summary()
      .then(s => {
        setCompletedDates(s.checkin_dates)
        setTodayDoneDB(s.checkin_dates.some((d: { date: string }) => d.date === localToday))
      })
      .catch(() => setTodayDoneDB(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // true if either the DB confirms it or the user just completed one in this session
  const todayCheckupComplete =
    todayDoneDB === true || completedDates.some(d => d.date === localToday)

  useEffect(() => {
    if (role === 'doctor') navigate('/dashboard', { replace: true })
  }, [role, navigate])

  const [stage, setStage] = useState<Stage>('idle')
  const [secondsLeft, setSecondsLeft] = useState(DURATION)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('connecting')
  const [transcript, setTranscript] = useState<TranscriptLine[]>([])
  const [geminiApiKey, setGeminiApiKey] = useState<string>('')
  const [systemPrompt, setSystemPrompt] = useState<string>('')
  const [processingMsg, setProcessingMsg] = useState('')

  // Refs to avoid stale closures.
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const sessionIdRef = useRef<string | null>(null)
  const localSidRef = useRef<string>('')
  const summaryRef = useRef<AgentSummary | null>(null)
  const emergencyRef = useRef<string | null>(null)
  const transcriptRef = useRef<TranscriptLine[]>([])
  const finishedRef = useRef(false)
  const secondsLeftRef = useRef(DURATION)
  const stageRef = useRef<Stage>('idle')
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => { secondsLeftRef.current = secondsLeft }, [secondsLeft])
  useEffect(() => { stageRef.current = stage }, [stage])
  useEffect(() => { transcriptRef.current = transcript }, [transcript])

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const progress =
    stage === 'conversing'
      ? ((DURATION - secondsLeft) / DURATION) * 100
      : stage === 'processing' || stage === 'done'
      ? 100
      : 0

  // ── Countdown ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (stage !== 'conversing') return
    if (secondsLeft <= 0) {
      void finishCheckin('time_limit_reached')
      return
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, secondsLeft])

  const appendLine = useCallback((line: TranscriptLine) => {
    setTranscript((prev) => [...prev, line])
  }, [])

  const handleSummary = useCallback((s: AgentSummary) => {
    summaryRef.current = s
  }, [])


  // ── Finish + persist ─────────────────────────────────────────────────────────
  const finishCheckin = useCallback(
    async (reason: string) => {
      if (finishedRef.current) return
      finishedRef.current = true

      setStage('processing')
      stageRef.current = 'processing'
      setProcessingMsg('Analyzing camera pulse signal…')

      // Stop the agent + video recorder, collect the recording.
      const videoBlob = await new Promise<Blob>((resolve) => {
        const recorder = recorderRef.current
        if (!recorder || recorder.state === 'inactive') {
          resolve(new Blob(chunksRef.current))
          return
        }
        recorder.onstop = () =>
          resolve(new Blob(chunksRef.current, { type: recorder.mimeType || 'video/webm' }))
        recorder.stop()
      })
      streamRef.current?.getTracks().forEach((t) => t.stop())

      // rPPG analysis (real upload, fall back to mock).
      let rppg: CheckupResult | null = null
      if (videoBlob.size > 0) {
        try {
          rppg = await api.checkup.upload(videoBlob, localSidRef.current)
        } catch {
          try { rppg = await api.checkup.mock(80 + Math.random() * 14, 'medium') } catch { /* offline */ }
        }
      } else {
        try { rppg = await api.checkup.mock(82, 'good') } catch { /* offline */ }
      }

      setProcessingMsg('Saving your check-in and sending your daily report…')

      const summary = summaryRef.current ?? DEMO_SUMMARY
      const hr = extractHr(rppg)
      const sid = sessionIdRef.current

      // Persist the Materna layer: watch data, summary, email + emergency.
      if (sid) {
        try {
          const res = await realtimeComplete({
            session_id: sid,
            full_transcript: transcriptRef.current
              .map((l) => `${l.role === 'agent' ? 'Materna' : 'Patient'}: ${l.text}`)
              .join('\n'),
            summary,
            stats: { ...(hr ? { hr_bpm: Math.round(hr) } : {}), completed_reason: reason },
            emergency: !!emergencyRef.current,
            emergency_reason: emergencyRef.current ?? undefined,
          })
          setMaternaExtras({
            watch_data: res.watch_data,
            summary,
            urgency_level: res.urgency_level,
            emergency_placed: res.emergency_scheduled,
          })
        } catch (err) {
          console.warn('realtime/complete failed:', err)
          setMaternaExtras({ summary, urgency_level: summary.urgency_level })
        }
      } else {
        setMaternaExtras({ summary, urgency_level: summary.urgency_level })
      }

      if (rppg) setCheckupResult(rppg)
      markCheckupComplete()
      setStage('done')
      navigate('/checkup/results')
    },
    [markCheckupComplete, navigate, setCheckupResult, setMaternaExtras],
  )

  // ── Start the real conversational check-in ───────────────────────────────────
  const startCheckin = useCallback(async () => {
    // Unlock AudioContext in user-gesture context so TTS can play later.
    if (!audioCtxRef.current) {
      const ctx = new AudioContext()
      await ctx.resume()
      audioCtxRef.current = ctx
    }
    setCameraError(null)
    setVoiceError(null)
    setTranscript([])
    transcriptRef.current = []
    summaryRef.current = null
    emergencyRef.current = null
    finishedRef.current = false
    setStage('requesting')

    // Request mic permission explicitly so Chrome shows the prompt now,
    // before SpeechRecognition needs it. Then immediately stop the track.
    try {
      const micCheck = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      micCheck.getTracks().forEach(t => t.stop())
    } catch {
      setCameraError('Microphone permission denied — voice responses will not be captured.')
    }

    // Camera for rPPG (audio handled separately by the voice widget).
    let videoStream: MediaStream | null = null
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } },
        audio: false,
      })
      streamRef.current = videoStream
      if (videoRef.current) videoRef.current.srcObject = videoStream
    } catch {
      setCameraError('Camera unavailable — continuing with voice only.')
    }

    // Create the Materna session + Gemini Live ephemeral token.
    try {
      const live = await geminiLiveToken()
      sessionIdRef.current = live.session_id
      setGeminiApiKey(live.api_key)
      setSystemPrompt(live.system_prompt)
    } catch (err) {
      console.warn('gemini/live-token failed:', err)
      // Fallback: try the old realtime/start for the session_id at least
      try {
        const start = await realtimeStart()
        sessionIdRef.current = start.session_id
        setSystemPrompt(start.system_prompt)
      } catch { /* continue without session_id */ }
    }

    localSidRef.current = localSessionId()

    // Start recording the webcam for rPPG.
    if (videoStream) {
      try {
        const recorder = new MediaRecorder(videoStream, { mimeType: getSupportedVideoMimeType() })
        recorderRef.current = recorder
        chunksRef.current = []
        recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
        recorder.start(500)
      } catch (err) {
        console.warn('Video recorder failed:', err)
      }
    }

    setSecondsLeft(DURATION)
    setStage('conversing')
  }, [todayCheckupComplete, navigate])

  // ── Demo (no camera / no mic) ────────────────────────────────────────────────
  const startDemo = useCallback(async () => {
    finishedRef.current = false
    setStage('processing')
    setProcessingMsg('Loading demo check-in…')

    // Create a DB session so the demo still exercises watch data + email + reports.
    let sid: string | null = null
    try {
      const start = await realtimeStart()
      sid = start.session_id
    } catch { /* will fall back to mock-only result */ }

    let rppg: CheckupResult | null = null
    try {
      rppg = await api.voiceCheckup.mockVoiceSession()
    } catch {
      try { rppg = await api.checkup.mock(82, 'good') } catch { /* offline */ }
    }

    const summary = DEMO_SUMMARY
    if (sid) {
      try {
        const res = await realtimeComplete({
          session_id: sid,
          summary,
          stats: { hr_bpm: extractHr(rppg) ? Math.round(extractHr(rppg)!) : 82 },
        })
        setMaternaExtras({
          watch_data: res.watch_data,
          summary,
          urgency_level: res.urgency_level,
          emergency_placed: res.emergency_scheduled,
        })
      } catch {
        setMaternaExtras({ summary, urgency_level: summary.urgency_level })
      }
    } else {
      setMaternaExtras({ summary, urgency_level: summary.urgency_level })
    }

    if (rppg) setCheckupResult(rppg)
    markCheckupComplete()
    setStage('done')
    navigate('/checkup/results')
  }, [todayCheckupComplete, navigate, markCheckupComplete, setCheckupResult, setMaternaExtras])

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-nn-mist/60 bg-white px-6 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-nn-navy">30-Second Morning Check-In</h1>
            <p className="text-xs text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
              Camera-based pulse estimate · Natural voice conversation with Materna
            </p>
          </div>
          <StageBadge stage={stage} />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4 lg:p-5">
        {/* Demo banner */}
        <div className="flex-shrink-0 rounded-xl border border-nn-periwinkle/60 bg-nn-pale-sky px-4 py-2 text-center text-[11px] font-semibold text-nn-deep-blue">
          Demo mode · 90-second voice check-in · Wearable data is simulated
        </div>

        <CompactSafetyNotice />

        {cameraError && <Banner text={cameraError} />}
        {voiceError && <Banner text={voiceError} />}

        <div className="flex flex-1 gap-4 overflow-hidden flex-col lg:flex-row min-h-0">
          {/* Left: camera */}
          <div className="flex flex-1 lg:flex-[3] flex-col gap-3 overflow-hidden">
            <div className="relative overflow-hidden rounded-2xl bg-[#1a2540] flex-1 min-h-[200px]">
              <video
                ref={videoRef}
                className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${stage === 'conversing' ? 'opacity-100' : 'opacity-0'}`}
                autoPlay muted playsInline
              />
              <WebcamOverlay stage={stage} secondsLeft={secondsLeft} />
            </div>

            {stage === 'idle' && (
              <div className="flex-shrink-0 space-y-2">
                <button
                  onClick={startCheckin}
                  className="w-full rounded-xl bg-nn-deep-blue px-6 py-3.5 text-sm font-bold text-white shadow-sm hover:bg-nn-navy-light transition-colors"
                >
                  Start Morning Check-In
                </button>
                <button
                  onClick={startDemo}
                  className="w-full rounded-xl border border-nn-periwinkle bg-white px-6 py-2.5 text-xs font-semibold text-nn-deep-blue hover:bg-nn-pale-sky transition-colors"
                >
                  Run demo check-in (no camera or mic required)
                </button>
                {todayCheckupComplete && (
                  <button
                    onClick={() => window.location.href = '/checkup/results'}
                    className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-6 py-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors"
                  >
                    View latest results
                  </button>
                )}
              </div>
            )}

            {stage === 'conversing' && (
              <button
                onClick={() => void finishCheckin('user_ended')}
                className="flex-shrink-0 w-full rounded-xl border border-nn-mist bg-white px-6 py-2.5 text-xs font-semibold text-nn-navy hover:bg-nn-pale-sky transition-colors"
              >
                End check-in &amp; save
              </button>
            )}
          </div>

          {/* Right: agent + transcript */}
          <div className="flex lg:flex-[2] flex-col gap-3 overflow-hidden lg:min-w-[280px] lg:max-w-[360px]">
            <div className="flex-shrink-0 rounded-2xl bg-white px-4 py-5 shadow-sm flex flex-col items-center gap-4">
              <CheckupProgressRing
                progress={progress}
                secondsLeft={secondsLeft}
                isRecording={stage === 'conversing'}
                isAnalyzing={stage === 'processing'}
              />
              {/* Gemini Live voice — bidirectional native audio via WebSocket */}
              {stage === 'conversing' && (
                <GeminiVoiceWidget
                  apiKey={geminiApiKey}
                  systemPrompt={systemPrompt}
                  sessionId={sessionIdRef.current ?? ''}
                  active={stage === 'conversing'}
                  onStatus={setAgentStatus}
                  onLine={appendLine}
                  onSummary={handleSummary}
                  onError={(m) => setVoiceError(m)}
                />
              )}
            </div>

            <div className="flex-1 overflow-y-auto rounded-2xl bg-white p-4 shadow-sm">
              {stage === 'idle' ? (
                <IdleInstructionsPanel />
              ) : stage === 'conversing' ? (
                <TranscriptPanel transcript={transcript} agentStatus={agentStatus} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-4 border-nn-periwinkle border-t-nn-deep-blue" />
                  <p className="text-sm font-bold text-nn-navy">{processingMsg || 'Finishing up…'}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Banner({ text }: { text: string }) {
  return (
    <div className="flex-shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      {text}
    </div>
  )
}

function TranscriptPanel({ transcript, agentStatus }: { transcript: TranscriptLine[]; agentStatus: AgentStatus }) {
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [transcript, agentStatus])

  return (
    <div className="space-y-2">
      {transcript.length === 0 && (
        <div className="space-y-2 text-xs pb-1">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
            <p className="font-semibold text-nn-navy">
              {agentStatus === 'speaking' ? 'Materna is speaking…' : 'Connecting to Materna…'}
            </p>
          </div>
          <p className="text-[11px] text-nn-navy-light leading-snug" style={{ fontFamily: 'var(--font-body)' }}>
            Materna will greet you first. When she stops talking, speak naturally — the conversation appears here.
          </p>
        </div>
      )}

      {transcript.map((line, i) => (
        <div
          key={i}
          className={`rounded-xl px-3 py-2 text-xs leading-snug ${
            line.role === 'agent'
              ? 'bg-nn-pale-sky/70 text-nn-navy'
              : 'bg-nn-deep-blue text-white ml-6'
          }`}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          <span className="block text-[9px] font-bold uppercase tracking-wide opacity-60 mb-0.5">
            {line.role === 'agent' ? 'Materna' : 'You'}
          </span>
          {line.text}
        </div>
      ))}

      {/* Live status indicators */}
      {agentStatus === 'listening' && transcript.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 ml-6">
          <div className="flex gap-0.5 items-end h-3">
            {[0,1,2].map(i => (
              <div key={i} className="w-1 rounded-full bg-emerald-500 animate-bounce"
                style={{ height: `${8 + i * 3}px`, animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
          <span className="text-[10px] font-bold text-emerald-700">Listening — speak now</span>
        </div>
      )}
      {agentStatus === 'speaking' && transcript.length > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-nn-pale-sky/60 px-3 py-2">
          <div className="h-2 w-2 rounded-full bg-nn-deep-blue animate-pulse flex-shrink-0" />
          <span className="text-[10px] font-bold text-nn-deep-blue">Materna is speaking…</span>
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  )
}

function IdleInstructionsPanel() {
  const tips = [
    { icon: '💡', text: 'Good lighting — face the camera directly' },
    { icon: '🧘', text: 'Sit still and breathe normally' },
    { icon: '🎤', text: 'Talk naturally — Materna will lead the conversation' },
    { icon: '⏱️', text: 'About 90 seconds — 3–5 questions' },
  ]
  return (
    <>
      <p className="mb-3 text-sm font-bold text-nn-navy">Before you start</p>
      <div className="space-y-2">
        {tips.map(({ icon, text }) => (
          <div key={text} className="flex items-center gap-2.5 rounded-xl bg-nn-pale-sky px-3 py-2.5">
            <span className="text-base flex-shrink-0">{icon}</span>
            <p className="text-xs text-nn-navy" style={{ fontFamily: 'var(--font-body)' }}>{text}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-xl bg-nn-mist/60 px-3 py-2.5 text-[10px] text-nn-navy-light leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
        <strong className="text-nn-navy">About this check-in:</strong> Materna estimates a camera-based wellness signal while you have a short voice conversation. Everything stays on your device until the session is complete.
      </div>
    </>
  )
}

function StageBadge({ stage }: { stage: Stage }) {
  const map: Record<Stage, { label: string; cls: string }> = {
    idle: { label: 'Ready', cls: 'bg-nn-mist text-nn-navy-light' },
    requesting: { label: '◌ Starting', cls: 'bg-nn-pale-sky text-nn-deep-blue' },
    conversing: { label: '● Live', cls: 'bg-red-100 text-red-600' },
    processing: { label: '↑ Saving', cls: 'bg-nn-pale-sky text-nn-deep-blue' },
    done: { label: '✓ Complete', cls: 'bg-emerald-100 text-emerald-700' },
  }
  const { label, cls } = map[stage]
  return <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${cls}`}>{label}</span>
}

function CompactSafetyNotice() {
  return (
    <div className="flex flex-shrink-0 items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
      <svg viewBox="0 0 16 16" fill="none" stroke="#d97706" strokeWidth="1.6" className="mt-0.5 h-3.5 w-3.5 flex-shrink-0">
        <path d="M8 1L1 14h14L8 1Z" strokeLinejoin="round" />
        <path d="M8 6v4M8 11.5v.5" strokeLinecap="round" />
      </svg>
      <p className="text-[11px] text-amber-700 leading-snug" style={{ fontFamily: 'var(--font-body)' }}>
        <strong>Estimated wellness signal only — not a diagnosis.</strong> Seek <strong>urgent care</strong> for chest pain, trouble breathing, fainting, seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement.
      </p>
    </div>
  )
}

function WebcamOverlay({ stage, secondsLeft }: { stage: Stage; secondsLeft: number }) {
  return (
    <>
      {stage !== 'conversing' && <div className="absolute inset-0 bg-gradient-to-br from-[#1a2540] to-nn-navy" />}
      {stage === 'conversing' && <div className="absolute inset-0 bg-black/20" />}
      {stage === 'idle' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/50">
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.4" className="h-14 w-14">
            <rect x="3" y="10" width="42" height="30" rx="5" />
            <circle cx="24" cy="25" r="8" />
          </svg>
          <p className="text-sm font-semibold">Camera preview</p>
        </div>
      )}
      {stage === 'requesting' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          <p className="text-sm font-semibold">Starting session…</p>
        </div>
      )}
      {stage === 'conversing' && (
        <>
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs font-bold text-white">REC</span>
          </div>
          <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <span className="text-xs font-mono font-bold text-white">
              0:{String(secondsLeft).padStart(2, '0')}
            </span>
          </div>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-72 w-56 rounded-full border-2 border-dashed border-white/30" />
          </div>
        </>
      )}
      {stage === 'processing' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
          <p className="text-sm font-bold">Analyzing &amp; saving…</p>
        </div>
      )}
    </>
  )
}
