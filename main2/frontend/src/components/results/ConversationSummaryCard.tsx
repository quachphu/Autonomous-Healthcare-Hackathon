import type { AgentSummary } from '../../lib/api'

interface Props {
  summary: AgentSummary
  urgencyLevel?: string
  emergencyPlaced?: boolean
}

const URGENCY_STYLE: Record<string, string> = {
  normal: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  monitor: 'bg-amber-50 text-amber-700 border-amber-100',
  urgent: 'bg-orange-50 text-orange-700 border-orange-100',
  emergency: 'bg-red-50 text-red-700 border-red-100',
}

function humanize(flag: string): string {
  return flag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export default function ConversationSummaryCard({ summary, urgencyLevel, emergencyPlaced }: Props) {
  const urgency = (urgencyLevel || summary.urgency_level || 'normal').toLowerCase()
  const flags = summary.symptom_flags || []

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-nn-mist">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-nn-navy">Today's conversation summary</h3>
        <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold capitalize ${URGENCY_STYLE[urgency] || URGENCY_STYLE.normal}`}>
          {urgency}
        </span>
      </div>

      {emergencyPlaced && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          <p className="text-xs font-semibold text-red-700">
            Emergency contact was notified by phone.
          </p>
        </div>
      )}

      {summary.plain_summary && (
        <p className="text-sm text-nn-navy leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
          {summary.plain_summary}
        </p>
      )}

      {summary.patient_quote && (
        <blockquote className="mt-3 border-l-2 border-nn-periwinkle pl-3 text-sm italic text-nn-navy-light">
          “{summary.patient_quote}”
        </blockquote>
      )}

      {flags.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-nn-navy-light">Symptom flags</p>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((f) => (
              <span key={f} className="rounded-full bg-nn-pale-sky px-2.5 py-1 text-[11px] font-semibold text-nn-navy">
                {humanize(f)}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {summary.mood_label && (
          <div className="rounded-xl bg-nn-pale-sky/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-nn-navy-light">Mood</p>
            <p className="mt-0.5 text-sm font-bold capitalize text-nn-navy">{summary.mood_label}</p>
          </div>
        )}
        {typeof summary.mood_score === 'number' && (
          <div className="rounded-xl bg-nn-pale-sky/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-nn-navy-light">Mood score</p>
            <p className="mt-0.5 text-sm font-bold text-nn-navy">{summary.mood_score}/100</p>
          </div>
        )}
        {typeof summary.edinburgh_score === 'number' && (
          <div className="rounded-xl bg-nn-pale-sky/60 px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-nn-navy-light">Edinburgh PPD</p>
            <p className="mt-0.5 text-sm font-bold text-nn-navy">{summary.edinburgh_score}/30</p>
          </div>
        )}
      </div>

      {summary.hospital_note && (
        <details className="mt-4 rounded-xl bg-nn-mist/40 px-3 py-2.5">
          <summary className="cursor-pointer text-xs font-semibold text-nn-navy">Hospital-ready note</summary>
          <p className="mt-2 text-xs text-nn-navy-light leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
            {summary.hospital_note}
          </p>
        </details>
      )}
    </div>
  )
}
