'use client'

import { useEffect, useState } from 'react'
import { CheckCircle, Clock, Eye, FileText, Loader2, Plus, Search, Send, XCircle } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Quote {
  quote_id: string
  title: string
  status: string
  total: number
  customer_pays: number
  rot_rut_type: string | null
  valid_until: string
  created_at: string
  view_count?: number
  last_viewed_at?: string
  customer?: {
    name: string
    phone_number: string
  }
}

type FilterKey = 'all' | 'draft' | 'sent' | 'accepted'

// ─── Helpers ─────────────────────────────────────────────────────────

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just nu'
  if (mins < 60) return `${mins} min sedan`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} tim sedan`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'igår'
  return `${days} dagar sedan`
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)
}

function getStatusBadge(status: string): { label: string; bg: string; text: string } {
  switch (status) {
    case 'draft':
      return { label: 'Utkast', bg: 'bg-slate-100', text: 'text-slate-600' }
    case 'sent':
      return { label: 'Skickad', bg: 'bg-amber-50', text: 'text-amber-700' }
    case 'opened':
      return { label: 'Öppnad', bg: 'bg-blue-50', text: 'text-blue-700' }
    case 'accepted':
      return { label: 'Accepterad', bg: 'bg-green-50', text: 'text-green-700' }
    case 'declined':
      return { label: 'Nekad', bg: 'bg-red-50', text: 'text-red-700' }
    case 'expired':
      return { label: 'Utgången', bg: 'bg-red-50', text: 'text-red-700' }
    default:
      return { label: status, bg: 'bg-slate-100', text: 'text-slate-600' }
  }
}

function getStatusIcon(status: string) {
  switch (status) {
    case 'draft': return <FileText className="w-4 h-4" />
    case 'sent': return <Send className="w-4 h-4" />
    case 'opened': return <Eye className="w-4 h-4" />
    case 'accepted': return <CheckCircle className="w-4 h-4" />
    case 'declined': return <XCircle className="w-4 h-4" />
    case 'expired': return <Clock className="w-4 h-4" />
    default: return <FileText className="w-4 h-4" />
  }
}

// ─── Component ───────────────────────────────────────────────────────

export default function QuotesPage() {
  const business = useBusiness()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [acceptingId, setAcceptingId] = useState<string | null>(null)

  async function handleAcceptQuote(e: React.MouseEvent, quoteId: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Vill du markera denna offert som accepterad?')) return
    setAcceptingId(quoteId)
    try {
      const res = await fetch('/api/quotes/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId }),
      })
      if (res.ok) fetchQuotes()
    } catch { /* ignore */ }
    setAcceptingId(null)
  }

  useEffect(() => {
    fetchQuotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id])

  async function fetchQuotes() {
    try {
      const res = await fetch('/api/quotes')
      if (res.ok) {
        const data = await res.json()
        setQuotes(data.quotes || [])
      }
    } catch (err) {
      console.error('Failed to fetch quotes:', err)
    }
    setLoading(false)
  }

  const filteredQuotes = quotes.filter(q => {
    if (filter === 'draft' && q.status !== 'draft') return false
    if (filter === 'sent' && !['sent', 'opened'].includes(q.status)) return false
    if (filter === 'accepted' && q.status !== 'accepted') return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const matchTitle = q.title?.toLowerCase().includes(query)
      const matchCustomer = q.customer?.name?.toLowerCase().includes(query)
      if (!matchTitle && !matchCustomer) return false
    }
    return true
  })

  const stats = {
    total: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => ['sent', 'opened'].includes(q.status)).length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    acceptRate:
      quotes.filter(q => ['accepted', 'declined'].includes(q.status)).length > 0
        ? Math.round(
            (quotes.filter(q => q.status === 'accepted').length /
              quotes.filter(q => ['accepted', 'declined'].includes(q.status)).length) *
              100
          )
        : 0,
  }

  const filters: Array<{ key: FilterKey; label: string; count: number }> = [
    { key: 'all', label: 'Alla', count: stats.total },
    { key: 'draft', label: 'Utkast', count: stats.draft },
    { key: 'sent', label: 'Skickade', count: stats.sent },
    { key: 'accepted', label: 'Accepterade', count: stats.accepted },
  ]

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        {/* ── Header ──────────────────────────────────────── */}
        <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
              Offerter
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {stats.total === 0
                ? 'Inga offerter ännu'
                : `${stats.total} ${stats.total === 1 ? 'offert' : 'offerter'} · ${stats.acceptRate}% acceptrate`}
            </p>
          </div>
          <Link
            href="/dashboard/quotes/new"
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Ny offert
          </Link>
        </header>

        {/* ── KPI cards ──────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
          {[
            { label: 'Utkast', value: stats.draft },
            { label: 'Skickade', value: stats.sent },
            { label: 'Accepterade', value: stats.accepted },
            { label: 'Acceptrate', value: `${stats.acceptRate}%` },
          ].map(kpi => (
            <div
              key={kpi.label}
              className="bg-white border border-slate-200 rounded-2xl px-4 py-4 sm:px-5 sm:py-5"
            >
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{kpi.label}</p>
              <p className="font-heading text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tracking-tight">
                {kpi.value}
              </p>
            </div>
          ))}
        </div>

        {/* ── Search + Filter tabs ───────────────────────── */}
        <div className="flex flex-col gap-4 mb-6">
          {/* Sökfält */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Sök offert eller kund…"
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            />
          </div>

          {/* Filter underline-tabs */}
          <div className="flex gap-1 border-b border-slate-200 overflow-x-auto scrollbar-hide -mb-px">
            {filters.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  filter === f.key
                    ? 'border-primary-700 text-primary-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                }`}
              >
                <span>{f.label}</span>
                {f.count > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                      filter === f.key ? 'bg-primary-100 text-primary-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Lista / Empty state ────────────────────────── */}
        {filteredQuotes.length === 0 ? (
          <EmptyState hasFilter={filter !== 'all' || !!searchQuery} />
        ) : (
          <div className="space-y-2">
            {filteredQuotes.map(quote => (
              <QuoteRow
                key={quote.quote_id}
                quote={quote}
                accepting={acceptingId === quote.quote_id}
                onAccept={e => handleAcceptQuote(e, quote.quote_id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── QuoteRow ────────────────────────────────────────────────────────

function QuoteRow({
  quote,
  accepting,
  onAccept,
}: {
  quote: Quote
  accepting: boolean
  onAccept: (e: React.MouseEvent) => void
}) {
  const badge = getStatusBadge(quote.status)
  const showAccept = ['sent', 'opened'].includes(quote.status)
  const showNudge =
    quote.view_count != null &&
    quote.view_count >= 3 &&
    ['sent', 'opened'].includes(quote.status)
  const displayAmount = quote.rot_rut_type ? quote.customer_pays : quote.total

  return (
    <Link
      href={`/dashboard/quotes/${quote.quote_id}`}
      className="group block bg-white border border-slate-200 rounded-xl px-4 sm:px-5 py-4 hover:border-slate-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Status icon (subtil teal-50 cirkel enligt designsystemet) */}
        <div className="flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center">
          {getStatusIcon(quote.status)}
        </div>

        {/* Innehåll */}
        <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
          {/* Vänster: titel + kund + view-info */}
          <div className="flex-1 min-w-0">
            <p className="font-heading text-[15px] font-semibold text-slate-900 truncate tracking-tight">
              {quote.title || 'Offert utan titel'}
            </p>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {quote.customer?.name || 'Ingen kund vald'}
              {quote.last_viewed_at && (
                <>
                  <span className="mx-1.5 text-slate-300">·</span>
                  <span>{formatRelativeTime(quote.last_viewed_at)}</span>
                </>
              )}
            </p>
            {(quote.view_count != null && quote.view_count > 0) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                  <Eye className="w-3 h-3" />
                  Öppnad {quote.view_count}x
                </span>
                {showNudge && (
                  <span className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 uppercase tracking-wider">
                    Föreslå nudge
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Höger: belopp + status + acceptera */}
          <div className="flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1.5 flex-shrink-0">
            <p className="font-heading text-base sm:text-lg font-bold text-slate-900 tracking-tight">
              {formatCurrency(displayAmount)}
            </p>
            {quote.rot_rut_type && (
              <p className="text-[11px] text-green-700 font-medium">
                efter {quote.rot_rut_type.toUpperCase()}
              </p>
            )}
            <span
              className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${badge.bg} ${badge.text}`}
            >
              {badge.label}
            </span>
            {showAccept && (
              <button
                type="button"
                onClick={onAccept}
                disabled={accepting}
                className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 border border-primary-200 bg-white hover:bg-primary-50 hover:border-primary-300 rounded-lg transition-colors disabled:opacity-50"
              >
                {accepting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="w-3.5 h-3.5" />
                )}
                Acceptera
              </button>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  if (hasFilter) {
    return (
      <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-16 px-6 text-center">
        <Search className="w-10 h-10 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-sm text-slate-500">Inga offerter matchar din sökning.</p>
      </div>
    )
  }
  return (
    <div className="bg-white border border-dashed border-slate-200 rounded-2xl py-16 px-6 text-center">
      <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" strokeWidth={1.5} />
      <h2 className="font-heading text-lg font-bold text-slate-900 mb-1.5 tracking-tight">
        Inga offerter än
      </h2>
      <p className="text-sm text-slate-500 mb-5 max-w-sm mx-auto">
        Skapa din första offert för att komma igång — Handymate hjälper dig med struktur och uppföljning.
      </p>
      <Link
        href="/dashboard/quotes/new"
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
      >
        <Plus className="w-4 h-4" />
        Skapa offert
      </Link>
    </div>
  )
}
