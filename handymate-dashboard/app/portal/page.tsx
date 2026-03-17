'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Calendar,
  FileText,
  Receipt,
  Shield,
  Check,
  X,
  Loader2,
  Clock,
  Phone,
  Mail,
  ExternalLink
} from 'lucide-react'

interface PortalData {
  customer: { name: string; email: string }
  business: { name: string; email: string; phone: string }
  bookings: Array<{
    booking_id: string
    scheduled_start: string
    scheduled_end: string
    status: string
    notes: string | null
    service_type: string | null
  }>
  invoices: Array<{
    invoice_id: string
    invoice_number: string
    invoice_date: string
    due_date: string
    total: number
    status: string
    rot_rut_type: string | null
    customer_pays: number | null
  }>
  quotes: Array<{
    quote_id: string
    status: string
    total: number
    customer_pays: number | null
    valid_until: string
    created_at: string
  }>
  warranties: Array<{
    warranty_id: string
    title: string
    description: string | null
    start_date: string
    end_date: string
    status: string
  }>
}

export default function CustomerPortalPageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    }>
      <CustomerPortalPage />
    </Suspense>
  )
}

function CustomerPortalPage() {
  const searchParams = useSearchParams()
  const token = searchParams?.get('token')
  const [data, setData] = useState<PortalData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'bookings' | 'invoices' | 'quotes' | 'warranties'>('overview')
  const [actionLoading, setActionLoading] = useState('')

  useEffect(() => {
    if (token) fetchData()
    else setError('Ingen giltig länk')
  }, [token])

  async function fetchData() {
    setLoading(true)
    try {
      const response = await fetch(`/api/portal?token=${token}`)
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Något gick fel')
      }
      setData(await response.json())
    } catch (err: any) {
      setError(err.message)
    }
    setLoading(false)
  }

  const handleQuoteAction = async (quoteId: string, action: 'accept_quote' | 'decline_quote') => {
    setActionLoading(quoteId)
    try {
      const response = await fetch('/api/portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action, quote_id: quoteId }),
      })
      if (!response.ok) throw new Error()
      fetchData()
    } catch {
      alert('Kunde inte utföra åtgärden')
    }
    setActionLoading('')
  }

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      confirmed: 'bg-emerald-100 text-emerald-700',
      completed: 'bg-teal-100 text-teal-700',
      cancelled: 'bg-red-100 text-red-700',
      paid: 'bg-emerald-100 text-emerald-700',
      sent: 'bg-teal-100 text-teal-700',
      overdue: 'bg-red-100 text-red-700',
      draft: 'bg-gray-100 text-gray-500',
      accepted: 'bg-emerald-100 text-emerald-700',
      declined: 'bg-red-100 text-red-700',
      active: 'bg-emerald-100 text-emerald-700',
      expired: 'bg-gray-100 text-gray-500',
    }
    const labels: Record<string, string> = {
      confirmed: 'Bekräftad',
      completed: 'Slutförd',
      cancelled: 'Avbokad',
      paid: 'Betald',
      sent: 'Skickad',
      overdue: 'Förfallen',
      draft: 'Utkast',
      accepted: 'Accepterad',
      declined: 'Avböjd',
      active: 'Aktiv',
      expired: 'Utgången',
    }
    return (
      <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${styles[status] || 'bg-gray-100 text-gray-500'}`}>
        {labels[status] || status}
      </span>
    )
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md text-center">
          <X className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Åtkomst nekad</h1>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const upcomingBookings = data.bookings.filter(b => new Date(b.scheduled_start) >= new Date() && b.status !== 'cancelled')
  const pendingInvoices = data.invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const openQuotes = data.quotes.filter(q => q.status === 'sent' || q.status === 'opened')

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{data.business.name}</h1>
              <p className="text-gray-500 text-sm mt-1">Kundportal för {data.customer.name}</p>
            </div>
            <div className="text-right text-sm text-gray-400">
              {data.business.phone && (
                <div className="flex items-center gap-1 justify-end">
                  <Phone className="w-3.5 h-3.5" />
                  {data.business.phone}
                </div>
              )}
              {data.business.email && (
                <div className="flex items-center gap-1 justify-end mt-1">
                  <Mail className="w-3.5 h-3.5" />
                  {data.business.email}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Calendar className="w-5 h-5 text-teal-600 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{upcomingBookings.length}</p>
            <p className="text-xs text-gray-400">Kommande bokningar</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Receipt className="w-5 h-5 text-amber-500 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{pendingInvoices.length}</p>
            <p className="text-xs text-gray-400">Obetald fakturor</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <FileText className="w-5 h-5 text-teal-500 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{openQuotes.length}</p>
            <p className="text-xs text-gray-400">Öppna offerter</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <Shield className="w-5 h-5 text-emerald-500 mb-2" />
            <p className="text-2xl font-bold text-gray-900">{data.warranties.filter(w => w.status === 'active').length}</p>
            <p className="text-xs text-gray-400">Aktiva garantier</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-white border border-gray-200 rounded-xl p-1 mb-6 overflow-x-auto">
          {[
            { id: 'overview', label: 'Översikt', icon: Calendar },
            { id: 'bookings', label: 'Bokningar', icon: Calendar },
            { id: 'invoices', label: 'Fakturor', icon: Receipt },
            { id: 'quotes', label: 'Offerter', icon: FileText },
            { id: 'warranties', label: 'Garantier', icon: Shield },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id ? 'bg-teal-50 text-sky-700' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Upcoming bookings */}
            {upcomingBookings.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-900 mb-4">Kommande bokningar</h2>
                <div className="space-y-3">
                  {upcomingBookings.slice(0, 3).map(b => (
                    <div key={b.booking_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">
                          {new Date(b.scheduled_start).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                        <p className="text-sm text-gray-500">
                          {new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} – {new Date(b.scheduled_end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {getStatusBadge(b.status)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Open quotes */}
            {openQuotes.length > 0 && (
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-5">
                <h2 className="font-semibold text-teal-900 mb-4">Offerter som väntar på ditt svar</h2>
                {openQuotes.map(q => (
                  <div key={q.quote_id} className="flex items-center justify-between p-3 bg-white rounded-lg mb-2">
                    <div>
                      <p className="font-medium text-gray-900">{(q.customer_pays || q.total)?.toLocaleString('sv-SE')} kr</p>
                      <p className="text-sm text-gray-500">Giltig till {new Date(q.valid_until).toLocaleDateString('sv-SE')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleQuoteAction(q.quote_id, 'accept_quote')}
                        disabled={actionLoading === q.quote_id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                      >
                        {actionLoading === q.quote_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Acceptera
                      </button>
                      <button
                        onClick={() => handleQuoteAction(q.quote_id, 'decline_quote')}
                        disabled={actionLoading === q.quote_id}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 disabled:opacity-50"
                      >
                        Avböj
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bookings tab */}
        {activeTab === 'bookings' && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
            {data.bookings.length === 0 ? (
              <p className="p-8 text-center text-gray-400">Inga bokningar</p>
            ) : (
              data.bookings.map(b => (
                <div key={b.booking_id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      {new Date(b.scheduled_start).toLocaleDateString('sv-SE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-sm text-gray-500">
                      {new Date(b.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} – {new Date(b.scheduled_end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                      {b.service_type && ` · ${b.service_type}`}
                    </p>
                  </div>
                  {getStatusBadge(b.status)}
                </div>
              ))
            )}
          </div>
        )}

        {/* Invoices tab */}
        {activeTab === 'invoices' && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
            {data.invoices.length === 0 ? (
              <p className="p-8 text-center text-gray-400">Inga fakturor</p>
            ) : (
              data.invoices.map(i => (
                <div key={i.invoice_id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Faktura #{i.invoice_number}</p>
                    <p className="text-sm text-gray-500">
                      {new Date(i.invoice_date).toLocaleDateString('sv-SE')} · Förfaller {new Date(i.due_date).toLocaleDateString('sv-SE')}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{(i.customer_pays || i.total)?.toLocaleString('sv-SE')} kr</p>
                    {getStatusBadge(i.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Quotes tab */}
        {activeTab === 'quotes' && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
            {data.quotes.length === 0 ? (
              <p className="p-8 text-center text-gray-400">Inga offerter</p>
            ) : (
              data.quotes.map(q => (
                <div key={q.quote_id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">{(q.customer_pays || q.total)?.toLocaleString('sv-SE')} kr</p>
                    <p className="text-sm text-gray-500">
                      Skapad {new Date(q.created_at).toLocaleDateString('sv-SE')} · Giltig till {new Date(q.valid_until).toLocaleDateString('sv-SE')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    {(q.status === 'sent' || q.status === 'opened') && (
                      <>
                        <button
                          onClick={() => handleQuoteAction(q.quote_id, 'accept_quote')}
                          disabled={actionLoading === q.quote_id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 text-white text-sm rounded-lg hover:bg-emerald-600 disabled:opacity-50"
                        >
                          Acceptera
                        </button>
                        <button
                          onClick={() => handleQuoteAction(q.quote_id, 'decline_quote')}
                          disabled={actionLoading === q.quote_id}
                          className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded-lg hover:bg-gray-300 disabled:opacity-50"
                        >
                          Avböj
                        </button>
                      </>
                    )}
                    {getStatusBadge(q.status)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Warranties tab */}
        {activeTab === 'warranties' && (
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-200">
            {data.warranties.length === 0 ? (
              <p className="p-8 text-center text-gray-400">Inga garantier</p>
            ) : (
              data.warranties.map(w => (
                <div key={w.warranty_id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-medium text-gray-900">{w.title}</h3>
                    {getStatusBadge(w.status)}
                  </div>
                  <p className="text-sm text-gray-500">
                    {new Date(w.start_date).toLocaleDateString('sv-SE')} – {new Date(w.end_date).toLocaleDateString('sv-SE')}
                  </p>
                  {w.description && <p className="text-sm text-gray-400 mt-1">{w.description}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-gray-400 mt-8 pb-4">
          Powered by Handymate
        </div>
      </div>
    </div>
  )
}
