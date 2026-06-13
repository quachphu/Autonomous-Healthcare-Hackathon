import { mockTrendData } from '../../data/mockData'

// Athletic SVG icons for each metric card
function IconPulse() {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
      <circle cx="18" cy="18" r="17" fill="#DBEAFE"/>
      <path d="M5 18h5l3-6 4 12 3-9 3 6 2-3h6" stroke="#1D4ED8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}
function IconSignal() {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
      <circle cx="18" cy="18" r="17" fill="#DBEAFE"/>
      <circle cx="18" cy="18" r="4" fill="#1D4ED8"/>
      <circle cx="18" cy="18" r="8" stroke="#1D4ED8" strokeWidth="2" fill="none" opacity="0.5"/>
      <circle cx="18" cy="18" r="12" stroke="#1D4ED8" strokeWidth="1.5" fill="none" opacity="0.25"/>
    </svg>
  )
}
function IconWeekly() {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
      <circle cx="18" cy="18" r="17" fill="#DBEAFE"/>
      <rect x="9" y="11" width="18" height="15" rx="2.5" stroke="#1D4ED8" strokeWidth="2" fill="none"/>
      <path d="M9 16h18" stroke="#1D4ED8" strokeWidth="1.5"/>
      <path d="M13 8v4M23 8v4" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round"/>
      <path d="M13 22l2.5 2.5 5-5" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  )
}
function IconWellness() {
  return (
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-8 w-8">
      <circle cx="18" cy="18" r="17" fill="#DBEAFE"/>
      <path d="M18 25s-8-5-8-10a5 5 0 0 1 8-4 5 5 0 0 1 8 4c0 5-8 10-8 10Z" fill="#1D4ED8" fillOpacity="0.2" stroke="#1D4ED8" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M13 18h10" stroke="#1D4ED8" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M18 13v10" stroke="#1D4ED8" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  )
}

interface MetricsProps {
  heartRate: number | null
  signalQuality: string | null
  trend: string | null
  weeklyCompletion: number | null
  wellnessScore?: number | null
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const w = 80, h = 32, pad = 3
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - 2 * pad)
    const y = h - pad - ((v - min) / range) * (h - 2 * pad)
    return `${x},${y}`
  }).join(' ')

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-20">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function qualityColor(label: string) {
  const l = label.toLowerCase()
  if (l === 'good') return 'text-emerald-600'
  if (l === 'medium') return 'text-amber-600'
  return 'text-red-500'
}

export default function MetricsSummaryCards({
  heartRate,
  signalQuality,
  trend,
  weeklyCompletion,
  wellnessScore,
}: MetricsProps) {
  const hrData = mockTrendData.map((d) => d.heartRate)

  const signalBadge = signalQuality ? (
    <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      signalQuality.toLowerCase() === 'good' ? 'bg-emerald-100 text-emerald-700' :
      signalQuality.toLowerCase() === 'medium' ? 'bg-amber-100 text-amber-700' :
      'bg-red-100 text-red-700'
    }`}>
      ● {signalQuality.charAt(0).toUpperCase() + signalQuality.slice(1)}
    </span>
  ) : (
    <span className="mt-1 inline-flex items-center rounded-full bg-nn-mist px-2 py-0.5 text-xs font-medium text-nn-navy-light">
      N/A
    </span>
  )

  const trendBadge = (
    <span className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
      trend ? 'bg-emerald-100 text-emerald-700' : 'bg-nn-mist text-nn-navy-light'
    }`}>
      {trend ? `● ${trend}` : 'N/A'}
    </span>
  )

  const cards = [
    {
      label: 'Estimated Pulse',
      value: heartRate != null ? `${heartRate}` : 'N/A',
      unit: heartRate != null ? 'bpm' : '',
      sub: 'Camera-based wellness signal',
      sparkData: heartRate != null ? hrData : null,
      sparkColor: '#1D4ED8',
      Icon: IconPulse,
      valueColor: heartRate != null ? 'text-nn-navy' : 'text-nn-navy-light',
    },
    {
      label: 'Signal Quality',
      value: '',
      unit: '',
      sub: 'rPPG camera signal',
      sparkData: null,
      sparkColor: null,
      Icon: IconSignal,
      badge: signalBadge,
      valueColor: signalQuality ? qualityColor(signalQuality) : undefined,
    },
    {
      label: 'Weekly Completion',
      value: weeklyCompletion != null ? `${weeklyCompletion}` : 'N/A',
      unit: weeklyCompletion != null ? '%' : '',
      sub: 'Check-ins this week',
      sparkData: null,
      sparkColor: null,
      Icon: IconWeekly,
      customContent: weeklyCompletion != null ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-nn-mist">
          <div
            className="h-full rounded-full bg-nn-deep-blue transition-all"
            style={{ width: `${weeklyCompletion}%` }}
          />
        </div>
      ) : null,
      valueColor: weeklyCompletion == null ? 'text-nn-navy-light' : undefined,
    },
    wellnessScore != null
      ? {
          label: 'Wellness Score',
          value: `${wellnessScore}`,
          unit: '/ 100',
          sub: 'Estimated check-in score',
          sparkData: null,
          sparkColor: null,
          Icon: IconWellness,
          valueColor: wellnessScore >= 75 ? 'text-emerald-600' : wellnessScore >= 50 ? 'text-amber-600' : 'text-red-500',
        }
      : {
          label: 'Check-in Trend',
          value: '',
          unit: '',
          sub: 'Compared to baseline',
          sparkData: null,
          sparkColor: null,
          Icon: IconWellness,
          badge: trendBadge,
        },
  ]

  return (
    <div className="fade-up fade-up-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(({ label, value, unit, sub, sparkData, sparkColor, Icon, customContent, badge, valueColor }) => (
        <div key={label} className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <Icon />
            {sparkData && sparkColor && (
              <Sparkline data={sparkData} color={sparkColor} />
            )}
          </div>
          <p className="text-xs font-medium uppercase tracking-wide text-nn-navy-light">{label}</p>
          <div className="mt-1 flex items-baseline gap-1">
            {badge ? (
              badge
            ) : (
              <>
                <span className={`text-2xl font-bold ${valueColor ?? 'text-nn-navy'}`}>{value}</span>
                {unit && <span className="text-sm text-nn-navy-light">{unit}</span>}
              </>
            )}
          </div>
          {customContent}
          <p className="mt-1.5 text-[10px] text-nn-navy-light">{sub}</p>
        </div>
      ))}
    </div>
  )
}
