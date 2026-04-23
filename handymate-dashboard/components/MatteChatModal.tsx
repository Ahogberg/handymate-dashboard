'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { X, Send, RotateCcw, Sparkles } from 'lucide-react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface Props {
  open: boolean
  onClose: () => void
  /** Valfri avatar för Matte */
  avatarUrl?: string
  /** Valfri initial prompt (kvickstartsknapp) */
  initialPrompt?: string
}

const STORAGE_KEY = 'matte-chat-history'
const MAX_HISTORY = 40

export default function MatteChatModal({ open, onClose, avatarUrl, initialPrompt }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadedFromStorage, setLoadedFromStorage] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Ladda historik vid första öppning
  useEffect(() => {
    if (!open || loadedFromStorage) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed: ChatMessage[] = JSON.parse(raw)
        if (Array.isArray(parsed)) setMessages(parsed.slice(-MAX_HISTORY))
      }
    } catch { /* noop */ }
    setLoadedFromStorage(true)
  }, [open, loadedFromStorage])

  // Spara historik
  useEffect(() => {
    if (!loadedFromStorage) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY)))
    } catch { /* noop */ }
  }, [messages, loadedFromStorage])

  // Auto-scroll vid nya meddelanden
  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  // Fokus på input när modal öppnas
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // Skicka initial prompt om angiven
  useEffect(() => {
    if (open && initialPrompt && messages.length === 0 && loadedFromStorage) {
      setInput(initialPrompt)
    }
  }, [open, initialPrompt, messages.length, loadedFromStorage])

  // ESC för att stänga
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || sending) return

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: Date.now() }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/agent/trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trigger_type: 'manual',
          trigger_data: {
            instruction: text,
            // Hela konversationen för kontext (exkl senaste assistant-svar om finns)
            conversation: newMessages.map(m => ({ role: m.role, content: m.content })),
          },
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Okänt fel' }))
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: err.error || 'Något gick fel — försök igen om en stund.',
          timestamp: Date.now(),
        }])
        return
      }

      const data = await res.json()
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.final_response || 'Jag är inte säker på hur jag ska svara.',
        timestamp: Date.now(),
      }])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Kunde inte nå servern — försök igen om en stund.',
        timestamp: Date.now(),
      }])
    } finally {
      setSending(false)
    }
  }, [input, sending, messages])

  const clearHistory = useCallback(() => {
    if (!confirm('Rensa konversationen?')) return
    setMessages([])
    try { localStorage.removeItem(STORAGE_KEY) } catch { /* noop */ }
  }, [])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl sm:mx-4 flex flex-col h-[90vh] sm:h-[720px] sm:max-h-[90vh] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-white">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Matte" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-primary-700 text-white flex items-center justify-center font-bold text-sm">
                M
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">Matte</p>
              <p className="text-[11px] text-gray-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                Online · chefsassistent
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearHistory}
                title="Rensa konversation"
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Meddelandelista */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-gradient-to-b from-white to-gray-50">
          {messages.length === 0 && !sending && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6 text-primary-700" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Hej! Vad kan jag hjälpa dig med?</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Fråga mig om kunder, offerter, fakturor, statistik eller vad som behöver göras idag.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-4 justify-center max-w-sm">
                {[
                  'Vilka kunder behöver uppföljning?',
                  'Hur mycket fakturerade vi förra månaden?',
                  'Visa mina obetalda fakturor',
                  'Vilka offerter väntar på svar?',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="px-2.5 py-1 bg-white border border-gray-200 rounded-full text-[11px] text-gray-600 hover:border-primary-400 hover:text-primary-700 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 flex-shrink-0">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Matte" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center font-bold text-xs">
                      M
                    </div>
                  )}
                </div>
              )}
              <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div
                  className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary-700 text-white rounded-br-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_strong]:font-semibold [&_a]:text-primary-700">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                <p className={`text-[10px] text-gray-400 mt-1 px-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                  {new Date(msg.timestamp).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing-indicator */}
          {sending && (
            <div className="flex gap-3">
              <div className="w-8 h-8 flex-shrink-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Matte" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center font-bold text-xs">
                    M
                  </div>
                )}
              </div>
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-gray-100 bg-white p-3">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Fråga Matte något..."
              rows={1}
              disabled={sending}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 resize-none max-h-32 min-h-[40px] disabled:opacity-60"
              style={{ height: Math.min(128, Math.max(40, 20 + input.split('\n').length * 20)) }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="flex items-center justify-center w-10 h-10 bg-primary-700 text-white rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:bg-primary-800 transition-colors flex-shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mt-1.5 px-1">
            Enter för att skicka · Shift+Enter för ny rad · Esc för att stänga
          </p>
        </div>
      </div>
    </div>
  )
}
