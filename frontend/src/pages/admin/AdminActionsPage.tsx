import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { admin, type PendingAction } from '../../lib/api'

export default function AdminActionsPage() {
  const navigate = useNavigate()
  const [actions, setActions] = useState<PendingAction[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'pending' | 'completed' | 'cancelled' | ''>('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchActions()
  }, [statusFilter])

  async function fetchActions() {
    try {
      setLoading(true)
      setError('')
      const data = await admin.listActions({
        status: statusFilter || undefined,
        limit: 100,
      })
      setActions(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load actions')
    } finally {
      setLoading(false)
    }
  }

  async function handleCancelAction(actionId: string) {
    if (!confirm('Are you sure you want to cancel this action?')) return
    try {
      setError('')
      setSuccess('')
      await admin.cancelAction(actionId)
      setSuccess('Action cancelled successfully')
      await fetchActions()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel action')
    }
  }

  return (
    <div className="min-h-screen bg-nn-pale-sky p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-nn-deep-blue">Pending Actions</h1>
          <p className="text-sm text-nn-muted">View and manage scheduled actions</p>
        </div>

        {/* Filters */}
        <div className="mb-6 rounded-xl bg-white p-4 shadow-sm">
          <div className="sm:w-48">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full rounded-lg border border-nn-muted/20 px-4 py-2 text-sm focus:border-nn-periwinkle focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-6 rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="mb-6 rounded-xl bg-green-50 p-4 text-sm text-green-600">{success}</div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-nn-periwinkle border-t-nn-deep-blue" />
          </div>
        )}

        {/* Actions List */}
        {!loading && (
          <div className="space-y-4">
            {actions.length === 0 ? (
              <div className="rounded-xl bg-white p-8 text-center shadow-sm">
                <p className="text-sm text-nn-muted">No actions found</p>
              </div>
            ) : (
              actions.map((action) => (
                <div key={action.id} className="rounded-xl bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold capitalize text-nn-deep-blue">
                          {action.action_type.replace(/_/g, ' ')}
                        </h3>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            action.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : action.status === 'completed'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {action.status}
                        </span>
                      </div>

                      {action.message && (
                        <p className="mt-2 text-sm text-nn-muted">{action.message}</p>
                      )}

                      {Object.keys(action.action_data).length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-nn-muted">
                            Data: {JSON.stringify(action.action_data)}
                          </p>
                        </div>
                      )}

                      <div className="mt-4 grid grid-cols-1 gap-2 text-xs text-nn-muted sm:grid-cols-3">
                        <div>
                          <span className="font-medium">User ID:</span>{' '}
                          <button
                            onClick={() => navigate(`/admin/users/${action.user_id}`)}
                            className="text-nn-deep-blue hover:underline"
                          >
                            {action.user_id.substring(0, 8)}...
                          </button>
                        </div>
                        <div>
                          <span className="font-medium">Created:</span>{' '}
                          {new Date(action.created_at).toLocaleString()}
                        </div>
                        {action.scheduled_for && (
                          <div>
                            <span className="font-medium">Scheduled for:</span>{' '}
                            {new Date(action.scheduled_for).toLocaleString()}
                          </div>
                        )}
                        {action.completed_at && (
                          <div>
                            <span className="font-medium">Completed:</span>{' '}
                            {new Date(action.completed_at).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </div>

                    {action.status === 'pending' && (
                      <button
                        onClick={() => handleCancelAction(action.id)}
                        className="ml-4 text-sm text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Stats */}
        {!loading && actions.length > 0 && (
          <div className="mt-6 rounded-xl bg-white p-4 shadow-sm">
            <p className="text-sm text-nn-muted">
              Showing {actions.length} action{actions.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
