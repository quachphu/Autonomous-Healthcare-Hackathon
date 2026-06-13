import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { authLogin, authSignup, authLogout, getProfile, getToken, isDemoMode, type UserProfile } from '../lib/api'
import { mockUser } from '../data/mockData'

type UserRole = 'patient' | 'doctor' | null

interface AuthUser {
  id: string
  email: string
}

const DUE_DATE_KEY = 'nn_due_date'

function computeGestationalWeek(dueDate: string): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  const weeksUntilDue = (new Date(dueDate).getTime() - Date.now()) / msPerWeek
  return Math.max(0, Math.min(40, Math.round(40 - weeksUntilDue)))
}

interface AuthContextValue {
  session: { token: string; user: AuthUser } | null
  user: AuthUser | null
  loading: boolean
  isDemoMode: boolean
  displayName: string
  role: UserRole
  isAdmin: boolean
  profileLoaded: boolean
  firstName: string | null
  lastName: string | null
  phoneNumber: string | null
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  dueDate: string
  gestationalWeek: number
  setDueDate: (date: string) => void
  setRole: (role: UserRole) => void
  setProfile: (profile: UserProfile) => void
  signInWithPassword: (email: string, password: string) => Promise<{ error: { message: string } | null }>
  signUp: (email: string, password: string, firstName: string, lastName: string, phoneNumber: string) => Promise<{ error: { message: string } | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const DEMO_USER: AuthUser = {
  id: 'demo-user',
  email: mockUser.email,
}

const DEMO_SESSION = {
  token: 'demo-token',
  user: DEMO_USER,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<{ token: string; user: AuthUser } | null>(
    isDemoMode ? DEMO_SESSION : null
  )
  const [loading, setLoading] = useState(!isDemoMode)
  const [role, setRole] = useState<UserRole>(isDemoMode ? 'patient' : null)
  const [isAdmin, setIsAdmin] = useState<boolean>(false)
  const [profileLoaded, setProfileLoaded] = useState(isDemoMode)
  const [firstName, setFirstName] = useState<string | null>(null)
  const [lastName, setLastName] = useState<string | null>(null)
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null)
  const [emergencyContactName, setEmergencyContactName] = useState<string | null>(null)
  const [emergencyContactPhone, setEmergencyContactPhone] = useState<string | null>(null)
  const [dueDate, setDueDateState] = useState<string>(
    () => localStorage.getItem(DUE_DATE_KEY) ?? mockUser.dueDate
  )

  const gestationalWeek = computeGestationalWeek(dueDate)

  function setDueDate(date: string) {
    localStorage.setItem(DUE_DATE_KEY, date)
    setDueDateState(date)
  }

  function setProfile(profile: UserProfile) {
    setRole(profile.role)
    setIsAdmin(profile.is_admin)
    setFirstName(profile.first_name)
    setLastName(profile.last_name)
    setPhoneNumber(profile.phone_number)
    setEmergencyContactName(profile.emergency_contact_name)
    setEmergencyContactPhone(profile.emergency_contact_phone)
  }

  // On mount, check if a token already exists in localStorage
  useEffect(() => {
    if (isDemoMode) return

    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }

    // We have a token — try to load profile to validate it
    getProfile()
      .then((profile) => {
        setSession({ token, user: { id: profile.id, email: '' } })
        setProfile(profile)
        setProfileLoaded(true)
        setLoading(false)
      })
      .catch(() => {
        // Token expired or invalid
        authLogout()
        setLoading(false)
      })
  }, [])

  async function signInWithPassword(email: string, password: string) {
    if (isDemoMode) {
      setSession(DEMO_SESSION)
      return { error: null }
    }
    try {
      const result = await authLogin(email, password)
      const authUser: AuthUser = { id: result.user.id, email: result.user.email }
      setSession({ token: result.token, user: authUser })
      // Fetch profile for role
      try {
        const profile = await getProfile()
        setProfile(profile)
        setProfileLoaded(true)
      } catch {
        // Profile may not exist yet (new user) — that's fine
        setProfileLoaded(true)
      }
      return { error: null }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed'
      return { error: { message } }
    }
  }

  async function signUp(email: string, password: string, firstName: string, lastName: string, phoneNumber: string) {
    if (isDemoMode) {
      setSession(DEMO_SESSION)
      return { error: null }
    }
    try {
      const result = await authSignup(email, password, firstName, lastName, phoneNumber)
      const authUser: AuthUser = { id: result.user.id, email: result.user.email }
      setSession({ token: result.token, user: authUser })
      // Set profile data immediately from signup
      setFirstName(firstName)
      setLastName(lastName)
      setPhoneNumber(phoneNumber)
      setProfileLoaded(true)
      return { error: null }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed'
      return { error: { message } }
    }
  }

  async function signOut() {
    authLogout()
    setSession(null)
    setRole(null)
    setIsAdmin(false)
    setProfileLoaded(false)
    setFirstName(null)
    setLastName(null)
    setPhoneNumber(null)
    setEmergencyContactName(null)
    setEmergencyContactPhone(null)
  }

  const displayName = isDemoMode
    ? mockUser.name
    : (firstName || lastName)
      ? [firstName, lastName].filter(Boolean).join(' ')
      : session?.user?.email?.split('@')[0] ?? 'User'

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        isDemoMode,
        displayName,
        role,
        isAdmin,
        profileLoaded,
        firstName,
        lastName,
        phoneNumber,
        emergencyContactName,
        emergencyContactPhone,
        dueDate,
        gestationalWeek,
        setDueDate,
        setRole,
        setProfile,
        signInWithPassword,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
