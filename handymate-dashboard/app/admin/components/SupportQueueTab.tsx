'use client'

import { useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'

interface SupportTicket {
  id: string
  business_id: string
  thread_id: string
  category: string
  status: string
  summary?: string | null
  escalated_at: string
  business_config?: { business_name?: string } | null
}

const CATEGORY_LABELS: Record<string, string> = {
  cancellation: 'Uppsägning',
  refund: 'Återbetalning',
  gdpr: 'GDPR/juridik',
  bug_financial: 'Bugg (pengapåverkan)',
  human_requested: 'Ville prata med människa',
  other: 'Övrigt',
}

export default function SupportQueueTab() {
  const [tickets, setTickets] = useState<SupportTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/admin/support-tickets')
        if (!res.ok) {
          if (!cancelled) setError('Kunde inte hämta supportärenden — försök igen.')
          return
        }
        const d = await res.json()
        if (!cancelled) setTickets(d.tickets || [])
      } catch {
        // Nätverksfel — skilj tydligt från en genuint tom kö (se CLAUDE.md
        // "Tomma sidor utan fel": en tyst swäljd query får aldrig se ut som
        // "inga ärenden").
        if (!cancelled) setError('Kunde inte hämta supportärenden — försök igen.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  if (loading) return <div className="text-gray-400 text-sm">Laddar...</div>

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        {error}
      </div>
    )
  }

  if (tickets.length === 0) return <div className="text-gray-400 text-sm">Inga öppna supportärenden.</div>

  return (
    <div className="space-y-2">
      {tickets.map(t => (
        <div key={t.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span className="font-semibold text-gray-900 text-sm">{t.business_config?.business_name || t.business_id}</span>
              <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full text-gray-600">{CATEGORY_LABELS[t.category] || t.category}</span>
            </div>
            {t.summary && <div className="text-xs text-gray-500 mt-1">{t.summary}</div>}
            <div className="text-xs text-gray-400 mt-1">Eskalerad {new Date(t.escalated_at).toLocaleString('sv-SE')}</div>
          </div>
          {/* /admin/support/[id] byggs i en senare task i denna serie — 404 här är väntat, inte en bugg. */}
          <a href={`/admin/support/${t.id}`} className="text-sm text-primary-700 font-medium hover:underline">Öppna →</a>
        </div>
      ))}
    </div>
  )
}
