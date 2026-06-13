import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { mockVitals, today } from '../data/mockData'
import type { CheckupResult } from '../types/checkup'
import type { WatchData, AgentSummary } from '../lib/api'

interface CheckinDateData {
  date: string
  streak: number
}

// Materna voice check-in extras (watch sim + conversation summary), shown on results.
export interface MaternaExtras {
  watch_data?: WatchData
  summary?: AgentSummary
  urgency_level?: string
  emergency_placed?: boolean
}

interface AppState {
  todayCheckupComplete: boolean
  streakCount: number
  longestStreak: number
  mascotHealth: number
  completedDates: CheckinDateData[]
  vitals: typeof mockVitals
  checkupResult: CheckupResult | null
  resultsByDate: Record<string, CheckupResult>
  maternaExtras: MaternaExtras | null
  setMaternaExtras: (e: MaternaExtras | null) => void
  setCheckupResult: (r: CheckupResult) => void
  addResultForDate: (date: string, result: CheckupResult) => void
  markCheckupComplete: () => void
  setTodayCheckupComplete: (done: boolean) => void
  setStreakCount: (count: number) => void
  setLongestStreak: (count: number) => void
  setMascotHealth: (health: number) => void
  setCompletedDates: (dates: CheckinDateData[]) => void
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [todayCheckupComplete, setTodayCheckupComplete] = useState(false)
  const [streakCount, setStreakCount] = useState(0)
  const [longestStreak, setLongestStreak] = useState(0)
  const [mascotHealth, setMascotHealth] = useState(80)
  const [completedDates, setCompletedDates] = useState<CheckinDateData[]>([])
  const [vitals] = useState(mockVitals)
  const [checkupResult, setCheckupResultState] = useState<CheckupResult | null>(null)
  const [resultsByDate, setResultsByDate] = useState<Record<string, CheckupResult>>({})
  const [maternaExtras, setMaternaExtras] = useState<MaternaExtras | null>(null)

  const setCheckupResult = useCallback((r: CheckupResult) => {
    setCheckupResultState(r)
    const resultDate = r.created_at.substring(0, 10)
    const localToday = new Date().toLocaleDateString('en-CA')
    setResultsByDate(prev => ({
      ...prev,
      [resultDate]: r,
      // Also key by local today so UTC-offset edge cases don't break calendar lookup
      [localToday]: r,
    }))
  }, [])

  const addResultForDate = useCallback((date: string, result: CheckupResult) => {
    setResultsByDate(prev => ({ ...prev, [date]: result }))
  }, [])

  function markCheckupComplete() {
    if (todayCheckupComplete) return
    setTodayCheckupComplete(true)
    setStreakCount((n) => {
      const newStreak = n + 1
      setLongestStreak((longest) => Math.max(longest, newStreak))
      return newStreak
    })
    setCompletedDates((dates) => {
      const dateStrings = dates.map(d => d.date)
      if (dateStrings.includes(today)) return dates
      const newStreak = streakCount + 1
      return [...dates, { date: today, streak: newStreak }]
    })
    setMascotHealth((health) => Math.min(100, health + 10))
  }

  return (
    <AppContext.Provider
      value={{
        todayCheckupComplete,
        streakCount,
        longestStreak,
        mascotHealth,
        completedDates,
        vitals,
        checkupResult,
        resultsByDate,
        maternaExtras,
        setMaternaExtras,
        setCheckupResult,
        addResultForDate,
        markCheckupComplete,
        setTodayCheckupComplete: setTodayCheckupComplete,
        setStreakCount,
        setLongestStreak,
        setMascotHealth,
        setCompletedDates,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used inside <AppProvider>')
  return ctx
}
