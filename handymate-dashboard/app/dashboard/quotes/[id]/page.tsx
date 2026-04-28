'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { QuoteHeader } from './components/QuoteHeader'
import { QuoteCustomerCard } from './components/QuoteCustomerCard'
import { QuoteDescriptionCard } from './components/QuoteDescriptionCard'
import { QuoteSpecificationTable } from './components/QuoteSpecificationTable'
import { QuoteSummaryCard } from './components/QuoteSummaryCard'
import { QuoteSignatureCard } from './components/QuoteSignatureCard'
import { QuoteStatusTimeline } from './components/QuoteStatusTimeline'
import { QuoteSendModal } from './components/QuoteSendModal'
import type { Quote, QuoteVersion, QuoteIntelligence } from './types'

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
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  })
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [creatingProject, setCreatingProject] = useState(false)
  const [generatingSignLink, setGeneratingSignLink] = useState(false)
  const [portalUrl, setPortalUrl] = useState<string | null>(null)
  const [extraEmails, setExtraEmails] = useState('')
  const [bccEmails, setBccEmails] = useState('')
  const [showSaveTemplate, setShowSaveTemplate] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [quoteIntelligence, setQuoteIntelligence] = useState<QuoteIntelligence | null>(null)
  const [versions, setVersions] = useState<QuoteVersion[]>([])
  const [creatingVersion, setCreatingVersion] = useState(false)

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

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
        }),
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId])

  async function fetchQuote() {
    try {
      const res = await fetch(`/api/quotes?quoteId=${quoteId}`)
      if (res.ok) {
        const data = await res.json()
        setQuote(data.quote || null)
        setVersions(data.versions || [])
        if (data.quote?.sign_token && data.quote?.customer_id) {
          fetch('/api/quotes/sign-link', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quoteId: data.quote.quote_id }),
          })
            .then(r => (r.ok ? r.json() : null))
            .then(d => {
              if (d?.url) setPortalUrl(d.url)
            })
            .catch(() => {})
        }
      }
    } catch (err) {
      console.error('Failed to fetch quote:', err)
    }
    setLoading(false)
  }

  const generatePDF = async () => {
    if (!quote) return
    setGeneratingPdf(true)

    try {
      const response = await fetch('/api/quotes/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.quote_id }),
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
    } catch {
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
        }),
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
    } catch {
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
        body: JSON.stringify({ duplicate_from: quote.quote_id }),
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
        }),
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

  const previewPDF = async () => {
    if (!quote) return
    setGeneratingPdf(true)
    try {
      const response = await fetch('/api/quotes/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quoteId: quote.quote_id }),
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
        }),
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
          name: quote.title || `Projekt från offert`,
        }),
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

  const onCopySignLink = () => {
    if (!quote?.sign_token) return
    navigator.clipboard.writeText(portalUrl || `https://app.handymate.se/quote/${quote.sign_token}`)
    showToast('Kopierad!', 'success')
  }

  const onOpenSendModal = () => {
    setShowSendModal(true)
    if (quote) {
      fetch(`/api/quotes/intelligence?quoteId=${quote.quote_id}`)
        .then(r => r.json())
        .then(data => setQuoteIntelligence(data))
        .catch(() => {})
    }
  }

  const onSaveTemplateClick = () => {
    setTemplateName(quote?.title || '')
    setShowSaveTemplate(true)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-slate-500">Offerten hittades inte</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-8">
      {toast.show && (
        <div
          className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-50 border-green-200 text-green-700'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="relative max-w-5xl mx-auto">
        <QuoteHeader
          quote={quote}
          quoteId={quoteId}
          versions={versions}
          portalUrl={portalUrl}
          generatingPdf={generatingPdf}
          generatingSignLink={generatingSignLink}
          duplicating={duplicating}
          creatingVersion={creatingVersion}
          creatingProject={creatingProject}
          creatingInvoice={creatingInvoice}
          onOpenSendModal={onOpenSendModal}
          onPreviewPDF={previewPDF}
          onGeneratePDF={generatePDF}
          onGenerateSignLink={generateSignLink}
          onCreateProject={createProjectFromQuote}
          onCreateInvoice={createInvoiceFromQuote}
          onDuplicate={duplicateQuote}
          onCreateNewVersion={createNewVersion}
          onSaveTemplate={onSaveTemplateClick}
          onDelete={deleteQuote}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            <QuoteCustomerCard quote={quote} />
            <QuoteDescriptionCard quote={quote} />
            <QuoteSpecificationTable quote={quote} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <QuoteSummaryCard quote={quote} />
            <QuoteSignatureCard quote={quote} portalUrl={portalUrl} onCopySignLink={onCopySignLink} />
            <QuoteStatusTimeline quote={quote} />
          </div>
        </div>
      </div>

      <QuoteSendModal
        show={showSendModal}
        quote={quote}
        business={business}
        sending={sending}
        sendMethod={sendMethod}
        setSendMethod={setSendMethod}
        extraEmails={extraEmails}
        setExtraEmails={setExtraEmails}
        bccEmails={bccEmails}
        setBccEmails={setBccEmails}
        quoteIntelligence={quoteIntelligence}
        setQuoteIntelligence={setQuoteIntelligence}
        onClose={() => setShowSendModal(false)}
        onSend={sendQuote}
      />

      {/* Save as Template Modal */}
      {showSaveTemplate && (
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSaveTemplate(false)}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="font-heading text-lg font-bold text-slate-900 mb-4 tracking-tight">Spara som mall</h3>
            <div className="mb-5">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Mallnamn</label>
              <input
                type="text"
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="T.ex. Byte elcentral"
                autoFocus
                className="w-full px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveTemplate(false)}
                className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 rounded-xl text-slate-700 text-sm font-semibold transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 px-4 py-2.5 bg-primary-700 hover:bg-primary-600 disabled:opacity-50 rounded-xl text-white text-sm font-semibold transition-colors"
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
