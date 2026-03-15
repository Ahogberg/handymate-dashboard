'use client'

import { useEffect, useState } from 'react'
import { FileText, Plus, Send, CheckCircle, XCircle, Clock, Eye, Search, Filter, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
  customer?: {
    name: string
    phone_number: string
  }
}

export default function QuotesPage() {
  const business = useBusiness()
  const [quotes, setQuotes] = useState<Quote[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'accepted'>('all')
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
      if (res.ok) {
        fetchQuotes()
      }
    } catch { /* ignore */ }
    setAcceptingId(null)
  }

  useEffect(() => {
    fetchQuotes()
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

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'sent': return 'bg-teal-100 text-teal-500 border-teal-500/30'
      case 'opened': return 'bg-amber-100 text-amber-600 border-amber-200'
      case 'accepted': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      case 'declined': return 'bg-red-100 text-red-600 border-red-200'
      case 'expired': return 'bg-gray-100 text-gray-400 border-gray-300'
      default: return 'bg-gray-100 text-gray-500 border-gray-300'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Utkast'
      case 'sent': return 'Skickad'
      case 'opened': return 'Öppnad'
      case 'accepted': return 'Accepterad'
      case 'declined': return 'Nekad'
      case 'expired': return 'Utgången'
      default: return status
    }
  }

  const getStatusIcon = (status: string) => {
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)
  }

  const stats = {
    total: quotes.length,
    draft: quotes.filter(q => q.status === 'draft').length,
    sent: quotes.filter(q => ['sent', 'opened'].includes(q.status)).length,
    accepted: quotes.filter(q => q.status === 'accepted').length,
    acceptRate: quotes.filter(q => ['accepted', 'declined'].includes(q.status)).length > 0
      ? Math.round(quotes.filter(q => q.status === 'accepted').length / quotes.filter(q => ['accepted', 'declined'].includes(q.status)).length * 100)
      : 0
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-teal-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Offerter</h1>
            <p className="text-gray-500">{stats.total} offerter • {stats.acceptRate}% acceptrate</p>
          </div>
          <Link
            href="/dashboard/quotes/new"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Ny offert
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <p className="text-gray-400 text-sm">Utkast</p>
            <p className="text-2xl font-bold text-gray-900">{stats.draft}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <p className="text-gray-400 text-sm">Skickade</p>
            <p className="text-2xl font-bold text-teal-500">{stats.sent}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <p className="text-gray-400 text-sm">Accepterade</p>
            <p className="text-2xl font-bold text-emerald-600">{stats.accepted}</p>
          </div>
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <p className="text-gray-400 text-sm">Acceptrate</p>
            <p className="text-2xl font-bold text-sky-700">{stats.acceptRate}%</p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Sök offert eller kund..."
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(['all', 'draft', 'sent', 'accepted'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  filter === f
                    ? 'bg-teal-600 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? 'Alla' : f === 'draft' ? 'Utkast' : f === 'sent' ? 'Skickade' : 'Accepterade'}
              </button>
            ))}
          </div>
        </div>

        {/* Quotes List */}
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
          {filteredQuotes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400">Inga offerter ännu</p>
              <Link href="/dashboard/quotes/new" className="mt-4 text-sky-700 hover:text-teal-600 inline-block">
                Skapa din första offert →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filteredQuotes.map((quote) => (
                <Link
                  key={quote.quote_id}
                  href={`/dashboard/quotes/${quote.quote_id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-100/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${getStatusStyle(quote.status)}`}>
                      {getStatusIcon(quote.status)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{quote.title || 'Offert utan titel'}</p>
                      <p className="text-sm text-gray-400">{quote.customer?.name || 'Ingen kund vald'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {['sent', 'opened'].includes(quote.status) && (
                      <button
                        onClick={(e) => handleAcceptQuote(e, quote.quote_id)}
                        disabled={acceptingId === quote.quote_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 rounded-lg text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 shrink-0"
                      >
                        {acceptingId === quote.quote_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
                        Acceptera
                      </button>
                    )}
                    <div className="text-right">
                      <p className="font-medium text-gray-900">
                        {quote.rot_rut_type ? formatCurrency(quote.customer_pays) : formatCurrency(quote.total)}
                      </p>
                      {quote.rot_rut_type && (
                        <p className="text-xs text-emerald-600">efter {quote.rot_rut_type.toUpperCase()}</p>
                      )}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border mt-1 ${getStatusStyle(quote.status)}`}>
                        {getStatusText(quote.status)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
