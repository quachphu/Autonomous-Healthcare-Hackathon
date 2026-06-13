import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { updateProfile } from '../lib/api'

export default function RoleSelectionPage() {
  const { setRole } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  async function handleSelect(role: 'patient' | 'doctor') {
    setLoading(true)
    try {
      await updateProfile({ role })
      setRole(role)
      navigate('/dashboard', { replace: true })
    } catch {
      // Could show error
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-nn-pale-sky p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-nn-navy">Welcome to Materna</h1>
          <p className="mt-2 text-sm text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
            Tell us about yourself to get started
          </p>
        </div>

        <div className="space-y-4">
          {/* Patient card */}
          <button
            onClick={() => handleSelect('patient')}
            disabled={loading}
            className="fade-up w-full rounded-3xl bg-white p-6 shadow-sm text-left transition-all hover:shadow-md hover:scale-[1.01] disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-nn-pale-sky">
                <svg viewBox="0 0 24 24" fill="none" stroke="#4663ac" strokeWidth="1.6" className="h-7 w-7">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" strokeLinecap="round" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-nn-navy">I'm a Patient</p>
                <p className="text-sm text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
                  Track your wellness, do checkups, and message your care team
                </p>
              </div>
            </div>
          </button>

          {/* Doctor card */}
          <button
            onClick={() => handleSelect('doctor')}
            disabled={loading}
            className="fade-up fade-up-1 w-full rounded-3xl bg-white p-6 shadow-sm text-left transition-all hover:shadow-md hover:scale-[1.01] disabled:opacity-50"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-nn-pale-sky">
                <svg viewBox="0 0 24 24" fill="none" stroke="#4663ac" strokeWidth="1.6" className="h-7 w-7">
                  <path d="M8 21h8M12 17v4M22 10a10 10 0 1 0-20 0" strokeLinecap="round" />
                  <path d="M12 6v4M10 8h4" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold text-nn-navy">I'm a Doctor</p>
                <p className="text-sm text-nn-navy-light" style={{ fontFamily: 'var(--font-body)' }}>
                  Monitor your patients, review checkups, and send messages
                </p>
              </div>
            </div>
          </button>
        </div>

        {loading && (
          <div className="mt-6 flex justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-nn-periwinkle border-t-nn-deep-blue" />
          </div>
        )}
      </div>
    </div>
  )
}
