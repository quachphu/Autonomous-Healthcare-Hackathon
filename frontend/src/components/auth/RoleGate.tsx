import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Redirects to /select-role if the user hasn't chosen a role yet.
 * In demo mode, always passes through (role defaults to 'patient').
 */
export default function RoleGate() {
  const { role, profileLoaded, isDemoMode } = useAuth()

  if (isDemoMode) return <Outlet />

  if (!profileLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-nn-periwinkle border-t-nn-deep-blue" />
      </div>
    )
  }

  if (!role) {
    return <Navigate to="/select-role" replace />
  }

  return <Outlet />
}
