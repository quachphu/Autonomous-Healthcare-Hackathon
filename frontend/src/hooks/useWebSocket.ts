import { useEffect, useRef, useCallback } from 'react'
import { getWebSocketUrl, getToken, type MessageItem } from '../lib/api'

interface UseWebSocketOptions {
  threadId: string | null
  onMessage?: (msg: MessageItem) => void
  onTyping?: (userId: string, isTyping: boolean) => void
  onReadReceipt?: (messageId: string, userId: string) => void
}

export function useWebSocket({ threadId, onMessage, onTyping, onReadReceipt }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const retriesRef = useRef(0)

  const connect = useCallback(async () => {
    if (!threadId) return

    const token = await getToken()
    if (!token) return

    const url = `${getWebSocketUrl(threadId)}?token=${token}`
    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      retriesRef.current = 0
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'message' && onMessage) {
          onMessage(data.data)
        } else if (data.type === 'typing' && onTyping) {
          onTyping(data.user_id, data.is_typing)
        } else if (data.type === 'read_receipt' && onReadReceipt) {
          onReadReceipt(data.message_id, data.user_id)
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      // Exponential backoff reconnect
      const delay = Math.min(1000 * 2 ** retriesRef.current, 30000)
      retriesRef.current++
      reconnectTimeout.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [threadId, onMessage, onTyping, onReadReceipt])

  useEffect(() => {
    connect()
    return () => {
      clearTimeout(reconnectTimeout.current)
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [connect])

  const sendMessage = useCallback((content: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'message', content }))
  }, [])

  const sendTyping = useCallback((isTyping: boolean) => {
    wsRef.current?.send(JSON.stringify({ type: 'typing', is_typing: isTyping }))
  }, [])

  const sendRead = useCallback((messageId: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'read', message_id: messageId }))
  }, [])

  return { sendMessage, sendTyping, sendRead }
}
