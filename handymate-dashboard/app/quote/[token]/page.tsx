'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { DECLINE_REASONS as DECLINE_REASON_OPTIONS } from '@/lib/quotes/decline-reasons'
import {
  Loader2,
  Check,
  CheckCircle,
  AlertTriangle,
  Zap,
  FileText,
  Eraser,
  PenTool,
  Calendar,
  User,
  Package,
  XCircle,
  Clock,
} from 'lucide-react'
import {
  calculatePublicQuoteTotals,
  calculatePublicQuoteTotalsFromBase,
  type PublicStructuredItem,
} from '@/lib/quote-calculations'
import { applyLiveSelectionToTemplateData } from '@/lib/quotes/public-document'
import { PublicQuoteDocument } from './components/PublicQuoteDocument'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface BusinessInfo {
  name: string
  contact_name: string
  email: string
  phone: string
  org_number: string
  f_skatt: boolean
  logo_url?: string | null
  accent_color?: string | null
}

interface QuoteData {
  quote_id: string
  title?: string
  description?: string
  structured_items?: PublicStructuredItem[]
  /** Bas-totaler (icke-tillvalsrader) — endast satt när à-priserna strippats
      ur svaret (summary/rows-nivå med tillval). */
  base_totals?: ReturnType<typeof calculatePublicQuoteTotals>
  labor_total: number
  material_total: number
  subtotal: number
  discount_amount?: number
  discount_percent?: number
  vat_amount?: number
  vat_rate?: number
  total: number
  rot_rut_type?: 'rot' | 'rut' | null
  rot_rut_deduction?: number
  customer_pays?: number
  personnummer?: string
  fastighetsbeteckning?: string
  valid_until?: string
  status: string
  signed_at?: string
  signed_by_name?: string
  attachments?: Array<{ name: string; url: string; size?: number }>
  customer?: {
    name: string
    phone_number?: string
    email?: string
    address_line?: string
  }
  /** ETAPP 5 (offert-masterplan.md): dokumentet ÄR gränssnittet — samma
      templateData/HTML som PDF:en/"Visa offert" bygger på. Se
      app/api/quotes/public/[token]/route.ts. */
  template_data?: QuoteTemplateData | null
  template_style?: 'modern' | 'premium' | 'friendly'
  document_html?: string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatSEK = (amount: number) =>
  new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)

// Taxonomin ägs av lib/quotes/decline-reasons.ts så kundvyn, portalen och
// förlustanalysen räknar på exakt samma kategorier. Den lokala listan hade
// bland annat 'no_longer_needed', som analysen inte kände igen — de svaren
// hamnade i "skäl saknas". 'not_now' ersätter den och är dessutom mer värd:
// en uppskjuten affär är en återaktiveringskandidat, inte en förlust.
const DECLINE_REASONS = DECLINE_REASON_OPTIONS.map(r => ({ value: r.code, label: r.label }))

// ── Component ──────────────────────────────────────────────────────────────────

type PageState =
  | 'loading'
  | 'error'
  | 'already_signed'
  | 'already_declined'
  | 'viewing'
  | 'success'
  | 'declined'

