import { useAuth } from '../../contexts/AuthContext'
import { mockUser } from '../../data/mockData'

export default function HealthProfileCard() {
  const { dueDate, gestationalWeek, emergencyContactName, emergencyContactPhone, isDemoMode } = useAuth()

  const weeksLeft = Math.max(
    0,
    Math.round((new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7))
  )

  const emergencyContact = isDemoMode
    ? mockUser.emergencyContact
    : [emergencyContactName, emergencyContactPhone].filter(Boolean).join('  •  ') || 'Not set'

  return (
    <div className="fade-up fade-up-2 rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-nn-soft-blue">
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="7" r="4" stroke="#1D4ED8" strokeWidth="2" fill="none"/>
            <path d="M5 20v-1a7 7 0 0 1 14 0v1" stroke="#1D4ED8" strokeWidth="2" strokeLinecap="round" fill="none"/>
          </svg>
        </div>
        <h2 className="font-semibold text-nn-navy">Health Profile</h2>
      </div>

      <div className="space-y-3">
        {/* Gestational week */}
        <div className="rounded-2xl bg-nn-pale-sky px-4 py-3">
          <p className="text-xs text-nn-navy-light">Gestational Week</p>
          <p className="mt-0.5 text-lg font-bold text-nn-deep-blue">
            Week {gestationalWeek}
          </p>
          <div className="mt-1.5 h-1.5 rounded-full bg-nn-mist overflow-hidden">
            <div
              className="h-full rounded-full bg-nn-deep-blue"
              style={{ width: `${(gestationalWeek / 40) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-nn-navy-light">~{weeksLeft} weeks to due date</p>
        </div>

        <Row
          label="Due Date"
          value={new Date(dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
        />
        <Row label="Last BP (manual)" value={mockUser.lastManualBP} sub="Entered 2026-05-14 • Requires cuff" />
        <Row label="Emergency Contact" value={emergencyContact} small />
      </div>

      <p className="mt-4 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-[10px] text-amber-700 leading-relaxed">
        <strong>Note:</strong> Blood pressure requires manual cuff entry. rPPG values are estimates and not diagnostic.
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  sub,
  valueClass = 'text-nn-navy',
  small = false,
}: {
  label: string
  value: string
  sub?: string
  valueClass?: string
  small?: boolean
}) {
  return (
    <div className="border-b border-nn-mist/60 pb-2.5 last:border-0 last:pb-0">
      <p className="text-[11px] text-nn-navy-light">{label}</p>
      <p className={`mt-0.5 ${small ? 'text-xs' : 'text-sm'} font-medium ${valueClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-nn-navy-light/70">{sub}</p>}
    </div>
  )
}
