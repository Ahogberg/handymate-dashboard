'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  MessageSquare,
  Search,
  Send,
  ArrowLeft,
  User,
  Bot,
  Loader2,
  Inbox,
  Phone,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'

interface Conversation {
  phone_number: string
  customer_name: string | null
  customer_id: string | null
  last_message: string
  last_role: string
  last_at: string
  message_count: number
  unread_count: number
}

interface Message {
  id: number
  phone_number: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

function formatPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('46') && digits.length > 9) digits = '0' + digits.substring(2)
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8)}`
  return phone
}

function timeAgo(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'Nu'
  if (diffMin < 60) return `${diffMin} min`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} tim`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} d`
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function formatMessageTime(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  const isYesterday = d.toDateString() === yesterday.toDateString()

  const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  if (isToday) return time
  if (isYesterday) return `Igår ${time}`
  return `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${time}`
}

export default function SmsInboxPage() {
  const business = useBusiness()
  const searchParams = useSearchParams()
  const phoneParam = searchParams?.get('phone') ?? null
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedPhone, setSelectedPhone] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [didAutoOpen, setDidAutoOpen] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`/api/sms/conversations?search=${encodeURIComponent(searchTerm)}`)
      const data = await res.json()
      setConversations(data.conversations || [])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [searchTerm])

  useEffect(() => {
    if (business.business_id) fetchConversations()
  }, [business.business_id, fetchConversations])

  // Auto-öppna tråd om ?phone= finns i URL
  useEffect(() => {
    if (phoneParam && !didAutoOpen && !loading) {
      setDidAutoOpen(true)
      loadThread(phoneParam)
    }
  }, [phoneParam, didAutoOpen, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll för nya meddelanden var 15:e sekund
  useEffect(() => {
    if (!business.business_id) return
    const interval = setInterval(fetchConversations, 15000)
    return () => clearInterval(interval)
  }, [business.business_id, fetchConversations])

  async function loadThread(phone: string) {
    setSelectedPhone(phone)
    setLoadingMessages(true)
    setReplyText('')
    try {
      const res = await fetch(`/api/sms/conversations?search=${encodeURIComponent(phone)}`)
      const listData = await res.json()

      // Hämta alla meddelanden för detta nummer via sms_conversation
      const msgRes = await fetch(`/api/sms/thread?phone=${encodeURIComponent(phone)}`)
      const msgData = await msgRes.json()
      setMessages(msgData.messages || [])
    } catch {
      setMessages([])
    } finally {
      setLoadingMessages(false)
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedPhone || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/sms/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: selectedPhone, message: replyText.trim() }),
      })
      if (res.ok) {
        setReplyText('')
        // Ladda om tråden
        await loadThread(selectedPhone)
        await fetchConversations()
      }
    } catch {
      /* ignore */
    } finally {
      setSending(false)
    }
  }

  const selectedConv = conversations.find((c) => c.phone_number === selectedPhone)
  const totalUnread = conversations.reduce((s, c) => s + c.unread_count, 0)

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#F8FAFC]">
      {/* ── Vänster: Konversationslista ─────────────────────── */}
      <div
        className={`w-full md:w-[380px] md:min-w-[380px] border-r border-[#E2E8F0] bg-white flex flex-col ${
          selectedPhone ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#E2E8F0]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#0F766E]" />
              <h1 className="text-[17px] font-semibold text-[#0F172A]">SMS</h1>
              {totalUnread > 0 && (
                <span className="bg-[#0F766E] text-white text-[11px] font-medium px-2 py-0.5 rounded-full">
                  {totalUnread}
                </span>
              )}
            </div>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#94A3B8]" />
            <input
              type="text"
              placeholder="Sök namn eller nummer..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-[13px] border border-[#E2E8F0] rounded-lg bg-white focus:outline-none focus:border-[#0F766E] placeholder:text-[#94A3B8]"
            />
          </div>
        </div>

        {/* Konversationslista */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
              <div className="w-14 h-14 rounded-full bg-[#F0FDFA] flex items-center justify-center mb-4">
                <Inbox className="w-7 h-7 text-[#0F766E]" />
              </div>
              <p className="text-[14px] font-medium text-[#334155] mb-1">Inga konversationer än</p>
              <p className="text-[12px] text-[#94A3B8]">
                SMS-konversationer dyker upp här när kunder svarar på dina meddelanden.
              </p>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.phone_number}
                onClick={() => loadThread(conv.phone_number)}
                className={`w-full text-left px-5 py-3.5 border-b border-[#F1F5F9] hover:bg-[#F8FAFC] transition-colors cursor-pointer ${
                  selectedPhone === conv.phone_number ? 'bg-[#F0FDFA] border-l-2 border-l-[#0F766E]' : ''
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#F1F5F9] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-[#64748B]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-[13px] font-medium text-[#0F172A] truncate">
                        {conv.customer_name || formatPhone(conv.phone_number)}
                      </span>
                      <span className="text-[11px] text-[#94A3B8] flex-shrink-0 ml-2">
                        {timeAgo(conv.last_at)}
                      </span>
                    </div>
                    {conv.customer_name && (
                      <p className="text-[11px] text-[#94A3B8] mb-0.5">{formatPhone(conv.phone_number)}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-[#64748B] truncate pr-2">
                        {conv.last_role === 'assistant' && (
                          <span className="text-[#94A3B8]">Du: </span>
                        )}
                        {conv.last_message.slice(0, 60)}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="w-5 h-5 rounded-full bg-[#0F766E] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Höger: Meddelandetråd ──────────────────────────── */}
      <div
        className={`flex-1 flex flex-col ${
          selectedPhone ? 'flex' : 'hidden md:flex'
        }`}
      >
        {!selectedPhone ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <div className="w-16 h-16 rounded-full bg-[#F0FDFA] flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-[#0F766E]" />
            </div>
            <p className="text-[15px] font-medium text-[#334155] mb-1">Välj en konversation</p>
            <p className="text-[13px] text-[#94A3B8]">Klicka på en konversation till vänster för att se meddelanden</p>
          </div>
        ) : (
          <>
            {/* Tråd-header */}
            <div className="px-5 py-3 border-b border-[#E2E8F0] bg-white flex items-center gap-3">
              <button
                onClick={() => setSelectedPhone(null)}
                className="md:hidden p-1.5 rounded-lg hover:bg-[#F1F5F9] cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5 text-[#64748B]" />
              </button>
              <div className="w-9 h-9 rounded-full bg-[#F0FDFA] flex items-center justify-center">
                <User className="w-4 h-4 text-[#0F766E]" />
              </div>
              <div className="flex-1">
                <p className="text-[14px] font-medium text-[#0F172A]">
                  {selectedConv?.customer_name || formatPhone(selectedPhone)}
                </p>
                <p className="text-[11px] text-[#94A3B8]">
                  {selectedConv?.customer_name ? formatPhone(selectedPhone) : ''}
                  {selectedConv && ` · ${selectedConv.message_count} meddelanden`}
                </p>
              </div>
              {selectedConv?.customer_id && (
                <a
                  href={`/dashboard/customers/${selectedConv.customer_id}`}
                  className="text-[12px] text-[#0F766E] hover:underline"
                >
                  Visa kund
                </a>
              )}
            </div>

            {/* Meddelanden */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {loadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 animate-spin text-[#94A3B8]" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-[13px] text-[#94A3B8] py-8">Inga meddelanden</p>
              ) : (
                <>
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] sm:max-w-[70%] rounded-xl px-4 py-2.5 ${
                          msg.role === 'user'
                            ? 'bg-white border border-[#E2E8F0] text-[#0F172A]'
                            : msg.role === 'system'
                            ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                            : 'bg-[#0F766E] text-white'
                        }`}
                      >
                        {msg.role === 'assistant' && (
                          <div className="flex items-center gap-1 mb-1">
                            <Bot className="w-3 h-3 opacity-70" />
                            <span className="text-[10px] opacity-70 font-medium">Matte</span>
                          </div>
                        )}
                        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        <p
                          className={`text-[10px] mt-1 ${
                            msg.role === 'user' ? 'text-[#94A3B8]' : msg.role === 'system' ? 'text-[#B45309]' : 'text-white/60'
                          }`}
                        >
                          {formatMessageTime(msg.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Svarsruta */}
            <div className="px-5 py-3 border-t border-[#E2E8F0] bg-white">
              <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      sendReply()
                    }
                  }}
                  placeholder="Skriv ett svar..."
                  rows={1}
                  className="flex-1 resize-none px-4 py-2.5 text-[13px] border border-[#E2E8F0] rounded-xl bg-white focus:outline-none focus:border-[#0F766E] placeholder:text-[#94A3B8]"
                  style={{ minHeight: 40, maxHeight: 120 }}
                  onInput={(e) => {
                    const el = e.currentTarget
                    el.style.height = 'auto'
                    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={!replyText.trim() || sending}
                  className="p-2.5 rounded-xl bg-[#0F766E] text-white hover:bg-[#0D6B63] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  {sending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                </button>
              </div>
              <p className="text-[10px] text-[#94A3B8] mt-1.5 pl-1">
                Svarsnumret bifogas automatiskt. Enter = skicka, Shift+Enter = ny rad.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
