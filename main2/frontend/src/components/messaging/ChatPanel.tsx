import { useState, useRef, useEffect, useCallback } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { getMessages, sendMessageRest, type MessageItem } from '../../lib/api'
import { useWebSocket } from '../../hooks/useWebSocket'

type ConnectionStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted' | 'loading'

interface ChatPanelProps {
  threadId: string | null
  contactName: string
  contactAvatar: React.ReactNode
  statusLine?: string
  connectionStatus?: ConnectionStatus
  onSendConnectionRequest?: () => void
}

export default function ChatPanel({ threadId, contactName, contactAvatar, statusLine, connectionStatus, onSendConnectionRequest }: ChatPanelProps) {
  const { user, isDemoMode } = useAuth()
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [input, setInput] = useState('')
  const [peerTyping, setPeerTyping] = useState(false)
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const lastTypingSent = useRef(false)

  const currentUserId = user?.id ?? ''

  // Fetch message history
  useEffect(() => {
    if (!threadId || isDemoMode) return
    setLoading(true)
    getMessages(threadId)
      .then((page) => setMessages(page.items))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [threadId, isDemoMode])

  // WebSocket callbacks
  const handleWsMessage = useCallback((msg: MessageItem) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev
      return [...prev, msg]
    })
  }, [])

  const handleTyping = useCallback((userId: string, isTyping: boolean) => {
    if (userId !== currentUserId) {
      setPeerTyping(isTyping)
    }
  }, [currentUserId])

  const { sendTyping } = useWebSocket({
    threadId: isDemoMode ? null : threadId,
    onMessage: handleWsMessage,
    onTyping: handleTyping,
  })

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, peerTyping])

  // Send handler
  async function handleSend() {
    const text = input.trim()
    if (!text || !threadId) return
    setInput('')

    // Stop typing indicator
    if (lastTypingSent.current) {
      sendTyping(false)
      lastTypingSent.current = false
    }

    if (isDemoMode) {
      // Demo mode: local only
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          thread_id: threadId,
          sender_id: currentUserId,
          sender_type: 'user',
          content: text,
          created_at: new Date().toISOString(),
          read_at: null,
        },
      ])
      return
    }

    // Send via REST (WebSocket will echo it back via broadcast)
    try {
      console.log('[SEND DEBUG] Calling sendMessageRest, threadId=', threadId, 'text=', text)
      const msg = await sendMessageRest(threadId, text)
      console.log('[SEND DEBUG] sendMessageRest succeeded, msg=', msg)
      // Add optimistically if WS hasn't delivered it yet
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev
        return [...prev, msg]
      })
    } catch (err) {
      console.error('[SEND DEBUG] sendMessageRest FAILED:', err)
    }
  }

  // Typing indicator debounce
  function handleInputChange(value: string) {
    setInput(value)
    if (!isDemoMode && threadId) {
      if (!lastTypingSent.current && value.trim()) {
        sendTyping(true)
        lastTypingSent.current = true
      }
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = setTimeout(() => {
        if (lastTypingSent.current) {
          sendTyping(false)
          lastTypingSent.current = false
        }
      }, 2000)
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-nn-mist bg-white px-6 py-4">
        {contactAvatar}
        <div>
          <p className="font-semibold text-nn-navy">{contactName}</p>
          {statusLine && (
            <p className="text-xs text-nn-navy-light flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
              {statusLine}
            </p>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Doctor-patient connection button */}
          {connectionStatus === 'loading' && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-nn-periwinkle border-t-nn-deep-blue" />
          )}
          {connectionStatus === 'none' && (
            <button
              onClick={onSendConnectionRequest}
              className="flex items-center gap-1.5 rounded-full bg-nn-deep-blue px-3 py-1.5 text-xs font-medium text-white hover:bg-nn-deep-blue/90 transition-colors"
              title="Send a doctor-patient connection request"
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <circle cx="6" cy="5" r="3" />
                <path d="M1 14c0-3 2-5 5-5" strokeLinecap="round" />
                <path d="M12 9v5M9.5 11.5h5" strokeLinecap="round" />
              </svg>
              Connect
            </button>
          )}
          {connectionStatus === 'pending_sent' && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3l2 1.5" strokeLinecap="round" />
              </svg>
              Request Sent
            </span>
          )}
          {connectionStatus === 'pending_received' && (
            <span className="flex items-center gap-1.5 rounded-full bg-blue-50 border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M5 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Pending (check Settings)
            </span>
          )}
          {connectionStatus === 'accepted' && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5">
                <circle cx="8" cy="8" r="6" />
                <path d="M5 8l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Connected
            </span>
          )}
          <span className="rounded-full bg-nn-pale-sky px-3 py-1 text-xs text-nn-navy-light flex items-center gap-1">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3.5 w-3.5">
              <rect x="1" y="2" width="14" height="12" rx="2" />
              <path d="M5 2v3M11 2v3M1 7h14" strokeLinecap="round" />
            </svg>
            Secure channel
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-nn-periwinkle border-t-nn-deep-blue" />
          </div>
        )}
        {!loading && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-nn-navy-light">No messages yet. Start the conversation!</p>
          </div>
        )}
        {messages.map((msg) => {
          const isUser = msg.sender_id === currentUserId
          return (
            <div key={msg.id} className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
              {!isUser && (
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-nn-deep-blue text-white text-sm font-bold">
                  {contactName.charAt(0)}
                </div>
              )}
              <div className={`max-w-[75%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
                <div
                  className={[
                    'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    isUser
                      ? 'bg-nn-deep-blue text-white rounded-tr-sm'
                      : 'bg-white text-nn-navy shadow-sm rounded-tl-sm',
                  ].join(' ')}
                >
                  {msg.content}
                </div>
                <p className="mt-1 text-[10px] text-nn-navy-light px-1">
                  {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}

        {/* Typing indicator */}
        {peerTyping && (
          <div className="flex gap-3">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-nn-deep-blue text-white text-sm font-bold">
              {contactName.charAt(0)}
            </div>
            <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-5">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-2 w-2 rounded-full bg-nn-periwinkle"
                    style={{ animation: `bounce 1.2s ${i * 0.2}s ease-in-out infinite` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-nn-mist bg-white px-4 py-3">
        <form
          onSubmit={(e) => { e.preventDefault(); handleSend() }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder={`Message ${contactName}…`}
            className="flex-1 rounded-xl border border-nn-mist bg-nn-pale-sky px-4 py-2.5 text-sm text-nn-navy placeholder-nn-navy-light outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/40"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-nn-deep-blue text-white disabled:opacity-40 transition-all"
            aria-label="Send message"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M3.105 2.289a.75.75 0 0 0-.826.95l1.813 6.932H11a.75.75 0 0 1 0 1.5H4.092l-1.813 6.932a.75.75 0 0 0 .826.95 28.896 28.896 0 0 0 15.293-7.154.75.75 0 0 0 0-1.115A28.897 28.897 0 0 0 3.105 2.289Z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}
