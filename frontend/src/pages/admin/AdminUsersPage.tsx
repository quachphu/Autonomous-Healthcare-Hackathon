import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { admin, type AdminUserSummary } from '../../lib/api'

export default function AdminUsersPage() {
  const navigate = useNavigate()
  const [users, setUsers] = useState<AdminUserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'patient' | 'doctor' | ''>('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetchUsers()
  }, [searchQuery, roleFilter])

  async function fetchUsers() {
    try {
      setLoading(true)
      setError('')
      const data = await admin.listUsers({
        q: searchQuery || undefined,
        role: roleFilter || undefined,
        limit: 50,
      })
      setUsers(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-nn-pale-sky p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-nn-deep-blue">User Management</h1>
          <p className="text-sm text-nn-muted">View and manage all user accounts</p>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-col gap-4 rounded-xl bg-white p-4 shadow-sm sm:flex-row">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search by email or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-nn-muted/20 px-4 py-2 text-sm focus:border-nn-periwinkle focus:outline-none"
            />
          </div>
          <div className="sm:w-48">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as 'patient' | 'doctor' | '')}
              className="w-full rounded-lg border border-nn-muted/20 px-4 py-2 text-sm focus:border-nn-periwinkle focus:outline-none"
            >
              <option value="">All Roles</option>
              <option value="patient">Patient</option>
              <option value="doctor">Doctor</option>
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-nn-periwinkle border-t-nn-deep-blue" />
          </div>
        )}

        {/* Table */}
        {!loading && (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full">
              <thead className="border-b border-nn-muted/10 bg-nn-pale-sky/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Email
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Health
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Streak
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Sessions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Last Check-in
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nn-muted/10">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-sm text-nn-muted">
                      No users found
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr
                      key={user.id}
                      className="cursor-pointer transition-colors hover:bg-nn-pale-sky/30"
                      onClick={() => navigate(`/admin/users/${user.id}`)}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-nn-deep-blue">{user.email}</span>
                          {user.is_admin && (
                            <span className="rounded-full bg-nn-deep-blue px-2 py-0.5 text-xs font-medium text-white">
                              Admin
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm capitalize text-nn-muted">
                          {user.role || 'None'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-16 overflow-hidden rounded-full bg-nn-muted/10">
                            <div
                              className="h-full bg-nn-periwinkle transition-all"
                              style={{ width: `${user.mascot_health}%` }}
                            />
                          </div>
                          <span className="text-sm text-nn-muted">{user.mascot_health}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-nn-muted">{user.current_streak} days</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-nn-muted">{user.total_sessions}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-nn-muted">
                          {user.last_checkin_date
                            ? new Date(user.last_checkin_date).toLocaleDateString()
                            : 'Never'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/admin/users/${user.id}`)
                          }}
                          className="text-sm font-medium text-nn-deep-blue hover:underline"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Stats Summary */}
        {!loading && users.length > 0 && (
          <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-nn-muted">
              Showing {users.length} user{users.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
