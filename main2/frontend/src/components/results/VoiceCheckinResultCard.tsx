import { useState } from 'react'
import type { CheckupResult, SymptomReport } from '../../types/checkup'

const URGENT_NOTICE =
  'Seek urgent medical care for chest pain, trouble breathing, fainting, seizure, severe headache, vision changes, heavy bleeding, or reduced fetal movement.'

function SymptomPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
      active ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-nn-pale-sky text-nn-navy-light'
    }`}>
      {active ? '⚠' : '✓'} {label}
    </span>
  )
}

export default function VoiceCheckinResultCard({ result }: { result: CheckupResult }) {
  const [showRaw, setShowRaw] = useState(false)
  const vc = result.voice_checkin!
  const notes = result.session_notes_for_user
  const symptoms: SymptomReport = vc.symptoms_reported || {}
  const anySymptom = Object.values(symptoms).some(Boolean)

  return (
    <div className="rounded-3xl bg-white p-6 shadow-sm space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-nn-pale-sky flex-shrink-0">
          <svg viewBox="0 0 20 20" fill="none" stroke="#4663ac" strokeWidth="1.8" className="h-5 w-5">
            <rect x="5" y="1" width="10" height="14" rx="5" />
            <path d="M3 10a7 7 0 0 0 14 0M10 18v-3" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-nn-navy">{notes?.title ?? 'Voice Check-In Notes'}</h2>
          <p className="text-xs text-nn-navy-light">{vc.questions_asked?.length ?? 0} questions answered</p>
        </div>
        {vc.ai_cleanup_skipped && (
          <span className="flex-shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
            AI unavailable — raw notes
          </span>
        )}
      </div>

      {/* Urgent notice */}
      {vc.requires_urgent_notice && (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3">
          <p className="text-xs font-bold text-red-700 mb-1">Urgent symptom reported</p>
          <p className="text-xs text-red-600" style={{ fontFamily: 'var(--font-body)' }}>
            {vc.urgent_notice_reason ?? URGENT_NOTICE}
          </p>
        </div>
      )}

      {/* Session summary */}
      {notes?.summary && (
        <p className="text-xs text-nn-navy-light leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
          {notes.summary}
        </p>
      )}

      {/* Cleaned note */}
      <div className="rounded-2xl bg-nn-pale-sky/60 px-4 py-4">
        <p className="text-[10px] font-semibold text-nn-navy-light uppercase tracking-wide mb-2">Your Session Notes</p>
        <p className="text-sm text-nn-navy leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
          {vc.cleaned_note || 'No cleaned notes available.'}
        </p>
      </div>

      {/* Questions and answers */}
      {vc.questions_asked && vc.questions_asked.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-nn-navy">Questions &amp; Answers</p>
          <div className="space-y-2">
            {vc.questions_asked.map((qa, i) => (
              <div key={qa.id || i} className="rounded-xl border border-nn-mist bg-white px-4 py-3">
                <p className="text-[10px] font-semibold text-nn-navy-light mb-0.5">{i + 1}. {qa.question}</p>
                <p className="text-xs text-nn-navy italic leading-snug" style={{ fontFamily: 'var(--font-body)' }}>
                  "{qa.cleaned_answer || qa.raw_transcript || '—'}"
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Care team summary */}
      {vc.care_team_summary && (
        <div className="rounded-2xl border border-nn-periwinkle/50 bg-gradient-to-br from-nn-pale-sky to-nn-periwinkle px-4 py-4">
          <p className="text-[10px] font-semibold text-nn-deep-blue uppercase tracking-wide mb-2">
            Care Team Summary
          </p>
          <p className="text-xs text-nn-navy leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
            {vc.care_team_summary}
          </p>
          <p className="mt-2 text-[10px] text-nn-navy-light italic">
            Share this summary with your care team at your next appointment.
          </p>
        </div>
      )}

      {/* Symptom report */}
      {symptoms && (
        <div>
          <p className="text-xs font-semibold text-nn-navy mb-2">Symptom Check</p>
          <div className="flex flex-wrap gap-1.5">
            <SymptomPill label="Chest pain" active={symptoms.chest_pain} />
            <SymptomPill label="Short of breath" active={symptoms.shortness_of_breath} />
            <SymptomPill label="Dizziness" active={symptoms.dizziness} />
            <SymptomPill label="Severe headache" active={symptoms.severe_headache} />
            <SymptomPill label="Vision changes" active={symptoms.vision_changes} />
            <SymptomPill label="Heavy bleeding" active={symptoms.heavy_bleeding} />
            <SymptomPill label="Reduced movement" active={symptoms.reduced_fetal_movement} />
            <SymptomPill label="Fever/chills" active={symptoms.fever_or_chills} />
            <SymptomPill label="Mood concern" active={symptoms.mood_concern} />
          </div>
          {!anySymptom && (
            <p className="mt-2 text-[10px] text-emerald-600" style={{ fontFamily: 'var(--font-body)' }}>
              No urgent symptoms reported in this check-in.
            </p>
          )}
        </div>
      )}

      {/* Possible context */}
      {vc.possible_context_for_metrics && vc.possible_context_for_metrics.length > 0 && (
        <div className="rounded-xl bg-nn-pale-sky/40 px-4 py-3">
          <p className="text-[10px] font-semibold text-nn-navy-light uppercase tracking-wide mb-1.5">
            Possible context for metrics
          </p>
          <ul className="space-y-0.5">
            {vc.possible_context_for_metrics.map((ctx, i) => (
              <li key={i} className="text-[11px] text-nn-navy flex items-start gap-1.5" style={{ fontFamily: 'var(--font-body)' }}>
                <span className="text-nn-navy-light flex-shrink-0 mt-0.5">•</span>
                {ctx}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested next step */}
      {vc.suggested_next_step && (
        <div className="flex items-start gap-2.5">
          <svg viewBox="0 0 16 16" fill="none" stroke="#4663ac" strokeWidth="1.6" className="h-4 w-4 mt-0.5 flex-shrink-0">
            <path d="M8 1v9M4 7l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M2 14h12" strokeLinecap="round" />
          </svg>
          <p className="text-xs text-nn-deep-blue font-medium leading-relaxed" style={{ fontFamily: 'var(--font-body)' }}>
            {vc.suggested_next_step}
          </p>
        </div>
      )}

      {/* Raw transcript toggle */}
      {vc.raw_full_transcript && (
        <div>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="flex items-center gap-1.5 text-xs font-semibold text-nn-navy-light hover:text-nn-navy transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              className={`h-3.5 w-3.5 transition-transform ${showRaw ? 'rotate-180' : ''}`}>
              <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {showRaw ? 'Hide' : 'Show'} raw transcript
          </button>
          {showRaw && (
            <pre className="mt-2 rounded-xl bg-nn-mist/60 px-4 py-3 text-[10px] text-nn-navy-light whitespace-pre-wrap leading-relaxed overflow-x-auto" style={{ fontFamily: 'var(--font-body)' }}>
              {vc.raw_full_transcript}
            </pre>
          )}
        </div>
      )}

      {/* Urgent notice footer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
        <p className="text-[10px] text-amber-700 leading-snug" style={{ fontFamily: 'var(--font-body)' }}>
          <strong>Important:</strong> {URGENT_NOTICE}
        </p>
      </div>

      <p className="text-center text-[10px] text-nn-navy-light">
        Estimated wellness signal only, not diagnostic. Share trends with your care team.
      </p>
    </div>
  )
}
