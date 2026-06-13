interface CheckupProgressRingProps {
  progress: number   // 0–100
  secondsLeft: number
  isRecording: boolean
  isAnalyzing: boolean
}

export default function CheckupProgressRing({
  progress,
  secondsLeft,
  isRecording,
  isAnalyzing,
}: CheckupProgressRingProps) {
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - progress / 100)

  return (
    <div className="relative flex items-center justify-center">
      {/* Outer glow ring */}
      {isRecording && (
        <div className="absolute h-48 w-48 rounded-full bg-nn-deep-blue/10 animate-ping" style={{ animationDuration: '2s' }} />
      )}

      <svg viewBox="0 0 120 120" className="h-44 w-44 -rotate-90">
        {/* Track */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="transparent"
          stroke="#d2deeb"
          strokeWidth="8"
        />
        {/* Progress arc */}
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="transparent"
          stroke="#4663ac"
          strokeWidth="8"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-linear"
        />
      </svg>

      {/* Center content */}
      <div className="absolute flex flex-col items-center justify-center">
        {isAnalyzing ? (
          <>
            <div className="h-6 w-6 animate-spin rounded-full border-3 border-nn-periwinkle border-t-nn-deep-blue" />
            <p className="mt-2 text-xs font-medium text-nn-navy-light">Analyzing…</p>
          </>
        ) : isRecording ? (
          <>
            <div className="recording-dot h-3 w-3 rounded-full bg-red-500 shadow-sm" />
            <p className="mt-2 text-3xl font-bold text-nn-navy">{secondsLeft}</p>
            <p className="text-xs text-nn-navy-light">seconds left</p>
          </>
        ) : (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="#4663ac" strokeWidth="1.8" className="h-8 w-8">
              <path d="M15 10l-4 4-2-2" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="2" y="2" width="20" height="20" rx="5" />
              <circle cx="8.5" cy="8.5" r="1.5" fill="#4663ac" stroke="none" />
              <path d="M22 11l-2 2-1-1" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="mt-2 text-xs font-medium text-nn-navy">Ready</p>
          </>
        )}
      </div>
    </div>
  )
}
