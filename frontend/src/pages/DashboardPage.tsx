import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useAppContext } from '../contexts/AppContext'
import { today } from '../data/mockData'
import { api } from '../lib/api'
import StreakCard from '../components/dashboard/StreakCard'
import CalendarCheckupCard from '../components/dashboard/CalendarCheckupCard'
import DailyCheckupCTA from '../components/dashboard/DailyCheckupCTA'
import MascotPanel from '../components/dashboard/MascotPanel'
import MetricsSummaryCards from '../components/dashboard/MetricsSummaryCards'
import HealthProfileCard from '../components/dashboard/HealthProfileCard'
import GenerateReportButton from '../components/dashboard/GenerateReportButton'
import NotificationDisplay from '../components/admin/NotificationDisplay'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardPage() {
  const { displayName } = useAuth()
  const {
    streakCount, longestStreak, mascotHealth,
    completedDates, checkupResult, resultsByDate,
    setCheckupResult, addResultForDate,
    setTodayCheckupComplete,
    setStreakCount, setLongestStreak, setMascotHealth, setCompletedDates,
  } = useAppContext()
  const [pendingNotifications, setPendingNotifications] = useState<any[]>([])
  const localToday = new Date().toLocaleDateString('en-CA')

  useEffect(() => {

    // Fetch latest result for display metrics only — never use this to decide "today complete"
    // (latest-db falls back to a local JSON file whose created_at is always "now")
    api.checkup.latestFromDb().then(r => {
      setCheckupResult(r)
    }).catch(() => {})

    // Fetch user-specific history from Supabase so calendar day-clicks show real results
    api.checkup.historyFromDb(60).then(history => {
      history.forEach(r => addResultForDate(r.created_at.substring(0, 10), r))
    }).catch(() => {})

    // Fetch dashboard summary (health, streak, completed dates, notifications)
    api.dashboard.summary().then(summary => {
      setStreakCount(summary.streak)
      setLongestStreak(summary.longest_streak)
      setMascotHealth(summary.mascot_health)
      setCompletedDates(summary.checkin_dates)
      setPendingNotifications(summary.pending_notifications || [])
      // Also detect today complete from the checkin dates list
      if (summary.checkin_dates.some((d: { date: string }) => d.date === localToday)) {
        setTodayCheckupComplete(true)
      }
    }).catch(err => {
      console.warn('Failed to load dashboard summary:', err)
    })
  }, [setCheckupResult, addResultForDate, setTodayCheckupComplete, setStreakCount, setLongestStreak, setMascotHealth, setCompletedDates])


  // Source of truth for whether today's checkup is done (supports multiple per day)
  const todayComplete = completedDates.some(d => d.date === localToday)
  const todayEntry = completedDates.find(d => d.date === localToday)
  const todayCheckupCount = (todayEntry as any)?.count ?? (todayComplete ? 1 : 0)

  // Only show today's metrics — N/A if the latest result is from a previous day
  const resultIsToday = checkupResult?.created_at?.substring(0, 10) === localToday

  const liveHR = resultIsToday
    ? (checkupResult?.checkup_summary?.estimated_pulse_bpm
        ?? checkupResult?.rppg_analysis?.consensus?.estimated_pulse_bpm
        ?? null)
    : null
  const liveSignalQuality = resultIsToday
    ? (checkupResult?.signal_quality?.overall
        ?? checkupResult?.rppg_analysis?.signal_quality?.label
        ?? null)
    : null
  const liveTrend = resultIsToday
    ? (checkupResult?.heart_rate_statistics?.trend
        ?? (checkupResult?.rppg_analysis?.check_in_trend as string | undefined)
        ?? null)
    : null
  const liveWellnessScore = resultIsToday
    ? (checkupResult?.maternal_wellness_interpretation?.wellness_score
        ?? checkupResult?.rppg_analysis?.signal_quality?.wellness_score
        ?? null)
    : null

  // Compute weekly completion from real completed dates (null = no data yet)
  const liveWeeklyCompletion = (() => {
    if (!completedDates.length) return null
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 7)
    const count = completedDates.filter(d => {
      const dt = new Date(d.date + 'T00:00:00')
      return dt >= monday && dt < sunday
    }).length
    return Math.round((count / 7) * 100)
  })()

  return (
    <div className="min-h-full p-6 lg:p-8">
      {/* ── Page header ── */}
      <header className="fade-up mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-nn-navy flex items-center gap-2">
            {getGreeting()}, {displayName}
            {/* Tiny anime baby face */}
            <svg viewBox="0 0 40 40" className="h-8 w-8 inline-block flex-shrink-0" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="20" r="18" fill="#FFE8D5"/>
              <path d="M8 18 Q12 6 20 6 Q28 6 32 18 Q26 12 20 12 Q14 12 8 18Z" fill="#2C1810"/>
              <path d="M8 16 Q20 14 32 16" stroke="#1D4ED8" strokeWidth="3" fill="none" strokeLinecap="round"/>
              <ellipse cx="14" cy="22" rx="5" ry="5.5" fill="white"/>
              <circle cx="14" cy="22.5" r="3.5" fill="#1D4ED8"/>
              <circle cx="14" cy="22.5" r="2" fill="#0F172A"/>
              <circle cx="15.5" cy="21" r="1.2" fill="white"/>
              <ellipse cx="26" cy="22" rx="5" ry="5.5" fill="white"/>
              <circle cx="26" cy="22.5" r="3.5" fill="#1D4ED8"/>
              <circle cx="26" cy="22.5" r="2" fill="#0F172A"/>
              <circle cx="27.5" cy="21" r="1.2" fill="white"/>
              <ellipse cx="11" cy="27" rx="4" ry="2.5" fill="#FCA5A5" fillOpacity="0.6"/>
              <ellipse cx="29" cy="27" rx="4" ry="2.5" fill="#FCA5A5" fillOpacity="0.6"/>
              <path d="M16 31 Q20 35 24 31" stroke="#E85D75" strokeWidth="1.8" fill="none" strokeLinecap="round"/>
            </svg>
          </h1>
          <p className="mt-1 text-sm text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
            Your daily heart and breathing wellness companion
          </p>

          {/* Mobile mascot health bar */}
          <div className="lg:hidden mt-2 flex items-center gap-2">
            <div className="flex-1 h-2 bg-nn-mist rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500" style={{ width: `${mascotHealth}%` }} />
            </div>
            <span className="text-xs font-medium text-nn-navy">{mascotHealth}%</span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Profile avatar */}
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-nn-deep-blue text-white font-bold text-sm shadow-sm">
            {displayName.charAt(0).toUpperCase()}
          </div>
        </div>
      </header>

      {/* ── Pending Notifications ── */}
      {pendingNotifications.length > 0 && (
        <div className="mb-6">
          <NotificationDisplay notifications={pendingNotifications} />
        </div>
      )}

      {/* ── Main grid ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">

        {/* ── Left column (2/3 width on desktop) ── */}
        <div className="space-y-5 lg:col-span-2">
          {/* Streak + CTA row */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <StreakCard
              streakCount={streakCount}
              longestStreak={longestStreak}
              todayComplete={todayComplete}
            />
            <DailyCheckupCTA todayCheckupComplete={todayComplete} todayCheckupCount={todayCheckupCount} />
          </div>

          {/* Calendar */}
          <CalendarCheckupCard
            completedDates={completedDates}
            today={today}
            resultsByDate={resultsByDate}
          />

          {/* Metrics */}
          <MetricsSummaryCards
            heartRate={typeof liveHR === 'number' ? Math.round(liveHR) : null}
            signalQuality={liveSignalQuality}
            trend={typeof liveTrend === 'string' ? (liveTrend.charAt(0).toUpperCase() + liveTrend.slice(1)) : null}
            weeklyCompletion={liveWeeklyCompletion}
            wellnessScore={liveWellnessScore}
          />
        </div>

        {/* ── Right column (1/3 width on desktop) ── */}
        <div className="space-y-5">
          <div className="hidden lg:block">
            <MascotPanel mascotHealth={mascotHealth} />
          </div>
          <HealthProfileCard />
          <GenerateReportButton />
        </div>
      </div>

      {/* ── Page-level safety footer ── */}
      <footer className="mt-8 text-center text-xs text-nn-navy-light/70">
        Materna is a wellness communication tool. It is not a diagnostic device and does not replace professional medical care.
        <br />
        <strong>Emergency:</strong> If you experience chest pain, severe headache, vision changes, heavy bleeding, or reduced fetal movement — seek urgent care immediately or call 911.
      </footer>
    </div>
  )
}
