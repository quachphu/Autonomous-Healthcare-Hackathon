import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { admin, type AdminUserDetail } from '../../lib/api'

export default function AdminUserDetailPage() {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form states
  const [mascotHealth, setMascotHealth] = useState(80)
  const [browniePoints, setBrowniePoints] = useState(0)
  const [actionType, setActionType] = useState<'reminder' | 'mascot_adjustment' | 'brownie_adjustment'>('reminder')
  const [actionMessage, setActionMessage] = useState('')
  const [actionDelta, setActionDelta] = useState(0)

  useEffect(() => {
    if (userId) {
      fetchUserDetail()
    }
  }, [userId])

  async function fetchUserDetail() {
    if (!userId) return
    try {
      setLoading(true)
      setError('')
      const data = await admin.getUserDetail(userId)
      setUser(data)
      setMascotHealth(data.mascot_health)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateHealth() {
    if (!userId) return
    try {
      setError('')
      setSuccess('')
      await admin.updateUser(userId, { mascot_health: mascotHealth })
      setSuccess('Mascot health updated successfully')
      await fetchUserDetail()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update health')
    }
  }

  async function handleUpdateBrowniePoints() {
    if (!userId) return
    try {
      setError('')
      setSuccess('')
      await admin.updateUser(userId, { brownie_points: browniePoints })
      setSuccess('Brownie points adjustment recorded')
      setBrowniePoints(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update brownie points')
    }
  }

  async function handleCancelSession(sessionId: string) {
    if (!userId) return
    if (!confirm('Are you sure you want to cancel this session?')) return
    try {
      setError('')
      setSuccess('')
      await admin.cancelSession(userId, sessionId)
      setSuccess('Session cancelled successfully')
      await fetchUserDetail()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel session')
    }
  }

  async function handleScheduleAction() {
    if (!userId) return
    if (!actionMessage && actionType !== 'mascot_adjustment' && actionType !== 'brownie_adjustment') {
      setError('Message is required')
      return
    }
    try {
      setError('')
      setSuccess('')
      await admin.scheduleAction({
        user_id: userId,
        action_type: actionType,
        message: actionMessage || undefined,
        action_data: actionType === 'mascot_adjustment' || actionType === 'brownie_adjustment'
          ? { delta: actionDelta }
          : {},
      })
      setSuccess('Action scheduled successfully')
      setActionMessage('')
      setActionDelta(0)
      await fetchUserDetail()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to schedule action')
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-nn-pale-sky">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-nn-periwinkle border-t-nn-deep-blue" />
      </div>
    )
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-nn-pale-sky p-6">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-nn-pale-sky p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/admin/users')}
            className="mb-4 text-sm text-nn-muted hover:text-nn-deep-blue"
          >
            ← Back to Users
          </button>
          <h1 className="text-2xl font-bold text-nn-deep-blue">User Details</h1>
        </div>

        {/* Alerts */}
        {error && (
          <div className="rounded-xl bg-red-50 p-4 text-sm text-red-600">{error}</div>
        )}
        {success && (
          <div className="rounded-xl bg-green-50 p-4 text-sm text-green-600">{success}</div>
        )}

        {/* Profile Card */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-nn-deep-blue">Profile Information</h2>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-nn-muted">Email</dt>
              <dd className="mt-1 text-sm text-nn-deep-blue">{user.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-nn-muted">Role</dt>
              <dd className="mt-1 text-sm capitalize text-nn-deep-blue">{user.role || 'None'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-nn-muted">Name</dt>
              <dd className="mt-1 text-sm text-nn-deep-blue">
                {user.first_name || user.last_name
                  ? `${user.first_name || ''} ${user.last_name || ''}`.trim()
                  : 'Not set'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-nn-muted">Phone</dt>
              <dd className="mt-1 text-sm text-nn-deep-blue">{user.phone_number || 'Not set'}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-nn-muted">Created</dt>
              <dd className="mt-1 text-sm text-nn-deep-blue">
                {new Date(user.created_at).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-nn-muted">Last Updated</dt>
              <dd className="mt-1 text-sm text-nn-deep-blue">
                {new Date(user.updated_at).toLocaleString()}
              </dd>
            </div>
          </dl>
        </div>

        {/* Metrics & Controls */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Mascot Health */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-nn-deep-blue">Mascot Health</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm text-nn-muted">Current: {mascotHealth}</label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={mascotHealth}
                  onChange={(e) => setMascotHealth(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              <button
                onClick={handleUpdateHealth}
                className="w-full rounded-lg bg-nn-deep-blue px-4 py-2 text-sm font-medium text-white hover:bg-nn-deep-blue/90"
              >
                Update Health
              </button>
            </div>
          </div>

          {/* Brownie Points Adjustment */}
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-sm font-semibold text-nn-deep-blue">Brownie Points Adjustment</h3>
            <div className="space-y-4">
              <input
                type="number"
                value={browniePoints}
                onChange={(e) => setBrowniePoints(Number(e.target.value))}
                placeholder="Enter adjustment (+ or -)"
                className="w-full rounded-lg border border-nn-muted/20 px-4 py-2 text-sm focus:border-nn-periwinkle focus:outline-none"
              />
              <button
                onClick={handleUpdateBrowniePoints}
                className="w-full rounded-lg bg-nn-deep-blue px-4 py-2 text-sm font-medium text-white hover:bg-nn-deep-blue/90"
              >
                Apply Adjustment
              </button>
            </div>
          </div>
        </div>

        {/* Streaks */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-nn-deep-blue">Streaks</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-nn-muted">Current Streak</p>
              <p className="mt-1 text-2xl font-bold text-nn-deep-blue">{user.current_streak} days</p>
            </div>
            <div>
              <p className="text-sm text-nn-muted">Longest Streak</p>
              <p className="mt-1 text-2xl font-bold text-nn-deep-blue">{user.longest_streak} days</p>
            </div>
          </div>
        </div>

        {/* Recent Sessions */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-nn-deep-blue">Recent Sessions</h2>
          {user.recent_sessions.length === 0 ? (
            <p className="text-sm text-nn-muted">No sessions yet</p>
          ) : (
            <div className="space-y-2">
              {user.recent_sessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-nn-muted/10 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-nn-deep-blue">
                      {new Date(session.start_time).toLocaleString()}
                    </p>
                    <p className="text-xs text-nn-muted">
                      Status: {session.status} • Points: {session.brownie_points}
                    </p>
                  </div>
                  {session.status !== 'cancelled' && (
                    <button
                      onClick={() => handleCancelSession(session.id)}
                      className="text-sm text-red-600 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending Actions */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-nn-deep-blue">Pending Actions</h2>
          {user.pending_actions.length === 0 ? (
            <p className="text-sm text-nn-muted">No pending actions</p>
          ) : (
            <div className="space-y-2">
              {user.pending_actions.map((action) => (
                <div key={action.id} className="rounded-lg border border-nn-muted/10 p-3">
                  <p className="text-sm font-medium capitalize text-nn-deep-blue">
                    {action.action_type.replace('_', ' ')}
                  </p>
                  {action.message && <p className="mt-1 text-sm text-nn-muted">{action.message}</p>}
                  <p className="mt-1 text-xs text-nn-muted">
                    Created: {new Date(action.created_at).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Schedule New Action */}
        <div className="rounded-xl bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-nn-deep-blue">Schedule New Action</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-nn-muted">Action Type</label>
              <select
                value={actionType}
                onChange={(e) => setActionType(e.target.value as any)}
                className="w-full rounded-lg border border-nn-muted/20 px-4 py-2 text-sm focus:border-nn-periwinkle focus:outline-none"
              >
                <option value="reminder">Reminder/Notification</option>
                <option value="mascot_adjustment">Mascot Health Adjustment</option>
                <option value="brownie_adjustment">Brownie Points Adjustment</option>
              </select>
            </div>

            {(actionType === 'mascot_adjustment' || actionType === 'brownie_adjustment') && (
              <div>
                <label className="mb-1 block text-sm font-medium text-nn-muted">Delta (+ or -)</label>
                <input
                  type="number"
                  value={actionDelta}
                  onChange={(e) => setActionDelta(Number(e.target.value))}
                  className="w-full rounded-lg border border-nn-muted/20 px-4 py-2 text-sm focus:border-nn-periwinkle focus:outline-none"
                />
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-nn-muted">Message</label>
              <textarea
                value={actionMessage}
                onChange={(e) => setActionMessage(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-nn-muted/20 px-4 py-2 text-sm focus:border-nn-periwinkle focus:outline-none"
                placeholder="Enter message to display to user..."
              />
            </div>

            <button
              onClick={handleScheduleAction}
              className="w-full rounded-lg bg-nn-deep-blue px-4 py-2 text-sm font-medium text-white hover:bg-nn-deep-blue/90"
            >
              Schedule Action
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
