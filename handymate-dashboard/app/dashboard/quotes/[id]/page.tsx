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
  Bookmark,
  Copy,
  ClipboardList,
  MapPin,
  CreditCard,
  AlertTriangle,
  GitBranch,
  ChevronDown
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import { CopyId } from '@/components/CopyId'

interface QuoteItem {
  id: string
  item_type: 'item' | 'heading' | 'text' | 'subtotal' | 'discount'
  group_name?: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  sort_order: number
}

interface QuoteVersion {
  quote_id: string
  version_number: number
  version_label: string | null
  status: string
  total: number
  created_at: string
}

interface PaymentPlanEntry {
  label: string
  percent: number
  amount: number
  due_description: string
}

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
  quote_items?: QuoteItem[]
  introduction_text?: string
  conclusion_text?: string
  not_included?: string
  ata_terms?: string
  payment_terms_text?: string
  payment_plan?: PaymentPlanEntry[]
  reference_person?: string
  customer_reference?: string
  project_address?: string
  detail_level?: string
  show_unit_prices?: boolean
  show_quantities?: boolean
  rot_work_cost?: number
  rot_deduction?: number
  rot_customer_pays?: number
  rut_work_cost?: number
  rut_deduction?: number
  rut_customer_pays?: number
  quote_number?: string
  signature_data?: string
  signed_at?: string
  signed_by_name?: string
  version_number?: number
  parent_quote_id?: string
  version_label?: string
  sign_token?: string
}

