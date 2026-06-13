import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

export default function AdminRoute() {
  const { isAdmin, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-nn-pale-sky">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-nn-periwinkle border-t-nn-deep-blue" />
      </div>
    )
  }

  if (isAdmin) return <Outlet />
  return <Navigate to="/dashboard" replace />
}
