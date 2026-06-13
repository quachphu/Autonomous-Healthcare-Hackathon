import { useAuth } from '../contexts/AuthContext'

export default function DebugPage() {
  const auth = useAuth()

  return (
    <div className="min-h-full p-6 lg:p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-bold text-nn-navy mb-6">Debug Info</h1>

        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <pre className="text-xs overflow-auto">
            {JSON.stringify({
              user: auth.user,
              displayName: auth.displayName,
              role: auth.role,
              isAdmin: auth.isAdmin,
              profileLoaded: auth.profileLoaded,
              firstName: auth.firstName,
              lastName: auth.lastName,
              phoneNumber: auth.phoneNumber,
            }, null, 2)}
          </pre>
        </div>

        <div className="mt-4 rounded-3xl bg-amber-50 border border-amber-200 p-6">
          <h2 className="font-semibold text-amber-900 mb-2">Admin Status</h2>
          <p className="text-sm text-amber-800">
            isAdmin: <strong>{auth.isAdmin ? 'true ✓' : 'false ✗'}</strong>
          </p>
          <p className="text-sm text-amber-800 mt-2">
            {auth.isAdmin
              ? '✓ You should see "Admin Panel" in the sidebar'
              : '✗ You do not have admin access'}
          </p>
        </div>
      </div>
    </div>
  )
}
