'use client'

import { useState } from 'react'
import { MessageSquarePlus, X, Send, Loader2, Star } from 'lucide-react'
import { useToast } from '@/components/Toast'

export default function FeedbackWidget() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<'bug' | 'feature' | 'general'>('general')
  const [message, setMessage] = useState('')
  const [rating, setRating] = useState(0)
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (!message.trim()) return
    setSending(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message,
          rating: rating || null,
          page: window.location.pathname,
        }),
      })
      if (res.ok) {
        toast.success('Tack för din feedback!')
        setMessage('')
        setRating(0)
        setOpen(false)
      } else {
        toast.error('Kunde inte skicka feedback')
      }
    } catch {
      toast.error('Något gick fel')
    }
    setSending(false)
  }

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 left-6 z-40 p-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all"
        title="Ge feedback"
      >
        <MessageSquarePlus className="w-5 h-5" />
      </button>

      {/* Feedback panel */}
      {open && (
        <div className="fixed bottom-20 left-6 z-50 w-80 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Ge feedback</h3>
            <button onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-700 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {/* Type selector */}
            <div className="flex gap-2">
              {([['general', 'Allmänt'], ['bug', 'Bugg'], ['feature', 'Önskemål']] as const).map(([t, label]) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`flex-1 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    type === t
                      ? 'bg-blue-100 text-blue-700 border border-blue-200'
                      : 'bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Rating */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 mr-2">Betyg:</span>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n === rating ? 0 : n)}
                  className="p-0.5"
                >
                  <Star
                    className={`w-4 h-4 transition-colors ${
                      n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300'
                    }`}
                  />
                </button>
              ))}
            </div>

            {/* Message */}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Beskriv din feedback..."
              rows={3}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />

            <button
              onClick={submit}
              disabled={!message.trim() || sending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Skicka
            </button>
          </div>
        </div>
      )}
    </>
  )
}
