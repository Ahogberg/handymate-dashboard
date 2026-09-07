'use client'

// Kundens offertsida — omdesignad 2026-09-07 efter Claude Design-utforskningen
// ("Kundens offert", varianterna 1a/1d/1e), med sanningsjusteringarna:
//  - "Du betalar" (efter preliminärt ROT) som huvudsiffra, totalen alltid synlig
//  - Signering = namn + kryss (ingen ritad signatur; servern kräver namn,
//    portalens signeringsmodal ritar fortfarande och är orörd)
//  - ROT-uppgiftssteget visas BARA när avdrag finns och uppgifter saknas
//    (quote.rot_uppgifter_saknas — en flagga; själva uppgifterna släpps
//    aldrig i den publika payloaden, se quote-public-dto-facitet)
//  - Bekräftelsen: godkänd-kort + "Vad händer nu" + starttidsförslagen
//    (booking_suggestions kommer från den riktiga kapacitetsmotorn)
//  - Ingen "kopia är på väg till din mejl"-rad — inget sådant mejl skickas
// Bevarat oförändrat: portal-redirect, öppningsspårningen (facit-låst),
// tillvalskortet med live-total, kundens fråga, referensfoton, avböj-flödet,
// dokumentmotorn (PublicQuoteDocument) och attributionsstämpeln.

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { DECLINE_REASONS as DECLINE_REASON_OPTIONS } from '@/lib/quotes/decline-reasons'
import {
  Loader2,
  Check,
  CheckCircle,
  AlertTriangle,
  Zap,
  FileText,
  Calendar,
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
import type { Attribution } from '@/lib/branding/attribution'
import AttributionStamp from '@/components/branding/AttributionStamp'

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
  /** Flagga ur DTO:n — uppgifterna själva exponeras aldrig publikt. */
  rot_uppgifter_saknas?: boolean
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
// förlustanalysen räknar på exakt samma kategorier.
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
  // Föreslagna starttider efter signering (idé 4).
  const [bookingSuggestions, setBookingSuggestions] = useState<
    { date: string; week: number; bookableHours: number }[]
  >([])
  const [bookingState, setBookingState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')

  async function handleRequestBooking(date: string) {
    if (bookingState === 'sending') return
    setBookingState('sending')
    try {
      const res = await fetch(`/api/quotes/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request_booking', date }),
      })
      setBookingState(res.ok ? 'sent' : 'error')
    } catch {
      setBookingState('error')
    }
  }
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  // "Skickat via Handymate"-stämpeln i sidfoten — ur samma svar som offerten.
  const [attribution, setAttribution] = useState<Attribution | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [name, setName] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)
  // ROT-uppgifterna (1e): valfria, skickas med i signeringen när ifyllda.
  const [rotPnr, setRotPnr] = useState('')
  const [rotFastighet, setRotFastighet] = useState('')
  const [rotBoende, setRotBoende] = useState<'smahus' | 'bostadsratt'>('smahus')
  const [showDeclineForm, setShowDeclineForm] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)
  // Kundens tillvalsval (id:n för ikryssade option-rader). Endast visning —
  // servern validerar id:na och räknar om totalen själv vid signering.
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(new Set())

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
        setAttribution(data.attribution || null)

        // Redirect till kundportalen om kunden har portal_token — all
        // offerthantering sker där.
        //
        // UNDANTAG ?portal=1: portalens "Läs offerten"-länk pekar hit för att
        // visa själva dokumentet. Utan undantaget studsade den direkt tillbaka
        // till portalen och kunden kunde ALDRIG läsa offerten — bara ladda ner
        // den som PDF.
        const cameFromPortal = new URLSearchParams(window.location.search).get('portal') === '1'
        if (quoteData?.customer?.portal_token && !cameFromPortal) {
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
    fetch(`/api/quotes/track?q=${quote.quote_id}&t=${encodeURIComponent(token)}&e=opened&s=${sessionId}`).catch(() => {})

    // Logga tid vid stängning
    const handleUnload = () => {
      const duration = Math.floor((Date.now() - startTime) / 1000)
      if (duration > 0) {
        navigator.sendBeacon(
          '/api/quotes/track',
          JSON.stringify({
            quoteId: quote.quote_id,
            signToken: token,
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

  // ── Tillval ────────────────────────────────────────────────────────────────

  function toggleOption(id: string) {
    setSelectedOptions((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // ── Submit approval (namn + kryss) ─────────────────────────────────────────

  async function handleSubmit() {
    if (!name.trim() || !termsAccepted || submitting) return

    setSubmitting(true)
    setErrorMessage('')

    try {
      const res = await fetch(`/api/quotes/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'sign',
          name: name.trim(),
          selected_option_ids: Array.from(selectedOptions),
          // ROT-uppgifterna: valfria — tomma fält är "hoppa över", då frågar
          // hantverkaren i stället innan fakturan.
          rot_personnummer: rotPnr.trim() || undefined,
          rot_fastighet: rotFastighet.trim() || undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Kunde inte spara godkännandet')
      } else {
        // Dokumentet (visas kvar på 'success'-skärmen) speglas som signerat
        // direkt — servern är fortfarande den auktoritativa sanningen.
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
        // Föreslagna starttider (idé 4) — bara dagar med verklig ledig
        // kapacitet. Tom lista → inget bokningserbjudande visas.
        setBookingSuggestions(data.booking_suggestions || [])
        setState('success')
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
    } catch {
      setErrorMessage('Något gick fel. Försök igen.')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Kundens fråga (idé 5) ──────────────────────────────────────────────────

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

  // ── Företagsfoten — hantverkarens varumärke + avstängbar stämpel ──────────

  function BusinessFooter() {
    return (
      <div className="pt-6 border-t border-slate-200 text-center text-xs leading-relaxed text-slate-500">
        {business && (
          <p>
            <strong className="text-slate-700">{business.name}</strong>
            {business.org_number && <> · Org.nr {business.org_number}</>}
            {business.f_skatt && <> · Godkänd för F-skatt</>}
            {(business.phone || business.email) && (
              <>
                <br />
                {[business.phone, business.email].filter(Boolean).join(' · ')}
              </>
            )}
          </p>
        )}
        {/* Footer — stämpeln, lib/branding/attribution.ts */}
        <AttributionStamp attribution={attribution} className="mt-3 text-center text-xs text-gray-400 pb-8" linkClassName="font-medium" />
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

  // ── Render: Already declined / declined ────────────────────────────────────

  if (state === 'already_declined' || state === 'declined') {
    return (
      <CenteredLayout>
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-gray-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <XCircle className="w-7 h-7 text-gray-400" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Offerten har avböjts</h2>
          <p className="text-gray-500 text-sm">
            {state === 'declined'
              ? `Vi har registrerat att du avböjer offerten. ${business?.name || 'Företaget'} kommer att informeras.`
              : 'Denna offert har redan avböjts.'}
          </p>
        </div>
      </CenteredLayout>
    )
  }

  if (!quote) return null

  const structuredItems = quote.structured_items || []
  const templateStyle = quote.template_style || 'modern'
  const canSubmit = !!(name.trim() && termsAccepted && !submitting)

  // ── Tillval: live-total på klienten via SAMMA motor som servern ────────────
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

  const liveTemplateData =
    quote.template_data && liveTotals
      ? applyLiveSelectionToTemplateData(quote.template_data, selectedOptions, liveTotals)
      : quote.template_data ?? null

  const harAvdrag = !!quote.rot_rut_type && dispRotRutDeduction > 0
  const avdragEtikett = quote.rot_rut_type === 'rut' ? 'RUT-avdrag' : 'ROT-avdrag'
  const visaRotSteg = state === 'viewing' && harAvdrag && quote.rot_uppgifter_saknas === true

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary-50 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-8">
        {/* ── Sidhuvud: hantverkarens varumärke ── */}
        <div className="flex items-center gap-3.5 mb-6">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shadow-md overflow-hidden text-white font-bold text-xl flex-none"
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
              <Zap className="w-6 h-6 text-white" />
            )}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-gray-900 leading-tight">{business?.name || 'Offert'}</h1>
            <p className="text-[13px] text-gray-500">
              Offert
              {quote.valid_until && state === 'viewing' && (
                <> · gäller till {new Date(quote.valid_until).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })}</>
              )}
            </p>
          </div>
        </div>

        {/* ── Bekräftelsen (success / redan signerad) ── */}
        {(state === 'success' || state === 'already_signed') && (
          <div className="mb-6 bg-teal-950 text-white rounded-2xl p-6">
            <div className="w-10 h-10 rounded-full bg-teal-300/20 flex items-center justify-center text-teal-300">
              <CheckCircle className="w-5 h-5" />
            </div>
            <h2 className="text-2xl font-bold tracking-tight mt-4 leading-snug">
              {state === 'success'
                ? `Tack${quote.signed_by_name ? ` ${quote.signed_by_name.split(' ')[0]}` : ''}. Offerten är godkänd.`
                : 'Offerten är redan godkänd.'}
            </h2>
            <p className="text-sm text-white/70 mt-2 leading-relaxed">
              {quote.signed_by_name && <>Godkänd av {quote.signed_by_name}</>}
              {quote.signed_at && (
                <>
                  {quote.signed_by_name ? ', ' : 'Godkänd '}
                  {new Date(quote.signed_at).toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })}
                </>
              )}
              {(quote.signed_by_name || quote.signed_at) && '.'}
            </p>
            <div className="flex justify-between items-baseline mt-4 pt-4 border-t border-white/10">
              <span className="text-[13px] text-white/70">
                {harAvdrag ? `Att betala efter preliminärt ${avdragEtikett.replace('-avdrag', '')}` : 'Att betala'}
              </span>
              <span className="text-xl font-bold tabular-nums">{formatSEK(dispCustomerPays || dispTotal)}</span>
            </div>
          </div>
        )}

        {/* ── Starttidsförslagen (kapacitetsmotorn) ── */}
        {state === 'success' && bookingSuggestions.length > 0 && (
          <div className="mb-6 bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
            {bookingState === 'sent' ? (
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Tack — vi har fått ditt önskemål.</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {business?.name || 'Vi'} bekräftar tiden så snart som möjligt. Den är preliminär tills dess.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-1">
                  <Calendar className="w-5 h-5 text-gray-400 shrink-0" />
                  <h3 className="text-base font-semibold text-gray-900">När vill du att vi börjar?</h3>
                </div>
                <p className="text-gray-400 text-xs mb-4 sm:pl-8">
                  Tiderna nedan har vi ledigt. Välj en så återkommer vi med bekräftelse.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:pl-8">
                  {bookingSuggestions.map((s) => {
                    const d = new Date(`${s.date}T12:00:00Z`)
                    const weekday = d.toLocaleDateString('sv-SE', { weekday: 'long', timeZone: 'Europe/Stockholm' })
                    const dayMonth = d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' })
                    return (
                      <button
                        key={s.date}
                        type="button"
                        onClick={() => handleRequestBooking(s.date)}
                        disabled={bookingState === 'sending'}
                        className="min-h-[44px] px-4 py-3 text-left border border-gray-200 rounded-xl hover:border-primary-400 hover:bg-primary-50/40 disabled:opacity-50 transition-colors"
                      >
                        <span className="block text-sm font-semibold text-gray-900">Vecka {s.week}</span>
                        <span className="block text-xs text-gray-500 mt-0.5 capitalize">
                          {weekday} {dayMonth}
                        </span>
                      </button>
                    )
                  })}
                </div>
                {bookingState === 'error' && (
                  <p className="mt-3 text-xs text-red-600 sm:pl-8">
                    Önskemålet kunde inte skickas. Hör av dig till oss i stället.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Vad händer nu ── */}
        {(state === 'success' || state === 'already_signed') && (
          <div className="mb-6 bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
            <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase">Vad händer nu</p>
            <div className="flex flex-col gap-3.5 mt-3.5 text-sm leading-relaxed">
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex-none bg-teal-50 text-primary-700 flex items-center justify-center text-xs font-bold">1</span>
                <span className="text-gray-700">
                  <strong className="text-gray-900">{business?.contact_name || business?.name || 'Hantverkaren'} hör av sig</strong>{' '}
                  och stämmer av starttid och detaljer.
                </span>
              </div>
              {harAvdrag && (
                <div className="flex gap-3">
                  <span className="w-6 h-6 rounded-full flex-none bg-teal-50 text-primary-700 flex items-center justify-center text-xs font-bold">2</span>
                  <span className="text-gray-700">
                    <strong className="text-gray-900">{avdragEtikett}et dras på fakturan.</strong>{' '}
                    {business?.name || 'Företaget'} ansöker hos Skatteverket när du betalat. Beloppet är
                    preliminärt tills Skatteverket godkänt det.
                  </span>
                </div>
              )}
              <div className="flex gap-3">
                <span className="w-6 h-6 rounded-full flex-none bg-teal-50 text-primary-700 flex items-center justify-center text-xs font-bold">{harAvdrag ? 3 : 2}</span>
                <span className="text-gray-700">
                  <strong className="text-gray-900">Den godkända offerten finns kvar här.</strong>{' '}
                  Länken fungerar även i efterhand, och du kan ladda ner den som PDF nedan.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── "Du betalar"-kortet (1a) ── */}
        {state === 'viewing' && (
          <div className="mb-5 bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
            <p className="text-[11px] font-semibold tracking-widest text-gray-500 uppercase">
              {harAvdrag ? 'Du betalar' : 'Totalt inkl. moms'}
            </p>
            <p className="text-4xl font-bold tracking-tight text-gray-900 mt-1.5 tabular-nums">
              {formatSEK(dispCustomerPays || dispTotal)}
            </p>
            {harAvdrag && (
              <>
                <div className="flex flex-col gap-1.5 mt-3.5 text-sm">
                  <div className="flex justify-between text-gray-600">
                    <span>Offertens totalsumma inkl. moms</span>
                    <span className="tabular-nums text-gray-900">{formatSEK(dispTotal)}</span>
                  </div>
                  <div className="flex justify-between items-center text-emerald-700">
                    <span className="flex items-center gap-2">
                      {avdragEtikett}
                      <span className="text-[10px] font-semibold tracking-wide uppercase px-1.5 py-0.5 rounded-full border border-emerald-200 bg-emerald-50">
                        preliminärt
                      </span>
                    </span>
                    <span className="tabular-nums font-semibold">−{formatSEK(dispRotRutDeduction)}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed mt-3">
                  Avdraget dras direkt på fakturan. Skatteverket fastställer det slutgiltiga beloppet.
                </p>
              </>
            )}
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
              ? 'Sista dagen att godkänna!'
              : `Offerten går ut om ${daysLeft} dag${daysLeft === 1 ? '' : 'ar'}`}
          </div>
        )}

        {/* Dokumentet — ETAPP 5: samma mall hantverkaren valde. */}
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

            {/* ── Godkänn offerten — namn + kryss (+ ROT-uppgifter vid behov) ──
                Ankarpunkt för dokumentets "Godkänn offerten digitalt"-yta
                (SignatureCta.tsx, id="signature-card"). */}
            <div id="signature-card" className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-4 scroll-mt-4">
              <h3 className="text-lg font-bold text-gray-900 mb-1">Godkänn offerten</h3>
              <p className="text-gray-400 text-xs mb-5">Skriv ditt namn och bekräfta — ingen signatur behövs.</p>

              {/* ROT-uppgiftssteget (1e) — bara när avdrag finns och uppgifter saknas */}
              {visaRotSteg && (
                <div className="mb-6 p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
                  <p className="text-[11px] font-semibold tracking-widest text-emerald-700 uppercase">
                    {avdragEtikett} · preliminärt −{formatSEK(dispRotRutDeduction)}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 mt-1.5">
                    Två uppgifter för att avdraget ska kunna sökas
                  </p>
                  <p className="text-xs text-gray-600 leading-relaxed mt-1">
                    Skatteverket kräver personnummer på den som får avdraget
                    {quote.rot_rut_type === 'rot' && ' och uppgifter om bostaden'}.
                    Du kan hoppa över — då frågar {business?.contact_name || business?.name || 'hantverkaren'} innan fakturan.
                  </p>

                  {quote.rot_rut_type === 'rot' && (
                    <div className="flex gap-2 mt-3">
                      {([['smahus', 'Hus / småhus'], ['bostadsratt', 'Bostadsrätt']] as const).map(([val, label]) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setRotBoende(val)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            rotBoende === val
                              ? 'bg-primary-700 border-primary-700 text-white'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-primary-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}

                  <label className="flex flex-col gap-1.5 mt-3.5 text-xs text-gray-500">
                    Personnummer
                    <input
                      type="text"
                      inputMode="numeric"
                      value={rotPnr}
                      onChange={(e) => setRotPnr(e.target.value)}
                      placeholder="ÅÅÅÅMMDD-XXXX"
                      className="h-12 px-3.5 border border-gray-300 rounded-xl font-mono text-[15px] text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/40"
                    />
                    <span className="text-[11px] text-gray-400">Den som äger bostaden och betalar fakturan.</span>
                  </label>

                  {quote.rot_rut_type === 'rot' && (
                    <label className="flex flex-col gap-1.5 mt-3 text-xs text-gray-500">
                      {rotBoende === 'bostadsratt' ? 'Föreningens org.nr + lägenhetsnummer' : 'Fastighetsbeteckning'}
                      <input
                        type="text"
                        value={rotFastighet}
                        onChange={(e) => setRotFastighet(e.target.value)}
                        placeholder={rotBoende === 'bostadsratt' ? 't.ex. 769600-1234, lgh 1102' : 't.ex. Bromma Ekbacken 4:12'}
                        className="h-12 px-3.5 border border-gray-300 rounded-xl text-[15px] text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-primary-600/40"
                      />
                      <span className="text-[11px] text-gray-400">
                        {rotBoende === 'bostadsratt'
                          ? 'Föreningens organisationsnummer och ditt lägenhetsnummer (står på avgiftsavin).'
                          : 'Står på lagfarten eller i Lantmäteriets Min fastighet.'}
                      </span>
                    </label>
                  )}

                  <p className="mt-3 text-[11px] text-gray-500 leading-relaxed">
                    Uppgifterna används bara för {avdragEtikett.replace('-avdrag', '')}-ansökan.
                  </p>
                </div>
              )}

              {/* Name input */}
              <div className="mb-4">
                <label className="block text-xs text-gray-500 mb-1.5">Ditt namn</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Förnamn Efternamn"
                  required
                  className="w-full h-12 px-4 bg-white border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-600/40 transition-all"
                />
              </div>

              {/* Terms checkbox — ersätter signaturen */}
              <label className="flex items-start gap-3 mb-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-gray-300 accent-primary-700"
                />
                <span className="text-sm text-gray-600 leading-relaxed">
                  Jag godkänner offerten och förstår att godkännandet är bindande. Det ersätter en signatur.
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
                    Godkänner...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Godkänn offert · {formatSEK(dispCustomerPays || dispTotal)}
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
                  {!name.trim() ? 'Fyll i ditt namn' : 'Bekräfta att du godkänner offerten'} för att fortsätta
                </p>
              )}
            </div>

            {/* Referensfoton (idé 6) */}
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

            {/* Kundens fråga (idé 5) */}
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
              Ladda ner godkänd offert (PDF)
            </a>
          </div>
        )}

        <BusinessFooter />
      </div>
    </div>
  )
}
