'use client'

import { useCallback, useEffect, useState } from 'react'
import { FileText, ExternalLink, Loader2 } from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'

/**
 * ProjectQuoteDocumentCard (Etapp 3.3, 2026-05-22).
 *
 * Visar offert-PDF som ett kort i projektets Dokument-tab. PDF:en
 * genereras on-demand via /api/quotes/pdf?id=<quote_id> (ingen lagrad
 * fil) — komponenten levererar bara en länk.
 *
 * Designkontrakt:
 * - Self-contained, flyttbar (samma princip som ProjectQuoteSpec)
 * - has_quote=false → renderar null (visas inte alls)
 * - Owner/admin-only — icke-OWA ser inget kort (PDF visar priser)
 * - Server-strippad data (prices_redacted) → också null som
 *   defense-in-depth mot client-server-drift
 */

interface ProjectQuoteDocumentCardProps {
  projectId: string
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Utkast', cls: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Skickad', cls: 'bg-blue-100 text-blue-700' },
  opened: { label: 'Öppnad', cls: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepterad', cls: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Avböjd', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Utgången', cls: 'bg-slate-100 text-slate-500' },
}

interface QuoteContextMinimal {
  has_quote: boolean
  quote_id: string | null
  quote_number: string | null
  status: string | null
  meta: {
    accepted_at: string | null
    sent_at: string | null
    valid_until: string | null
  }
  dokument: { pdf_url: string } | null
  prices_redacted?: boolean
}

export function ProjectQuoteDocumentCard({ projectId }: ProjectQuoteDocumentCardProps) {
  const { isOwnerOrAdmin } = useCurrentUser()
  const [data, setData] = useState<QuoteContextMinimal | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/quote-context`)
      if (!res.ok) {
        setData(null)
        return
      }
      const payload = (await res.json()) as QuoteContextMinimal
      setData(payload)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Tyst tomma fall — komponenten ska inte ta plats om inget att visa.
  if (loading) return null
  if (!data || !data.has_quote || !data.dokument) return null

  // Server är källan till sanning: om server inte gav priser → dölj
  // även om lokal isOwnerOrAdmin säger annat. PDF:en visar priser.
  if (!isOwnerOrAdmin || data.prices_redacted) return null

  const statusInfo = data.status ? STATUS_LABELS[data.status] : null
  const datum = data.meta.accepted_at || data.meta.sent_at || null

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-3">Offert</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <a
          href={data.dokument.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white rounded-xl border border-[#E2E8F0] p-4 hover:border-primary-300 transition block group"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-primary-50 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-secondary-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {data.quote_number ? `Offert ${data.quote_number}` : 'Offert'}
              </p>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary-700 transition-colors flex-shrink-0" />
          </div>
          <div className="flex items-center gap-2">
            {statusInfo && (
              <span className={`px-2 py-0.5 text-xs rounded-full ${statusInfo.cls}`}>
                {statusInfo.label}
              </span>
            )}
            {datum && (
              <span className="text-xs text-gray-400">
                {new Date(datum).toLocaleDateString('sv-SE')}
              </span>
            )}
          </div>
        </a>
      </div>
    </div>
  )
}