export default function QuoteSignPage() {
  const params = useParams()
  const token = params?.token as string

  const [state, setState] = useState<PageState>('loading')
  const [quote, setQuote] = useState<QuoteData | null>(null)
  // Referensfoton från hantverkarens egna avslutade jobb (idé 6).
  const [referencePhotos, setReferencePhotos] = useState<
    { heading: string; isSimilar: boolean; photos: { url: string; caption: string | null }[] } | null
  >(null)
  // Kundens fråga om offerten (idé 5) — landar som kort i godkännande-kön.
  const [questionText, setQuestionText] = useState('')
  const [questionState, setQuestionState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [name, setName] = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showDeclineForm, setShowDeclineForm] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  // Kundens tillvalsval (id:n för ikryssade option-rader). Endast visning —
  // servern validerar id:na och räknar om totalen själv vid signering.
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())

  // Canvas refs and drawing state
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const isDrawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)

  // ── Fetch quote on mount ───────────────────────────────────────────────────

  useEffect(() => {
    async function fetchQuote() {
      try {
        const res = await fetch(`/api/quotes/public/${token}`)
        const data = await res.json()

        if (!res.ok) {
          setErrorMessage(data.error || 'Kunde inte hämta offerten')
          setState('error')
          return
        }

        const { quote: quoteData, business: businessData, alreadySigned } = data
        setReferencePhotos(data.reference_photos || null)

        // Redirect till kundportalen om kunden har portal_token — all offerthantering sker där
        if (quoteData?.customer?.portal_token) {
          window.location.replace(`/portal/${quoteData.customer.portal_token}?tab=quotes`)
          return
        }

        setQuote(quoteData)
        setBusiness(businessData)

        // Initiera tillvalsvalen från lagrat option_selected (Förvald-toggle
        // vid skapande, kundens val efter signering).
        const optionIds = ((quoteData.structured_items || []) as PublicStructuredItem[])
          .filter((i) => i.item_type === 'option' && i.option_selected === true)
          .map((i) => i.id)
        setSelectedOptions(new Set(optionIds))

        if (quoteData.customer?.name) {
          setName(quoteData.customer.name)
        }

        if (alreadySigned) {
          setState('already_signed')
        } else if (quoteData.status === 'declined') {
          setState('already_declined')
        } else if (quoteData.valid_until) {
          const diff = Math.ceil(
            (new Date(quoteData.valid_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
          if (diff < 0) {
            setErrorMessage('Offerten har gått ut och kan inte längre signeras.')
            setState('error')
          } else {
            setDaysLeft(diff)
            setState('viewing')
          }
        } else {
          setState('viewing')
        }
      } catch {
        setErrorMessage('Kunde inte hämta offerten. Försök igen senare.')
        setState('error')
      }
    }

    fetchQuote()
  }, [token])

  // ── View tracking ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!quote || state !== 'viewing') return

    const sessionId = new URLSearchParams(window.location.search).get('s') || crypto.randomUUID()
    const startTime = Date.now()

    // Logga "opened"
    fetch(`/api/quotes/track?q=${quote.quote_id}&e=opened&s=${sessionId}`).catch(() => {})

    // Logga tid vid stängning
    const handleUnload = () => {
      const duration = Math.floor((Date.now() - startTime) / 1000)
      if (duration > 0) {
        navigator.sendBeacon(
          '/api/quotes/track',
          JSON.stringify({
            quoteId: quote.quote_id,
            event: 'closed',
            sessionId,
            duration,
          })
        )
      }
    }

    window.addEventListener('beforeunload', handleUnload)
    return () => window.removeEventListener('beforeunload', handleUnload)
  }, [quote, state])

  // ── Canvas setup ───────────────────────────────────────────────────────────

  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.scale(dpr, dpr)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#1e293b'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => {
    if (state === 'viewing') {
      const timer = setTimeout(initCanvas, 50)
      return () => clearTimeout(timer)
    }
  }, [state, initCanvas])

  useEffect(() => {
    if (state !== 'viewing') return

    const handleResize = () => {
      initCanvas()
      setHasDrawn(false)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [state, initCanvas])

  // ── Canvas drawing helpers ─────────────────────────────────────────────────

  function getCanvasPoint(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number

    if ('touches' in e) {
      if (e.touches.length === 0) return null
      clientX = e.touches[0].clientX
      clientY = e.touches[0].clientY
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }

    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    isDrawingRef.current = true
    const point = getCanvasPoint(e)
    if (point) lastPointRef.current = point
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    if (!isDrawingRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!ctx || !canvas) return

    const point = getCanvasPoint(e)
    if (!point || !lastPointRef.current) return

    ctx.beginPath()
    ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y)
    ctx.lineTo(point.x, point.y)
    ctx.stroke()

    lastPointRef.current = point
    setHasDrawn(true)
  }

  function stopDrawing() {
    isDrawingRef.current = false
    lastPointRef.current = null
  }

  function clearCanvas() {
    initCanvas()
    setHasDrawn(false)
  }

  // ── Tillval ────────────────────────────────────────────────────────────────

  function toggleOption(id: string) {
    setSelectedOptions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Submit signature ───────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!name.trim() || !hasDrawn || !termsAccepted || submitting) return

    const canvas = canvasRef.current
    if (!canvas) return

    setSubmitting(true)
    setErrorMessage('')

    try {
      const signatureData = canvas.toDataURL('image/png')

      const res = await fetch(`/api/quotes/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: name.trim(),
          signature_data: signatureData,
          selected_option_ids: Array.from(selectedOptions),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Kunde inte spara signaturen')
      } else {
        // ETAPP 5 (offert-masterplan.md), punkt 4: dokumentet (visas kvar på
        // 'success'-skärmen) ska speglas som signerat direkt, utan att vänta
        // på en ny GET-runda — servern är fortfarande den auktoritativa
        // sanningen (redan skriven ovan), detta är bara den lokala vyn.
        const signedDate = new Date().toLocaleDateString('sv-SE', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
        setQuote((prev) =>
          prev
            ? {
                ...prev,
                status: 'accepted',
                signed_at: new Date().toISOString(),
                signed_by_name: name.trim(),
                template_data: prev.template_data
                  ? { ...prev.template_data, isSigned: true, signatureCta: 'signed', signedDate }
                  : prev.template_data,
              }
            : prev
        )
        setState('success')
      }
    } catch {
      setErrorMessage('Något gick fel. Försök igen.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Kundens fråga (idé 5) ──────────────────────────────────────────────────
  // En kund som undrar något hör oftast inte av sig alls — hen tackar nej i
  // tysthet. Frågan landar direkt i hantverkarens godkännande-kö.

  async function handleAskQuestion() {
    const text = questionText.trim()
    if (!text || questionState === 'sending') return

    setQuestionState('sending')
    try {
      const res = await fetch(`/api/quotes/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'question', question: text }),
      })
      if (res.ok) {
        setQuestionState('sent')
        setQuestionText('')
      } else {
        setQuestionState('error')
      }
    } catch {
      setQuestionState('error')
    }
  }

  // ── Submit decline ─────────────────────────────────────────────────────────

  async function handleDecline() {
    if (!declineReason || submitting) return

    setSubmitting(true)
    setErrorMessage('')

    try {
      const res = await fetch(`/api/quotes/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // reason_code är det som gör förlusten räknebar; reason lämnas kvar
        // för bakåtkompatibilitet med äldre klienter.
        body: JSON.stringify({ action: 'decline', reason_code: declineReason, reason: declineReason }),
      })

      if (res.ok) {
        setState('declined')
      } else {
        const data = await res.json()
        setErrorMessage(data.error || 'Kunde inte registrera avböjandet')
        setShowDeclineForm(false)
      }
    } catch {
      setErrorMessage('Något gick fel. Försök igen.')
      setShowDeclineForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Shared centered layout (loading/error/enkla bekräftelser) ─────────────

  function CenteredLayout({ children }: { children: React.ReactNode }) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
        </div>
        <div className="relative w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-600/10">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Handymate</h1>
          </div>
          {children}
        </div>
      </div>
    )
  }

  // ── Render: Loading ────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-primary-700 animate-spin" />
          <p className="text-gray-500 text-sm">Laddar offert...</p>
        </div>
      </div>
    )
  }

  // ── Render: Error ──────────────────────────────────────────────────────────

  if (state === 'error') {
    return (
      <CenteredLayout>
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Offerten kunde inte visas</h2>
          <p className="text-gray-500 mb-6">{errorMessage}</p>
          <a
            href="/"
            className="inline-block px-6 py-3 text-sm font-medium text-primary-700 hover:text-primary-700 transition-colors"
          >
            Tillbaka till startsidan
          </a>
        </div>
      </CenteredLayout>
    )
  }

  // ── Render: Already declined ───────────────────────────────────────────────

  if (state === 'already_declined') {
    return (
      <CenteredLayout>
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-gray-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Offerten har avböjts</h2>
          <p className="text-gray-500 text-sm">Denna offert har redan avböjts.</p>
        </div>
      </CenteredLayout>
    )
  }

  // ── Render: Declined (just now) ────────────────────────────────────────────

  if (state === 'declined') {
    return (
      <CenteredLayout>
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-gray-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Offerten har avböjts</h2>
          <p className="text-gray-500 text-sm">
            Vi har registrerat att du avböjer offerten.{' '}
            {business?.name || 'Företaget'} kommer att informeras.
          </p>
        </div>
      </CenteredLayout>
    )
  }

  // ── Gemensamt: 'viewing' / 'already_signed' / 'success' ────────────────────
  // Alla tre visar SAMMA dokument (mallmotorn) — ETAPP 5, "dokumentet ÄR
  // gränssnittet". 'viewing' lägger till det interaktiva lagret (tillval,
  // signaturkort, avböj); de andra två är read-only bekräftelser.

  if (!quote) return null

  const structuredItems = quote.structured_items || []
  const templateStyle = quote.template_style || 'modern'
  const canSubmit = !!(name.trim() && hasDrawn && termsAccepted && !submitting)

  // ── Tillval: live-total på klienten via SAMMA motor som servern ────────────
  // Endast visning — servern räknar alltid om själv vid signering.
  // Låst läge (signerad offert): visa lagrat option_selected, ingen toggling.
  const optionsLocked = !!quote.signed_at
  const optionRows = structuredItems.filter((i) => i.item_type === 'option')
  const hasOptionRows = optionRows.length > 0
  const liveTotals = !hasOptionRows
    ? null
    : quote.base_totals
      ? calculatePublicQuoteTotalsFromBase(
          quote.base_totals,
          structuredItems,
          selectedOptions,
          quote.discount_percent ?? 0,
          quote.vat_rate ?? 25
        )
      : calculatePublicQuoteTotals(
          structuredItems,
          selectedOptions,
          quote.discount_percent ?? 0,
          quote.vat_rate ?? 25
        )
  const dispTotal = liveTotals ? liveTotals.total : quote.total
  const dispRotRutDeduction = liveTotals
    ? liveTotals.rotDeduction + liveTotals.rutDeduction
    : quote.rot_rut_deduction || 0
  const dispCustomerPays = liveTotals
    ? liveTotals.customerPaysAfterDeductions
    : quote.customer_pays ?? quote.total - (quote.rot_rut_deduction || 0)

  // ETAPP 5, punkt 3: kundens tillvalsval uppdaterar HELA Modern-dokumentet
  // (rader + summering) live — Premium/Friendly (iframe mot serverns
  // färdig-renderade HTML) förblir statiska tills E2a:s motor täcker fler
  // stilar, se PublicQuoteDocument-kommentaren och not-texten i tillvalskortet.
  const liveTemplateData =
    quote.template_data && liveTotals
      ? applyLiveSelectionToTemplateData(quote.template_data, selectedOptions, liveTotals)
      : quote.template_data ?? null

  // ROT-boxen: dokumentet visar redan avdragsbeloppet + personnummer i sin
  // egen summering/mottagarblock (se QuoteDocument.tsx / premium.ts/
  // friendly.ts) — bara fastighetsbeteckning saknas där, så den separata
  // boxen visas bara när den faktiskt tillför information.
  const showRotBox = !!quote.rot_rut_type && dispRotRutDeduction > 0 && !!quote.fastighetsbeteckning

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg overflow-hidden text-white font-bold text-2xl"
            style={{ background: business?.accent_color || '#0F766E' }}
          >
            {business?.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={business.logo_url}
                alt={business.name}
                className="w-full h-full object-contain bg-white"
                onError={(e) => {
                  const parent = e.currentTarget.parentElement
                  if (parent) {
                    parent.textContent = (business.name || 'H').charAt(0).toUpperCase()
                  }
                }}
              />
            ) : business?.name ? (
              <span>{business.name.charAt(0).toUpperCase()}</span>
            ) : (
              <Zap className="w-8 h-8 text-white" />
            )}
          </div>
          <h1 className="text-3xl font-bold">
            <span className="text-primary-700">{business?.name || 'Offert'}</span>
          </h1>
          <p className="text-gray-500 mt-1 text-sm">
            {state === 'success'
              ? 'Offerten är godkänd'
              : state === 'already_signed'
                ? 'Offerten är signerad'
                : 'Offert'}
          </p>
        </div>

        {/* Confirmation banner (success / already signed) */}
        {(state === 'success' || state === 'already_signed') && (
          <div className="mb-6 p-5 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 rounded-xl flex items-center justify-center shrink-0">
              <CheckCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {state === 'success' ? 'Tack! Din signatur har sparats.' : 'Offerten är redan signerad.'}
              </p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {quote.signed_by_name && `Signerad av ${quote.signed_by_name}. `}
                {business?.name || 'Företaget'} kommer att kontakta dig med nästa steg.
              </p>
            </div>
          </div>
        )}

        {/* Validity countdown banner */}
        {state === 'viewing' && daysLeft !== null && daysLeft <= 7 && (
          <div
            className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm font-medium ${
              daysLeft <= 2
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-amber-50 border border-amber-200 text-amber-700'
            }`}
          >
            <Clock className="w-4 h-4 shrink-0" />
            {daysLeft === 0
              ? 'Sista dagen att signera!'
              : `Offerten går ut om ${daysLeft} dag${daysLeft === 1 ? '' : 'ar'}`}
          </div>
        )}

        {/* Dokumentet — ETAPP 5: samma mall hantverkaren valde (Modern/Premium/
            Friendly), inte en egen tolkning. */}
        <div className="mb-6">
          <PublicQuoteDocument
            style={templateStyle}
            templateData={liveTemplateData}
            documentHtml={quote.document_html ?? null}
          />
        </div>

        {state === 'viewing' && (
          <>
            {/* Anpassa din offert — tillval */}
            {hasOptionRows && (
              <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">Anpassa din offert</h3>
                    <p className="text-gray-400 text-xs">
                      {optionsLocked
                        ? 'Dina valda tillval'
                        : templateStyle === 'modern'
                          ? 'Kryssa i det du vill ha med — dokumentet ovan uppdateras direkt'
                          : 'Kryssa i det du vill ha med — summan nedan uppdateras direkt'}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mb-5">
                  {optionRows.map((item) => {
                    const selected = optionsLocked
                      ? item.option_selected === true
                      : selectedOptions.has(item.id)
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={optionsLocked}
                        onClick={() => toggleOption(item.id)}
                        aria-pressed={selected}
                        className={`w-full text-left px-4 py-3 rounded-xl border flex justify-between gap-4 text-sm transition-colors ${
                          selected ? 'border-primary-200 bg-primary-50/40' : 'border-gray-200 bg-gray-50'
                        } ${optionsLocked ? 'cursor-default' : 'cursor-pointer hover:bg-primary-50/60 active:bg-primary-50/80'}`}
                      >
                        <div className="min-w-0 flex items-start gap-3">
                          <span
                            className={`mt-0.5 shrink-0 rounded border flex items-center justify-center ${
                              selected ? 'bg-primary-700 border-primary-700' : 'bg-white border-gray-300'
                            }`}
                            style={{ width: 18, height: 18 }}
                          >
                            {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                          </span>
                          <div>
                            <p className={selected ? 'text-gray-900' : 'text-gray-500'}>{item.description}</p>
                            {!optionsLocked && (
                              <p className="text-[11px] text-primary-700/70 mt-0.5">
                                {selected ? 'Tryck för att välja bort' : 'Tryck för att lägga till'}
                              </p>
                            )}
                          </div>
                        </div>
                        <span className={`font-medium shrink-0 ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
                          {selected ? '' : '+'}
                          {formatSEK(item.total || 0)}
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex justify-between items-center pt-4 border-t border-gray-200">
                  <span className="text-sm font-medium text-gray-500">
                    {dispRotRutDeduction > 0 ? 'Du betalar (efter avdrag)' : 'Du betalar'}
                  </span>
                  <span className="text-lg font-bold text-gray-900">{formatSEK(dispCustomerPays || dispTotal)}</span>
                </div>

                {templateStyle !== 'modern' && !optionsLocked && (
                  <p className="mt-3 text-xs text-gray-400 leading-relaxed">
                    Dokumentet ovan uppdateras inte automatiskt när du kryssar i tillval — den slutgiltiga
                    sammanställningen ser du här, och den riktiga totalen räknas alltid om vid signering.
                  </p>
                )}
              </div>
            )}

            {/* ROT/RUT — endast när dokumentet inte redan täcker informationen */}
            {showRotBox && (
              <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
                <h4 className="text-sm font-semibold text-emerald-600 uppercase tracking-wider mb-3">
                  {quote.rot_rut_type === 'rot' ? 'ROT-avdrag' : 'RUT-avdrag'}
                </h4>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">Fastighetsbeteckning</span>
                  <span className="text-gray-500">{quote.fastighetsbeteckning}</span>
                </div>
              </div>
            )}

            {/* Attachments */}
            {quote.attachments && quote.attachments.length > 0 && (
              <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Bifogade dokument</h3>
                <div className="space-y-2">
                  {quote.attachments.map((att, i) => (
                    <a
                      key={i}
                      href={att.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                    >
                      <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-primary-700" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-gray-900 truncate">{att.name}</p>
                        {att.size && <p className="text-xs text-gray-400">{(att.size / 1024).toFixed(0)} KB</p>}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Signature Card — ankarpunkt för dokumentets "Godkänn offerten
                digitalt"-yta (SignatureCta.tsx, id="signature-card"). */}
            <div id="signature-card" className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-4 scroll-mt-4">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center">
                  <PenTool className="w-5 h-5 text-primary-700" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Signera offerten</h3>
                  <p className="text-gray-400 text-xs">Skriv ditt namn och rita din signatur nedan</p>
                </div>
              </div>

              {/* Name input */}
              <div className="mb-5">
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <User className="w-4 h-4" />
                  Namn
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ditt fullständiga namn"
                  required
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/50 transition-all"
                />
              </div>

              {/* Signature canvas */}
              <div className="mb-3">
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <PenTool className="w-4 h-4" />
                  Signatur
                </label>
                <div className="relative">
                  <canvas
                    ref={canvasRef}
                    className="w-full bg-gray-100 border border-gray-300 rounded-xl cursor-crosshair touch-none"
                    style={{ height: '150px' }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    onTouchCancel={stopDrawing}
                  />
                  {!hasDrawn && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <p className="text-gray-400 text-sm">Rita din signatur här</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Clear button */}
              <div className="flex justify-end mb-5">
                <button
                  type="button"
                  onClick={clearCanvas}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg transition-all"
                >
                  <Eraser className="w-4 h-4" />
                  Rensa
                </button>
              </div>

              {/* Terms checkbox */}
              <label className="flex items-start gap-3 mb-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-primary-700"
                />
                <span className="text-sm text-gray-500 leading-relaxed">
                  Jag har läst och godkänner offerten och förstår att min digitala signatur är bindande.
                </span>
              </label>

              {/* Error message */}
              {errorMessage && (
                <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 text-sm mb-4">
                  {errorMessage}
                </div>
              )}

              {/* Submit button */}
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="w-full py-4 bg-primary-700 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting && !showDeclineForm ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signerar...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Godkänn offert
                  </>
                )}
              </button>

              {/* PDF download */}
              <a
                href={`/api/quotes/pdf?token=${token}&format=pdf`}
                download
                className="w-full py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2 mt-3"
              >
                <FileText className="w-4 h-4" />
                Ladda ner offert som PDF
              </a>

              {/* Validation hint */}
              {!canSubmit && !submitting && (
                <p className="mt-3 text-center text-gray-400 text-xs">
                  {!name.trim()
                    ? 'Fyll i ditt namn'
                    : !hasDrawn
                      ? 'Rita din signatur'
                      : 'Bekräfta att du godkänner villkoren'}{' '}
                  för att fortsätta
                </p>
              )}
            </div>

            {/* Referensfoton (idé 6) — bevis utan arbete. Kunden jämför
                två-tre offerter; vår är den enda som visar hur det blev. */}
            {referencePhotos && referencePhotos.photos.length > 0 && (
              <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 mb-8">
                <h3 className="text-base font-semibold text-gray-900 mb-1">{referencePhotos.heading}</h3>
                <p className="text-gray-400 text-xs mb-4">Foton från våra egna avslutade projekt</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {referencePhotos.photos.map((p, i) => (
                    <figure key={i} className="min-w-0">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.url}
                        alt={p.caption || 'Foto från ett tidigare jobb'}
                        loading="lazy"
                        className="w-full h-40 object-cover rounded-xl border border-gray-100 bg-gray-50"
                      />
                      {p.caption && (
                        <figcaption className="mt-1.5 text-xs text-gray-500">{p.caption}</figcaption>
                      )}
                    </figure>
                  ))}
                </div>
              </div>
            )}

            {/* Kundens fråga (idé 5) — offerten blir en kanal, inte ett
                dokument. Frågan landar direkt i hantverkarens kö. */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 mb-8">
              <h3 className="text-base font-semibold text-gray-900 mb-1">Undrar du något?</h3>
              <p className="text-gray-400 text-xs mb-4">
                Skriv din fråga här så återkommer vi — du behöver inte bestämma dig nu.
              </p>

              {questionState === 'sent' ? (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
                  <CheckCircle className="w-5 h-5 text-gray-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-gray-700">
                    Tack — din fråga är skickad. Vi hör av oss så snart vi kan.
                  </p>
                </div>
              ) : (
                <>
                  <textarea
                    value={questionText}
                    onChange={(e) => setQuestionText(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Till exempel: vad ingår i rivningen?"
                    className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
                  />
                  {questionState === 'error' && (
                    <p className="mt-2 text-xs text-red-600">
                      Frågan kunde inte skickas. Försök igen.
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={handleAskQuestion}
                    disabled={!questionText.trim() || questionState === 'sending'}
                    className="mt-3 min-h-[44px] px-5 bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    {questionState === 'sending' ? 'Skickar…' : 'Skicka fråga'}
                  </button>
                </>
              )}
            </div>

            {/* Decline section */}
            {!showDeclineForm ? (
              <div className="text-center mb-8">
                <button
                  type="button"
                  onClick={() => setShowDeclineForm(true)}
                  className="text-sm text-gray-400 hover:text-gray-600 underline underline-offset-2 transition-colors"
                >
                  Vill du avböja offerten?
                </button>
              </div>
            ) : (
              <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 mb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <XCircle className="w-5 h-5 text-gray-400" />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">Avböj offerten</h3>
                    <p className="text-gray-400 text-xs">Hjälp oss förstå varför</p>
                  </div>
                </div>

                <div className="space-y-2 mb-5">
                  {DECLINE_REASONS.map((r) => (
                    <label
                      key={r.value}
                      className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <input
                        type="radio"
                        name="decline_reason"
                        value={r.value}
                        checked={declineReason === r.value}
                        onChange={() => setDeclineReason(r.value)}
                        className="h-4 w-4 accent-gray-600"
                      />
                      <span className="text-sm text-gray-700">{r.label}</span>
                    </label>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeclineForm(false)
                      setDeclineReason('')
                    }}
                    className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium text-gray-700 transition-colors"
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    onClick={handleDecline}
                    disabled={!declineReason || submitting}
                    className="flex-1 py-3 bg-gray-800 hover:bg-gray-900 rounded-xl text-sm font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Skickar...
                      </>
                    ) : (
                      'Bekräfta avböjande'
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {(state === 'success' || state === 'already_signed') && (
          <div className="text-center mb-8">
            <a
              href={`/api/quotes/pdf?token=${token}&format=pdf`}
              download
              className="inline-flex items-center gap-2 px-5 py-3 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-white transition-colors bg-white/60"
            >
              <FileText className="w-4 h-4" />
              Ladda ner offert som PDF
            </a>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-8">
          Drivs av{' '}
          <span className="text-primary-700 font-medium">Handymate</span>
        </p>
      </div>
    </div>
  )
}