export default function QuoteDetailPage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const quoteId = (params as any)?.id as string

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
  const [extraEmails, setExtraEmails] = useState('')
  const [bccEmails, setBccEmails] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [quoteIntelligence, setQuoteIntelligence] = useState<{
    show_warning: boolean
    analysis: {
      similar_jobs: number
      overrun_percent: number
      suggested_price: number
      current_price: number
      confidence: string
      message: string
    } | null
  } | null>(null)
  const [versions, setVersions] = useState<QuoteVersion[]>([])
  const [creatingVersion, setCreatingVersion] = useState(false)
  const [acceptingQuote, setAcceptingQuote] = useState(false)

  const saveAsTemplate = async () => {
    if (!quote || !templateName.trim()) return
    setSavingTemplate(true)
    try {
      await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description: quote.description,
          default_items: quote.quote_items || [],
          default_payment_plan: quote.payment_plan || [],
          introduction_text: quote.introduction_text,
          conclusion_text: quote.conclusion_text,
          not_included: quote.not_included,
          ata_terms: quote.ata_terms,
          payment_terms_text: quote.payment_terms_text,
          detail_level: quote.detail_level,
          show_unit_prices: quote.show_unit_prices,
          show_quantities: quote.show_quantities,
          rot_enabled: (quote.quote_items || []).some((i: any) => i.is_rot_eligible),
          rut_enabled: (quote.quote_items || []).some((i: any) => i.is_rut_eligible),
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
    try {
      const res = await fetch(`/api/quotes?quoteId=${quoteId}`)
      if (res.ok) {
        const data = await res.json()
        setQuote(data.quote || null)
        setVersions(data.versions || [])
      }
    } catch (err) {
      console.error('Failed to fetch quote:', err)
    }
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
          method: sendMethod,
          extraEmails: extraEmails.split(',').map(e => e.trim()).filter(Boolean),
          bccEmails: bccEmails.split(',').map(e => e.trim()).filter(Boolean),
        })
      })

      if (response.ok) {
        const result = await response.json()
        const methods = []
        if (result.smsSent) methods.push('SMS')
        if (result.emailSent) methods.push('email')
        showToast(`Offert skickad via ${methods.join(' och ')}!`, 'success')
        setShowSendModal(false)
        fetchQuote()
      } else {
        const err = await response.json().catch(() => ({}))
        showToast(err.error || 'Kunde inte skicka', 'error')
      }
    } catch (error) {
      showToast('Något gick fel', 'error')
    }
    setSending(false)
  }

  const deleteQuote = async () => {
    if (!confirm('Är du säker på att du vill ta bort denna offert?')) return

    try {
      await fetch(`/api/quotes?quoteId=${quoteId}`, { method: 'DELETE' })
      router.push('/dashboard/quotes')
    } catch {
      showToast('Kunde inte ta bort offerten', 'error')
    }
  }

  const duplicateQuote = async () => {
    if (!quote) return
    setDuplicating(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duplicate_from: quote.quote_id })
      })
      if (res.ok) {
        const data = await res.json()
        showToast('Offert duplicerad!', 'success')
        router.push(`/dashboard/quotes/${data.quote.quote_id}/edit`)
      } else {
        showToast('Kunde inte duplicera offerten', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    }
    setDuplicating(false)
  }

  const createNewVersion = async () => {
    if (!quote) return
    const label = prompt('Versionsnamn (valfritt):', `Version ${(versions.length || 1) + 1}`)
    if (label === null) return // cancelled
    setCreatingVersion(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duplicate_from: quote.quote_id,
          create_version: true,
          version_label: label || undefined,
        })
      })
      if (res.ok) {
        const data = await res.json()
        showToast('Ny version skapad!', 'success')
        router.push(`/dashboard/quotes/${data.quote.quote_id}/edit`)
      } else {
        showToast('Kunde inte skapa version', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    }
    setCreatingVersion(false)
  }

  const markQuoteAccepted = async () => {
    if (!quote) return
    if (!confirm('Vill du markera denna offert som accepterad?')) return
    setAcceptingQuote(true)
    try {
      const res = await fetch('/api/quotes/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.quote_id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Kunde inte acceptera offerten')
      }
      showToast('Offert markerad som accepterad!', 'success')
      fetchQuote()
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    }
    setAcceptingQuote(false)
  }

  const previewPDF = async () => {
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
        window.open(url, '_blank')
        showToast('PDF öppnad i ny flik', 'success')
      } else {
        showToast('Kunde inte generera förhandsgranskning', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    }
    setGeneratingPdf(false)
  }

  const createInvoiceFromQuote = async () => {
    if (!quote) return
    setCreatingInvoice(true)

    try {
      const response = await fetch('/api/invoices/from-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quote.quote_id,
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
      const response = await fetch('/api/quotes/sign-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.quote_id }),
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

  const getUnitLabel = (unit: string) => {
    switch (unit) {
      case 'hour': return 'tim'
      case 'piece': return 'st'
      case 'm2': return 'm²'
      case 'm': return 'm'
      case 'lm': return 'lm'
      case 'pauschal': return 'pauschal'
      default: return unit || 'st'
    }
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-500 border-gray-300'
      case 'sent': return 'bg-blue-100 text-blue-600 border-blue-300'
      case 'opened': return 'bg-amber-100 text-amber-600 border-amber-300'
      case 'accepted': return 'bg-emerald-100 text-emerald-600 border-emerald-300'
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

  const hasStructuredItems = quote?.quote_items && quote.quote_items.length > 0
  const hasNewRotRut = (quote?.rot_work_cost && quote.rot_work_cost > 0) || (quote?.rut_work_cost && quote.rut_work_cost > 0)

  const renderStructuredItems = (items: QuoteItem[]) => {
    const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)

    return (
      <div className="space-y-1">
        {sorted.map((item) => {
          switch (item.item_type) {
            case 'heading':
              return (
                <div key={item.id} className="bg-primary-50 border border-[#E2E8F0] rounded-lg px-4 py-2.5 mt-3 first:mt-0">
                  <p className="font-semibold text-primary-800 text-sm">{item.description}</p>
                </div>
              )

            case 'item':
              return (
                <div key={item.id} className="flex justify-between items-center py-2.5 px-2 border-b border-gray-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-gray-900">{item.description}</p>
                      {item.is_rot_eligible && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded">
                          ROT
                        </span>
                      )}
                      {item.is_rut_eligible && (
                        <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 rounded">
                          RUT
                        </span>
                      )}
                    </div>
                    {(quote?.show_quantities !== false || quote?.show_unit_prices !== false) && (
                      <p className="text-sm text-gray-400">
                        {quote?.show_quantities !== false && <>{item.quantity} {getUnitLabel(item.unit)}</>}
                        {quote?.show_quantities !== false && quote?.show_unit_prices !== false && ' × '}
                        {quote?.show_unit_prices !== false && formatCurrency(item.unit_price)}
                      </p>
                    )}
                  </div>
                  <p className="text-gray-900 font-medium ml-4 whitespace-nowrap">{formatCurrency(item.total)}</p>
                </div>
              )

            case 'text':
              return (
                <div key={item.id} className="py-2 px-2">
                  <p className="text-gray-500 italic text-sm">{item.description}</p>
                </div>
              )

            case 'subtotal':
              return (
                <div key={item.id} className="flex justify-between items-center py-2.5 px-2 border-t border-gray-300 bg-gray-50 rounded">
                  <p className="font-semibold text-gray-900">{item.description || 'Delsumma'}</p>
                  <p className="font-semibold text-gray-900">{formatCurrency(item.total)}</p>
                </div>
              )

            case 'discount':
              return (
                <div key={item.id} className="flex justify-between items-center py-2.5 px-2 border-b border-gray-100">
                  <p className="text-emerald-600">{item.description}</p>
                  <p className="text-emerald-600 font-medium">-{formatCurrency(Math.abs(item.total))}</p>
                </div>
              )

            default:
              return null
          }
        })}
      </div>
    )
  }

  const renderLegacyItems = (items: any[]) => {
    return (
      <>
        {/* Labor */}
        {items.filter((i: any) => i.type === 'labor').length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-primary-600 mb-2">Arbete</h3>
            <div className="space-y-2">
              {items.filter((i: any) => i.type === 'labor').map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                  <div>
                    <p className="text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-400">{item.quantity} {getUnitLabel(item.unit)} × {formatCurrency(item.unit_price)}</p>
                  </div>
                  <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Materials */}
        {items.filter((i: any) => i.type === 'material').length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-emerald-600 mb-2">Material</h3>
            <div className="space-y-2">
              {items.filter((i: any) => i.type === 'material').map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                  <div>
                    <p className="text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-400">{item.quantity} {getUnitLabel(item.unit)} × {formatCurrency(item.unit_price)}</p>
                  </div>
                  <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Services */}
        {items.filter((i: any) => i.type === 'service').length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-amber-400 mb-2">Tjänster</h3>
            <div className="space-y-2">
              {items.filter((i: any) => i.type === 'service').map((item: any, idx: number) => (
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
      </>
    )
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Offerten hittades inte</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${toast.type === 'success' ? 'bg-emerald-100 border-emerald-500/30 text-emerald-600' : 'bg-red-100 border-red-500/30 text-red-600'}`}>
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
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {quote.title || 'Offert'}
                {quote.quote_number && (
                  <span className="ml-2"><CopyId value={quote.quote_number} /></span>
                )}
              </h1>
              <p className="text-sm text-gray-500">Skapad {formatDate(quote.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 text-sm rounded-full border ${getStatusStyle(quote.status)}`}>
              {getStatusText(quote.status)}
            </span>
          </div>
        </div>

        {/* Version selector */}
        {versions.length > 1 && (
          <div className="flex items-center gap-3 mb-4 bg-white border border-[#E2E8F0] rounded-xl p-3">
            <GitBranch className="w-4 h-4 text-primary-700 flex-shrink-0" />
            <span className="text-sm text-gray-500">Version:</span>
            <select
              value={quoteId}
              onChange={(e) => router.push(`/dashboard/quotes/${e.target.value}`)}
              className="text-sm border border-[#E2E8F0] rounded-lg px-3 py-1.5 bg-white text-gray-900 font-medium focus:ring-1 focus:ring-primary-600 focus:border-primary-600"
            >
              {versions.map((v) => (
                <option key={v.quote_id} value={v.quote_id}>
                  {v.version_label || `Version ${v.version_number}`}
                  {v.status === 'accepted' ? ' ✓' : v.status === 'sent' ? ' (skickad)' : v.status === 'draft' ? ' (utkast)' : ''}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">
              {versions.length} versioner
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mb-6">
          {quote.status === 'draft' && (
            <button
              onClick={() => {
                setShowSendModal(true)
                fetch(`/api/quotes/intelligence?quoteId=${quote.quote_id}`)
                  .then(r => r.json())
                  .then(data => setQuoteIntelligence(data))
                  .catch(() => {})
              }}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90"
            >
              <Send className="w-4 h-4" />
              Skicka offert
            </button>
          )}
          {quote.sign_token && (
            <a
              href={`/quote/${quote.sign_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
            >
              <Eye className="w-4 h-4" />
              Förhandsgranska
            </a>
          )}
          {['draft', 'sent', 'opened'].includes(quote.status) && (
            <button
              onClick={generateSignLink}
              disabled={generatingSignLink}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
            >
              {generatingSignLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              Signeringslänk
            </button>
          )}
          {['sent', 'opened'].includes(quote.status) && (
            <button
              onClick={() => setShowSendModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90"
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
                className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creatingProject ? <Loader2 className="w-4 h-4 animate-spin" /> : <FolderKanban className="w-4 h-4" />}
                Skapa projekt
              </button>
              <button
                onClick={createInvoiceFromQuote}
                disabled={creatingInvoice}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-emerald-500 to-primary-600 rounded-xl text-gray-900 font-medium hover:opacity-90 disabled:opacity-50"
              >
                {creatingInvoice ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
                Skapa faktura
              </button>
            </>
          )}
          <Link
            href={`/dashboard/quotes/${quote.quote_id}/edit`}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            <Edit className="w-4 h-4" />
            Redigera
          </Link>
          <button
            onClick={duplicateQuote}
            disabled={duplicating}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
          >
            {duplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Duplicera
          </button>
          <button
            onClick={createNewVersion}
            disabled={creatingVersion}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
          >
            {creatingVersion ? <Loader2 className="w-4 h-4 animate-spin" /> : <GitBranch className="w-4 h-4" />}
            Ny version
          </button>
          <button
            onClick={previewPDF}
            disabled={generatingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
          >
            {generatingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            Förhandsgranska
          </button>
          <button
            onClick={generatePDF}
            disabled={generatingPdf}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Ladda ner PDF
          </button>
          <button
            onClick={() => { setTemplateName(quote.title || ''); setShowSaveTemplate(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
          >
            <Bookmark className="w-4 h-4" />
            Spara mall
          </button>
          {quote.status === 'draft' && (
            <button
              onClick={deleteQuote}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-red-600 hover:bg-red-500/10 hover:border-red-500/30"
            >
              <Trash2 className="w-4 h-4" />
              Ta bort
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-primary-500" />
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

            {/* Reference fields */}
            {(quote.reference_person || quote.customer_reference || quote.project_address) && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-primary-600" />
                  Referenser
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {quote.reference_person && (
                    <div>
                      <p className="text-sm text-gray-400">Referensperson</p>
                      <p className="text-gray-900">{quote.reference_person}</p>
                    </div>
                  )}
                  {quote.customer_reference && (
                    <div>
                      <p className="text-sm text-gray-400">Kundreferens</p>
                      <p className="text-gray-900">{quote.customer_reference}</p>
                    </div>
                  )}
                  {quote.project_address && (
                    <div className="sm:col-span-2">
                      <p className="text-sm text-gray-400 flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />
                        Projektadress
                      </p>
                      <p className="text-gray-900">{quote.project_address}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {quote.description && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-400" />
                  Beskrivning
                </h2>
                <p className="text-gray-700">{quote.description}</p>
              </div>
            )}

            {/* Introduction text */}
            {quote.introduction_text && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary-600" />
                  Inledning
                </h2>
                <p className="text-gray-700 whitespace-pre-wrap">{quote.introduction_text}</p>
              </div>
            )}

            {/* Items */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Specifikation</h2>

              {hasStructuredItems
                ? renderStructuredItems(quote.quote_items!)
                : renderLegacyItems(quote.items || [])
              }
            </div>

            {/* Ej inkluderat */}
            {quote.not_included && (
              <div className="bg-red-50 rounded-xl border border-red-200 p-4 sm:p-6">
                <h2 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                  Ej inkluderat
                </h2>
                <p className="text-red-700 whitespace-pre-wrap text-sm">{quote.not_included}</p>
              </div>
            )}

            {/* ATA-villkor */}
            {quote.ata_terms && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 sm:p-6">
                <h2 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
                  <ClipboardList className="w-5 h-5 text-amber-500" />
                  ÄTA-villkor
                </h2>
                <p className="text-amber-700 whitespace-pre-wrap text-sm">{quote.ata_terms}</p>
              </div>
            )}

            {/* Payment plan */}
            {quote.payment_plan && quote.payment_plan.length > 0 && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-primary-600" />
                  Betalningsplan
                </h2>
                {quote.payment_terms_text && (
                  <p className="text-gray-500 text-sm mb-4">{quote.payment_terms_text}</p>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="text-left py-2 pr-4 text-gray-500 font-medium">Delbetaling</th>
                        <th className="text-right py-2 px-4 text-gray-500 font-medium">Andel</th>
                        <th className="text-right py-2 px-4 text-gray-500 font-medium">Belopp</th>
                        <th className="text-left py-2 pl-4 text-gray-500 font-medium">Förfaller</th>
                      </tr>
                    </thead>
                    <tbody>
                      {quote.payment_plan.map((entry, idx) => (
                        <tr key={idx} className="border-b border-gray-100 last:border-0">
                          <td className="py-2.5 pr-4 text-gray-900">{entry.label}</td>
                          <td className="py-2.5 px-4 text-right text-gray-600">{entry.percent}%</td>
                          <td className="py-2.5 px-4 text-right text-gray-900 font-medium">{formatCurrency(entry.amount)}</td>
                          <td className="py-2.5 pl-4 text-gray-500">{entry.due_description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Conclusion text */}
            {quote.conclusion_text && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-400" />
                  Avslutning
                </h2>
                <p className="text-gray-700 whitespace-pre-wrap">{quote.conclusion_text}</p>
              </div>
            )}
          </div>

          {/* Sidebar - Summary */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
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
                  <span className="text-gray-500">Netto (exkl. moms)</span>
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
                  <span className="text-gray-900">Totalt inkl. moms</span>
                  <span className="text-gray-900">{formatCurrency(quote.total)}</span>
                </div>

                {/* New ROT/RUT display with structured fields */}
                {hasNewRotRut ? (
                  <>
                    {quote.rot_work_cost && quote.rot_work_cost > 0 && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mt-4">
                        <p className="text-xs font-semibold text-emerald-700 mb-2">ROT-avdrag</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Arbetskostnad (ROT)</span>
                            <span className="text-gray-900">{formatCurrency(quote.rot_work_cost)}</span>
                          </div>
                          <div className="flex justify-between text-emerald-600">
                            <span>ROT-avdrag (30%)</span>
                            <span>-{formatCurrency(quote.rot_deduction || 0)}</span>
                          </div>
                          <div className="border-t border-emerald-500/30 pt-2 mt-1">
                            <div className="flex justify-between font-semibold">
                              <span className="text-gray-900">Kund betalar</span>
                              <span className="text-emerald-600">{formatCurrency(quote.rot_customer_pays || 0)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {quote.rut_work_cost && quote.rut_work_cost > 0 && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mt-4">
                        <p className="text-xs font-semibold text-purple-700 mb-2">RUT-avdrag</p>
                        <div className="space-y-1 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-500">Arbetskostnad (RUT)</span>
                            <span className="text-gray-900">{formatCurrency(quote.rut_work_cost)}</span>
                          </div>
                          <div className="flex justify-between text-purple-600">
                            <span>RUT-avdrag (50%)</span>
                            <span>-{formatCurrency(quote.rut_deduction || 0)}</span>
                          </div>
                          <div className="border-t border-purple-500/30 pt-2 mt-1">
                            <div className="flex justify-between font-semibold">
                              <span className="text-gray-900">Kund betalar</span>
                              <span className="text-purple-600">{formatCurrency(quote.rut_customer_pays || 0)}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  /* Legacy ROT/RUT display */
                  quote.rot_rut_type && (
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
                  )
                )}
              </div>
            </div>

            {/* Signature Info */}
            {quote.signature_data && (
              <div className="bg-white rounded-xl border border-emerald-200 p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <PenTool className="w-5 h-5 text-emerald-600" />
                  E-signerad
                </h2>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{quote.signed_by_name}</p>
                    <p className="text-xs text-gray-500">{quote.signed_at && formatDate(quote.signed_at)}</p>
                  </div>
                </div>
                {quote.signature_data && (
                  <div className="bg-gray-50 rounded-lg p-2">
                    <img src={quote.signature_data} alt="Signatur" className="max-h-16 mx-auto" />
                  </div>
                )}
              </div>
            )}

            {/* Signing link */}
            {quote.sign_token && ['sent', 'opened'].includes(quote.status) && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
                <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                  <Link2 className="w-5 h-5 text-primary-700" />
                  Signeringslänk
                </h2>
                <div className="flex items-center gap-2 bg-gray-50 border border-[#E2E8F0] rounded-lg p-2">
                  <span className="text-xs text-gray-500 truncate flex-1">app.handymate.se/quote/{quote.sign_token.slice(0, 8)}...</span>
                  <button onClick={() => { navigator.clipboard.writeText(`https://app.handymate.se/quote/${quote.sign_token}`); showToast('Kopierad!', 'success') }}
                    className="flex-shrink-0 px-2.5 py-1 bg-primary-700 text-white text-xs rounded-md font-medium">Kopiera</button>
                </div>
              </div>
            )}

            {/* Progress indicator */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Clock className="w-5 h-5 text-primary-700" />
                Status
              </h2>
              <div className="relative space-y-0">
                {/* Connector line */}
                <div className="absolute left-[7px] top-3 bottom-3 w-0.5 bg-gray-200" />
                {[
                  { label: 'Skapad', date: quote.created_at, done: true },
                  { label: 'Skickad', date: quote.sent_at, done: !!quote.sent_at },
                  { label: 'Öppnad', date: quote.opened_at, done: !!quote.opened_at },
                  { label: quote.signed_at ? `Signerad av ${quote.signed_by_name}` : 'Signerad', date: quote.signed_at, done: !!quote.signed_at },
                  { label: 'Utgår', date: quote.valid_until, done: false, isDeadline: true },
                ].map((step, i) => (
                  <div key={i} className="relative flex items-start gap-3 py-2">
                    <div className={`relative z-10 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 mt-0.5 ${
                      step.done ? 'bg-primary-600 border-primary-600' : step.isDeadline ? 'bg-white border-gray-300' : 'bg-white border-gray-300'
                    }`}>
                      {step.done && <svg className="w-full h-full text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${step.done ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>{step.label}</span>
                      {step.date && (
                        <span className="text-xs text-gray-400 ml-2">{formatDate(step.date)}</span>
                      )}
                      {!step.date && !step.isDeadline && (
                        <span className="text-xs text-gray-300 ml-2">—</span>
                      )}
                    </div>
                  </div>
                ))}
                {quote.declined_at && (
                  <div className="relative flex items-start gap-3 py-2">
                    <div className="relative z-10 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-sm text-red-600 font-medium">Nekad</span>
                      <span className="text-xs text-gray-400 ml-2">{formatDate(quote.declined_at)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Send Modal — mail-style */}
      {showSendModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !sending && setShowSendModal(false)}>
          <div className="bg-white rounded-xl border border-[#E2E8F0] w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100">
              <Mail className="w-5 h-5 text-primary-700" />
              <h2 className="text-lg font-semibold text-gray-900">Skicka offert {quote.quote_number || ''}</h2>
              <button onClick={() => !sending && setShowSendModal(false)} className="ml-auto text-gray-400 hover:text-gray-600"><XCircle className="w-5 h-5" /></button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Daniel's intelligence warning */}
              {quoteIntelligence?.show_warning && quoteIntelligence.analysis && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-amber-600 flex items-center justify-center flex-shrink-0 text-white text-xs font-bold">D</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-sm font-semibold text-gray-900">Daniel</span>
                        <span className="text-xs text-gray-400">· Säljare</span>
                      </div>
                      <p className="text-sm text-amber-800 mb-3">{quoteIntelligence.analysis.message}</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            // TODO: Justera pris-logik
                            setQuoteIntelligence(null)
                          }}
                          className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-xs font-medium hover:bg-amber-700"
                        >
                          Justera till {new Intl.NumberFormat('sv-SE').format(quoteIntelligence.analysis.suggested_price)} kr
                        </button>
                        <button
                          onClick={() => setQuoteIntelligence(null)}
                          className="px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-100"
                        >
                          Skicka ändå
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Från */}
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Från</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{business?.business_name}</p>
                  <p className="text-xs text-gray-400">offert@handymate.se · Svar till {business?.contact_email}</p>
                </div>
              </div>

              {/* Leveransmetod */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">Via</span>
                <div className="flex gap-1.5">
                  {['sms', 'email', 'both'].map(m => (
                    <button key={m} onClick={() => setSendMethod(m as any)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                        sendMethod === m ? 'bg-primary-50 border-primary-300 text-primary-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}>
                      {m === 'sms' ? 'SMS' : m === 'email' ? 'Email' : 'Båda'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Till */}
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Till</span>
                <div className="flex-1 space-y-1.5">
                  {(sendMethod === 'sms' || sendMethod === 'both') && (
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-700">{quote.customer?.phone_number || <span className="text-red-500">Telefonnummer saknas</span>}</span>
                    </div>
                  )}
                  {(sendMethod === 'email' || sendMethod === 'both') && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-gray-400" />
                      <span className="text-sm text-gray-700">{quote.customer?.email || <span className="text-red-500">Email saknas</span>}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Extra mottagare (email) */}
              {(sendMethod === 'email' || sendMethod === 'both') && (
                <>
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Kopia</span>
                    <input type="text" value={extraEmails} onChange={e => setExtraEmails(e.target.value)}
                      placeholder="anna@firma.se" className="flex-1 px-3 py-1.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-primary-500 bg-gray-50" />
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">BCC</span>
                    <input type="text" value={bccEmails} onChange={e => setBccEmails(e.target.value)}
                      placeholder="chef@firma.se" className="flex-1 px-3 py-1.5 text-sm border border-[#E2E8F0] rounded-lg focus:outline-none focus:border-primary-500 bg-gray-50" />
                  </div>
                </>
              )}

              {/* Ämne (email) */}
              {(sendMethod === 'email' || sendMethod === 'both') && (
                <div className="flex items-start gap-3">
                  <span className="text-xs text-gray-400 w-16 pt-2 text-right flex-shrink-0">Ämne</span>
                  <p className="flex-1 text-sm text-gray-700 pt-1.5">Offert från {business?.business_name}: {quote.title || 'Offert'}</p>
                </div>
              )}

              {/* Bifogat */}
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0"></span>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-[#E2E8F0] rounded-lg">
                  <FileText className="w-4 h-4 text-primary-700" />
                  <span className="text-xs text-gray-600">Offert {quote.quote_number || ''} · {quote.total ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(quote.total) + ' kr' : ''}</span>
                </div>
              </div>

              {/* Validering */}
              {sendMethod !== 'sms' && !quote.customer?.email && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-xs text-red-600">Kunden saknar e-postadress. Lägg till den i kundkortet först.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl">
              <button onClick={() => !sending && setShowSendModal(false)} className="text-sm text-gray-500 hover:text-gray-700">Avbryt</button>
              <button
                onClick={sendQuote}
                disabled={sending || (sendMethod !== 'sms' && !quote.customer?.email)}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-700 rounded-xl text-white font-medium text-sm hover:opacity-90 disabled:opacity-40 transition-all"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                {sending ? 'Skickar...' : 'Skicka offert'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save as Template Modal */}
      {showSaveTemplate && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSaveTemplate(false)}>
          <div className="bg-white border border-[#E2E8F0] rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Spara som mall</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">Mallnamn</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="T.ex. Byte elcentral"
                autoFocus
                className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="flex-1 px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 px-4 py-2 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
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
