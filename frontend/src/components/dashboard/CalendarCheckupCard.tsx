import { useState } from 'react'
import type { CheckupResult } from '../../types/checkup'

interface CheckinDateData {
  date: string
  streak: number
}

interface CalendarCheckupCardProps {
  completedDates: CheckinDateData[]
  today: string
  resultsByDate?: Record<string, CheckupResult>
}

function getStreakColor(streak: number): string {
  if (streak === 0 || streak === 1) return 'bg-yellow-400'       // Yellow
  if (streak === 2) return 'bg-lime-400'         // Lime
  if (streak === 3) return 'bg-green-400'        // Light green
  if (streak === 4) return 'bg-green-500'        // Green
  if (streak === 5) return 'bg-emerald-500'      // Emerald
  return 'bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 shadow-lg'  // Shiny gold for 6+
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]

function buildCalendarDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const days: Array<{ date: string; dayNum: number } | null> = []

  for (let i = 0; i < firstDay; i++) days.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    const mm = String(month + 1).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    days.push({ date: `${year}-${mm}-${dd}`, dayNum: d })
  }
  return days
}

function formatDisplayDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric',
  })
}

function qualityColor(q: string) {
  if (q === 'good') return 'text-emerald-600'
  if (q === 'medium') return 'text-amber-600'
  return 'text-red-500'
}

function trendLabel(t: string) {
  const map: Record<string, string> = {
    stable: '→ Stable', increasing: '↑ Increasing',
    decreasing: '↓ Decreasing', variable: '↕ Variable',
  }
  return map[t] ?? t
}

