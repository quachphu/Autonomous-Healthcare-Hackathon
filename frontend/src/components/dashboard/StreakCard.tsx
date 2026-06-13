interface StreakCardProps {
  streakCount: number
  longestStreak: number
  todayComplete: boolean
}

export default function StreakCard({
  streakCount,
  longestStreak,
  todayComplete
}: StreakCardProps) {
  const pct = Math.min((streakCount / 14) * 100, 100)

  return (
    <div className="fade-up fade-up-1 rounded-3xl bg-nn-deep-blue p-6 text-white shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-white/70">Current streak</p>
          <p className="mt-1 text-4xl font-bold">{streakCount}</p>
          <p className="text-sm font-medium text-white/80">
            {streakCount === 1 ? 'day' : 'days'} in a row
          </p>

          {longestStreak > 0 && (
            <div className="mt-3 pt-3 border-t border-white/20">
              <p className="text-xs text-white/60">Personal best</p>
              <p className="text-lg font-bold text-white/90">
                {longestStreak} {longestStreak === 1 ? 'day' : 'days'}
              </p>
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-1">
          <svg viewBox="0 0 28 28" fill="none" className="h-10 w-10">
            <path
              d="M14 25S4 18.5 4 11a6 6 0 0 1 10-4.5A6 6 0 0 1 24 11c0 7.5-10 14-10 14Z"
              fill="rgba(255,255,255,0.25)"
              stroke="white"
              strokeWidth="1.5"
            />
          </svg>
          {todayComplete && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold text-white">
              Today ✓
            </span>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex justify-between text-xs text-white/60">
          <span>Building a healthy rhythm</span>
          <span>{streakCount}/14 days</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/20">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {!todayComplete && (
        <p className="mt-3 text-xs text-white/60">
          Complete today's checkup to extend your streak
        </p>
      )}
      {todayComplete && streakCount === longestStreak && longestStreak > 3 && (
        <p className="mt-3 text-xs text-emerald-300 font-medium">
          🎉 New personal record!
        </p>
      )}
      {todayComplete && (streakCount !== longestStreak || longestStreak <= 3) && (
        <p className="mt-3 text-xs text-white/80">
          Great work — come back tomorrow to keep going!
        </p>
      )}
    </div>
  )
}
