import { useState } from 'react'
import type { ThreadWithStatus } from '../../lib/api'

interface MessageRequestItemProps {
  request: ThreadWithStatus
  displayName: string
  firstMessage: string
  onAccept?: () => void
  onReject?: () => void
  isSent?: boolean
}

export default function MessageRequestItem({
  request,
  displayName,
  firstMessage,
  onAccept,
  onReject,
  isSent = false,
}: MessageRequestItemProps) {
  const [loading, setLoading] = useState<'accept' | 'reject' | null>(null)

  async function handleAccept() {
    if (!onAccept) return
    setLoading('accept')
    try {
      await onAccept()
    } finally {
      setLoading(null)
    }
  }

  async function handleReject() {
    if (!onReject) return
    setLoading('reject')
    try {
      await onReject()
    } finally {
      setLoading(null)
    }
  }

  const timeAgo = new Date(request.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const truncatedMessage = firstMessage.length > 100
    ? firstMessage.slice(0, 100) + '...'
    : firstMessage

  return (
    <div className="p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0 w-12 h-12 rounded-full bg-nn-deep-blue text-white flex items-center justify-center text-lg font-semibold">
          {displayName.charAt(0).toUpperCase()}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-1">
            <h3 className="font-semibold text-nn-navy">{displayName}</h3>
            <span className="text-xs text-gray-500 ml-2">{timeAgo}</span>
          </div>

          <p className="text-sm text-gray-600 mb-3">{truncatedMessage}</p>

          {/* Actions */}
          {isSent ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 text-sm rounded-full">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Pending
            </span>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={handleAccept}
                disabled={loading !== null}
                className="flex-1 px-4 py-2 rounded-lg bg-nn-deep-blue text-white text-sm font-medium hover:bg-nn-deep-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === 'accept' ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                    Accepting...
                  </span>
                ) : (
                  'Accept'
                )}
              </button>
              <button
                onClick={handleReject}
                disabled={loading !== null}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading === 'reject' ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-700" />
                    Rejecting...
                  </span>
                ) : (
                  'Decline'
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
