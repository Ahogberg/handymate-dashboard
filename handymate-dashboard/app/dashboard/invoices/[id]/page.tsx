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
  Loader2,
  AlertCircle,
  X,
  CreditCard,
  Banknote,
  Smartphone,
  Building,
  Bell
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
  sent_at: string | null
  paid_at: string | null
  paid_amount: number | null
  payment_method: string | null
  reminder_sent_at: string | null
  reminder_count: number
  created_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string | null
    address_line: string | null
  }
  business_id: string
}

const PAYMENT_METHODS = [
  { value: 'swish', label: 'Swish', icon: Smartphone },
  { value: 'bankgiro', label: 'Bankgiro', icon: Building },
  { value: 'card', label: 'Kort', icon: CreditCard },
  { value: 'cash', label: 'Kontant', icon: Banknote },
]

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string

  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [sendingReminder, setSendingReminder] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState({
    paid_at: new Date().toISOString().split('T')[0],
    payment_method: 'swish',
    paid_amount: 0
  })
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    fetchInvoice()
  }, [invoiceId])

  useEffect(() => {
    if (invoice) {
      setPaymentData(prev => ({
        ...prev,
        paid_amount: invoice.customer_pays || invoice.total
      }))
    }
  }, [invoice])

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
    setUpdatingStatus(true)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'paid',
          paid_at: paymentData.paid_at,
          payment_method: paymentData.payment_method,
          paid_amount: paymentData.paid_amount
        })
      })

      if (!response.ok) throw new Error('Kunde inte uppdatera')

      showToast('Faktura markerad som betald!', 'success')
      setShowPaymentModal(false)
      fetchInvoice()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleSendReminder = async () => {
    setSendingReminder(true)
    try {
      const response = await fetch(`/api/invoices/${invoiceId}/reminder`, {
        method: 'POST'
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte skicka påminnelse')
      }

      showToast(`Påminnelse skickad! (${result.reminderCount} totalt)`, 'success')
      fetchInvoice()
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    } finally {
      setSendingReminder(false)
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'sent': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'paid': return 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
      case 'overdue': return 'bg-red-100 text-red-600 border-red-500/30'
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
      default: return status
    }
  }

  const getPaymentMethodText = (method: string | null) => {
    if (!method) return 'Okänd'
    const found = PAYMENT_METHODS.find(m => m.value === method)
    return found?.label || method
  }

  const isOverdue = () => {
    if (!invoice) return false
    const dueDate = new Date(invoice.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return (invoice.status === 'sent' || invoice.status === 'overdue') && dueDate < today
  }

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Faktura hittades inte</div>
      </div>
    )
  }

  const items = invoice.items || []
  const ocrNumber = invoice.invoice_number?.replace('-', '') + '0'

  // Build timeline events
  const timelineEvents = [
    { date: invoice.created_at, label: 'Skapad', icon: FileText, color: 'zinc' },
  ]

  if (invoice.sent_at) {
    timelineEvents.push({ date: invoice.sent_at, label: 'Skickad', icon: Send, color: 'blue' })
  }

  if (isOverdue() && invoice.status !== 'paid') {
    timelineEvents.push({ date: invoice.due_date, label: 'Förfallen', icon: AlertCircle, color: 'red' })
  }

  if (invoice.reminder_sent_at) {
    timelineEvents.push({
      date: invoice.reminder_sent_at,
      label: `Påminnelse skickad${invoice.reminder_count > 1 ? ` (${invoice.reminder_count}x)` : ''}`,
      icon: Bell,
      color: 'amber'
    })
  }

  if (invoice.paid_at) {
    timelineEvents.push({
      date: invoice.paid_at,
      label: `Betald via ${getPaymentMethodText(invoice.payment_method)}`,
      icon: CheckCircle,
      color: 'emerald'
    })
  }

  // Sort by date
  timelineEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-500/30 text-emerald-600' : 'bg-red-100 border-red-500/30 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">Markera som betald</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Betaldatum</label>
                <input
                  type="date"
                  value={paymentData.paid_at}
                  onChange={(e) => setPaymentData({ ...paymentData, paid_at: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Betalningsmetod</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((method) => (
                    <button
                      key={method.value}
                      onClick={() => setPaymentData({ ...paymentData, payment_method: method.value })}
                      className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                        paymentData.payment_method === method.value
                          ? 'bg-blue-100 border-blue-500 text-gray-900'
                          : 'bg-gray-100 border-gray-300 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      <method.icon className="w-4 h-4" />
                      <span className="text-sm">{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Betalt belopp</label>
                <div className="relative">
                  <input
                    type="number"
                    value={paymentData.paid_amount}
                    onChange={(e) => setPaymentData({ ...paymentData, paid_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-12"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Att betala: {(invoice.customer_pays || invoice.total)?.toLocaleString('sv-SE')} kr
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowPaymentModal(false)}
                className="flex-1 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                onClick={handleMarkPaid}
                disabled={updatingStatus}
                className="flex-1 py-3 bg-gradient-to-r from-emerald-500 to-green-500 rounded-xl text-gray-900 font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {updatingStatus ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Bekräfta
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/invoices" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">Faktura #{invoice.invoice_number}</h1>
                <span className={`px-3 py-1 text-xs rounded-full border ${getStatusStyle(invoice.status)}`}>
                  {getStatusText(invoice.status)}
                </span>
              </div>
              <p className="text-sm text-gray-500 mt-1">
                Skapad {new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={`/api/invoices/pdf?invoiceId=${invoiceId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
            >
              <Download className="w-4 h-4" />
              PDF
            </a>

            {invoice.status === 'draft' && (
              <div className="relative group">
                <button
                  disabled={sending}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white hover:opacity-90 disabled:opacity-50"
                >
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Skicka
                </button>
                <div className="absolute right-0 top-full mt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                  <div className="bg-gray-100 border border-gray-300 rounded-xl p-2 shadow-xl min-w-[160px]">
                    <button
                      onClick={() => handleSend('email')}
                      disabled={!invoice.customer?.email || sending}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                    >
                      <Mail className="w-4 h-4" />
                      Via email
                    </button>
                    <button
                      onClick={() => handleSend('sms')}
                      disabled={!invoice.customer?.phone_number || sending}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Via SMS
                    </button>
                    <button
                      onClick={() => handleSend('both')}
                      disabled={(!invoice.customer?.email && !invoice.customer?.phone_number) || sending}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 hover:text-gray-900 hover:bg-gray-200 rounded-lg disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                      Båda
                    </button>
                  </div>
                </div>
              </div>
            )}

            {(invoice.status === 'sent' || invoice.status === 'overdue') && (
              <>
                <button
                  onClick={() => setShowPaymentModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-100 border border-emerald-500/30 rounded-xl text-emerald-600 hover:bg-emerald-500/30"
                >
                  <CheckCircle className="w-4 h-4" />
                  Markera betald
                </button>

                {isOverdue() && (
                  <button
                    onClick={handleSendReminder}
                    disabled={sendingReminder}
                    className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400 hover:bg-amber-500/30 disabled:opacity-50"
                  >
                    {sendingReminder ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                    Skicka påminnelse
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Status Timeline */}
        <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-500 mb-4">Historik</h3>
          <div className="flex flex-wrap gap-4">
            {timelineEvents.map((event, index) => {
              const Icon = event.icon
              const colorClasses: Record<string, string> = {
                zinc: 'bg-gray-100 text-gray-500 border-gray-300',
                blue: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
                red: 'bg-red-100 text-red-600 border-red-500/30',
                amber: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
                emerald: 'bg-emerald-100 text-emerald-600 border-emerald-500/30',
              }
              return (
                <div key={index} className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg border ${colorClasses[event.color]}`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-900">{event.label}</p>
                    <p className="text-xs text-gray-400">{new Date(event.date).toLocaleDateString('sv-SE')}</p>
                  </div>
                  {index < timelineEvents.length - 1 && (
                    <div className="w-8 h-px bg-gray-200 hidden sm:block" />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Invoice Content */}
        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
          {/* Customer & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 border-b border-gray-200">
            <div>
              <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Kund</h3>
              {invoice.customer ? (
                <div>
                  <p className="text-gray-900 font-medium">{invoice.customer.name}</p>
                  <p className="text-sm text-gray-500">{invoice.customer.address_line || ''}</p>
                  <p className="text-sm text-gray-500">{invoice.customer.email || ''}</p>
                  <p className="text-sm text-gray-500">{invoice.customer.phone_number || ''}</p>
                </div>
              ) : (
                <p className="text-gray-400">Ingen kund vald</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Fakturadatum</h3>
                <p className="text-gray-900">{new Date(invoice.invoice_date).toLocaleDateString('sv-SE')}</p>
              </div>
              <div>
                <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Förfallodatum</h3>
                <p className={isOverdue() ? 'text-red-600 font-medium' : 'text-gray-900'}>
                  {new Date(invoice.due_date).toLocaleDateString('sv-SE')}
                  {isOverdue() && ' (förfallen)'}
                </p>
              </div>
              <div>
                <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">OCR-nummer</h3>
                <p className="text-gray-900 font-mono">{ocrNumber}</p>
              </div>
              {invoice.paid_at && (
                <div>
                  <h3 className="text-xs text-gray-400 uppercase tracking-wider mb-2">Betald</h3>
                  <p className="text-emerald-600">
                    {new Date(invoice.paid_at).toLocaleDateString('sv-SE')}
                    {invoice.payment_method && (
                      <span className="text-gray-500 text-xs ml-1">
                        ({getPaymentMethodText(invoice.payment_method)})
                      </span>
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ROT/RUT Notice */}
          {invoice.rot_rut_type && (
            <div className="p-4 bg-emerald-500/10 border-b border-emerald-500/20">
              <p className="text-emerald-600 text-sm">
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
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Beskrivning</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Antal</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Enhet</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">à-pris</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Summa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {items.map((item, index) => (
                  <tr key={index} className="hover:bg-gray-100/30">
                    <td className="px-6 py-4 text-gray-900">{item.description}</td>
                    <td className="px-6 py-4 text-right text-gray-500">{item.quantity}</td>
                    <td className="px-6 py-4 text-right text-gray-500">{item.unit}</td>
                    <td className="px-6 py-4 text-right text-gray-500">{item.unit_price?.toLocaleString('sv-SE')} kr</td>
                    <td className="px-6 py-4 text-right text-gray-900 font-medium">{item.total?.toLocaleString('sv-SE')} kr</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="p-6 bg-gray-100/30">
            <div className="max-w-xs ml-auto space-y-2">
              <div className="flex justify-between text-gray-500">
                <span>Delsumma</span>
                <span>{invoice.subtotal?.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Moms ({invoice.vat_rate}%)</span>
                <span>{invoice.vat_amount?.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t border-gray-300">
                <span>Totalt</span>
                <span>{invoice.total?.toLocaleString('sv-SE')} kr</span>
              </div>
              {invoice.rot_rut_type && (
                <>
                  <div className="flex justify-between text-emerald-600">
                    <span>{invoice.rot_rut_type.toUpperCase()}-avdrag</span>
                    <span>-{invoice.rot_rut_deduction?.toLocaleString('sv-SE')} kr</span>
                  </div>
                  <div className="flex justify-between text-lg font-bold text-emerald-600 pt-2 border-t border-gray-300">
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
