import { type CheckupSession } from '../../lib/api'

interface PatientCheckupHistoryProps {
  sessions: CheckupSession[]
  loading: boolean
}

export default function PatientCheckupHistory({ sessions, loading }: PatientCheckupHistoryProps) {
  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-nn-navy-light">Loading checkup history...</p>
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl bg-nn-soft-blue border border-nn-mist p-8 text-center">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-10 w-10 mx-auto mb-3 text-nn-navy-light">
          <path d="M10 6v5l3 2" strokeLinecap="round" />
          <circle cx="10" cy="10" r="7" />
        </svg>
        <h3 className="font-medium text-nn-navy mb-1">No checkups yet</h3>
        <p className="text-sm text-nn-navy-light">
          Patient hasn't completed any checkups yet
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {sessions.map(session => {
        const date = new Date(session.started_at)
        const dateStr = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric'
        })
        const timeStr = date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit'
        })

        const isCompleted = session.status === 'completed'
        const stats = session.stats || {}
        const rppgData = session.rppg_raw || {}

        return (
          <div
            key={session.id}
            className="rounded-xl bg-white border border-nn-mist p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-medium text-nn-navy">{dateStr}</p>
                <p className="text-xs text-nn-navy-light">{timeStr}</p>
              </div>
              <span
                className={[
                  'rounded-full px-3 py-1 text-xs font-medium',
                  isCompleted
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700',
                ].join(' ')}
              >
                {isCompleted ? 'Completed' : 'In Progress'}
              </span>
            </div>

            {isCompleted && (
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-nn-mist">
                {stats.heart_rate && (
                  <div>
                    <p className="text-xs text-nn-navy-light">Heart Rate</p>
                    <p className="font-semibold text-nn-navy">{stats.heart_rate} bpm</p>
                  </div>
                )}
                {stats.respiratory_rate && (
                  <div>
                    <p className="text-xs text-nn-navy-light">Respiratory Rate</p>
                    <p className="font-semibold text-nn-navy">{stats.respiratory_rate} rpm</p>
                  </div>
                )}
                {session.brownie_points !== undefined && session.brownie_points > 0 && (
                  <div>
                    <p className="text-xs text-nn-navy-light">Brownie Points</p>
                    <p className="font-semibold text-nn-navy">{session.brownie_points}</p>
                  </div>
                )}
                {rppgData.signal_quality && (
                  <div>
                    <p className="text-xs text-nn-navy-light">Signal Quality</p>
                    <p className="font-semibold text-nn-navy capitalize">{rppgData.signal_quality}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
