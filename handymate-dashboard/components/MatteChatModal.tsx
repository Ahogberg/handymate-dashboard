'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import { X, Send, Plus, MessageCircle, Sparkles, Trash2, Menu } from 'lucide-react'
import { getAgentById } from '@/lib/agents/team'

interface ChatMessage {
  id?: string
  role: 'user' | 'assistant'
  content: string
  created_at?: string
  delegated_to?: string | null
}

interface Conversation {
  id: string
  title: string | null
  last_message_preview: string | null
  message_count: number
  created_at: string
  updated_at: string
}

interface Props {
  open: boolean
  onClose: () => void
  avatarUrl?: string
  initialPrompt?: string
  /** Om true, öppna senaste aktiva konversation när modalen öppnas. Default: true */
  resumeLatest?: boolean
}

const SUGGESTIONS = [
  'Vilka kunder behöver uppföljning?',
  'Hur mycket fakturerade vi förra månaden?',
  'Visa mina obetalda fakturor',
  'Vilka offerter väntar på svar?',
  'Vad är på gång idag?',
]

export default function MatteChatModal({ open, onClose, avatarUrl, initialPrompt, resumeLatest = true }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingConversations, setLoadingConversations] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [initialized, setInitialized] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Ladda lista över konversationer
  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true)
    try {
      const res = await fetch('/api/matte/conversations')
      if (res.ok) {
        const data = await res.json()
        setConversations(data.conversations || [])
        return data.conversations || []
      }
    } catch { /* noop */ }
    finally { setLoadingConversations(false) }
    return []
  }, [])

  // Ladda meddelanden för en specifik konversation
  const loadConversation = useCallback(async (id: string) => {
    setActiveId(id)
    setMessages([])
    try {
      const res = await fetch(`/api/matte/conversations/${id}`)
      if (res.ok) {
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } catch { /* noop */ }
  }, [])

  // Skapa ny konversation
  const createNewConversation = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/matte/conversations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!res.ok) return null
      const data = await res.json()
      const id = data.conversation?.id as string
      if (!id) return null
      setActiveId(id)
      setMessages([])
      fetchConversations()
      return id
    } catch { return null }
  }, [fetchConversations])

  // Vid öppning: ladda historik och välj senaste
  useEffect(() => {
    if (!open || initialized) return
    setInitialized(true)
    fetchConversations().then(list => {
      if (resumeLatest && list.length > 0) {
        loadConversation(list[0].id)
      }
    })
  }, [open, initialized, fetchConversations, loadConversation, resumeLatest])

  // Fyll i initial prompt när modal öppnas första gången
  useEffect(() => {
    if (open && initialPrompt && !input) {
      setInput(initialPrompt)
    }
  }, [open, initialPrompt, input])

  // Fokus på input
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150)
  }, [open, activeId])

  // Auto-scroll
  useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending, open])

  // ESC stänger
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

    let convId = activeId
    if (!convId) {
      convId = await createNewConversation()
      if (!convId) return
    }

    const userMsg: ChatMessage = { role: 'user', content: text, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch(`/api/matte/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Okänt fel' }))
        setMessages(prev => [...prev, { role: 'assistant', content: err.error || 'Något gick fel.', created_at: new Date().toISOString() }])
        return
      }
      const data = await res.json()
      if (data.assistant_message) {
        setMessages(prev => [...prev, {
          id: data.assistant_message.id,
          role: 'assistant',
          content: data.assistant_message.content,
          created_at: data.assistant_message.created_at,
          delegated_to: data.assistant_message.delegated_to || null,
        }])
      }
      fetchConversations()
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Kunde inte nå servern — försök igen om en stund.', created_at: new Date().toISOString() }])
    } finally {
      setSending(false)
    }
  }, [input, sending, activeId, createNewConversation, fetchConversations])

  const startNew = useCallback(async () => {
    await createNewConversation()
  }, [createNewConversation])

  const deleteConv = useCallback(async (id: string) => {
    if (!confirm('Ta bort konversationen?')) return
    await fetch(`/api/matte/conversations/${id}`, { method: 'DELETE' })
    if (activeId === id) {
      setActiveId(null)
      setMessages([])
    }
    fetchConversations()
  }, [activeId, fetchConversations])

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!open) return null

  const formatConvTime = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffHours = (now.getTime() - d.getTime()) / 3_600_000
    if (diffHours < 24) return d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
    if (diffHours < 7 * 24) return d.toLocaleDateString('sv-SE', { weekday: 'short' })
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-5xl sm:mx-4 flex h-[92vh] sm:h-[780px] sm:max-h-[92vh] overflow-hidden"
      >
        {/* Sidopanel — konversationshistorik */}
        <aside className={`${sidebarOpen ? 'w-72' : 'w-0'} hidden sm:flex flex-col border-r border-gray-100 bg-gray-50 transition-all overflow-hidden`}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Historik</p>
            <button
              onClick={startNew}
              className="flex items-center gap-1 px-2 py-1 bg-white border border-gray-200 rounded-lg text-xs font-medium text-primary-700 hover:bg-primary-50 hover:border-primary-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Ny
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-2">
            {loadingConversations && conversations.length === 0 && (
              <p className="text-xs text-gray-400 px-4 py-3">Laddar...</p>
            )}
            {!loadingConversations && conversations.length === 0 && (
              <p className="text-xs text-gray-400 px-4 py-3">Inga tidigare konversationer</p>
            )}
            {conversations.map(c => (
              <button
                key={c.id}
                onClick={() => loadConversation(c.id)}
                className={`group w-full text-left px-3 py-2.5 flex items-start gap-2 transition-colors border-l-[3px] ${
                  activeId === c.id
                    ? 'bg-primary-50 border-l-primary-700'
                    : 'border-l-transparent hover:bg-white'
                }`}
              >
                <MessageCircle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${activeId === c.id ? 'text-primary-700' : 'text-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-medium truncate ${activeId === c.id ? 'text-primary-900' : 'text-gray-800'}`}>
                    {c.title || 'Ny konversation'}
                  </p>
                  {c.last_message_preview && (
                    <p className="text-[11px] text-gray-400 truncate mt-0.5">{c.last_message_preview}</p>
                  )}
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatConvTime(c.updated_at)}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteConv(c.id) }}
                  className="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
          </div>
        </aside>

        {/* Mittenpanel — aktiv konversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-primary-50 to-white">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="hidden sm:flex p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                title="Visa/dölj historik"
              >
                <Menu className="w-4 h-4" />
              </button>
              {avatarUrl ? (
                <img src={avatarUrl} alt="Matte" className="w-10 h-10 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-primary-700 text-white flex items-center justify-center font-bold text-sm flex-shrink-0">M</div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900">Matte</p>
                <p className="text-[11px] text-gray-500 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Chefsassistent · online
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
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
                  Fråga mig om kunder, offerter, fakturor eller vad som behöver göras idag.
                </p>
                <div className="flex flex-wrap gap-1.5 mt-4 justify-center max-w-sm">
                  {SUGGESTIONS.map(q => (
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
              <div key={msg.id || idx} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 flex-shrink-0">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Matte" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center font-bold text-xs">M</div>
                    )}
                  </div>
                )}
                <div className={`max-w-[75%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-primary-700 text-white rounded-br-sm'
                      : 'bg-white border border-gray-200 text-gray-800 rounded-bl-sm'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <>
                        <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0 [&_strong]:font-semibold [&_a]:text-primary-700">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.delegated_to && (() => {
                          const agent = getAgentById(msg.delegated_to)
                          if (!agent) return null
                          return (
                            <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                              <span className={`w-2 h-2 rounded-full ${agent.color}`} />
                              <span>💬 via {agent.name} <span className="text-gray-400">({agent.role})</span></span>
                            </div>
                          )
                        })()}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                  {msg.created_at && (
                    <p className={`text-[10px] text-gray-400 mt-1 px-1 ${msg.role === 'user' ? 'text-right' : ''}`}>
                      {new Date(msg.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
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
                    <div className="w-8 h-8 rounded-full bg-primary-700 text-white flex items-center justify-center font-bold text-xs">M</div>
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
              Enter = skicka · Shift+Enter = ny rad · Esc = stäng
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
