'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Send,
  Download,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Mail,
  MessageSquare,
  Loader2,
  FileText,
  User,
  Calendar,
  RefreshCw
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Quote {
  quote_id: string
  business_id: string
  customer_id: string
  status: string
  title: string
  description: string
  items: any[]
  labor_total: number
  material_total: number
  subtotal: number
  discount_percent: number
  discount_amount: number
  vat_rate: number
  vat_amount: number
  total: number
  rot_rut_type: string | null
  rot_rut_eligible: number
  rot_rut_deduction: number
  customer_pays: number
  valid_until: string
  sent_at: string | null
  opened_at: string | null
  accepted_at: string | null
  declined_at: string | null
  decline_reason: string | null
  pdf_url: string | null
  created_at: string
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string
  }
}

export default function QuoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const quoteId = params.id as string

  const [quote, setQuote] = useState<Quote | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [sendMethod, setSendMethod] = useState<'sms' | 'email' | 'both'>('sms')
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    fetchQuote()
  }, [quoteId])

  async function fetchQuote() {
    const { data } = await supabase
      .from('quotes')
      .select('*, customer(*)')
      .eq('quote_id', quoteId)
      .single()

    setQuote(data)
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const generatePDF = async () => {
    if (!quote) return
    setGeneratingPdf(true)

    try {
      const response = await fetch('/api/quotes/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.quote_id })
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `Offert-${quote.quote_id}.pdf`
        a.click()
        window.URL.revokeObjectURL(url)
        showToast('PDF nedladdad!', 'success')
      } else {
        showToast('Kunde inte generera PDF', 'error')
      }
    } catch (error) {
      showToast('Något gick fel', 'error')
    }
    setGeneratingPdf(false)
  }

  const sendQuote = async () => {
    if (!quote) return
    setSending(true)

    try {
      const response = await fetch('/api/quotes/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteId: quote.quote_id,
          method: sendMethod
        })
      })

      if (response.ok) {
        await supabase
          .from('quotes')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('quote_id', quote.quote_id)

        showToast('Offert skickad!', 'success')
        setShowSendModal(false)
        fetchQuote()
      } else {
        showToast('Kunde inte skicka', 'error')
      }
    } catch (error) {
      showToast('Något gick fel', 'error')
    }
    setSending(false)
  }

  const deleteQuote = async () => {
    if (!confirm('Är du säker på att du vill ta bort denna offert?')) return

    await supabase.from('quotes').delete().eq('quote_id', quoteId)
    router.push('/dashboard/quotes')
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
  }

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

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Offerten hittades inte</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/quotes" className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white">{quote.title || 'Offert'}</h1>
              <p className="text-sm text-zinc-400">Skapad {formatDate(quote.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 text-sm rounded-full border ${getStatusStyle(quote.status)}`}>
              {getStatusText(quote.status)}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-6">
          {quote.status === 'draft' && (
            <button
              onClick={() => setShowSendModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90"
            >
              <Send className="w-4 h-4" />
              Skicka offert
            </button>
          )}
          {['sent', 'opened'].includes(quote.status) && (
            <button
              onClick={() => setShowSendModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
            >
              <RefreshCw className="w-4 h-4" />
              Skicka påminnelse
            </button>
          )}
          <button
            onClick={generatePDF}
            disabled={generatingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Ladda ner PDF
          </button>
          {quote.status === 'draft' && (
            <>
              <Link
                href={`/dashboard/quotes/${quote.quote_id}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
              >
                <Edit className="w-4 h-4" />
                Redigera
              </Link>
              <button
                onClick={deleteQuote}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-red-400 hover:bg-red-500/10 hover:border-red-500/30"
              >
                <Trash2 className="w-4 h-4" />
                Ta bort
              </button>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                Kund
              </h2>
              {quote.customer ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-zinc-500">Namn</p>
                    <p className="text-white">{quote.customer.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-zinc-500">Telefon</p>
                    <p className="text-white">{quote.customer.phone_number}</p>
                  </div>
                  {quote.customer.email && (
                    <div>
                      <p className="text-sm text-zinc-500">Email</p>
                      <p className="text-white">{quote.customer.email}</p>
                    </div>
                  )}
                  {quote.customer.address_line && (
                    <div>
                      <p className="text-sm text-zinc-500">Adress</p>
                      <p className="text-white">{quote.customer.address_line}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-zinc-500">Ingen kund vald</p>
              )}
            </div>

            {/* Description */}
            {quote.description && (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
                <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-400" />
                  Beskrivning
                </h2>
                <p className="text-zinc-300">{quote.description}</p>
              </div>
            )}

            {/* Items */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="font-semibold text-white mb-4">Specifikation</h2>
              
              {/* Labor */}
              {quote.items.filter((i: any) => i.type === 'labor').length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-blue-400 mb-2">Arbete</h3>
                  <div className="space-y-2">
                    {quote.items.filter((i: any) => i.type === 'labor').map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-800">
                        <div>
                          <p className="text-white">{item.name}</p>
                          <p className="text-sm text-zinc-500">{item.quantity} {item.unit === 'hour' ? 'timmar' : 'st'} × {formatCurrency(item.unit_price)}</p>
                        </div>
                        <p className="text-white font-medium">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Materials */}
              {quote.items.filter((i: any) => i.type === 'material').length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-emerald-400 mb-2">Material</h3>
                  <div className="space-y-2">
                    {quote.items.filter((i: any) => i.type === 'material').map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-800">
                        <div>
                          <p className="text-white">{item.name}</p>
                          <p className="text-sm text-zinc-500">{item.quantity} st × {formatCurrency(item.unit_price)}</p>
                        </div>
                        <p className="text-white font-medium">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Services */}
              {quote.items.filter((i: any) => i.type === 'service').length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-amber-400 mb-2">Tjänster</h3>
                  <div className="space-y-2">
                    {quote.items.filter((i: any) => i.type === 'service').map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-zinc-800">
                        <div>
                          <p className="text-white">{item.name}</p>
                        </div>
                        <p className="text-white font-medium">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Summary */}
          <div className="space-y-6">
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="font-semibold text-white mb-4">Summering</h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Arbete</span>
                  <span className="text-white">{formatCurrency(quote.labor_total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Material</span>
                  <span className="text-white">{formatCurrency(quote.material_total)}</span>
                </div>
                <div className="border-t border-zinc-700 pt-3 flex justify-between">
                  <span className="text-zinc-400">Summa</span>
                  <span className="text-white">{formatCurrency(quote.subtotal)}</span>
                </div>
                {quote.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Rabatt ({quote.discount_percent}%)</span>
                    <span>-{formatCurrency(quote.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-zinc-400">Moms ({quote.vat_rate}%)</span>
                  <span className="text-white">{formatCurrency(quote.vat_amount)}</span>
                </div>
                <div className="border-t border-zinc-700 pt-3 flex justify-between text-lg font-semibold">
                  <span className="text-white">Totalt</span>
                  <span className="text-white">{formatCurrency(quote.total)}</span>
                </div>

                {quote.rot_rut_type && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-emerald-400">{quote.rot_rut_type.toUpperCase()}-avdrag</span>
                      <span className="text-emerald-400">-{formatCurrency(quote.rot_rut_deduction)}</span>
                    </div>
                    <div className="border-t border-emerald-500/30 pt-2 mt-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-white">Kund betalar</span>
                        <span className="text-emerald-400">{formatCurrency(quote.customer_pays)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-violet-400" />
                Historik
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-zinc-500 rounded-full"></div>
                  <span className="text-zinc-400">Skapad {formatDate(quote.created_at)}</span>
                </div>
                {quote.sent_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-zinc-400">Skickad {formatDate(quote.sent_at)}</span>
                  </div>
                )}
                {quote.opened_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                    <span className="text-zinc-400">Öppnad {formatDate(quote.opened_at)}</span>
                  </div>
                )}
                {quote.accepted_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-zinc-400">Accepterad {formatDate(quote.accepted_at)}</span>
                  </div>
                )}
                {quote.declined_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-zinc-400">Nekad {formatDate(quote.declined_at)}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-zinc-700 rounded-full"></div>
                  <span className="text-zinc-500">Giltig till {formatDate(quote.valid_until)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-white mb-4">Skicka offert</h2>
            <p className="text-zinc-400 text-sm mb-6">
              Välj hur du vill skicka offerten till {quote.customer?.name}
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => setSendMethod('sms')}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  sendMethod === 'sms'
                    ? 'bg-violet-500/20 border-violet-500 text-white'
                    : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                }`}
              >
                <MessageSquare className="w-5 h-5" />
                <div className="text-left">
                  <p className="font-medium">SMS</p>
                  <p className="text-sm opacity-70">{quote.customer?.phone_number}</p>
                </div>
              </button>

              {quote.customer?.email && (
                <button
                  onClick={() => setSendMethod('email')}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${
                    sendMethod === 'email'
                      ? 'bg-violet-500/20 border-violet-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Mail className="w-5 h-5" />
                  <div className="text-left">
                    <p className="font-medium">Email</p>
                    <p className="text-sm opacity-70">{quote.customer?.email}</p>
                  </div>
                </button>
              )}

              {quote.customer?.email && (
                <button
                  onClick={() => setSendMethod('both')}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${
                    sendMethod === 'both'
                      ? 'bg-violet-500/20 border-violet-500 text-white'
                      : 'bg-zinc-800 border-zinc-700 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Send className="w-5 h-5" />
                  <div className="text-left">
                    <p className="font-medium">Båda</p>
                    <p className="text-sm opacity-70">SMS + Email</p>
                  </div>
                </button>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSendModal(false)}
                className="flex-1 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
              >
                Avbryt
              </button>
              <button
                onClick={sendQuote}
                disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Skicka
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
