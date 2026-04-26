'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, MessageSquare, Send } from 'lucide-react'
import { formatDateTime } from '../helpers'
import type { Message } from '../types'

interface MessagesThreadProps {
  messages: Message[]
  token: string
  onMessageSent: (message: Message) => void
}

/**
 * Tvåvägs-meddelandetråd mellan kund och hantverkare.
 * Extraherat från page.tsx vid komponent-splitten — INGEN visuell ändring.
 *
 * Auto-scrollar till botten när nya meddelanden kommer in.
 * Skickar via POST /api/portal/[token]/messages.
 */
export default function MessagesThread({ messages, token, onMessageSent }: MessagesThreadProps) {
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!newMessage.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/portal/${token}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage }),
      })
      if (res.ok) {
        const data = await res.json()
        onMessageSent(data.message)
        setNewMessage('')
      }
    } catch {
      console.error('Failed to send message')
    }
    setSending(false)
  }

  return (
    <div className="flex flex-col" style={{ minHeight: 'calc(100vh - 200px)' }}>
      <div className="flex-1 space-y-3 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p>Inga meddelanden annu.</p>
            <p className="text-sm mt-1">Skriv ett meddelande till din hantverkare.</p>
          </div>
        )}

        {messages.map(msg => (
          <div
            key={msg.id}
            className={`max-w-[85%] ${msg.direction === 'inbound' ? 'ml-auto' : 'mr-auto'}`}
          >
            <div className={`rounded-2xl px-4 py-2.5 ${
              msg.direction === 'inbound'
                ? 'bg-primary-700 text-gray-900 rounded-br-md'
                : 'bg-white border border-gray-200 text-gray-900 rounded-bl-md'
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.message}</p>
            </div>
            <p className={`text-xs mt-1 ${msg.direction === 'inbound' ? 'text-right' : ''} text-gray-400`}>
              {formatDateTime(msg.created_at)}
            </p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div className="sticky bottom-0 bg-gray-50 pt-2 pb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Skriv meddelande..."
            className="flex-1 px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50 focus:border-primary-300"
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || sending}
            className="px-4 py-3 bg-primary-700 text-gray-900 rounded-xl hover:bg-primary-800 disabled:opacity-50 min-w-[48px] flex items-center justify-center"
          >
            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
        </div>
      </div>
    </div>
  )
}
