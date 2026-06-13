import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useAppContext } from '../contexts/AppContext'
import ResultsSummary from '../components/results/ResultsSummary'
import AISummaryCard from '../components/results/AISummaryCard'
import SafetyNotice from '../components/checkup/SafetyNotice'
import VoiceCheckinResultCard from '../components/results/VoiceCheckinResultCard'
import WatchDataCard from '../components/results/WatchDataCard'
import ConversationSummaryCard from '../components/results/ConversationSummaryCard'
import GenerateReportButton from '../components/dashboard/GenerateReportButton'
import type { SessionStorage } from '../types/checkup'

export default function CheckupResultsPage() {
  const navigate = useNavigate()
  const { role } = useAuth()
  const { todayCheckupComplete, checkupResult, maternaExtras } = useAppContext()
  const hasVoice = !!checkupResult?.voice_checkin

  // Redirect doctors to dashboard
  useEffect(() => {
    if (role === 'doctor') {
      navigate('/dashboard', { replace: true })
    }
  }, [role, navigate])

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">

        {/* Header */}
        <div className="fade-up mb-6 flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-1.5 text-sm text-nn-navy-light hover:text-nn-navy transition-colors"
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Dashboard
          </button>
          <div>
            <h1 className="text-2xl font-bold text-nn-navy">Checkup Results</h1>
            <p className="text-sm text-nn-navy-light">
              {todayCheckupComplete
                ? hasVoice ? "Today's voice + camera check-in is complete" : "Today's wellness checkup is complete"
                : 'Latest checkup results'}
            </p>
          </div>
        </div>

        {/* Complete badge */}
        {todayCheckupComplete && (
          <div className="fade-up fade-up-1 mb-5 flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-100 px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-400 flex-shrink-0">
              <svg viewBox="0 0 16 16" fill="white" className="h-5 w-5">
                <path d="M3 8l3.5 3.5L13 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-emerald-800">Check-in complete!</p>
              <p className="text-sm text-emerald-600">Your streak has been updated. Keep it up!</p>
            </div>
          </div>
        )}

        <div className="space-y-5">
          {/* rPPG stats */}
          <div className="fade-up fade-up-2">
            <ResultsSummary />
          </div>

          {/* Conversation summary (mood, symptom flags, hospital note) */}
          {maternaExtras?.summary && (
            <div className="fade-up fade-up-2">
              <ConversationSummaryCard
                summary={maternaExtras.summary}
                urgencyLevel={maternaExtras.urgency_level}
                emergencyPlaced={maternaExtras.emergency_placed}
              />
            </div>
          )}

          {/* Simulated wearable overnight summary */}
          {maternaExtras?.watch_data && (
            <div className="fade-up fade-up-3">
              <WatchDataCard watch={maternaExtras.watch_data} />
            </div>
          )}

          {/* Voice check-in notes */}
          {hasVoice && (
            <div className="fade-up fade-up-3">
              <VoiceCheckinResultCard result={checkupResult!} />
            </div>
          )}

          {/* AI / session summary */}
          <div className="fade-up fade-up-4">
            <AISummaryCard />
          </div>

          {/* Storage status */}
          {checkupResult?.storage && (
            <div className="fade-up fade-up-5">
              <StorageStatusCard storage={checkupResult.storage} />
            </div>
          )}

          {/* Doctor report (PDF) */}
          <div className="fade-up fade-up-6">
            <GenerateReportButton />
          </div>

          {/* Safety notice */}
          <div className="fade-up fade-up-6">
            <SafetyNotice />
          </div>

          {/* Action buttons */}
          <div className="fade-up fade-up-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => navigate('/dashboard')}
              className="rounded-xl border border-nn-mist bg-white px-5 py-2.5 text-sm font-semibold text-nn-navy hover:bg-nn-pale-sky transition-colors"
            >
              ← Back to Dashboard
            </button>
            <button
              onClick={() => navigate('/messaging?tab=doctor')}
              className="rounded-xl bg-nn-deep-blue px-6 py-3 text-sm font-semibold text-white hover:bg-nn-deep-blue-hover transition-colors"
            >
              Message Your Doctor
            </button>
            <button
              onClick={() => navigate('/messaging?tab=ai')}
              className="rounded-xl bg-nn-periwinkle px-5 py-2.5 text-sm font-semibold text-nn-navy hover:bg-nn-soft-blue transition-colors"
            >
              Ask Materna AI
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function StorageStatusCard({ storage }: { storage: SessionStorage }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-nn-mist">
      <p className="text-xs font-semibold text-nn-navy mb-2">Session saved</p>
      <div className="flex gap-3 flex-wrap">
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
          storage.saved_local_json ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {storage.saved_local_json ? '✓' : '✗'} Saved locally
        </span>
        <span className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-semibold ${
          storage.saved_supabase ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
        }`}>
          {storage.saved_supabase ? '✓' : '!'} {storage.saved_supabase ? 'Synced to cloud' : 'Cloud sync pending'}
        </span>
      </div>
      {storage.supabase_error && !storage.saved_supabase && (
        <p className="mt-2 text-[10px] text-amber-700" style={{ fontFamily: 'var(--font-body)' }}>
          {storage.supabase_error.includes('not configured')
            ? 'Supabase not configured — saved locally only.'
            : `Supabase sync failed. ${storage.supabase_error}`}
        </p>
      )}
    </div>
  )
}
