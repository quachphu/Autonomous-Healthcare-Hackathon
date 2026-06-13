import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { getDoctorDashboardSummary, type DoctorDashboardSummary } from '../lib/api'

function getGreeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const MOCK_SUMMARY: DoctorDashboardSummary = {
  total_patients: 2,
  patients_with_recent_checkups: 1,
  patients_with_missed_checkups: 1,
  patients_with_urgent_symptoms: 0,
}

export default function DoctorDashboardPage() {
  const { displayName, isDemoMode } = useAuth()
  const navigate = useNavigate()
  const [summary, setSummary] = useState<DoctorDashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isDemoMode) {
      setSummary(MOCK_SUMMARY)
      setLoading(false)
    } else {
      getDoctorDashboardSummary()
        .then(setSummary)
        .catch(err => {
          console.error('Failed to load doctor dashboard summary:', err)
          setError(err.message || 'Failed to load dashboard')
        })
        .finally(() => setLoading(false))
    }
  }, [isDemoMode])

  if (loading) {
    return (
      <div className="min-h-full p-6 lg:p-8 flex items-center justify-center">
        <p className="text-nn-navy-light">Loading dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-full p-6 lg:p-8">
        <div className="rounded-xl bg-red-50 border border-red-100 px-5 py-4">
          <p className="text-red-800 font-medium">Error loading dashboard</p>
          <p className="text-red-600 text-sm mt-1">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full p-6 lg:p-8">
      {/* Page header */}
      <header className="fade-up mb-6">
        <h1 className="text-2xl font-bold text-nn-navy">
          {getGreeting()}, Dr. {displayName}
        </h1>
        <p className="mt-1 text-sm text-nn-navy-light">
          Care team dashboard and patient overview
        </p>
      </header>

      {/* Metrics grid */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4 mb-6">
        {/* Total patients */}
        <div className="fade-up rounded-2xl bg-white p-6 shadow-sm border border-nn-mist">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nn-deep-blue/10">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-nn-deep-blue">
                <circle cx="7" cy="6" r="3" />
                <circle cx="14" cy="8" r="2.5" />
                <path d="M2 17v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M12 17v-1.5a3.5 3.5 0 0 1 3.5-3.5h0a3.5 3.5 0 0 1 3.5 3.5V17" strokeLinecap="round" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-nn-navy-light">Total Patients</h3>
          </div>
          <p className="text-3xl font-bold text-nn-navy">{summary?.total_patients ?? 0}</p>
        </div>

        {/* Recent checkups */}
        <div className="fade-up fade-up-1 rounded-2xl bg-white p-6 shadow-sm border border-nn-mist">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-emerald-600">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.17l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-nn-navy-light">Recent Checkups</h3>
          </div>
          <p className="text-3xl font-bold text-nn-navy">{summary?.patients_with_recent_checkups ?? 0}</p>
          <p className="text-xs text-nn-navy-light mt-1">Last 7 days</p>
        </div>

        {/* Missed checkups */}
        <div className="fade-up fade-up-2 rounded-2xl bg-white p-6 shadow-sm border border-nn-mist">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-amber-600">
                <path d="M10 6v5l3 2" strokeLinecap="round" />
                <circle cx="10" cy="10" r="7" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-nn-navy-light">Missed Checkups</h3>
          </div>
          <p className="text-3xl font-bold text-nn-navy">{summary?.patients_with_missed_checkups ?? 0}</p>
          <p className="text-xs text-nn-navy-light mt-1">&gt;3 days inactive</p>
        </div>

        {/* Urgent symptoms */}
        <div className="fade-up fade-up-3 rounded-2xl bg-white p-6 shadow-sm border border-nn-mist">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-red-600">
                <path d="M10 6v5M10 14h.01" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="10" cy="10" r="7" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-nn-navy-light">Urgent Symptoms</h3>
          </div>
          <p className="text-3xl font-bold text-nn-navy">{summary?.patients_with_urgent_symptoms ?? 0}</p>
          <p className="text-xs text-nn-navy-light mt-1">Flagged for review</p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 mb-6">
        <button
          onClick={() => navigate('/patients')}
          className="fade-up fade-up-4 rounded-2xl bg-gradient-to-br from-nn-pale-sky to-nn-periwinkle p-6 text-left hover:shadow-md transition-shadow border border-nn-periwinkle/50"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-nn-deep-blue">
                <circle cx="7" cy="6" r="3" />
                <circle cx="14" cy="8" r="2.5" />
                <path d="M2 17v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M12 17v-1.5a3.5 3.5 0 0 1 3.5-3.5h0a3.5 3.5 0 0 1 3.5 3.5V17" strokeLinecap="round" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-nn-navy">Manage Patients</h3>
              <p className="text-sm text-nn-navy-light">View profiles and health records</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => navigate('/messaging')}
          className="fade-up fade-up-5 rounded-2xl bg-gradient-to-br from-nn-soft-blue to-nn-mist p-6 text-left hover:shadow-md transition-shadow border border-nn-mist"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white">
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5 text-nn-deep-blue">
                <path d="M17 10.5C17 14.09 13.87 17 10 17c-1.07 0-2.08-.22-3-.62L3 17l.93-3.5A6.4 6.4 0 0 1 3 10.5C3 6.91 6.13 4 10 4s7 2.91 7 6.5Z" strokeLinejoin="round" />
              </svg>
            </div>
            <div>
              <h3 className="font-semibold text-nn-navy">Messaging</h3>
              <p className="text-sm text-nn-navy-light">Chat with patients and team</p>
            </div>
          </div>
        </button>
      </div>

      {/* Empty state for no patients */}
      {summary?.total_patients === 0 && (
        <div className="fade-up fade-up-6 rounded-2xl bg-nn-soft-blue border border-nn-mist p-8 text-center">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12 mx-auto mb-4 text-nn-navy-light">
            <circle cx="7" cy="6" r="3" />
            <circle cx="14" cy="8" r="2.5" />
            <path d="M2 17v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M12 17v-1.5a3.5 3.5 0 0 1 3.5-3.5h0a3.5 3.5 0 0 1 3.5 3.5V17" strokeLinecap="round" />
          </svg>
          <h3 className="font-semibold text-nn-navy mb-2">No patients connected yet</h3>
          <p className="text-sm text-nn-navy-light mb-4">
            Connect with patients to start monitoring their wellness check-ins
          </p>
          <button
            onClick={() => navigate('/settings')}
            className="rounded-xl bg-nn-deep-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-nn-deep-blue-hover transition-colors"
          >
            Go to Care Team Settings
          </button>
        </div>
      )}
    </div>
  )
}
