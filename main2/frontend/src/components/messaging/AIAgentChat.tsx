import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { ragChat, type RagSource, type RagChatResponse } from '../../lib/api'

function MaternaAvatar({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" style={{ width: size, height: size }} className="flex-shrink-0">
      <circle cx="30" cy="30" r="30" fill="#1D4ED8"/>
      <ellipse cx="30" cy="29" rx="19" ry="18" fill="#FFE8D5"/>
      <path d="M14 24 Q18 10 30 10 Q42 10 46 24 Q40 16 30 15 Q20 16 14 24Z" fill="#2C1810"/>
      <path d="M14 21 Q30 18 46 21" stroke="#1D4ED8" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
      <ellipse cx="22" cy="28" rx="5" ry="5.5" fill="white"/>
      <circle cx="22" cy="28.5" r="3.5" fill="#1D4ED8"/>
      <circle cx="22" cy="28.5" r="2" fill="#0F172A"/>
      <circle cx="23.5" cy="27" r="1.3" fill="white"/>
      <ellipse cx="38" cy="28" rx="5" ry="5.5" fill="white"/>
      <circle cx="38" cy="28.5" r="3.5" fill="#1D4ED8"/>
      <circle cx="38" cy="28.5" r="2" fill="#0F172A"/>
      <circle cx="39.5" cy="27" r="1.3" fill="white"/>
      <ellipse cx="18" cy="35" rx="5" ry="3" fill="#FCA5A5" fillOpacity="0.55"/>
      <ellipse cx="42" cy="35" rx="5" ry="3" fill="#FCA5A5" fillOpacity="0.55"/>
      <path d="M25 41 Q30 46 35 41" stroke="#E85D75" strokeWidth="2" fill="none" strokeLinecap="round"/>
    </svg>
  )
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: RagSource[]
  safety_notice?: string
}

const DEMO_SUGGESTIONS = [
  'Summarize my last check-in',
  'What symptoms did I report?',
  'Has my estimated pulse been trending higher?',
  'What should I ask my care team?',
]

export default function AIAgentChat() {
  const { isDemoMode } = useAuth()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      let response: RagChatResponse
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 900))
        response = {
          answer:
            "Based on your uploaded documents and check-in history, I found some relevant wellness signals from your recent sessions. This is demo mode — connect to the backend to see your real records.\n\nThis may be helpful to share with your care team. Not diagnostic.",
          sources: [
            {
              source_type: 'checkup_session',
              session_id: 'demo-session-1',
              created_at: new Date().toISOString(),
              snippet: 'Demo checkup session data…',
            },
          ],
          safety_notice:
            'Materna answers from your uploaded documents and check-in history. Not a diagnosis. For medical decisions, contact your care team.',
        }
      } else {
        response = await ragChat(content)
      }

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.answer,
        sources: response.sources,
        safety_notice: response.safety_notice,
      }
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err: any) {
      const errMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content:
          err.message?.includes('401')
            ? 'Please sign in to use Materna AI.'
            : 'Something went wrong. Please try again or contact your care team directly.',
      }
      setMessages((prev) => [...prev, errMsg])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  return (
    <div className="flex h-full flex-col bg-nn-pale-sky/30">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-nn-mist bg-white px-5 py-4">
        <div className="flex items-center gap-3">
          <MaternaAvatar size={40}/>
          <div>
            <p className="text-sm font-bold text-nn-navy">Materna AI</p>
            <p className="text-[11px] text-nn-navy-light">Your health records · Not a diagnosis</p>
          </div>
        </div>
      </div>

      {/* Safety banner */}
      <div className="flex-shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
        <p className="text-[10px] text-amber-700 leading-snug">
          <strong>Not diagnostic.</strong> Answers come from your uploaded documents and check-in history.
          For medical decisions, contact your care team.{' '}
          <strong>Urgent symptoms?</strong> Call 911 or your provider immediately.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="mb-4">
              <MaternaAvatar size={56}/>
            </div>
            <p className="font-bold text-nn-navy">Ask Materna AI</p>
            <p className="mt-1 text-xs text-nn-navy-light max-w-xs">
              Ask questions about your uploaded health documents, prior check-ins, or voice notes.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {DEMO_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="rounded-full border border-nn-mist bg-white px-3 py-1.5 text-xs font-medium text-nn-navy hover:border-nn-periwinkle hover:bg-nn-pale-sky transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-nn-deep-blue px-4 py-3">
                <p className="text-sm text-white whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ) : (
            <div key={msg.id} className="flex gap-2.5">
              <img src={logo} alt="Materna AI" className="h-8 w-8 flex-shrink-0 rounded-full object-cover shadow-sm mt-1" />
              <div className="max-w-[85%] space-y-2">
                <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm border border-nn-mist">
                  <p className="text-sm text-nn-navy whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>

                {/* Source chips */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {msg.sources.map((src, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full border border-nn-mist bg-white px-2.5 py-1 text-[10px] font-medium text-nn-deep-blue"
                        title={src.snippet}
                      >
                        {src.source_type === 'health_document' ? (
                          <>
                            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
                              <path d="M9 1H3a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" />
                              <path d="M9 1v4h4" />
                            </svg>
                            {src.title || 'Health Doc'}
                            {src.page_number != null && ` · p${src.page_number}`}
                          </>
                        ) : (
                          <>
                            <svg viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3">
                              <circle cx="7" cy="7" r="6" />
                              <path d="M7 4v4l2 1" strokeLinecap="round" />
                            </svg>
                            Check-in
                            {src.created_at
                              ? ` · ${new Date(src.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                              : ''}
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                )}

                {/* Safety notice (collapsed) */}
                {msg.safety_notice && (
                  <p className="px-1 text-[10px] text-nn-navy-light leading-snug">
                    {msg.safety_notice}
                  </p>
                )}
              </div>
            </div>
          )
        )}

        {loading && (
          <div className="flex gap-2.5">
            <img src={logo} alt="Materna AI" className="h-8 w-8 flex-shrink-0 rounded-full object-cover shadow-sm" />
            <div className="rounded-2xl rounded-tl-sm bg-white px-4 py-3 shadow-sm border border-nn-mist">
              <div className="flex gap-1.5 items-center h-5">
                <span className="h-2 w-2 rounded-full bg-nn-periwinkle animate-bounce [animation-delay:0ms]" />
                <span className="h-2 w-2 rounded-full bg-nn-periwinkle animate-bounce [animation-delay:150ms]" />
                <span className="h-2 w-2 rounded-full bg-nn-periwinkle animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t border-nn-mist bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your health documents or check-in history…"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-2xl border border-nn-mist bg-nn-pale-sky px-4 py-3 text-sm text-nn-navy placeholder-nn-navy-light outline-none focus:border-nn-periwinkle focus:ring-2 focus:ring-nn-periwinkle/30 disabled:opacity-50 max-h-32 leading-snug"
            style={{ fieldSizing: 'content' } as React.CSSProperties}
          />
          <button
            onClick={() => void sendMessage()}
            disabled={!input.trim() || loading}
            className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-nn-deep-blue text-white shadow-sm hover:bg-nn-deep-blue/90 disabled:opacity-40 transition-colors"
            aria-label="Send"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5 rotate-90">
              <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
            </svg>
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-nn-navy-light">
          Based on your uploaded documents and check-in history · Not a diagnosis
        </p>
      </div>
    </div>
  )
}
