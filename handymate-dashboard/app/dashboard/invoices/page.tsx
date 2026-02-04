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
  Download
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
  const stats = {
    total: invoices.length,
    draft: invoices.filter(i => i.status === 'draft').length,
    sent: invoices.filter(i => i.status === 'sent').length,
    paid: invoices.filter(i => i.status === 'paid').length,
    overdue: invoices.filter(i => i.status === 'overdue').length,
    totalValue: invoices.reduce((sum, i) => sum + (i.total || 0), 0),
    paidValue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0)
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
              <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-violet-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-zinc-500">Totalt</p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                <Send className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats.sent}</p>
                <p className="text-xs text-zinc-500">Skickade</p>
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
                <p className="text-xs text-zinc-500">Betalda</p>
              </div>
            </div>
          </div>
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xl font-bold text-white">{stats.paidValue.toLocaleString('sv-SE')}</p>
                <p className="text-xs text-zinc-500">kr inbetalt</p>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Faktura</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Kund</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Datum</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Förfaller</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Belopp</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Status</th>
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
                        <div className="flex items-center gap-2">
                          <a
                            href={`/api/invoices/pdf?invoiceId=${invoice.invoice_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                            title="Visa PDF"
                          >
                            <Eye className="w-4 h-4" />
                          </a>

                          {invoice.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleSend(invoice.invoice_id)}
                                disabled={sendingId === invoice.invoice_id}
                                className="p-2 text-zinc-500 hover:text-violet-400 hover:bg-violet-500/10 rounded-lg transition-all disabled:opacity-50"
                                title="Skicka"
                              >
                                <Send className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(invoice.invoice_id)}
                                className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Ta bort"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}

                          {invoice.status === 'sent' && (
                            <button
                              onClick={() => handleMarkPaid(invoice.invoice_id)}
                              className="px-3 py-1.5 text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-lg"
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
          )}
        </div>
      </div>
    </div>
  )
}
