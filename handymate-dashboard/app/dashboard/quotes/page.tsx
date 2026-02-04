'use client'

import { useEffect, useState } from 'react'
import { FileText, Plus, Send, CheckCircle, XCircle, Clock, Eye, Search, Filter } from 'lucide-react'
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

  useEffect(() => {
    fetchQuotes()
  }, [business.business_id])

  async function fetchQuotes() {
    const { data } = await supabase
      .from('quotes')
      .select('*, customer(name, phone_number)')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    setQuotes(data || [])
    setLoading(false)
  }

  const filteredQuotes = quotes.filter(q => {
    if (filter === 'all') return true
    if (filter === 'draft') return q.status === 'draft'
    if (filter === 'sent') return ['sent', 'opened'].includes(q.status)
    if (filter === 'accepted') return q.status === 'accepted'
    return true
  })

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
      case 'sent': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'opened': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      case 'accepted': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      case 'declined': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'expired': return 'bg-zinc-500/20 text-zinc-500 border-zinc-500/30'
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
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
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Offerter</h1>
            <p className="text-zinc-400">{stats.total} offerter • {stats.acceptRate}% acceptrate</p>
          </div>
          <Link
            href="/dashboard/quotes/new"
            className="flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 transition-all"
          >
            <Plus className="w-4 h-4" />
            Ny offert
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
            <p className="text-zinc-500 text-sm">Utkast</p>
            <p className="text-2xl font-bold text-white">{stats.draft}</p>
          </div>
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
            <p className="text-zinc-500 text-sm">Skickade</p>
            <p className="text-2xl font-bold text-blue-400">{stats.sent}</p>
          </div>
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
            <p className="text-zinc-500 text-sm">Accepterade</p>
            <p className="text-2xl font-bold text-emerald-400">{stats.accepted}</p>
          </div>
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
            <p className="text-zinc-500 text-sm">Acceptrate</p>
            <p className="text-2xl font-bold text-violet-400">{stats.acceptRate}%</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-6 overflow-x-auto">
          {(['all', 'draft', 'sent', 'accepted'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                filter === f
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {f === 'all' ? 'Alla' : f === 'draft' ? 'Utkast' : f === 'sent' ? 'Skickade' : 'Accepterade'}
            </button>
          ))}
        </div>

        {/* Quotes List */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 overflow-hidden">
          {filteredQuotes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500">Inga offerter ännu</p>
              <Link href="/dashboard/quotes/new" className="mt-4 text-violet-400 hover:text-violet-300 inline-block">
                Skapa din första offert →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800">
              {filteredQuotes.map((quote) => (
                <Link
                  key={quote.quote_id}
                  href={`/dashboard/quotes/${quote.quote_id}`}
                  className="flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${getStatusStyle(quote.status)}`}>
                      {getStatusIcon(quote.status)}
                    </div>
                    <div>
                      <p className="font-medium text-white">{quote.title || 'Offert utan titel'}</p>
                      <p className="text-sm text-zinc-500">{quote.customer?.name || 'Ingen kund vald'}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-medium text-white">
                      {quote.rot_rut_type ? formatCurrency(quote.customer_pays) : formatCurrency(quote.total)}
                    </p>
                    {quote.rot_rut_type && (
                      <p className="text-xs text-emerald-400">efter {quote.rot_rut_type.toUpperCase()}</p>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border mt-1 ${getStatusStyle(quote.status)}`}>
                      {getStatusText(quote.status)}
                    </span>
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
