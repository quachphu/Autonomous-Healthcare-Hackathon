import { useState, useEffect, useRef } from 'react'
import { mockUser } from '../data/mockData'
import { useAuth } from '../contexts/AuthContext'
import {
  listMyPatients,
  addPatient,
  removePatient,
  listMyDoctors,
  updateProfile,
  getReceivedConnectionRequests,
  getSentConnectionRequests,
  acceptConnectionRequest,
  rejectConnectionRequest,
  listHealthDocuments,
  uploadHealthDocument,
  deleteHealthDocument,
  getNotificationPreferences,
  updateNotificationPreferences,
  type DoctorPatientLink,
  type DoctorPatientLinkWithStatus,
  type HealthDocument,
  type NotificationPreferences,
} from '../lib/api'

export default function SettingsPage() {
  const { displayName, signOut, role, isDemoMode, dueDate, gestationalWeek, setDueDate } = useAuth()
  const [activeTab, setActiveTab] = useState<'profile' | 'care-team' | 'health' | 'preferences'>('profile')

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <div className="fade-up mb-6">
          <h1 className="text-2xl font-bold text-nn-navy">Settings & Profile</h1>
          <p className="text-sm text-nn-navy-light">
            Your health context, preferences, and account settings
          </p>
        </div>

        {/* Tab navigation */}
        <div className="mb-6 flex gap-2 overflow-x-auto pb-2">
          {[
            { id: 'profile' as const, label: 'Profile' },
            { id: 'care-team' as const, label: 'Care Team' },
            ...(role === 'patient' ? [{ id: 'health' as const, label: 'Health Context' }] : []),
            { id: 'preferences' as const, label: 'Preferences' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-nn-deep-blue text-white'
                  : 'bg-white text-nn-navy hover:bg-nn-pale-sky border border-nn-mist'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="space-y-5">
          {/* Profile tab */}
          {activeTab === 'profile' && (
            <>
              <ProfileCard />
              <HealthDocumentsCard />
            </>
          )}

          {/* Care Team tab */}
          {activeTab === 'care-team' && (
            <>
              {role === 'doctor' && <DoctorPatientsCard />}
              {role === 'patient' && <PatientCareTeamCard />}
              {!isDemoMode && <ConnectionRequestsCard />}
            </>
          )}

          {/* Health tab (patient only) */}
          {activeTab === 'health' && role === 'patient' && (
            <>
              {/* Health context card */}
              <div className="fade-up fade-up-3 rounded-3xl bg-white p-6 shadow-sm">
                <h2 className="mb-4 font-semibold text-nn-navy">Health Context</h2>
                <div className="space-y-3">
                  <SettingRow label="Gestational Week" value={`Week ${gestationalWeek} of 40`} />
                  <div className="flex items-center justify-between border-b border-nn-mist/60 pb-3">
                    <span className="text-sm text-nn-navy-light">Due Date</span>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => e.target.value && setDueDate(e.target.value)}
                      className="rounded-xl border border-nn-mist bg-nn-pale-sky px-3 py-1.5 text-sm text-nn-navy outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                    />
                  </div>
                </div>
              </div>
              {/* Emergency contact */}
              <EmergencyContactCard />
            </>
          )}

          {/* Preferences tab */}
          {activeTab === 'preferences' && (
            <NotificationPreferencesCard />
          )}

          {/* Safety notice - always visible */}
          {/*
          <div className="fade-up fade-up-6 rounded-3xl border border-amber-200 bg-amber-50 p-6">
            <div className="flex gap-3">
              <svg viewBox="0 0 20 20" fill="none" stroke="#d97706" strokeWidth="1.8" className="mt-0.5 h-5 w-5 flex-shrink-0">
                <path d="M10 2L2 17h16L10 2Z" strokeLinejoin="round" />
                <path d="M10 8v4M10 14v.5" strokeLinecap="round" />
              </svg>
              <div>
                <p className="font-semibold text-amber-800">Medical safety notice</p>
                <p className="mt-1 text-sm text-amber-700 leading-relaxed">
                  Materna is a wellness communication tool, not a diagnostic device. All rPPG
                  values are estimates. Blood pressure must be measured with a validated cuff.
                  Always contact your care team for medical decisions. If you have a medical emergency,
                  call 911.
                </p>
              </div>
            </div>
          </div>
          */}

          {/* Sign out */}
          <div className="fade-up text-center">
            <button
              onClick={() => void signOut()}
              className="rounded-xl border border-red-200 bg-white px-8 py-3 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileCard() {
  const { displayName, role, isDemoMode, firstName, lastName, setProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [firstInput, setFirstInput] = useState(firstName ?? '')
  const [lastInput, setLastInput] = useState(lastName ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Keep inputs in sync when context loads
  useEffect(() => {
    if (!editing) {
      setFirstInput(firstName ?? '')
      setLastInput(lastName ?? '')
    }
  }, [firstName, lastName, editing])

  async function handleSave() {
    if (isDemoMode) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      const updated = await updateProfile({
        first_name: firstInput.trim() || undefined,
        last_name: lastInput.trim() || undefined,
      })
      setProfile(updated)
      setEditing(false)
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setFirstInput(firstName ?? '')
    setLastInput(lastName ?? '')
    setEditing(false)
    setError('')
  }

  return (
    <div className="fade-up fade-up-1 rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-nn-deep-blue text-2xl font-bold text-white shadow-sm">
          {displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-xl font-bold text-nn-navy">{displayName}</p>
          <span className="mt-1 inline-block rounded-full bg-nn-pale-sky px-3 py-0.5 text-xs font-medium text-nn-deep-blue capitalize">
            {role ?? 'No role set'}
          </span>
        </div>
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-nn-navy-light">First Name</label>
              <input
                value={firstInput}
                onChange={(e) => setFirstInput(e.target.value)}
                placeholder="First name"
                className="w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-2.5 text-sm text-nn-navy placeholder-nn-navy-light outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-nn-navy-light">Last Name</label>
              <input
                value={lastInput}
                onChange={(e) => setLastInput(e.target.value)}
                placeholder="Last name"
                className="w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-2.5 text-sm text-nn-navy placeholder-nn-navy-light outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
              />
            </div>
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-nn-deep-blue px-6 py-3 text-sm font-medium text-white disabled:opacity-40 transition-all"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-xl border border-nn-mist px-5 py-2.5 text-sm font-medium text-nn-navy hover:bg-nn-pale-sky transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-nn-mist/60 pb-3">
            <span className="text-sm text-nn-navy-light">Full Name</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-nn-navy">{displayName}</span>
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-medium text-nn-deep-blue hover:underline"
              >
                Edit
              </button>
            </div>
          </div>
          <SettingRow label="Role" value={role ?? 'Not set'} />
        </div>
      )}
    </div>
  )
}

function EmergencyContactCard() {
  const { isDemoMode, emergencyContactName, emergencyContactPhone, setProfile } = useAuth()
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(emergencyContactName ?? '')
  const [phoneInput, setPhoneInput] = useState(emergencyContactPhone ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!editing) {
      setNameInput(emergencyContactName ?? '')
      setPhoneInput(emergencyContactPhone ?? '')
    }
  }, [emergencyContactName, emergencyContactPhone, editing])

  const displayName = isDemoMode
    ? mockUser.emergencyContact
    : emergencyContactName ?? 'Not set'
  const displayPhone = isDemoMode ? '' : (emergencyContactPhone ?? '')

  async function handleSave() {
    if (isDemoMode) {
      setEditing(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      const updated = await updateProfile({
        emergency_contact_name: nameInput.trim() || undefined,
        emergency_contact_phone: phoneInput.trim() || undefined,
      })
      setProfile(updated)
      setEditing(false)
    } catch (e: any) {
      setError(e.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setNameInput(emergencyContactName ?? '')
    setPhoneInput(emergencyContactPhone ?? '')
    setEditing(false)
    setError('')
  }

  return (
    <div className="fade-up fade-up-4 rounded-3xl bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-nn-navy">Emergency Contact</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-xs font-medium text-nn-deep-blue hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-nn-navy-light">Contact Name</label>
            <input
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-2.5 text-sm text-nn-navy placeholder-nn-navy-light outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-nn-navy-light">Phone Number</label>
            <input
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="e.g. +1 (555) 000-0000"
              type="tel"
              className="w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-2.5 text-sm text-nn-navy placeholder-nn-navy-light outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
            />
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-nn-deep-blue px-6 py-3 text-sm font-medium text-white disabled:opacity-40 transition-all"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={handleCancel}
              className="rounded-xl border border-nn-mist px-5 py-2.5 text-sm font-medium text-nn-navy hover:bg-nn-pale-sky transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <SettingRow label="Name" value={displayName} />
          {displayPhone && <SettingRow label="Phone" value={displayPhone} />}
          {!isDemoMode && !emergencyContactName && !emergencyContactPhone && (
            <p className="text-sm text-nn-navy-light">No emergency contact set yet.</p>
          )}
        </div>
      )}
    </div>
  )
}

function DoctorPatientsCard() {
  const { isDemoMode } = useAuth()
  const [patients, setPatients] = useState<DoctorPatientLink[]>([])
  const [newPatientId, setNewPatientId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isDemoMode) return
    listMyPatients()
      .then(setPatients)
      .catch(() => {})
  }, [isDemoMode])

  async function handleAdd() {
    const id = newPatientId.trim()
    if (!id) return
    setError('')
    setLoading(true)
    try {
      const link = await addPatient(id)
      setPatients((prev) => [...prev, link])
      setNewPatientId('')
    } catch (e: any) {
      setError(e.message || 'Failed to add patient')
    } finally {
      setLoading(false)
    }
  }

  async function handleRemove(patientId: string) {
    try {
      await removePatient(patientId)
      setPatients((prev) => prev.filter((p) => p.patient_id !== patientId))
    } catch {
      // Could show error
    }
  }

  return (
    <div className="fade-up fade-up-2 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-nn-navy">My Patients</h2>

      {patients.length === 0 && (
        <p className="mb-4 text-sm text-nn-navy-light">No patients added yet.</p>
      )}

      {patients.length > 0 && (
        <div className="mb-4 space-y-2">
          {patients.map((p) => (
            <div
              key={p.patient_id}
              className="flex items-center justify-between rounded-2xl bg-nn-pale-sky px-4 py-3"
            >
              <span className="text-sm font-medium text-nn-navy truncate">
                {p.patient_display_name}
              </span>
              <button
                onClick={() => handleRemove(p.patient_id)}
                className="ml-3 flex h-7 w-7 items-center justify-center rounded-full text-red-500 hover:bg-red-50 transition-colors"
                aria-label="Remove patient"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <div className="flex gap-2">
          <input
            value={newPatientId}
            onChange={(e) => setNewPatientId(e.target.value)}
            placeholder="Paste patient ID here"
            className="flex-1 rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-2.5 text-sm text-nn-navy placeholder-nn-navy-light outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
          />
          <button
            onClick={handleAdd}
            disabled={loading || !newPatientId.trim()}
            className="rounded-xl bg-nn-deep-blue px-6 py-3 text-sm font-medium text-white disabled:opacity-40 transition-all"
          >
            Add Patient
          </button>
        </div>
        <p className="mt-1 text-xs text-nn-navy-light">
          Patient will share this from Settings → My Care Team
        </p>
        {error && (
          <p className="mt-1 text-xs text-red-500">{error}</p>
        )}
      </div>
    </div>
  )
}

function PatientCareTeamCard() {
  const { user, isDemoMode } = useAuth()
  const [doctors, setDoctors] = useState<DoctorPatientLink[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (isDemoMode) return
    listMyDoctors()
      .then(setDoctors)
      .catch(() => {})
  }, [isDemoMode])

  async function handleCopy() {
    if (!user?.id) return
    try {
      await navigator.clipboard.writeText(user.id)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Graceful fallback for older browsers
    }
  }

  const displayId = isDemoMode ? 'demo-patient-id' : user?.id

  return (
    <div className="fade-up fade-up-2 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-nn-navy">My Care Team</h2>

      {/* UUID section */}
      <div className="mb-5">
        <p className="mb-2 text-xs font-medium text-nn-navy-light uppercase tracking-wider">Your ID</p>
        <div className="flex gap-2">
          <div className="flex-1 rounded-xl bg-nn-pale-sky px-4 py-3 font-mono text-xs text-nn-navy break-all">
            {displayId}
          </div>
          <button
            onClick={handleCopy}
            className="flex h-auto items-center justify-center rounded-xl bg-nn-deep-blue px-4 py-2 text-xs font-medium text-white hover:bg-nn-deep-blue-hover transition-colors"
          >
            {copied ? '✓ Copied!' : 'Copy ID'}
          </button>
        </div>
        <p className="mt-2 text-xs text-nn-navy-light">
          Share this ID with your doctor to connect your care team
        </p>
      </div>

      {/* Doctors section */}
      <div>
        <p className="mb-2 text-xs font-medium text-nn-navy-light uppercase tracking-wider">Assigned Doctors</p>
        {doctors.length === 0 ? (
          <p className="text-sm text-nn-navy-light">No doctors assigned yet.</p>
        ) : (
          <div className="space-y-2">
            {doctors.map((d) => (
              <div
                key={d.doctor_id}
                className="flex items-center gap-3 rounded-2xl bg-nn-pale-sky px-4 py-3"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-nn-deep-blue text-xs font-bold text-white flex-shrink-0">
                  Dr
                </div>
                <span className="text-sm font-medium text-nn-navy truncate">
                  {d.doctor_display_name}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ConnectionRequestsCard() {
  const { role } = useAuth()
  const [receivedRequests, setReceivedRequests] = useState<DoctorPatientLinkWithStatus[]>([])
  const [sentRequests, setSentRequests] = useState<DoctorPatientLinkWithStatus[]>([])
  const [loading, setLoading] = useState<string | null>(null)

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    try {
      const [received, sent] = await Promise.all([
        getReceivedConnectionRequests(),
        getSentConnectionRequests(),
      ])
      setReceivedRequests(received)
      setSentRequests(sent)
    } catch {
      // Ignore errors
    }
  }

  async function handleAccept(connectionId: string) {
    setLoading(connectionId)
    try {
      await acceptConnectionRequest(connectionId)
      await loadRequests()
      // You might want to reload the main care team list here
      window.location.reload() // Simple approach to refresh all data
    } catch (err) {
      console.error('Failed to accept connection:', err)
    } finally {
      setLoading(null)
    }
  }

  async function handleReject(connectionId: string) {
    setLoading(connectionId)
    try {
      await rejectConnectionRequest(connectionId)
      await loadRequests()
    } catch (err) {
      console.error('Failed to reject connection:', err)
    } finally {
      setLoading(null)
    }
  }

  const hasRequests = receivedRequests.length > 0 || sentRequests.length > 0

  if (!hasRequests) return null

  return (
    <div className="fade-up rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="mb-4 font-semibold text-nn-navy">Connection Requests</h2>

      {/* Received Requests */}
      {receivedRequests.length > 0 && (
        <div className="mb-6">
          <p className="mb-3 text-xs font-medium text-nn-navy-light uppercase tracking-wider">
            Received Requests
          </p>
          <div className="space-y-3">
            {receivedRequests.map((req) => {
              const otherName = role === 'doctor' ? req.patient_display_name : req.doctor_display_name
              const connectionId = `${req.doctor_id}:${req.patient_id}`
              const isLoading = loading === connectionId

              return (
                <div
                  key={connectionId}
                  className="rounded-2xl border border-nn-mist bg-nn-pale-sky p-4"
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-nn-deep-blue text-white flex items-center justify-center text-sm font-semibold">
                        {role === 'doctor' ? 'P' : 'Dr'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-nn-navy truncate">{otherName}</p>
                        <p className="text-xs text-nn-navy-light">
                          Wants to connect with you
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleAccept(connectionId)}
                      disabled={isLoading}
                      className="flex-1 rounded-xl bg-nn-deep-blue px-4 py-2 text-sm font-medium text-white hover:bg-nn-deep-blue/90 disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? 'Accepting...' : 'Accept'}
                    </button>
                    <button
                      onClick={() => handleReject(connectionId)}
                      disabled={isLoading}
                      className="flex-1 rounded-xl border border-nn-mist px-4 py-2 text-sm font-medium text-nn-navy hover:bg-white disabled:opacity-50 transition-colors"
                    >
                      {isLoading ? 'Declining...' : 'Decline'}
                    </button>
                  </div>

                  <p className="mt-3 text-xs text-nn-navy-light leading-relaxed">
                    {role === 'doctor'
                      ? 'Accepting this connection will grant you access to their health records and emergency contact information.'
                      : 'Accepting this connection will grant them access to your health records and emergency contact information.'}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Sent Requests */}
      {sentRequests.length > 0 && (
        <div>
          <p className="mb-3 text-xs font-medium text-nn-navy-light uppercase tracking-wider">
            Sent Requests
          </p>
          <div className="space-y-2">
            {sentRequests.map((req) => {
              const otherName = role === 'doctor' ? req.patient_display_name : req.doctor_display_name

              return (
                <div
                  key={`${req.doctor_id}:${req.patient_id}`}
                  className="flex items-center gap-3 rounded-2xl bg-nn-pale-sky px-4 py-3"
                >
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-nn-deep-blue text-white flex items-center justify-center text-xs font-semibold">
                    {role === 'doctor' ? 'P' : 'Dr'}
                  </div>
                  <span className="text-sm font-medium text-nn-navy truncate flex-1">
                    {otherName}
                  </span>
                  <span className="flex-shrink-0 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                    Pending
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function HealthDocumentsCard() {
  const { isDemoMode } = useAuth()
  const [docs, setDocs] = useState<HealthDocument[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadSuccess, setUploadSuccess] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isDemoMode) return
    listHealthDocuments()
      .then(setDocs)
      .catch(() => {})
  }, [isDemoMode])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setUploadError('Only PDF files are supported.')
      if (inputRef.current) inputRef.current.value = ''
      return
    }
    setUploadError('')
    setUploadSuccess('')
    setUploading(true)
    try {
      const result = await uploadHealthDocument(file)
      setUploadSuccess(
        result.warning
          ? `Uploaded "${result.file_name}" (indexing: ${result.warning})`
          : `"${result.file_name}" uploaded and indexed.`
      )
      const refreshed = await listHealthDocuments()
      setDocs(refreshed)
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function handleDelete(docId: string) {
    setDeletingId(docId)
    try {
      await deleteHealthDocument(docId)
      setDocs((prev) => prev.filter((d) => d.id !== docId))
    } catch {
      // Silent failure — doc still shows
    } finally {
      setDeletingId(null)
    }
  }

  const statusBadge = (status: HealthDocument['processing_status']) => {
    const cfg: Record<string, { label: string; cls: string }> = {
      uploaded:          { label: 'Uploaded',          cls: 'bg-nn-pale-sky text-nn-deep-blue' },
      processing:        { label: 'Processing…',       cls: 'bg-amber-100 text-amber-700' },
      indexed:           { label: 'Indexed',           cls: 'bg-emerald-100 text-emerald-700' },
      partially_indexed: { label: 'Partial',           cls: 'bg-amber-100 text-amber-700' },
      failed:            { label: 'Failed',            cls: 'bg-red-100 text-red-600' },
    }
    const { label, cls } = cfg[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
    return (
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
        {label}
      </span>
    )
  }

  return (
    <div className="fade-up fade-up-2 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="mb-1 font-semibold text-nn-navy">Health Documents</h2>
      <p className="mb-4 text-xs text-nn-navy-light leading-relaxed">
        Upload PDFs from your care team so Materna can help summarize and reference them
        during check-ins.
      </p>

      {/* Upload area */}
      <label
        htmlFor="pdf-upload"
        className={[
          'flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-colors',
          uploading
            ? 'border-nn-periwinkle/50 bg-nn-pale-sky/40 cursor-not-allowed'
            : 'border-nn-mist hover:border-nn-periwinkle hover:bg-nn-pale-sky/40',
        ].join(' ')}
      >
        {uploading ? (
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-nn-periwinkle border-t-nn-deep-blue" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="#4663ac" strokeWidth="1.6" className="h-8 w-8">
            <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M12 12V4m0 0L8.5 7.5M12 4l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
        <span className="text-sm font-medium text-nn-navy">
          {uploading ? 'Uploading…' : 'Click to upload a PDF'}
        </span>
        <span className="text-xs text-nn-navy-light">PDF files only · max 20 MB</span>
        <input
          id="pdf-upload"
          ref={inputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="sr-only"
          disabled={uploading || isDemoMode}
          onChange={handleFileChange}
        />
      </label>

      {isDemoMode && (
        <p className="mt-2 text-xs text-nn-navy-light">Document upload is disabled in demo mode.</p>
      )}

      {uploadSuccess && (
        <p className="mt-2 text-xs text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{uploadSuccess}</p>
      )}
      {uploadError && (
        <p className="mt-2 text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{uploadError}</p>
      )}

      {/* Document list */}
      {docs.length > 0 && (
        <div className="mt-4 space-y-2">
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-3 rounded-2xl border border-nn-mist bg-nn-pale-sky px-4 py-3"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="#4663ac" strokeWidth="1.6" className="mt-0.5 h-5 w-5 flex-shrink-0">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-nn-navy">{doc.file_name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {statusBadge(doc.processing_status)}
                  {doc.page_count != null && (
                    <span className="text-[10px] text-nn-navy-light">{doc.page_count}p</span>
                  )}
                  <span className="text-[10px] text-nn-navy-light">
                    {new Date(doc.uploaded_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                </div>
                {doc.error_message && (
                  <p className="mt-1 text-[10px] text-red-500 leading-snug">{doc.error_message}</p>
                )}
              </div>
              <button
                onClick={() => handleDelete(doc.id)}
                disabled={deletingId === doc.id}
                className="ml-1 flex-shrink-0 rounded-full p-1 text-nn-navy-light hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                aria-label="Remove document"
              >
                {deletingId === doc.id ? (
                  <div className="h-4 w-4 animate-spin rounded-full border border-nn-navy-light border-t-transparent" />
                ) : (
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                    <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
                  </svg>
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {!isDemoMode && docs.length === 0 && (
        <p className="mt-3 text-xs text-nn-navy-light">No documents uploaded yet.</p>
      )}

      <p className="mt-4 text-[10px] text-nn-navy-light leading-relaxed">
        Materna uses uploaded documents to support wellness summaries and care-team questions.
        It does not replace medical advice.
      </p>
    </div>
  )
}

function NotificationPreferencesCard() {
  const { isDemoMode } = useAuth()
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    daily_reminder: true,
    streak_alerts: true,
    message_notifications: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isDemoMode) { setLoading(false); return }
    getNotificationPreferences()
      .then(setPrefs)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isDemoMode])

  async function toggle(key: keyof NotificationPreferences) {
    if (isDemoMode || saving) return
    const updated = { ...prefs, [key]: !prefs[key] }
    setPrefs(updated)
    setSaving(true)
    try {
      const saved = await updateNotificationPreferences(updated)
      setPrefs(saved)
    } catch {
      setPrefs(prefs) // revert on failure
    } finally {
      setSaving(false)
    }
  }

  const items: { label: string; key: keyof NotificationPreferences; description: string }[] = [
    {
      label: 'Daily checkup reminder',
      key: 'daily_reminder',
      description: 'Email at 8 AM your time if you haven\'t checked in',
    },
    {
      label: 'Streak milestone alerts',
      key: 'streak_alerts',
      description: 'Email at 12 PM your time to keep your streak going',
    },
    {
      label: 'Doctor message notifications',
      key: 'message_notifications',
      description: 'Email when your care team sends you a message',
    },
  ]

  return (
    <div className="fade-up fade-up-5 rounded-3xl bg-white p-6 shadow-sm">
      <h2 className="mb-1 font-semibold text-nn-navy">Email Notifications</h2>
      <p className="mb-4 text-xs text-nn-navy-light">
        Emails are sent to the address you signed up with.
      </p>
      {loading ? (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-nn-periwinkle border-t-nn-deep-blue" />
        </div>
      ) : (
        <div className="space-y-1">
          {items.map(({ label, key, description }) => (
            <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-nn-mist/60 last:border-0">
              <div>
                <p className="text-sm text-nn-navy">{label}</p>
                <p className="text-xs text-nn-navy-light mt-0.5">{description}</p>
              </div>
              <button
                onClick={() => toggle(key)}
                disabled={saving || isDemoMode}
                className={[
                  'relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors disabled:opacity-60',
                  prefs[key] ? 'bg-nn-deep-blue' : 'bg-nn-mist',
                ].join(' ')}
                aria-label={`Toggle ${label}`}
                aria-pressed={prefs[key]}
              >
                <span
                  className={[
                    'absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform',
                    prefs[key] ? 'translate-x-6' : 'translate-x-1',
                  ].join(' ')}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SettingRow({
  label,
  value,
  valueClass = 'text-nn-navy',
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div className="flex items-center justify-between border-b border-nn-mist/60 pb-3 last:border-0 last:pb-0">
      <span className="text-sm text-nn-navy-light">{label}</span>
      <span className={`text-sm font-medium ${valueClass}`}>{value}</span>
    </div>
  )
}
