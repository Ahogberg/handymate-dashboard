'use client'

import { useEffect, useState } from 'react'
import {
  FileText,
  Plus,
  Search,
  Send,
  Eye,
  Trash2,
  CheckCircle,
  Clock,
  AlertCircle,
  DollarSign,
  Download,
  RefreshCw,
  Loader2
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Invoice {
  invoice_id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  subtotal: number
  vat_amount: number
  total: number
  rot_rut_type: string | null
  rot_rut_deduction: number | null
  customer_pays: number | null
  invoice_date: string
  due_date: string
  paid_at: string | null
  fortnox_invoice_number: string | null
  fortnox_synced_at: string | null
  fortnox_sync_error: string | null
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string | null
  }
}

export default function InvoicesPage() {
  const business = useBusiness()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'draft' | 'sent' | 'paid' | 'overdue'>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [sendingId, setSendingId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    if (business.business_id) {
      fetchInvoices()
    }
  }, [business.business_id])

  async function fetchInvoices() {
    const response = await fetch(`/api/invoices?businessId=${business.business_id}`)
    const data = await response.json()
    setInvoices(data.invoices || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSend = async (invoiceId: string) => {
    setSendingId(invoiceId)
    try {
      const response = await fetch('/api/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, send_email: true, send_sms: true })
      })

      if (!response.ok) throw new Error('Kunde inte skicka faktura')

      showToast('Faktura skickad!', 'success')
      fetchInvoices()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSendingId(null)
    }
  }

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      const response = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, status: 'paid' })
      })

      if (!response.ok) throw new Error('Kunde inte uppdatera faktura')

      showToast('Faktura markerad som betald!', 'success')
      fetchInvoices()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const handleDelete = async (invoiceId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna faktura?')) return

    try {
      const response = await fetch(`/api/invoices?invoiceId=${invoiceId}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Kunde inte ta bort faktura')

      showToast('Faktura borttagen!', 'success')
      fetchInvoices()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const handleSyncToFortnox = async (invoiceId: string) => {
    setSyncingId(invoiceId)
    try {
      const response = await fetch('/api/fortnox/sync/invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Synk misslyckades')

      showToast(`Synkad till Fortnox (${data.fortnoxInvoiceNumber})`, 'success')
      fetchInvoices()
    } catch (error: any) {
      showToast(error.message || 'Kunde inte synka till Fortnox', 'error')
    } finally {
      setSyncingId(null)
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
      case 'sent': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'paid': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      case 'overdue': return 'bg-red-500/20 text-red-400 border-red-500/30'
      case 'cancelled': return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Utkast'
      case 'sent': return 'Skickad'
      case 'paid': return 'Betald'
      case 'overdue': return 'Förfallen'
      case 'cancelled': return 'Makulerad'
      default: return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-4 h-4" />
      case 'sent': return <Send className="w-4 h-4" />
      case 'paid': return <CheckCircle className="w-4 h-4" />
      case 'overdue': return <AlertCircle className="w-4 h-4" />
      default: return <Clock className="w-4 h-4" />
    }
  }

  // Filtrera fakturor
  const filteredInvoices = invoices.filter(inv => {
    const matchesFilter = filter === 'all' || inv.status === filter
    const matchesSearch = !searchTerm ||
      inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  // Beräkna statistik
  const unpaidInvoices = invoices.filter(i => i.status === 'sent' || i.status === 'overdue')
  const overdueInvoices = invoices.filter(i => i.status === 'overdue')
  const paidThisMonth = invoices.filter(i => {
    if (i.status !== 'paid' || !i.paid_at) return false
    const paidDate = new Date(i.paid_at)
    const now = new Date()
    return paidDate.getMonth() === now.getMonth() && paidDate.getFullYear() === now.getFullYear()
  })

  const stats = {
    total: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: overdueInvoices.length,
    totalValue: invoices.reduce((sum, i) => sum + (i.total || 0), 0),
    paidValue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0),
    unpaidCount: unpaidInvoices.length,
    unpaidValue: unpaidInvoices.reduce((sum, i) => sum + (i.customer_pays || i.total || 0), 0),
    overdueValue: overdueInvoices.reduce((sum, i) => sum + (i.customer_pays || i.total || 0), 0),
    paidThisMonthValue: paidThisMonth.reduce((sum, i) => sum + (i.customer_pays || i.total || 0), 0)
  }

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1">Fakturor</h1>
            <p className="text-sm text-zinc-400">Hantera och skicka fakturor</p>
          </div>
          <Link
            href="/dashboard/invoices/new"
            className="flex items-center justify-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny faktura
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats.unpaidCount} st</p>
                <p className="text-xs text-zinc-500">Obetalda</p>
                <p className="text-xs text-blue-400">{stats.unpaidValue.toLocaleString('sv-SE')} kr</p>
              </div>
            </div>
          </div>
          <div className={`border rounded-xl p-4 ${stats.overdue > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-zinc-900/50 border-zinc-800'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.overdue > 0 ? 'bg-red-500/20' : 'bg-zinc-800'}`}>
                <AlertCircle className={`w-5 h-5 ${stats.overdue > 0 ? 'text-red-400' : 'text-zinc-500'}`} />
              </div>
              <div>
                <p className={`text-xl font-bold ${stats.overdue > 0 ? 'text-red-400' : 'text-white'}`}>{stats.overdue} st</p>
                <p className="text-xs text-zinc-500">Förfallna</p>
                {stats.overdue > 0 && (
                  <p className="text-xs text-red-400">{stats.overdueValue.toLocaleString('sv-SE')} kr</p>
                )}
              </div>
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats.paid}</p>
                <p className="text-xs text-zinc-500">Betalda totalt</p>
                <p className="text-xs text-emerald-400">{stats.paidValue.toLocaleString('sv-SE')} kr</p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats.paidThisMonthValue.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-zinc-500">kr inbetalt</p>
                <p className="text-xs text-zinc-400">denna månad</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
            {[
              { id: 'all', label: 'Alla' },
              { id: 'draft', label: 'Utkast' },
              { id: 'sent', label: 'Skickade' },
              { id: 'paid', label: 'Betalda' },
              { id: 'overdue', label: 'Förfallna' }
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  filter === f.id ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              placeholder="Sök faktura..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </div>
        </div>

        {/* Invoice List */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 overflow-hidden">
          {filteredInvoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-400 mb-2">Inga fakturor hittades</p>
              <Link
                href="/dashboard/invoices/new"
                className="text-violet-400 hover:text-violet-300 text-sm"
              >
                Skapa din första faktura →
              </Link>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y divide-zinc-800">
                {filteredInvoices.map((invoice) => (
                  <div key={invoice.invoice_id} className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/dashboard/invoices/${invoice.invoice_id}`} className="font-medium text-white hover:text-violet-400">
                            #{invoice.invoice_number}
                          </Link>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(invoice.status)}`}>
                            {getStatusIcon(invoice.status)}
                            {getStatusText(invoice.status)}
                          </span>
                          {invoice.fortnox_invoice_number ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              FN:{invoice.fortnox_invoice_number}
                            </span>
                          ) : invoice.fortnox_sync_error ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-red-500/10 text-red-400 border border-red-500/20" title={invoice.fortnox_sync_error}>
                              <AlertCircle className="w-3 h-3" />
                              Synkfel
                            </span>
                          ) : null}
                        </div>
                        <p className="text-sm text-zinc-400 mt-1">{invoice.customer?.name || 'Ingen kund'}</p>
                        <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500">
                          <span>Förfaller {new Date(invoice.due_date).toLocaleDateString('sv-SE')}</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-white">{invoice.total?.toLocaleString('sv-SE')} kr</p>
                        {invoice.rot_rut_type && (
                          <p className="text-xs text-emerald-400">
                            {invoice.rot_rut_type.toUpperCase()}: {invoice.customer_pays?.toLocaleString('sv-SE')} kr
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <a
                        href={`/api/invoices/pdf?invoiceId=${invoice.invoice_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 p-2.5 text-zinc-400 hover:text-white bg-zinc-800/50 rounded-lg min-h-[44px]"
                      >
                        <Eye className="w-4 h-4" />
                        Visa PDF
                      </a>
                      {invoice.status === 'draft' && (
                        <>
                          <button
                            onClick={() => handleSend(invoice.invoice_id)}
                            disabled={sendingId === invoice.invoice_id}
                            className="flex-1 flex items-center justify-center gap-2 p-2.5 text-violet-400 bg-violet-500/10 rounded-lg min-h-[44px] disabled:opacity-50"
                          >
                            <Send className="w-4 h-4" />
                            Skicka
                          </button>
                          <button
                            onClick={() => handleDelete(invoice.invoice_id)}
                            className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                      {invoice.status === 'sent' && (
                        <button
                          onClick={() => handleMarkPaid(invoice.invoice_id)}
                          className="flex-1 flex items-center justify-center gap-2 p-2.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-lg min-h-[44px]"
                        >
                          <CheckCircle className="w-4 h-4" />
                          Betald
                        </button>
                      )}
                      {invoice.status !== 'draft' && !invoice.fortnox_invoice_number && (
                        <button
                          onClick={() => handleSyncToFortnox(invoice.invoice_id)}
                          disabled={syncingId === invoice.invoice_id}
                          className="p-2.5 text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center disabled:opacity-50"
                          title="Synka till Fortnox"
                        >
                          {syncingId === invoice.invoice_id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Faktura</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Kund</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Datum</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Förfaller</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Belopp</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Fortnox</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.invoice_id} className="hover:bg-zinc-800/30 transition-all">
                        <td className="px-6 py-4">
                          <Link href={`/dashboard/invoices/${invoice.invoice_id}`} className="font-medium text-white hover:text-violet-400">
                            #{invoice.invoice_number}
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white">{invoice.customer?.name || 'Ingen kund'}</p>
                          <p className="text-sm text-zinc-500">{invoice.customer?.email || ''}</p>
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}
                        </td>
                        <td className="px-6 py-4 text-zinc-400">
                          {new Date(invoice.due_date).toLocaleDateString('sv-SE')}
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-white font-medium">{invoice.total?.toLocaleString('sv-SE')} kr</p>
                          {invoice.rot_rut_type && (
                            <p className="text-xs text-emerald-400">
                              {invoice.rot_rut_type.toUpperCase()}: {invoice.customer_pays?.toLocaleString('sv-SE')} kr
                            </p>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border ${getStatusStyle(invoice.status)}`}>
                            {getStatusIcon(invoice.status)}
                            {getStatusText(invoice.status)}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {invoice.fortnox_invoice_number ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                              <CheckCircle className="w-3 h-3" />
                              {invoice.fortnox_invoice_number}
                            </span>
                          ) : invoice.fortnox_sync_error ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-red-500/10 text-red-400 border border-red-500/20 cursor-help" title={invoice.fortnox_sync_error}>
                              <AlertCircle className="w-3 h-3" />
                              Fel
                            </span>
                          ) : invoice.status !== 'draft' ? (
                            <button
                              onClick={() => handleSyncToFortnox(invoice.invoice_id)}
                              disabled={syncingId === invoice.invoice_id}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-zinc-800 text-zinc-400 hover:text-violet-300 hover:bg-violet-500/10 border border-zinc-700 hover:border-violet-500/30 transition-colors disabled:opacity-50"
                            >
                              {syncingId === invoice.invoice_id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              Synka
                            </button>
                          ) : (
                            <span className="text-xs text-zinc-600">-</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <a
                              href={`/api/invoices/pdf?invoiceId=${invoice.invoice_id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all min-w-[40px] min-h-[40px] flex items-center justify-center"
                              title="Visa PDF"
                            >
                              <Eye className="w-4 h-4" />
                            </a>

                            {invoice.status === 'draft' && (
                              <>
                                <button
                                  onClick={() => handleSend(invoice.invoice_id)}
                                  disabled={sendingId === invoice.invoice_id}
                                  className="p-2 text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all disabled:opacity-50 min-w-[40px] min-h-[40px] flex items-center justify-center"
                                  title="Skicka"
                                >
                                  <Send className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleDelete(invoice.invoice_id)}
                                  className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all min-w-[40px] min-h-[40px] flex items-center justify-center"
                                  title="Ta bort"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}

                            {invoice.status === 'sent' && (
                              <button
                                onClick={() => handleMarkPaid(invoice.invoice_id)}
                                className="px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg min-h-[36px]"
                              >
                                Markera betald
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
