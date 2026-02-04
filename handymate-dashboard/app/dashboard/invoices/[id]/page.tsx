'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  Download,
  CheckCircle,
  Clock,
  FileText,
  Mail,
  MessageSquare,
  Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

interface InvoiceItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: string
}

interface Invoice {
  invoice_id: string
  invoice_number: string
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled'
  items: InvoiceItem[]
  subtotal: number
  vat_rate: number
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
    address_line: string | null
  }
  business_id: string
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    fetchInvoice()
  }, [invoiceId])

  async function fetchInvoice() {
    const { data, error } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .eq('invoice_id', invoiceId)
      .single()

    if (!error && data) {
      setInvoice(data)
    }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSend = async (method: 'email' | 'sms' | 'both') => {
    setSending(true)
    try {
      const response = await fetch('/api/invoices/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          send_email: method === 'email' || method === 'both',
          send_sms: method === 'sms' || method === 'both'
        })
      })

      if (!response.ok) throw new Error('Kunde inte skicka')

      const result = await response.json()
      if (result.success) {
        showToast('Faktura skickad!', 'success')
        fetchInvoice()
      } else {
        showToast(result.errors?.join(', ') || 'Något gick fel', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSending(false)
    }
  }

  const handleMarkPaid = async () => {
    try {
      const response = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: invoiceId, status: 'paid' })
      })

      if (!response.ok) throw new Error('Kunde inte uppdatera')

      showToast('Faktura markerad som betald!', 'success')
      fetchInvoice()
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

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Faktura hittades inte</div>
      </div>
    )
  }

  const items = invoice.items || []
  const ocrNumber = invoice.invoice_number?.replace('-', '') + '0'

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

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/invoices" className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white">Faktura #{invoice.invoice_number}</h1>
                <span className={`px-3 py-1 text-xs rounded-full border ${getStatusStyle(invoice.status)}`}>
                  {getStatusText(invoice.status)}
                </span>
              </div>
              <p className="text-sm text-zinc-400 mt-1">
                Skapad {new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`/api/invoices/pdf?invoiceId=${invoiceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
            >
              <Download className="w-4 h-4" />
              PDF
            </a>

            {invoice.status === 'draft' && (
              <div className="relative group">
                <button
                  disabled={sending}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Skicka
                </button>
                <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-2 shadow-xl min-w-[160px]">
                    <button
                      onClick={() => handleSend('email')}
                      disabled={!invoice.customer?.email || sending}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg disabled:opacity-50"
                    >
                      <Mail className="w-4 h-4" />
                      Via email
                    </button>
                    <button
                      onClick={() => handleSend('sms')}
                      disabled={!invoice.customer?.phone_number || sending}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg disabled:opacity-50"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Via SMS
                    </button>
                    <button
                      onClick={() => handleSend('both')}
                      disabled={(!invoice.customer?.email && !invoice.customer?.phone_number) || sending}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-zinc-300 hover:text-white hover:bg-zinc-700 rounded-lg disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      Båda
                    </button>
                  </div>
                </div>
              </div>
            )}

            {invoice.status === 'sent' && (
              <button
                onClick={handleMarkPaid}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-500/30"
              >
                <CheckCircle className="w-4 h-4" />
                Markera betald
              </button>
            )}
          </div>
        </div>

        {/* Invoice Content */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden">
          {/* Customer & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border-b border-zinc-800">
            <div>
              <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Kund</h3>
              {invoice.customer ? (
                <div>
                  <p className="text-white font-medium">{invoice.customer.name}</p>
                  <p className="text-sm text-zinc-400">{invoice.customer.address_line || ''}</p>
                  <p className="text-sm text-zinc-400">{invoice.customer.email || ''}</p>
                  <p className="text-sm text-zinc-400">{invoice.customer.phone_number || ''}</p>
                </div>
              ) : (
                <p className="text-zinc-500">Ingen kund vald</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Fakturadatum</h3>
                <p className="text-white">{new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}</p>
              </div>
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Förfallodatum</h3>
                <p className="text-white">{new Date(invoice.due_date).toLocaleDateString('sv-SE')}</p>
              </div>
              <div>
                <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">OCR-nummer</h3>
                <p className="text-white font-mono">{ocrNumber}</p>
              </div>
              {invoice.paid_at && (
                <div>
                  <h3 className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Betald</h3>
                  <p className="text-emerald-400">{new Date(invoice.paid_at).toLocaleDateString('sv-SE')}</p>
                </div>
              )}
            </div>
          </div>

          {/* ROT/RUT Notice */}
          {invoice.rot_rut_type && (
            <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20">
              <p className="text-emerald-400 text-sm">
                <strong>{invoice.rot_rut_type.toUpperCase()}-avdrag tillämpas.</strong>{' '}
                Avdraget på {invoice.rot_rut_deduction?.toLocaleString('sv-SE')} kr dras automatiskt via Skatteverket.
                Kunden betalar {invoice.customer_pays?.toLocaleString('sv-SE')} kr.
              </p>
            </div>
          )}

          {/* Items Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-800/50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-zinc-500 uppercase">Beskrivning</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Antal</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Enhet</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">à-pris</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-zinc-500 uppercase">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-zinc-800/30">
                    <td className="px-6 py-4 text-white">{item.description}</td>
                    <td className="px-6 py-4 text-right text-zinc-400">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-zinc-400">{item.unit}</td>
                    <td className="px-6 py-4 text-right text-zinc-400">{item.unit_price?.toLocaleString('sv-SE')} kr</td>
                    <td className="px-6 py-4 text-right text-white font-medium">{item.total?.toLocaleString('sv-SE')} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="p-6 bg-zinc-800/30">
            <div className="max-w-xs ml-auto space-y-2">
              <div className="flex justify-between text-zinc-400">
                <span>Delsumma</span>
                <span>{invoice.subtotal?.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>Moms ({invoice.vat_rate}%)</span>
                <span>{invoice.vat_amount?.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-white pt-2 border-t border-zinc-700">
                <span>Totalt</span>
                <span>{invoice.total?.toLocaleString('sv-SE')} kr</span>
              </div>
              {invoice.rot_rut_type && (
                <>
                  <div className="flex justify-between text-emerald-400">
                    <span>{invoice.rot_rut_type.toUpperCase()}-avdrag</span>
                    <span>-{invoice.rot_rut_deduction?.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-emerald-400 pt-2 border-t border-zinc-700">
                    <span>Att betala</span>
                    <span>{invoice.customer_pays?.toLocaleString('sv-SE')} kr</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
