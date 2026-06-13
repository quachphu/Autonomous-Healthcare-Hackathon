import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { admin, type AdminAuditLog } from '../../lib/api'

export default function AdminAuditPage() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<AdminAuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchLogs()
  }, [])

  async function fetchLogs() {
    try {
      setLoading(true)
      setError('')
      const data = await admin.getAuditLogs({ limit: 100 })
      setLogs(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-nn-pale-sky p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-nn-deep-blue">Audit Logs</h1>
          <p className="text-sm text-nn-muted">View all administrative actions</p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-nn-periwinkle border-t-nn-deep-blue" />
          </div>
        )}

        {/* Audit Logs */}
        {!loading && (
          <div className="overflow-hidden rounded-xl bg-white shadow-sm">
            <table className="w-full">
              <thead className="border-b border-nn-muted/10 bg-nn-pale-sky/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Admin
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Target User
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-nn-muted">
                    Changes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nn-muted/10">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-sm text-nn-muted">
                      No audit logs found
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="transition-colors hover:bg-nn-pale-sky/30">
                      <td className="px-6 py-4 text-sm text-nn-muted">
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => navigate(`/admin/users/${log.admin_id}`)}
                          className="text-sm text-nn-deep-blue hover:underline"
                        >
                          {log.admin_id.substring(0, 8)}...
                        </button>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm font-medium text-nn-deep-blue">{log.action}</span>
                      </td>
                      <td className="px-6 py-4">
                        {log.target_user_id ? (
                          <button
                            onClick={() => navigate(`/admin/users/${log.target_user_id}`)}
                            className="text-sm text-nn-deep-blue hover:underline"
                          >
                            {log.target_user_id.substring(0, 8)}...
                          </button>
                        ) : (
                          <span className="text-sm text-nn-muted">N/A</span>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <details className="text-xs">
                          <summary className="cursor-pointer text-nn-deep-blue hover:underline">
                            View Details
                          </summary>
                          <div className="mt-2 space-y-1 rounded bg-nn-pale-sky/30 p-2">
                            {log.old_values && (
                              <div>
                                <span className="font-medium text-nn-muted">Old:</span>{' '}
                                <code className="text-nn-deep-blue">
                                  {JSON.stringify(log.old_values, null, 2)}
                                </code>
                              </div>
                            )}
                            {log.new_values && (
                              <div>
                                <span className="font-medium text-nn-muted">New:</span>{' '}
                                <code className="text-nn-deep-blue">
                                  {JSON.stringify(log.new_values, null, 2)}
                                </code>
                              </div>
                            )}
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Stats */}
        {!loading && logs.length > 0 && (
          <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-nn-muted">
              Showing {logs.length} log entr{logs.length !== 1 ? 'ies' : 'y'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
