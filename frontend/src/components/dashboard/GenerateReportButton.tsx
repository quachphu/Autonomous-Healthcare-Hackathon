import { useState } from 'react'
import { downloadFullReport, generateWeeklyRollup } from '../../lib/api'

interface Props {
  variant?: 'full' | 'compact'
}

export default function GenerateReportButton({ variant = 'full' }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleClick() {
    setBusy(true)
    setError(null)
    setDone(false)
    try {
      // Refresh this week's rollup so the PDF reflects the latest data (best-effort).
      await generateWeeklyRollup().catch(() => undefined)
      const blob = await downloadFullReport()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `materna_doctor_report_${new Date().toISOString().slice(0, 10)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate the report.')
    } finally {
      setBusy(false)
    }
  }

  if (variant === 'compact') {
    return (
      <div>
        <button
          onClick={handleClick}
          disabled={busy}
          className="w-full rounded-xl border border-nn-periwinkle bg-white px-4 py-2.5 text-sm font-semibold text-nn-deep-blue hover:bg-nn-pale-sky transition-colors disabled:opacity-60"
        >
          {busy ? 'Generating PDF…' : 'Download doctor report (PDF)'}
        </button>
        {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-nn-mist">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-nn-navy">Full doctor report</h3>
          <p className="mt-0.5 text-xs text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
            A printable PDF with vitals, weekly trends, symptoms, and a clinical summary.
          </p>
        </div>
        <button
          onClick={handleClick}
          disabled={busy}
          className="flex-shrink-0 rounded-xl bg-nn-deep-blue px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-nn-deep-blue-hover transition-colors disabled:opacity-60"
        >
          {busy ? 'Generating…' : 'Generate PDF'}
        </button>
      </div>
      {done && <p className="mt-2 text-[11px] font-semibold text-emerald-600">Report downloaded.</p>}
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  )
}
