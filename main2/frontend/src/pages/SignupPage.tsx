import { type FormEvent, useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function SignupPage() {
  const { signUp, session, isDemoMode } = useAuth()
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (session || isDemoMode) navigate('/dashboard', { replace: true })
  }, [session, isDemoMode, navigate])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    // Validate first name
    if (firstName.trim().length === 0) {
      setError('First name is required.')
      return
    }

    // Validate last name
    if (lastName.trim().length === 0) {
      setError('Last name is required.')
      return
    }

    // Validate phone number (E.164 format)
    const cleanPhone = phoneNumber.replace(/[\s\-()]/g, '')
    if (!/^\+?[1-9]\d{1,14}$/.test(cleanPhone)) {
      setError('Please enter a valid phone number.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    const { error } = await signUp(email, password, firstName.trim(), lastName.trim(), cleanPhone)
    setLoading(false)

    if (error) {
      setError(error.message)
    }
    // Navigation happens via the useEffect watching `session` above
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-nn-pale-sky to-nn-mist px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-2">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-nn-deep-blue shadow-sm">
              <svg viewBox="0 0 24 24" fill="white" className="h-5 w-5">
                <path d="M12 21.5S3 15.5 3 9a5 5 0 0 1 9-3A5 5 0 0 1 21 9c0 6.5-9 12.5-9 12.5Z" />
              </svg>
            </div>
            <span className="text-xl font-bold tracking-tight text-nn-navy">Materna</span>
          </Link>
          <p className="text-sm text-nn-navy-light">Create your wellness account</p>
        </div>

        {/* Card */}
        <div className="rounded-3xl bg-white p-8 shadow-sm">
          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
            {/* First Name and Last Name - 2 column grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="first-name" className="block text-sm font-medium text-nn-navy">
                  First name
                </label>
                <input
                  id="first-name"
                  type="text"
                  required
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy placeholder-nn-navy-light outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                  placeholder="Jane"
                />
              </div>
              <div>
                <label htmlFor="last-name" className="block text-sm font-medium text-nn-navy">
                  Last name
                </label>
                <input
                  id="last-name"
                  type="text"
                  required
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy placeholder-nn-navy-light outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                  placeholder="Smith"
                />
              </div>
            </div>

            {/* Phone Number */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-nn-navy">
                Phone number
              </label>
              <input
                id="phone"
                type="tel"
                required
                autoComplete="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy placeholder-nn-navy-light outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                placeholder="+1 555-123-4567"
              />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-nn-navy">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy placeholder-nn-navy-light outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-nn-navy">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-nn-navy">
                Confirm password
              </label>
              <input
                id="confirm-password"
                type="password"
                required
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy outline-none transition focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 border border-red-100">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-nn-deep-blue px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-nn-deep-blue-hover disabled:opacity-60"
            >
              {loading ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-nn-navy-light">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-nn-deep-blue hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
