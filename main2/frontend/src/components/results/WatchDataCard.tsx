import type { WatchData } from '../../lib/api'

interface Props {
  watch: WatchData
}

function Metric({ label, value, unit }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="rounded-xl bg-nn-pale-sky/60 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-nn-navy-light">{label}</p>
      <p className="mt-0.5 text-lg font-bold text-nn-navy">
        {value}
        {unit && <span className="ml-1 text-xs font-medium text-nn-navy-light">{unit}</span>}
      </p>
    </div>
  )
}

export default function WatchDataCard({ watch }: Props) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-nn-mist">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-nn-deep-blue">
            <rect x="6" y="5" width="8" height="10" rx="2" />
            <path d="M8 5V3.5A1.5 1.5 0 0 1 9.5 2h1A1.5 1.5 0 0 1 12 3.5V5M8 15v1.5A1.5 1.5 0 0 0 9.5 18h1a1.5 1.5 0 0 0 1.5-1.5V15" strokeLinecap="round" />
          </svg>
          <h3 className="text-sm font-bold text-nn-navy">Wearable overnight summary</h3>
        </div>
        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-700">
          Simulated · Demo Only
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Metric label="Avg heart rate" value={watch.heart_rate_avg_bpm} unit="bpm" />
        <Metric label="Resting HR" value={watch.resting_hr_bpm} unit="bpm" />
        <Metric label="HRV (SDNN)" value={watch.hrv_sdnn_ms} unit="ms" />
        <Metric label="SpO₂" value={watch.spo2_pct} unit="%" />
        <Metric label="Resp. rate" value={watch.respiratory_rate_bpm} unit="/min" />
        <Metric label="Steps today" value={watch.steps_today} />
        <Metric label="Sleep" value={watch.sleep_hours_last_night} unit="h" />
        <Metric label="Sleep quality" value={watch.sleep_quality} />
      </div>

      <p className="mt-3 text-[10px] leading-snug text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
        {watch.note}
      </p>
    </div>
  )
}
