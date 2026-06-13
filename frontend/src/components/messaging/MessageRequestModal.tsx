import { useState } from 'react'
import { sendMessageRequest, type UserSearchResult } from '../../lib/api'

interface MessageRequestModalProps {
  isOpen: boolean
  onClose: () => void
  recipient: UserSearchResult | null
  onSuccess: () => void
}

export default function MessageRequestModal({
  isOpen,
  onClose,
  recipient,
  onSuccess,
}: MessageRequestModalProps) {
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const maxLength = 500
  const remainingChars = maxLength - message.length

  async function handleSend() {
    if (!recipient || !message.trim()) return

    setLoading(true)
    setError(null)

    try {
      await sendMessageRequest(recipient.id, message.trim())
      setMessage('')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send request')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !recipient) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 m-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-nn-navy">Send Message Request</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Recipient Info */}
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl mb-4">
          <div className="flex-shrink-0 w-12 h-12 rounded-full bg-nn-deep-blue text-white flex items-center justify-center text-lg font-semibold">
            {recipient.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-nn-navy">{recipient.display_name}</p>
            <span className={`inline-block px-2 py-0.5 text-xs rounded-full ${
              recipient.role === 'doctor'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-pink-100 text-pink-700'
            }`}>
              {recipient.role === 'doctor' ? 'Doctor' : 'Patient'}
            </span>
          </div>
        </div>

        {/* Message Input */}
        <div className="mb-4">
          <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-2">
            Initial Message
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, maxLength))}
            placeholder="Introduce yourself and explain why you'd like to connect..."
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-nn-deep-blue focus:border-transparent resize-none"
            rows={4}
            maxLength={maxLength}
          />
          <div className="flex justify-between items-center mt-2">
            <p className="text-xs text-gray-500">
              {remainingChars} characters remaining
            </p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !message.trim()}
            className="flex-1 px-4 py-3 rounded-xl bg-nn-deep-blue text-white font-medium hover:bg-nn-deep-blue/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                Sending...
              </span>
            ) : (
              'Send Request'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
