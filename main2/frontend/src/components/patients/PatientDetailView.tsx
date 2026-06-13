import { useState } from 'react'
import { type UserProfile, type CheckupSession } from '../../lib/api'
import PatientHealthForm from './PatientHealthForm'
import PatientCheckupHistory from './PatientCheckupHistory'

interface PatientDetailViewProps {
  profile: UserProfile | null
  checkupSessions: CheckupSession[]
  loading: boolean
  loadingSessions: boolean
}

export default function PatientDetailView({
  profile,
  checkupSessions,
  loading,
  loadingSessions,
}: PatientDetailViewProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'health' | 'history'>('profile')

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className="text-nn-navy-light">Loading patient details...</p>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12 mb-4 text-nn-navy-light">
          <circle cx="10" cy="7" r="4" />
          <path d="M4 18v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" strokeLinecap="round" />
        </svg>
        <h3 className="font-medium text-nn-navy mb-1">No patient selected</h3>
        <p className="text-sm text-nn-navy-light">
          Select a patient from the list to view their details
        </p>
      </div>
    )
  }

  const displayName = profile.first_name && profile.last_name
    ? `${profile.first_name} ${profile.last_name}`
    : profile.first_name || profile.last_name || 'Unknown Patient'

  return (
    <div className="h-full flex flex-col">
      {/* Patient header */}
      <div className="p-6 border-b border-nn-mist">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-nn-deep-blue text-white text-xl font-bold flex-shrink-0">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-nn-navy">{displayName}</h2>
            <p className="text-sm text-nn-navy-light">Patient ID: {profile.id.toString().substring(0, 8)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 border-b border-nn-mist flex gap-2">
        {[
          { id: 'profile' as const, label: 'Profile' },
          { id: 'health' as const, label: 'Health Context' },
          { id: 'history' as const, label: 'Checkup History' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2',
              activeTab === tab.id
                ? 'border-nn-deep-blue text-nn-deep-blue'
                : 'border-transparent text-nn-navy-light hover:text-nn-navy',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'profile' && (
          <div className="space-y-4">
            <h3 className="font-semibold text-nn-navy mb-3">Patient Information (Read-Only)</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-nn-navy-light mb-1">
                  First Name
                </label>
                <p className="text-sm text-nn-navy">{profile.first_name || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-nn-navy-light mb-1">
                  Last Name
                </label>
                <p className="text-sm text-nn-navy">{profile.last_name || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-nn-navy-light mb-1">
                  Phone Number
                </label>
                <p className="text-sm text-nn-navy">{profile.phone_number || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-nn-navy-light mb-1">
                  Emergency Contact Name
                </label>
                <p className="text-sm text-nn-navy">{profile.emergency_contact_name || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-nn-navy-light mb-1">
                  Emergency Contact Phone
                </label>
                <p className="text-sm text-nn-navy">{profile.emergency_contact_phone || '—'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-nn-navy-light mb-1">
                  Mascot Health
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-nn-mist rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${profile.mascot_health}%` }} />
                  </div>
                  <span className="text-sm font-medium text-nn-navy">{profile.mascot_health}%</span>
                </div>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-nn-soft-blue border border-nn-mist px-4 py-3">
              <p className="text-xs text-nn-navy-light">
                Profile fields (name, phone, emergency contact) are read-only. Patients can update these in their own settings.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'health' && (
          <div>
            <h3 className="font-semibold text-nn-navy mb-4">Health Context (Editable)</h3>
            <PatientHealthForm patientId={profile.id.toString()} />
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h3 className="font-semibold text-nn-navy mb-4">Checkup History</h3>
            <PatientCheckupHistory sessions={checkupSessions} loading={loadingSessions} />
          </div>
        )}
      </div>
    </div>
  )
}
