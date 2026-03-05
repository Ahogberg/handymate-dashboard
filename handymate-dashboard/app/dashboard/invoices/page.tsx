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
  Loader2,
  Bell,
  Pencil,
  TrendingUp
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { PermissionGate } from '@/components/PermissionGate'
import Link from 'next/link'

interface Invoice {
  invoice_id: string
  invoice_number: string
  invoice_type?: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled' | 'credited'
  is_credit_note?: boolean
  subtotal: number
  vat_amount: number
  total: number
  rot_rut_type: string | null
  rot_rut_deduction: number | null
  customer_pays: number | null
  invoice_date: string
  due_date: string
  paid_at: string | null
  reminder_count?: number
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
  const [remindingId, setRemindingId] = useState<string | null>(null)
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

  const handleSendReminder = async (invoiceId: string) => {
    setRemindingId(invoiceId)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/reminder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!response.ok) throw new Error('Kunde inte skicka påminnelse')

      showToast('Påminnelse skickad!', 'success')
      fetchInvoices()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setRemindingId(null)
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
      case 'draft': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'sent': return 'bg-teal-100 text-sky-700 border-teal-200'
      case 'paid': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      case 'overdue': return 'bg-red-100 text-red-600 border-red-200'
      case 'cancelled': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'credited': return 'bg-orange-100 text-orange-600 border-orange-200'
      default: return 'bg-gray-100 text-gray-500 border-gray-300'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'draft': return 'Utkast'
      case 'sent': return 'Skickad'
      case 'paid': return 'Betald'
      case 'overdue': return 'Förfallen'
      case 'cancelled': return 'Makulerad'
      case 'credited': return 'Krediterad'
      default: return status
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <FileText className="w-3.5 h-3.5" />
      case 'sent': return <Send className="w-3.5 h-3.5" />
      case 'paid': return <CheckCircle className="w-3.5 h-3.5" />
      case 'overdue': return <AlertCircle className="w-3.5 h-3.5" />
      default: return <Clock className="w-3.5 h-3.5" />
    }
  }

  // Filter
  const filteredInvoices = invoices.filter(inv => {
    const matchesFilter = filter === 'all' || inv.status === filter
    const matchesSearch = !searchTerm ||
      inv.invoice_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inv.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesFilter && matchesSearch
  })

  // Stats
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
    unpaidCount: unpaidInvoices.length,
    unpaidValue: unpaidInvoices.reduce((sum, i) => sum + (i.customer_pays || i.total || 0), 0),
    overdueValue: overdueInvoices.reduce((sum, i) => sum + (i.customer_pays || i.total || 0), 0),
    paidValue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0),
    paidThisMonthValue: paidThisMonth.reduce((sum, i) => sum + (i.customer_pays || i.total || 0), 0)
  }

  const filterTabs = [
    { id: 'all' as const, label: 'Alla', count: stats.total },
    { id: 'draft' as const, label: 'Utkast', count: stats.draft },
    { id: 'sent' as const, label: 'Skickade', count: stats.sent },
    { id: 'overdue' as const, label: 'Förfallna', count: stats.overdue },
    { id: 'paid' as const, label: 'Betalda', count: stats.paid },
  ]

  const getDaysUntilDue = (dueDate: string) => {
    const due = new Date(dueDate)
    const now = new Date()
    due.setHours(0, 0, 0, 0)
    now.setHours(0, 0, 0, 0)
    return Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  }

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
      </div>
    )
  }

  return (
    <PermissionGate permission="see_financials">
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-teal-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1">Fakturor</h1>
            <p className="text-sm text-gray-500">Hantera, skicka och följ upp fakturor</p>
          </div>
          <Link
            href="/dashboard/invoices/new"
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 shadow-md shadow-teal-500/20"
          >
            <Plus className="w-4 h-4" />
            Ny faktura
          </Link>
        </div>

        {/* Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.unpaidCount}</p>
                <p className="text-xs text-gray-400">Obetalda</p>
                <p className="text-xs text-teal-600 font-medium">{stats.unpaidValue.toLocaleString('sv-SE')} kr</p>
              </div>
            </div>
          </div>
          <div className={`border rounded-xl p-4 hover:shadow-md transition-shadow ${stats.overdue > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${stats.overdue > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                <AlertCircle className={`w-5 h-5 ${stats.overdue > 0 ? 'text-red-500' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className={`text-xl font-bold ${stats.overdue > 0 ? 'text-red-600' : 'text-gray-900'}`}>{stats.overdue}</p>
                <p className="text-xs text-gray-400">Förfallna</p>
                {stats.overdue > 0 && (
                  <p className="text-xs text-red-500 font-medium">{stats.overdueValue.toLocaleString('sv-SE')} kr</p>
                )}
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.paid}</p>
                <p className="text-xs text-gray-400">Betalda totalt</p>
                <p className="text-xs text-emerald-500 font-medium">{stats.paidValue.toLocaleString('sv-SE')} kr</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{stats.paidThisMonthValue.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-gray-400">kr inbetalt</p>
                <p className="text-xs text-gray-500">denna månad</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
            {filterTabs.map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  filter === f.id
                    ? 'bg-teal-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                {f.label}
                {f.count > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                    filter === f.id
                      ? 'bg-white/20 text-white'
                      : f.id === 'overdue' && f.count > 0
                        ? 'bg-red-100 text-red-600'
                        : 'bg-gray-100 text-gray-500'
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Sök fakturanr eller kund..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          </div>
        </div>

        {/* Invoice List */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
          {filteredInvoices.length === 0 ? (
            <div className="p-12 text-center">
              <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500 mb-2">Inga fakturor hittades</p>
              <Link
                href="/dashboard/invoices/new"
                className="text-sky-700 hover:text-teal-600 text-sm"
              >
                Skapa din första faktura
              </Link>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="sm:hidden divide-y divide-gray-100">
                {filteredInvoices.map((invoice) => {
                  const daysUntilDue = getDaysUntilDue(invoice.due_date)
                  return (
                    <div key={invoice.invoice_id} className="p-4">
                      <Link href={`/dashboard/invoices/${invoice.invoice_id}`} className="block">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-gray-900">
                                #{invoice.invoice_number}
                              </span>
                              {invoice.is_credit_note && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-600 border border-red-200 font-medium">
                                  KREDIT
                                </span>
                              )}
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${getStatusStyle(invoice.status)}`}>
                                {getStatusIcon(invoice.status)}
                                {getStatusText(invoice.status)}
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">{invoice.customer?.name || 'Ingen kund'}</p>
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                              <span>
                                {invoice.status === 'overdue'
                                  ? `${Math.abs(daysUntilDue)} dagar försenad`
                                  : invoice.status === 'paid'
                                    ? `Betald ${invoice.paid_at ? new Date(invoice.paid_at).toLocaleDateString('sv-SE') : ''}`
                                    : `Förfaller ${new Date(invoice.due_date).toLocaleDateString('sv-SE')}`
                                }
                              </span>
                              {invoice.reminder_count ? (
                                <span className="text-orange-500">{invoice.reminder_count} påminnelse{invoice.reminder_count > 1 ? 'r' : ''}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-bold text-gray-900">{invoice.total?.toLocaleString('sv-SE')} kr</p>
                            {invoice.rot_rut_type && (
                              <p className="text-xs text-emerald-600">
                                {invoice.rot_rut_type.toUpperCase()}: {invoice.customer_pays?.toLocaleString('sv-SE')} kr
                              </p>
                            )}
                          </div>
                        </div>
                      </Link>
                      <div className="flex gap-2 mt-3">
                        <a
                          href={`/api/invoices/pdf?invoiceId=${invoice.invoice_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 flex items-center justify-center gap-2 p-2.5 text-gray-500 hover:text-gray-900 bg-gray-50 rounded-lg min-h-[44px]"
                        >
                          <Eye className="w-4 h-4" />
                          PDF
                        </a>
                        {invoice.status === 'draft' && (
                          <>
                            <button
                              onClick={() => handleSend(invoice.invoice_id)}
                              disabled={sendingId === invoice.invoice_id}
                              className="flex-1 flex items-center justify-center gap-2 p-2.5 text-sky-700 bg-teal-50 rounded-lg min-h-[44px] disabled:opacity-50"
                            >
                              {sendingId === invoice.invoice_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                              Skicka
                            </button>
                            <button
                              onClick={() => handleDelete(invoice.invoice_id)}
                              className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                          <button
                            onClick={() => handleMarkPaid(invoice.invoice_id)}
                            className="flex-1 flex items-center justify-center gap-2 p-2.5 text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg min-h-[44px]"
                          >
                            <CheckCircle className="w-4 h-4" />
                            Betald
                          </button>
                        )}
                        {invoice.status === 'overdue' && (
                          <button
                            onClick={() => handleSendReminder(invoice.invoice_id)}
                            disabled={remindingId === invoice.invoice_id}
                            className="flex-1 flex items-center justify-center gap-2 p-2.5 text-orange-600 bg-orange-50 border border-orange-200 rounded-lg min-h-[44px] disabled:opacity-50"
                          >
                            {remindingId === invoice.invoice_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
                            Påminn
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Desktop Table View */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/50">
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Faktura</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Kund</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Datum</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Förfaller</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Belopp</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Fortnox</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Åtgärder</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredInvoices.map((invoice) => {
                      const daysUntilDue = getDaysUntilDue(invoice.due_date)
                      return (
                        <tr key={invoice.invoice_id} className="hover:bg-teal-50/30 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Link href={`/dashboard/invoices/${invoice.invoice_id}`} className="font-semibold text-gray-900 hover:text-sky-700">
                                #{invoice.invoice_number}
                              </Link>
                              {invoice.is_credit_note && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-600 border border-red-200 font-medium">
                                  KREDIT
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-900 text-sm">{invoice.customer?.name || 'Ingen kund'}</p>
                            <p className="text-xs text-gray-400">{invoice.customer?.email || ''}</p>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}
                          </td>
                          <td className="px-6 py-4">
                            <p className={`text-sm ${invoice.status === 'overdue' ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                              {new Date(invoice.due_date).toLocaleDateString('sv-SE')}
                            </p>
                            {invoice.status === 'overdue' && (
                              <p className="text-xs text-red-500">{Math.abs(daysUntilDue)} dagar sen</p>
                            )}
                            {invoice.reminder_count ? (
                              <p className="text-xs text-orange-500">{invoice.reminder_count} påm.</p>
                            ) : null}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-gray-900 font-medium text-sm">{invoice.total?.toLocaleString('sv-SE')} kr</p>
                            {invoice.rot_rut_type && (
                              <p className="text-xs text-emerald-600">
                                {invoice.rot_rut_type.toUpperCase()}: {invoice.customer_pays?.toLocaleString('sv-SE')} kr
                              </p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full border font-medium ${getStatusStyle(invoice.status)}`}>
                              {getStatusIcon(invoice.status)}
                              {getStatusText(invoice.status)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            {invoice.fortnox_invoice_number ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-emerald-50 text-emerald-600 border border-emerald-500/20">
                                <CheckCircle className="w-3 h-3" />
                                {invoice.fortnox_invoice_number}
                              </span>
                            ) : invoice.fortnox_sync_error ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-red-50 text-red-600 border border-red-500/20 cursor-help" title={invoice.fortnox_sync_error}>
                                <AlertCircle className="w-3 h-3" />
                                Fel
                              </span>
                            ) : invoice.status !== 'draft' ? (
                              <button
                                onClick={() => handleSyncToFortnox(invoice.invoice_id)}
                                disabled={syncingId === invoice.invoice_id}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full bg-gray-50 text-gray-500 hover:text-teal-600 hover:bg-teal-50 border border-gray-200 hover:border-teal-300 transition-colors disabled:opacity-50"
                              >
                                {syncingId === invoice.invoice_id ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="w-3 h-3" />
                                )}
                                Synka
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1 justify-end">
                              <a
                                href={`/api/invoices/pdf?invoiceId=${invoice.invoice_id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                                title="Visa PDF"
                              >
                                <Eye className="w-4 h-4" />
                              </a>

                              <Link
                                href={`/dashboard/invoices/${invoice.invoice_id}/edit`}
                                className="p-2 text-gray-400 hover:text-sky-700 hover:bg-teal-50 rounded-lg transition-all"
                                title="Redigera"
                              >
                                <Pencil className="w-4 h-4" />
                              </Link>

                              {invoice.status === 'draft' && (
                                <>
                                  <button
                                    onClick={() => handleSend(invoice.invoice_id)}
                                    disabled={sendingId === invoice.invoice_id}
                                    className="p-2 text-gray-400 hover:text-sky-700 hover:bg-teal-50 rounded-lg transition-all disabled:opacity-50"
                                    title="Skicka"
                                  >
                                    {sendingId === invoice.invoice_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                  </button>
                                  <button
                                    onClick={() => handleDelete(invoice.invoice_id)}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                    title="Ta bort"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}

                              {(invoice.status === 'sent' || invoice.status === 'overdue') && (
                                <button
                                  onClick={() => handleMarkPaid(invoice.invoice_id)}
                                  className="px-3 py-1.5 text-xs font-medium text-emerald-600 hover:text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
                                  title="Markera betald"
                                >
                                  Betald
                                </button>
                              )}

                              {invoice.status === 'overdue' && (
                                <button
                                  onClick={() => handleSendReminder(invoice.invoice_id)}
                                  disabled={remindingId === invoice.invoice_id}
                                  className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
                                  title="Skicka påminnelse"
                                >
                                  {remindingId === invoice.invoice_id ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Påminn'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </PermissionGate>
  )
}