function DayResultPopup({
  date,
  result,
  onClose,
}: {
  date: string
  result: CheckupResult
  onClose: () => void
}) {
  const [showMore, setShowMore] = useState(false)

  const pulse = result.checkup_summary?.estimated_pulse_bpm
    ?? result.rppg_analysis.consensus.estimated_pulse_bpm
  const quality = result.signal_quality?.overall
    ?? result.rppg_analysis.signal_quality.label
  const wellness = result.maternal_wellness_interpretation?.wellness_score
    ?? result.rppg_analysis.signal_quality.wellness_score
  const trend = result.heart_rate_statistics?.trend
    ?? result.rppg_analysis.check_in_trend as string
  const retake = result.checkup_summary?.retake_recommended
    ?? result.rppg_analysis.consensus.retake_recommended
  const hrs = result.heart_rate_statistics
  const mwi = result.maternal_wellness_interpretation
  const vc = result.voice_checkin
  const exp = result.experimental_vitals
  const confidence = result.checkup_summary?.confidence
  const duration = result.recording_quality?.recording_duration_seconds
    ?? result.recording.duration_seconds

  return (
    <div className="mt-4 rounded-2xl border border-nn-periwinkle bg-nn-pale-sky p-4 animate-fade-in">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-nn-navy">{formatDisplayDate(date)}</p>
          <p className="text-[10px] text-nn-navy-light">
            Session {result.session_id}
            {duration ? ` · ${duration.toFixed(0)}s` : ''}
            {confidence ? ` · ${confidence} confidence` : ''}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-nn-navy-light hover:bg-nn-mist transition-colors"
          aria-label="Close"
        >
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
            <path d="M2 2l8 8M10 2L2 10" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Core 4 stats */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] text-nn-navy-light font-medium">Estimated Pulse</p>
          <p className="text-base font-bold text-nn-deep-blue">
            {pulse != null ? `${pulse.toFixed(1)} bpm` : '—'}
          </p>
          {hrs && (
            <p className="text-[9px] text-nn-navy-light">
              {hrs.min_window_bpm?.toFixed(0)}–{hrs.max_window_bpm?.toFixed(0)} bpm range
            </p>
          )}
        </div>

        <div className="rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] text-nn-navy-light font-medium">Signal Quality</p>
          <p className={`text-base font-bold capitalize ${qualityColor(quality)}`}>{quality}</p>
          <p className="text-[9px] text-nn-navy-light">rPPG estimate</p>
        </div>

        <div className="rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] text-nn-navy-light font-medium">Wellness Score</p>
          <p className={`text-base font-bold ${
            wellness >= 75 ? 'text-emerald-600' : wellness >= 50 ? 'text-amber-600' : 'text-red-500'
          }`}>
            {wellness} <span className="text-xs font-normal text-nn-navy-light">/ 100</span>
          </p>
          <p className="text-[9px] text-nn-navy-light">Not a medical score</p>
        </div>

        <div className="rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] text-nn-navy-light font-medium">HR Trend</p>
          <p className="text-base font-bold text-nn-navy">{trendLabel(trend)}</p>
          {hrs && hrs.std_window_bpm != null && (
            <p className="text-[9px] text-nn-navy-light">±{hrs.std_window_bpm.toFixed(1)} bpm std</p>
          )}
        </div>
      </div>

      {/* Wellness interpretation message */}
      {mwi?.message && (
        <div className="mt-2 rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold text-nn-navy mb-0.5">What this means</p>
          <p className="text-[10px] text-nn-navy-light leading-snug">{mwi.message}</p>
          {mwi.suggested_next_step && (
            <p className="text-[10px] text-nn-deep-blue font-medium mt-1">→ {mwi.suggested_next_step}</p>
          )}
        </div>
      )}

      {/* Voice Q&A summary */}
      {vc?.care_team_summary && (
        <div className="mt-2 rounded-xl bg-white px-3 py-2.5">
          <p className="text-[10px] font-semibold text-nn-navy mb-0.5">Voice Check-In Notes</p>
          <p className="text-[10px] text-nn-navy-light leading-snug">{vc.care_team_summary}</p>
        </div>
      )}

      {/* Expandable: per-method HR + experimental vitals */}
      <button
        onClick={() => setShowMore(s => !s)}
        className="mt-2 w-full flex items-center justify-between rounded-xl border border-nn-mist bg-white px-3 py-2 text-[10px] font-semibold text-nn-navy hover:bg-nn-pale-sky transition-colors"
      >
        {showMore ? 'Hide details' : 'Show more stats'}
        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"
          className={`h-3 w-3 transition-transform ${showMore ? 'rotate-180' : ''}`}>
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {showMore && (
        <div className="mt-2 space-y-2">
          {/* Per-method HR */}
          {hrs?.heart_rate_by_method && (
            <div className="rounded-xl bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold text-nn-navy mb-1.5">Per-Method HR</p>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                {(['POS', 'CHROM', 'GREEN'] as const).map(m => (
                  <div key={m} className="rounded-lg bg-nn-pale-sky px-1 py-1.5">
                    <p className="text-[9px] text-nn-navy-light">{m}</p>
                    <p className="text-xs font-bold text-nn-navy">
                      {hrs.heart_rate_by_method[m] != null
                        ? `${hrs.heart_rate_by_method[m]!.toFixed(1)}`
                        : '—'}
                    </p>
                    <p className="text-[8px] text-nn-navy-light">bpm</p>
                  </div>
                ))}
              </div>
              {result.method_agreement?.agreement_quality && (
                <p className="mt-1.5 text-[9px] text-nn-navy-light">
                  Agreement: <span className={`font-semibold ${qualityColor(result.method_agreement.agreement_quality)}`}>
                    {result.method_agreement.agreement_quality}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* HR window values */}
          {hrs?.window_values_bpm && hrs.window_values_bpm.length > 0 && (
            <div className="rounded-xl bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold text-nn-navy mb-1">
                Window HR ({hrs.window_size_seconds}s windows)
              </p>
              <div className="flex flex-wrap gap-1">
                {hrs.window_values_bpm.map((v, i) => (
                  <span key={i} className="rounded-full bg-nn-pale-sky px-2 py-0.5 text-[9px] font-medium text-nn-navy">
                    {v.toFixed(1)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Experimental vitals */}
          {exp && (
            <div className="rounded-xl bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold text-nn-navy mb-1.5">
                Experimental Vitals
                <span className="ml-1 text-[8px] font-normal text-nn-navy-light">(not diagnostic)</span>
              </p>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-nn-navy-light">Resp. rate</span>
                  <span className={`font-semibold ${exp.respiratory_rate.value_breaths_per_min != null ? 'text-nn-navy' : 'text-nn-navy-light'}`}>
                    {exp.respiratory_rate.value_breaths_per_min != null
                      ? `~${exp.respiratory_rate.value_breaths_per_min.toFixed(1)} br/min`
                      : 'Not available'}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-nn-navy-light">Blood pressure</span>
                  <span className={`font-semibold ${exp.blood_pressure.systolic_mmHg != null ? 'text-nn-navy' : 'text-nn-navy-light'}`}>
                    {exp.blood_pressure.systolic_mmHg != null
                      ? `~${exp.blood_pressure.systolic_mmHg}/${exp.blood_pressure.diastolic_mmHg} mmHg`
                      : 'Not available'}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-nn-navy-light">SpO2</span>
                  <span className={`font-semibold ${exp.spo2.value_percent != null ? 'text-nn-navy' : 'text-nn-navy-light'}`}>
                    {exp.spo2.value_percent != null
                      ? `~${exp.spo2.value_percent.toFixed(1)}%`
                      : 'Not available'}
                  </span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-nn-navy-light">Pulse wave velocity</span>
                  <span className={`font-semibold ${exp.pulse_wave_velocity.value_m_per_s != null ? 'text-nn-navy' : 'text-nn-navy-light'}`}>
                    {exp.pulse_wave_velocity.value_m_per_s != null
                      ? `${exp.pulse_wave_velocity.value_m_per_s.toFixed(2)} m/s`
                      : 'Not available'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Voice Q&A full transcript */}
          {vc?.questions_asked && vc.questions_asked.length > 0 && (
            <div className="rounded-xl bg-white px-3 py-2.5">
              <p className="text-[10px] font-semibold text-nn-navy mb-1.5">Voice Q&amp;A</p>
              <div className="space-y-1.5">
                {vc.questions_asked.map((q, i) => (
                  <div key={q.id ?? i}>
                    <p className="text-[9px] font-semibold text-nn-navy-light">Q{i + 1}: {q.question}</p>
                    <p className="text-[9px] text-nn-navy italic leading-snug">
                      "{q.cleaned_answer || q.raw_transcript}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {retake && (
        <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
          Retake was recommended for this session.
        </div>
      )}

      <p className="mt-2 text-[9px] text-nn-navy-light leading-snug">
        Estimated wellness signal only, not diagnostic.
      </p>
    </div>
  )
}

export default function CalendarCheckupCard({
  completedDates,
  today,
  resultsByDate = {},
}: CalendarCheckupCardProps) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  // Parse YYYY-MM-DD as local date (not UTC midnight, which shifts by timezone)
  const [yearN, monthN] = today.split('-').map(Number)
  const year = yearN
  const month = monthN - 1  // convert to 0-indexed
  const days = buildCalendarDays(year, month)

  // Convert to map for O(1) lookup
  const completedMap = new Map(
    completedDates.map(d => [d.date, d.streak])
  )
  const completedSet = new Set(completedDates.map(d => d.date))

  function handleDayClick(date: string) {
    if (!completedSet.has(date)) return
    setSelectedDate(prev => (prev === date ? null : date))
  }

  const selectedResult = selectedDate ? resultsByDate[selectedDate] : null

  return (
    <div className="fade-up fade-up-2 rounded-3xl bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-nn-navy">
            {MONTHS[month]} {year}
          </h2>
          <p className="text-sm text-nn-navy-light">
            Daily checkup calendar{' '}
            {Object.keys(resultsByDate).length > 0 && (
              <span className="text-nn-deep-blue font-medium">· tap a green day for results</span>
            )}
          </p>
        </div>
        {/* Legend */}
        <div className="flex flex-col gap-1.5 text-left text-[11px] text-nn-navy-light">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-yellow-400 inline-block" /> Streak 1
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-green-400 inline-block" /> Streak 2-5
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-amber-500 shadow-md inline-block" /> Streak 6+
          </span>
        </div>
      </div>

      {/* Weekday headers */}
      <div className="mb-2 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs font-medium text-nn-navy-light py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />

          const isToday = day.date === today
          const streakValue = completedMap.get(day.date)
          const isComplete = streakValue !== undefined
          const isPast = day.date < today
          const isSelected = day.date === selectedDate
          const hasResult = Boolean(resultsByDate[day.date])

          // Classes: completed uses streak gradient; today gets a ring; selected gets a stronger ring
          const baseRing = isSelected
            ? 'ring-2 ring-nn-deep-blue ring-offset-1'
            : isToday && isComplete
            ? 'ring-2 ring-nn-deep-blue ring-offset-1'
            : ''

          const bgCls = isComplete
            ? `${getStreakColor(streakValue!)} text-white shadow-sm`
            : isToday
            ? 'border-2 border-nn-deep-blue font-bold text-nn-deep-blue'
            : isPast
            ? 'text-nn-navy-light'
            : 'text-nn-navy-light/50'

          const interactiveCls = isComplete
            ? `cursor-pointer hover:scale-105 transition-all ${hasResult ? 'hover:scale-110' : ''}`
            : ''

          return (
            <div
              key={day.date}
              className="flex items-center justify-center"
            >
              <button
                type="button"
                disabled={!isComplete}
                onClick={() => handleDayClick(day.date)}
                className={[
                  'flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-all',
                  bgCls,
                  baseRing,
                  interactiveCls,
                  !isComplete ? 'cursor-default' : '',
                ].join(' ')}
                aria-label={`${day.date}${isComplete ? ' — completed, click for results' : ''}${isToday ? ' — today' : ''}`}
                title={isComplete && hasResult ? 'Click to view results' : undefined}
              >
                {day.dayNum}
              </button>
            </div>
          )
        })}
      </div>

      {/* Inline result popup */}
      {selectedDate && selectedResult && (
        <DayResultPopup
          date={selectedDate}
          result={selectedResult}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {/* Clicked a completed day but no result stored yet */}
      {selectedDate && !selectedResult && completedSet.has(selectedDate) && (
        <div className="mt-4 rounded-2xl border border-nn-mist bg-nn-pale-sky/50 px-4 py-3 text-center text-xs text-nn-navy-light">
          <p className="font-medium text-nn-navy">{formatDisplayDate(selectedDate)}</p>
          <p className="mt-1">Check-in recorded, but detailed results are not available for this session.</p>
          <button onClick={() => setSelectedDate(null)} className="mt-2 text-nn-deep-blue hover:underline text-[11px]">Dismiss</button>
        </div>
      )}
    </div>
  )
}
