import { useNavigate } from 'react-router-dom'

export default function MessagingDock() {
  const navigate = useNavigate()

  return (
    <div className="fade-up fade-up-5 rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <svg viewBox="0 0 20 20" fill="none" stroke="#4663ac" strokeWidth="1.6" className="h-5 w-5">
          <path d="M17 10.5C17 14.09 13.87 17 10 17c-1.07 0-2.08-.22-3-.62L3 17l.93-3.5A6.4 6.4 0 0 1 3 10.5C3 6.91 6.13 4 10 4s7 2.91 7 6.5Z" strokeLinejoin="round" />
        </svg>
        <h2 className="font-semibold text-nn-navy">Messages</h2>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Doctor chat */}
        <button
          onClick={() => navigate('/messaging?tab=doctor')}
          className="group flex items-start gap-4 rounded-2xl border border-nn-mist bg-nn-pale-sky p-4 text-left transition-all hover:border-nn-periwinkle hover:shadow-sm"
        >
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-nn-deep-blue text-white font-bold text-lg shadow-sm">
            R
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-nn-navy">Dr. Rivera</p>
            <p className="mt-0.5 text-sm text-nn-navy-light truncate">
              "Your vitals look stable — keep up the daily scans!"
            </p>
            <div className="mt-2 flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-emerald-600 font-medium">Online</span>
              <span className="ml-2 text-[11px] text-nn-navy-light">9:18 AM</span>
            </div>
          </div>
        </button>

        {/* AI chat */}
        <button
          onClick={() => navigate('/messaging?tab=ai')}
          className="group flex items-start gap-4 rounded-2xl border border-nn-mist bg-nn-pale-sky p-4 text-left transition-all hover:border-nn-periwinkle hover:shadow-sm"
        >
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-nn-periwinkle to-nn-deep-blue shadow-sm">
            <svg viewBox="0 0 20 20" fill="white" className="h-5 w-5">
              <path d="M10 2a1 1 0 0 1 .894.553l2.083 4.221 4.658.677a1 1 0 0 1 .555 1.705l-3.37 3.285.795 4.638a1 1 0 0 1-1.45 1.054L10 15.913l-4.165 2.22a1 1 0 0 1-1.45-1.054l.795-4.638L1.81 9.156a1 1 0 0 1 .555-1.705l4.658-.677L9.106 2.553A1 1 0 0 1 10 2Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-nn-navy">Materna AI</p>
            <p className="mt-0.5 text-sm text-nn-navy-light line-clamp-2">
              Ask about your checkup history, care instructions, or symptoms.
            </p>
            <p className="mt-2 text-[11px] text-nn-navy-light/70 italic">
              Uses your health context — not a diagnosis
            </p>
          </div>
        </button>
      </div>

      <p className="mt-4 text-center text-xs text-nn-navy-light">
        All messages are private and secure. Your care team can see your checkup summaries.
      </p>
    </div>
  )
}
