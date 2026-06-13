import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import {
  listMyPatients,
  getUserProfile,
  getPatientCheckupSessions,
  isDemoMode,
  type DoctorPatientLink,
  type UserProfile,
  type CheckupSession,
} from '../lib/api'
import PatientList from '../components/patients/PatientList'
import PatientDetailView from '../components/patients/PatientDetailView'

// Mock data for demo mode
const MOCK_PATIENTS: DoctorPatientLink[] = [
  {
    doctor_id: 'demo-doctor',
    patient_id: 'demo-patient-1',
    created_at: new Date().toISOString(),
    patient_display_name: 'Sarah Johnson',
    doctor_display_name: 'Dr. Demo',
  },
  {
    doctor_id: 'demo-doctor',
    patient_id: 'demo-patient-2',
    created_at: new Date().toISOString(),
    patient_display_name: 'Emma Williams',
    doctor_display_name: 'Dr. Demo',
  },
]

const MOCK_PROFILE: UserProfile = {
  id: 'demo-patient-1',
  role: 'patient',
  first_name: 'Sarah',
  last_name: 'Johnson',
  phone_number: '(555) 123-4567',
  emergency_contact_name: 'John Johnson',
  emergency_contact_phone: '(555) 987-6543',
  mascot_health: 85,
  longest_streak: 14,
  last_checkin_date: new Date().toISOString().split('T')[0],
  last_health_update: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}

const MOCK_SESSIONS: CheckupSession[] = [
  {
    id: 'demo-session-1',
    user_id: 'demo-patient-1',
    status: 'completed',
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 24 + 120000).toISOString(),
    brownie_points: 0,
    stats: { heart_rate: 78, respiratory_rate: 16 },
    rppg_raw: { signal_quality: 'good' },
  },
  {
    id: 'demo-session-2',
    user_id: 'demo-patient-1',
    status: 'completed',
    started_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    completed_at: new Date(Date.now() - 1000 * 60 * 60 * 48 + 120000).toISOString(),
    brownie_points: 0,
    stats: { heart_rate: 76, respiratory_rate: 15 },
    rppg_raw: { signal_quality: 'excellent' },
  },
]

export default function PatientsPage() {
  const navigate = useNavigate()
  const { isDemoMode: isDemo } = useAuth()
  const [patients, setPatients] = useState<DoctorPatientLink[]>([])
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null)
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null)
  const [checkupSessions, setCheckupSessions] = useState<CheckupSession[]>([])

  const [loadingPatients, setLoadingPatients] = useState(true)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load patient list
  useEffect(() => {
    if (isDemo) {
      // Use mock data in demo mode
      setPatients(MOCK_PATIENTS)
      setSelectedPatientId(MOCK_PATIENTS[0].patient_id)
      setLoadingPatients(false)
    } else {
      loadPatients()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemo])

  async function loadPatients() {
    try {
      setLoadingPatients(true)
      setError(null)
      const patientList = await listMyPatients()
      setPatients(patientList)

      // Auto-select first patient if available
      if (patientList.length > 0 && !selectedPatientId) {
        setSelectedPatientId(patientList[0].patient_id)
      }
    } catch (err: any) {
      console.error('Failed to load patients:', err)
      setError(err.message || 'Failed to load patients')
    } finally {
      setLoadingPatients(false)
    }
  }

  // Load selected patient details
  useEffect(() => {
    if (!selectedPatientId) {
      setSelectedProfile(null)
      setCheckupSessions([])
      return
    }

    if (isDemo) {
      // Use mock data in demo mode
      setSelectedProfile(MOCK_PROFILE)
      setCheckupSessions(MOCK_SESSIONS)
      setLoadingProfile(false)
      setLoadingSessions(false)
    } else {
      loadPatientDetails()
      loadPatientSessions()
    }

    async function loadPatientDetails() {
      try {
        setLoadingProfile(true)
        const profile = await getUserProfile(selectedPatientId!)
        setSelectedProfile(profile)
      } catch (err: any) {
        console.error('Failed to load patient profile:', err)
        if (err.message?.includes('403')) {
          // Connection was removed
          setError('Connection with this patient has been removed')
          setSelectedPatientId(null)
          loadPatients()
        }
      } finally {
        setLoadingProfile(false)
      }
    }

    async function loadPatientSessions() {
      try {
        setLoadingSessions(true)
        const sessions = await getPatientCheckupSessions(selectedPatientId!)
        setCheckupSessions(sessions)
      } catch (err: any) {
        console.error('Failed to load patient sessions:', err)
      } finally {
        setLoadingSessions(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPatientId, isDemo])

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Header (mobile) */}
      <div className="lg:hidden p-6 border-b border-nn-mist">
        <h1 className="text-2xl font-bold text-nn-navy">Patients</h1>
        <p className="text-sm text-nn-navy-light">Manage connected patients</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="m-4 lg:m-6 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
          <p className="text-red-800 text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-red-600 hover:text-red-700 text-xs mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Patient list sidebar */}
      <div className="lg:w-80 lg:border-r border-nn-mist bg-nn-soft-blue lg:h-full overflow-hidden">
        <div className="hidden lg:block p-6 border-b border-nn-mist bg-white">
          <h1 className="text-xl font-bold text-nn-navy">Patients</h1>
          <p className="text-sm text-nn-navy-light">
            {patients.length} {patients.length === 1 ? 'patient' : 'patients'} connected
          </p>
        </div>
        <PatientList
          patients={patients}
          selectedPatientId={selectedPatientId}
          onSelectPatient={setSelectedPatientId}
          loading={loadingPatients}
        />
      </div>

      {/* Patient detail view */}
      <div className="flex-1 bg-white lg:h-full overflow-hidden">
        {patients.length === 0 && !loadingPatients ? (
          <div className="h-full flex flex-col items-center justify-center p-8 text-center">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-12 w-12 mb-4 text-nn-navy-light">
              <circle cx="7" cy="6" r="3" />
              <circle cx="14" cy="8" r="2.5" />
              <path d="M2 17v-2a4 4 0 0 1 4-4h2a4 4 0 0 1 4 4v2M12 17v-1.5a3.5 3.5 0 0 1 3.5-3.5h0a3.5 3.5 0 0 1 3.5 3.5V17" strokeLinecap="round" />
            </svg>
            <h3 className="font-semibold text-nn-navy mb-2">No patients connected yet</h3>
            <p className="text-sm text-nn-navy-light mb-4 max-w-sm">
              Connect with patients in Settings → Care Team to start monitoring their wellness check-ins
            </p>
            <button
              onClick={() => navigate('/settings')}
              className="rounded-xl bg-nn-deep-blue px-6 py-2.5 text-sm font-semibold text-white hover:bg-nn-deep-blue-hover transition-colors"
            >
              Go to Care Team Settings
            </button>
          </div>
        ) : (
          <PatientDetailView
            profile={selectedProfile}
            checkupSessions={checkupSessions}
            loading={loadingProfile}
            loadingSessions={loadingSessions}
          />
        )}
      </div>
    </div>
  )
}
