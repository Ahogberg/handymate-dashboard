'use client'

import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'next/navigation'

interface WidgetConfig {
  business_name: string
  color: string
  welcome_message: string
  position: string
  bot_name: string
  collect_contact: boolean
  give_estimates: boolean
  quick_questions: string[]
  logo_url: string | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

function generateSessionId() {
  return 'ws_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 9)
}

export default function WidgetChatPage() {
  const searchParams = useSearchParams()
  const businessId = searchParams.get('bid')

  const [config, setConfig] = useState<WidgetConfig | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [sessionId] = useState(() => {
    if (typeof window === 'undefined') return generateSessionId()
    const stored = sessionStorage.getItem('hm_widget_session')
    if (stored) return stored
    const id = generateSessionId()
    sessionStorage.setItem('hm_widget_session', id)
    return id
  })
  const [error, setError] = useState('')
  const [visitorInfo, setVisitorInfo] = useState({ name: '', phone: '', email: '' })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const appUrl = typeof window !== 'undefined'
    ? window.location.origin
    : process.env.NEXT_PUBLIC_APP_URL || ''

  useEffect(() => {
    if (!businessId) return
    fetch(`${appUrl}/api/widget/config?bid=${encodeURIComponent(businessId)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setError('Widget inte tillgänglig')
          return
        }
        setConfig(data)
        // Add welcome message
        setMessages([{ role: 'assistant', content: data.welcome_message }])
      })
      .catch(() => setError('Kunde inte ladda widget'))
  }, [businessId, appUrl])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || sending || !businessId) return

    setInput('')
    setSending(true)

    const userMessage: Message = { role: 'user', content: msg }
    setMessages(prev => [...prev, userMessage])

    // Extract visitor info from message
    const info = { ...visitorInfo }
    const phoneMatch = msg.match(/(?:0\d{1,3}[\s-]?\d{5,8}|\+46\s?\d{1,3}[\s-]?\d{5,8})/)
    if (phoneMatch) info.phone = phoneMatch[0].replace(/[\s-]/g, '')
    const emailMatch = msg.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
    if (emailMatch) info.email = emailMatch[0]
    if (info.phone !== visitorInfo.phone || info.email !== visitorInfo.email) {
      setVisitorInfo(info)
    }

    try {
      const res = await fetch(`${appUrl}/api/widget/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: businessId,
          session_id: sessionId,
          message: msg,
          visitor_info: info.name || info.phone || info.email ? info : undefined,
        }),
      })

      const data = await res.json()
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Något gick fel. Försök igen.' }])
    }

    setSending(false)
    inputRef.current?.focus()
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 p-4">
        <p className="text-sm text-gray-500">{error}</p>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    )
  }

  const color = config.color || '#0891b2'

  return (
    <div className="h-screen flex flex-col bg-white" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 text-white flex-shrink-0" style={{ backgroundColor: color }}>
        <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(255,255,255,0.2)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold truncate">{config.bot_name}</p>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-green-400 rounded-full" />
            <span className="text-xs opacity-80">Online</span>
          </div>
        </div>
        <button
          onClick={() => window.parent.postMessage('handymate-widget-close', '*')}
          className="p-1 rounded-full hover:bg-white/10 transition-colors"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ backgroundColor: '#f9fafb' }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}>
            {msg.role === 'assistant' && (
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
                style={{ backgroundColor: color }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'text-white rounded-br-sm'
                  : 'bg-white text-gray-800 rounded-bl-sm shadow-sm border border-gray-100'
              }`}
              style={msg.role === 'user' ? { backgroundColor: color } : undefined}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="flex gap-2">
            <div
              className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center"
              style={{ backgroundColor: color }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="bg-white rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm border border-gray-100">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick questions (only show if first message and config has them) */}
      {messages.length === 1 && config.quick_questions.length > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1.5 bg-gray-50 border-t border-gray-100">
          {config.quick_questions.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              disabled={sending}
              className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-gray-100 bg-white flex-shrink-0">
        <form
          onSubmit={e => { e.preventDefault(); sendMessage() }}
          className="flex items-center gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Skriv ett meddelande..."
            disabled={sending}
            className="flex-1 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50"
            style={{ ['--tw-ring-color' as string]: color }}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-opacity disabled:opacity-30 flex-shrink-0"
            style={{ backgroundColor: color }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </form>
        <p className="text-center mt-2">
          <span className="text-[10px] text-gray-300">Powered by Handymate</span>
        </p>
      </div>
    </div>
  )
}
