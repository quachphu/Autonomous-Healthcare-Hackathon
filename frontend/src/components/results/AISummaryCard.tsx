import { useAppContext } from '../../contexts/AppContext'

export default function AISummaryCard() {
  const { checkupResult } = useAppContext()

  const notes = checkupResult?.session_notes_for_user
  const vc = checkupResult?.voice_checkin
  const mwi = checkupResult?.maternal_wellness_interpretation

  // Use real AI-generated data when available
  if (notes || vc) {
    return (
      <div className="rounded-3xl bg-gradient-to-br from-nn-pale-sky to-nn-periwinkle p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-nn-deep-blue shadow-sm">
            <svg viewBox="0 0 20 20" fill="white" className="h-5 w-5">
              <path d="M10 2a1 1 0 0 1 .894.553l2.083 4.221 4.658.677a1 1 0 0 1 .555 1.705l-3.37 3.285.795 4.638a1 1 0 0 1-1.45 1.054L10 15.913l-4.165 2.22a1 1 0 0 1-1.45-1.054l.795-4.638L1.81 9.156a1 1 0 0 1 .555-1.705l4.658-.677L9.106 2.553A1 1 0 0 1 10 2Z" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-nn-navy">Materna AI Summary</p>
            <p className="text-xs text-nn-navy-light">Based on your voice check-in and wellness signal</p>
          </div>
        </div>

        <div className="rounded-2xl bg-white/80 p-4 space-y-2">
          {notes?.summary && (
            <p className="text-sm leading-relaxed text-nn-navy" style={{ fontFamily: 'var(--font-body)' }}>
              {notes.summary}
            </p>
          )}
          {mwi?.message && (
            <p className="text-sm leading-relaxed text-nn-navy" style={{ fontFamily: 'var(--font-body)' }}>
              {mwi.message}
            </p>
          )}
          {mwi?.suggested_next_step && (
            <p className="text-sm text-nn-deep-blue font-medium">
              → {mwi.suggested_next_step}
            </p>
          )}
        </div>

        {vc?.requires_urgent_notice && (
          <div className="mt-3 rounded-2xl bg-red-50 border border-red-200 px-4 py-2.5">
            <p className="text-[11px] text-red-700 font-semibold">
              Urgent symptom reported: {vc.urgent_notice_reason || 'Please contact your care team immediately.'}
            </p>
          </div>
        )}

        {!vc?.requires_urgent_notice && (
          <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-2.5">
            <p className="text-[11px] text-amber-700">
              <strong>Reminder:</strong> Call if you experience chest pain, shortness of breath at rest, severe headache, vision changes, or heavy bleeding.
            </p>
          </div>
        )}

        <p className="mt-3 text-center text-[10px] text-nn-navy-light">
          AI summaries use your check-in data. They are not a diagnosis. Always contact your care team for medical decisions.
        </p>
      </div>
    )
  }

  // Fallback for rPPG-only sessions (no voice check-in)
  const wellnessScore = checkupResult?.maternal_wellness_interpretation?.wellness_score
  const pulseLabel = checkupResult?.checkup_summary?.pulse_label
    || checkupResult?.rppg_analysis?.consensus?.pulse_label

  return (
    <div className="rounded-3xl bg-gradient-to-br from-nn-pale-sky to-nn-periwinkle p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-nn-deep-blue shadow-sm">
          <svg viewBox="0 0 20 20" fill="white" className="h-5 w-5">
            <path d="M10 2a1 1 0 0 1 .894.553l2.083 4.221 4.658.677a1 1 0 0 1 .555 1.705l-3.37 3.285.795 4.638a1 1 0 0 1-1.45 1.054L10 15.913l-4.165 2.22a1 1 0 0 1-1.45-1.054l.795-4.638L1.81 9.156a1 1 0 0 1 .555-1.705l4.658-.677L9.106 2.553A1 1 0 0 1 10 2Z" />
          </svg>
        </div>
        <div>
          <p className="font-semibold text-nn-navy">Materna AI Summary</p>
          <p className="text-xs text-nn-navy-light">Based on your health context and checkup history</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white/80 p-4">
        <p className="text-sm leading-relaxed text-nn-navy" style={{ fontFamily: 'var(--font-body)' }}>
          {pulseLabel
            ? `Your estimated wellness signal is: ${pulseLabel}.`
            : 'Your estimated heart and breathing signals look close to your recent baseline.'}{' '}
          {wellnessScore != null
            ? `Wellness score: ${wellnessScore}/100.`
            : 'Continue daily check-ins to build a clearer picture of your trends.'}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-nn-navy" style={{ fontFamily: 'var(--font-body)' }}>
          If you feel <strong>chest pain</strong>, <strong>shortness of breath</strong>,{' '}
          <strong>dizziness</strong>, <strong>fainting</strong>, or{' '}
          <strong>severe headache</strong>, contact your care team right away.
        </p>
      </div>

      <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 px-4 py-2.5">
        <p className="text-[11px] text-amber-700">
          <strong>Reminder:</strong> Call if shortness of breath at rest, chest pain, severe headache, vision changes, or BP ≥ 140/90.
        </p>
      </div>

      <p className="mt-3 text-center text-[10px] text-nn-navy-light">
        AI summaries use your health context. They are not a diagnosis. Always contact your care team for medical decisions.
      </p>
    </div>
  )
}
