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
  RefreshCw,
  Receipt,
  FolderKanban,
  Link2,
  PenTool,
  Bookmark
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
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [generatingSignLink, setGeneratingSignLink] = useState(false)
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  const saveAsTemplate = async () => {
    if (!quote || !templateName.trim()) return
    setSavingTemplate(true)
    try {
      const laborItems = (quote.items || []).filter((i: any) => i.type === 'labor')
      const materialItems = (quote.items || []).filter((i: any) => i.type === 'material')
      const totalHours = laborItems.reduce((sum: number, i: any) => sum + (i.quantity || 0), 0)

      await fetch('/api/quotes/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description: quote.description,
          estimatedHours: totalHours,
          laborCost: quote.labor_total,
          materials: materialItems.map((i: any) => ({ name: i.name, quantity: i.quantity, unit: i.unit, unitPrice: i.unit_price })),
          totalEstimate: quote.subtotal
        })
      })
      showToast('Mall sparad!', 'success')
      setShowSaveTemplate(false)
      setTemplateName('')
    } catch {
      showToast('Kunde inte spara mall', 'error')
    }
    setSavingTemplate(false)
  }

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

  const createInvoiceFromQuote = async () => {
    if (!quote) return
    setCreatingInvoice(true)

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: quote.business_id,
          customer_id: quote.customer_id,
          quote_id: quote.quote_id,
          items: quote.items.map((item: any) => ({
            description: item.name,
            quantity: item.quantity || 1,
            unit: item.unit === 'hour' ? 'timmar' : 'st',
            unit_price: item.unit_price || 0,
            total: item.total || 0,
            type: item.type === 'labor' ? 'labor' : 'material'
          })),
          vat_rate: quote.vat_rate,
          rot_rut_type: quote.rot_rut_type
        })
      })

      if (!response.ok) throw new Error('Kunde inte skapa faktura')

      const data = await response.json()
      showToast('Faktura skapad!', 'success')
      router.push(`/dashboard/invoices/${data.invoice.invoice_id}`)
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setCreatingInvoice(false)
    }
  }

  const createProjectFromQuote = async () => {
    if (!quote) return
    setCreatingProject(true)

    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_quote_id: quote.quote_id,
          name: quote.title || `Projekt från offert`
        })
      })

      if (!response.ok) throw new Error('Kunde inte skapa projekt')

      const data = await response.json()
      showToast('Projekt skapat!', 'success')
      router.push(`/dashboard/projects/${data.project.project_id}`)
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setCreatingProject(false)
    }
  }

  const generateSignLink = async () => {
    if (!quote) return
    setGeneratingSignLink(true)
    try {
      const response = await fetch(`/api/quotes/${quote.quote_id}/sign-link`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Kunde inte generera länk')
      const data = await response.json()
      await navigator.clipboard.writeText(data.url)
      showToast('Signeringslänk kopierad till urklipp!', 'success')
      fetchQuote()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setGeneratingSignLink(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' })
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'sent': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'opened': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      case 'accepted': return 'bg-emerald-100 text-emerald-600 border-emerald-500/30'
      case 'declined': return 'bg-red-100 text-red-600 border-red-500/30'
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

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Offerten hittades inte</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${toast.type === 'success' ? 'bg-emerald-100 border-emerald-500/30 text-emerald-600' : 'bg-red-100 border-red-500/30 text-red-600'}`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/quotes" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{quote.title || 'Offert'}</h1>
              <p className="text-sm text-gray-500">Skapad {formatDate(quote.created_at)}</p>
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
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90"
            >
              <Send className="w-4 h-4" />
              Skicka offert
            </button>
          )}
          {['draft', 'sent', 'opened'].includes(quote.status) && (
            <button
              onClick={generateSignLink}
              disabled={generatingSignLink}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 disabled:opacity-50"
            >
              {generatingSignLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Signeringslänk
            </button>
          )}
          {['sent', 'opened'].includes(quote.status) && (
            <button
              onClick={() => setShowSendModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
            >
              <RefreshCw className="w-4 h-4" />
              Skicka påminnelse
            </button>
          )}
          {quote.status === 'accepted' && (
            <>
              <button
                onClick={createProjectFromQuote}
                disabled={creatingProject}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
                Skapa projekt
              </button>
              <button
                onClick={createInvoiceFromQuote}
                disabled={creatingInvoice}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 rounded-xl text-gray-900 font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                Skapa faktura
              </button>
            </>
          )}
          <button
            onClick={generatePDF}
            disabled={generatingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 disabled:opacity-50"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Ladda ner PDF
          </button>
          <button
            onClick={() => { setTemplateName(quote.title || ''); setShowSaveTemplate(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
          >
            <Bookmark className="w-4 h-4" />
            Spara mall
          </button>
          {quote.status === 'draft' && (
            <>
              <Link
                href={`/dashboard/quotes/${quote.quote_id}/edit`}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
              >
                <Edit className="w-4 h-4" />
                Redigera
              </Link>
              <button
                onClick={deleteQuote}
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-red-600 hover:bg-red-500/10 hover:border-red-500/30"
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
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                Kund
              </h2>
              {quote.customer ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-400">Namn</p>
                    <p className="text-gray-900">{quote.customer.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-400">Telefon</p>
                    <p className="text-gray-900">{quote.customer.phone_number}</p>
                  </div>
                  {quote.customer.email && (
                    <div>
                      <p className="text-sm text-gray-400">Email</p>
                      <p className="text-gray-900">{quote.customer.email}</p>
                    </div>
                  )}
                  {quote.customer.address_line && (
                    <div>
                      <p className="text-sm text-gray-400">Adress</p>
                      <p className="text-gray-900">{quote.customer.address_line}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-gray-400">Ingen kund vald</p>
              )}
            </div>

            {/* Description */}
            {quote.description && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-400" />
                  Beskrivning
                </h2>
                <p className="text-gray-700">{quote.description}</p>
              </div>
            )}

            {/* Items */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Specifikation</h2>
              
              {/* Labor */}
              {quote.items.filter((i: any) => i.type === 'labor').length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-blue-400 mb-2">Arbete</h3>
                  <div className="space-y-2">
                    {quote.items.filter((i: any) => i.type === 'labor').map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                        <div>
                          <p className="text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-400">{item.quantity} {item.unit === 'hour' ? 'timmar' : 'st'} × {formatCurrency(item.unit_price)}</p>
                        </div>
                        <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Materials */}
              {quote.items.filter((i: any) => i.type === 'material').length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm font-medium text-emerald-600 mb-2">Material</h3>
                  <div className="space-y-2">
                    {quote.items.filter((i: any) => i.type === 'material').map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                        <div>
                          <p className="text-gray-900">{item.name}</p>
                          <p className="text-sm text-gray-400">{item.quantity} st × {formatCurrency(item.unit_price)}</p>
                        </div>
                        <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
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
                      <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                        <div>
                          <p className="text-gray-900">{item.name}</p>
                        </div>
                        <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar - Summary */}
          <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Summering</h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Arbete</span>
                  <span className="text-gray-900">{formatCurrency(quote.labor_total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Material</span>
                  <span className="text-gray-900">{formatCurrency(quote.material_total)}</span>
                </div>
                <div className="border-t border-gray-300 pt-3 flex justify-between">
                  <span className="text-gray-500">Summa</span>
                  <span className="text-gray-900">{formatCurrency(quote.subtotal)}</span>
                </div>
                {quote.discount_amount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Rabatt ({quote.discount_percent}%)</span>
                    <span>-{formatCurrency(quote.discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Moms ({quote.vat_rate}%)</span>
                  <span className="text-gray-900">{formatCurrency(quote.vat_amount)}</span>
                </div>
                <div className="border-t border-gray-300 pt-3 flex justify-between text-lg font-semibold">
                  <span className="text-gray-900">Totalt</span>
                  <span className="text-gray-900">{formatCurrency(quote.total)}</span>
                </div>

                {quote.rot_rut_type && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-emerald-600">{quote.rot_rut_type.toUpperCase()}-avdrag</span>
                      <span className="text-emerald-600">-{formatCurrency(quote.rot_rut_deduction)}</span>
                    </div>
                    <div className="border-t border-emerald-500/30 pt-2 mt-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-gray-900">Kund betalar</span>
                        <span className="text-emerald-600">{formatCurrency(quote.customer_pays)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                Historik
              </h2>
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-gray-300 rounded-full"></div>
                  <span className="text-gray-500">Skapad {formatDate(quote.created_at)}</span>
                </div>
                {quote.sent_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-gray-500">Skickad {formatDate(quote.sent_at)}</span>
                  </div>
                )}
                {quote.opened_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                    <span className="text-gray-500">Öppnad {formatDate(quote.opened_at)}</span>
                  </div>
                )}
                {quote.accepted_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-gray-500">Accepterad {formatDate(quote.accepted_at)}</span>
                  </div>
                )}
                {(quote as any).signed_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
                    <span className="text-gray-500">Signerad av {(quote as any).signed_by_name} {formatDate((quote as any).signed_at)}</span>
                  </div>
                )}
                {quote.declined_at && (
                  <div className="flex items-center gap-3">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-gray-500">Nekad {formatDate(quote.declined_at)}</span>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-gray-200 rounded-full"></div>
                  <span className="text-gray-400">Giltig till {formatDate(quote.valid_until)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send Modal */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Skicka offert</h2>
            <p className="text-gray-500 text-sm mb-6">
              Välj hur du vill skicka offerten till {quote.customer?.name}
            </p>

            <div className="space-y-3 mb-6">
              <button
                onClick={() => setSendMethod('sms')}
                className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all ${
                  sendMethod === 'sms'
                    ? 'bg-blue-100 border-blue-500 text-gray-900'
                    : 'bg-gray-100 border-gray-300 text-gray-500 hover:text-gray-900'
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
                      ? 'bg-blue-100 border-blue-500 text-gray-900'
                      : 'bg-gray-100 border-gray-300 text-gray-500 hover:text-gray-900'
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
                      ? 'bg-blue-100 border-blue-500 text-gray-900'
                      : 'bg-gray-100 border-gray-300 text-gray-500 hover:text-gray-900'
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
                className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                onClick={sendQuote}
                disabled={sending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Skicka
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSaveTemplate(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Spara som mall</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">Mallnamn</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="T.ex. Byte elcentral"
                autoFocus
                className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
