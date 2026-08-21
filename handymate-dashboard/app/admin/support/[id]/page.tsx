'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { CATEGORY_LABELS } from '@/lib/constants/support-categories'

interface ThreadMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  agent?: string | null
  created_at: string
}

interface TicketInfo {
  id: string
  business_id: string
  status: string
  category: string
  summary?: string | null
  business_config?: { business_name?: string } | null
}

export default function SupportTicketPage() {
  const params = useParams()
  const ticketId = params.id as string
  const [ticket, setTicket] = useState<TicketInfo | null>(null)
  const [messages, setMessages] = useState<ThreadMsg[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}`)
      if (!res.ok) throw new Error('Kunde inte hämta ärendet')
      const d = await res.json()
      setTicket(d.ticket || null)
      setMessages(d.messages || [])
      setLoadError(null)
    } catch {
      // Nätverksfel/DB-fel ska synas — aldrig se ut som en tom tråd.
      setLoadError('Kunde inte hämta ärendet — försök igen.')
    } finally {
      setLoading(false)
    }
  }, [ticketId])

  useEffect(() => {
    load()
  }, [load])

  async function sendReply() {
    if (sending) return
    if (!reply.trim()) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: reply }),
      })
      if (!res.ok) throw new Error('Kunde inte skicka svaret')
      setReply('')
      await load()
    } catch {
      setSendError('Kunde inte skicka svaret — försök igen.')
    } finally {
      setSending(false)
    }
  }

  async function markResolved() {
    setSendError(null)
    try {
      const res = await fetch(`/api/admin/support-tickets/${ticketId}/resolve`, { method: 'POST' })
      if (!res.ok) throw new Error('Kunde inte markera ärendet löst')
      window.location.href = '/admin'
    } catch {
      setSendError('Kunde inte markera ärendet löst — försök igen.')
    }
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Laddar...</div>

  if (loadError) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{loadError}</div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Supportärende</h1>
        {ticket && (
          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
            <span>{ticket.business_config?.business_name || ticket.business_id}</span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">
              {CATEGORY_LABELS[ticket.category] || ticket.category}
            </span>
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">{ticket.status}</span>
          </div>
        )}
        {ticket?.summary && <div className="text-sm text-gray-500 mt-1">{ticket.summary}</div>}
      </div>

      <div className="space-y-2 max-h-[60vh] overflow-y-auto">
        {messages.length === 0 && (
          <div className="text-gray-400 text-sm">Inga meddelanden i tråden ännu.</div>
        )}
        {messages.map(m => (
          <div key={m.id} className={`p-3 rounded-xl text-sm ${m.role === 'user' ? 'bg-gray-100' : 'bg-primary-50'}`}>
            <div className="text-xs text-gray-400 mb-1">{m.role === 'user' ? 'Hantverkare' : (m.agent || 'AI')}</div>
            {m.content}
          </div>
        ))}
      </div>

      {sendError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{sendError}</div>
      )}

      <textarea
        value={reply}
        onChange={e => setReply(e.target.value)}
        className="w-full border rounded-xl p-3 text-sm"
        rows={3}
        placeholder="Skriv ditt svar..."
      />
      <div className="flex gap-2">
        <button
          onClick={sendReply}
          disabled={sending || !reply.trim()}
          className="px-4 py-2 bg-primary-700 text-white rounded-xl text-sm font-medium disabled:opacity-40"
        >
          Skicka svar
        </button>
        <button
          onClick={markResolved}
          className="px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium"
        >
          Markera löst
        </button>
      </div>
    </div>
  )
}
