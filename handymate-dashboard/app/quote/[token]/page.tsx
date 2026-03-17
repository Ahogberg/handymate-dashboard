'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  Zap,
  FileText,
  Eraser,
  PenTool,
  Calendar,
  User,
  Hammer,
  Package,
  Wrench,
  XCircle,
  Clock,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuoteItem {
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  type?: 'labor' | 'material' | 'service'
}

interface BusinessInfo {
  name: string
  contact_name: string
  email: string
  phone: string
  org_number: string
  f_skatt: boolean
}

interface QuoteData {
  quote_id: string
  title?: string
  description?: string
  items: QuoteItem[]
  labor_total: number
  material_total: number
  subtotal: number
  discount_amount?: number
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
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const formatSEK = (amount: number) =>
  new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)

const DECLINE_REASONS = [
  { value: 'too_expensive', label: 'Priset är för högt' },
  { value: 'chose_other', label: 'Valde en annan leverantör' },
  { value: 'no_longer_needed', label: 'Behovet finns inte längre' },
  { value: 'other', label: 'Annat skäl' },
]

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
  const [business, setBusiness] = useState<BusinessInfo | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [name, setName] = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [showDeclineForm, setShowDeclineForm] = useState(false)
  const [declineReason, setDeclineReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

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
        setQuote(quoteData)
        setBusiness(businessData)

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
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Kunde inte spara signaturen')
      } else {
        setState('success')
      }
    } catch {
      setErrorMessage('Något gick fel. Försök igen.')
    } finally {
      setSubmitting(false)
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
        body: JSON.stringify({ action: 'decline', reason: declineReason }),
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

  // ── Group items by type ────────────────────────────────────────────────────

  function groupItems(items: QuoteItem[]) {
    const groups: Record<string, QuoteItem[]> = {
      labor: [],
      material: [],
      service: [],
    }

    for (const item of items) {
      const type = item.type || 'service'
      if (!groups[type]) groups[type] = []
      groups[type].push(item)
    }

    return groups
  }

  const groupLabels: Record<string, { label: string; icon: React.ReactNode }> = {
    labor: { label: 'Arbete', icon: <Hammer className="w-4 h-4" /> },
    material: { label: 'Material', icon: <Package className="w-4 h-4" /> },
    service: { label: 'Tjänster', icon: <Wrench className="w-4 h-4" /> },
  }

  // ── Shared centered layout ─────────────────────────────────────────────────

  function CenteredLayout({ children }: { children: React.ReactNode }) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-teal-50 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-50 rounded-full blur-3xl" />
        </div>
        <div className="relative w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/10">
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
          <Loader2 className="w-8 h-8 text-sky-700 animate-spin" />
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
            className="inline-block px-6 py-3 text-sm font-medium text-sky-700 hover:text-teal-600 transition-colors"
          >
            Tillbaka till startsidan
          </a>
        </div>
      </CenteredLayout>
    )
  }

  // ── Render: Already signed ─────────────────────────────────────────────────

  if (state === 'already_signed' && quote) {
    return (
      <CenteredLayout>
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Offerten är redan signerad</h2>
          <div className="space-y-2 text-sm text-gray-500">
            {quote.signed_by_name && (
              <p>
                Signerad av: <span className="text-gray-900">{quote.signed_by_name}</span>
              </p>
            )}
            {quote.signed_at && (
              <p>
                Datum:{' '}
                <span className="text-gray-900">
                  {new Date(quote.signed_at).toLocaleDateString('sv-SE', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </p>
            )}
            <p>
              Belopp:{' '}
              <span className="text-gray-900 font-semibold">{formatSEK(quote.total)}</span>
            </p>
          </div>
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

  // ── Render: Success (just signed) ──────────────────────────────────────────

  if (state === 'success') {
    return (
      <CenteredLayout>
        <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold mb-2">
            <span className="text-teal-600">Tack!</span>
          </h2>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Offerten är godkänd</h3>
          <p className="text-gray-500 text-sm mb-4">
            Din signatur har sparats.{' '}
            {business?.name || 'Företaget'} kommer att kontakta dig med nästa steg.
          </p>
          {quote && (
            <div className="mt-4 p-4 bg-gray-50 rounded-xl border border-gray-300/50">
              <p className="text-gray-500 text-sm">
                Offert: <span className="text-gray-900">{quote.title || quote.quote_id}</span>
              </p>
              <p className="text-gray-500 text-sm">
                Belopp:{' '}
                <span className="text-gray-900 font-semibold">
                  {formatSEK(quote.customer_pays ?? quote.total)}
                </span>
              </p>
            </div>
          )}
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

  // ── Render: Viewing ────────────────────────────────────────────────────────

  if (!quote) return null

  const itemGroups = groupItems(quote.items || [])
  const canSubmit = !!(name.trim() && hasDrawn && termsAccepted && !submitting)

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-teal-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-teal-50 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/10">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">
            <span className="text-teal-600">{business?.name || 'Offert'}</span>
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Offert</p>
        </div>

        {/* Validity countdown banner */}
        {daysLeft !== null && daysLeft <= 7 && (
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

        {/* Quote Details Card */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
          {/* Title & Description */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-sky-700" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {quote.title || `Offert ${quote.quote_id}`}
                </h2>
                {quote.valid_until && (
                  <p className="text-gray-400 text-xs flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3 h-3" />
                    Giltig t.o.m.{' '}
                    {new Date(quote.valid_until).toLocaleDateString('sv-SE', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </p>
                )}
              </div>
            </div>
            {quote.description && (
              <p className="text-gray-500 text-sm mt-3 leading-relaxed">{quote.description}</p>
            )}
          </div>

          {/* Items grouped by type */}
          <div className="space-y-6">
            {Object.entries(itemGroups).map(([type, items]) => {
              if (items.length === 0) return null
              const group = groupLabels[type] || { label: type, icon: null }

              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-sky-700">{group.icon}</span>
                    <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                      {group.label}
                    </h3>
                  </div>
                  <div className="bg-gray-100/30 rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-200">
                          <th className="text-left px-4 py-3 text-gray-400 font-medium">
                            Beskrivning
                          </th>
                          <th className="text-right px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">
                            Antal
                          </th>
                          <th className="text-right px-4 py-3 text-gray-400 font-medium hidden sm:table-cell">
                            Á-pris
                          </th>
                          <th className="text-right px-4 py-3 text-gray-400 font-medium">Summa</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, idx) => (
                          <tr
                            key={idx}
                            className={idx < items.length - 1 ? 'border-b border-gray-200/50' : ''}
                          >
                            <td className="px-4 py-3 text-gray-900">
                              {item.description}
                              <span className="sm:hidden block text-xs text-gray-400 mt-0.5">
                                {item.quantity} {item.unit} x {formatSEK(item.unit_price)}
                              </span>
                            </td>
                            <td className="text-right px-4 py-3 text-gray-700 hidden sm:table-cell">
                              {item.quantity} {item.unit}
                            </td>
                            <td className="text-right px-4 py-3 text-gray-700 hidden sm:table-cell">
                              {formatSEK(item.unit_price)}
                            </td>
                            <td className="text-right px-4 py-3 text-gray-900 font-medium">
                              {formatSEK(item.total)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="space-y-2">
              {quote.labor_total > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Arbete</span>
                  <span className="text-gray-700">{formatSEK(quote.labor_total)}</span>
                </div>
              )}
              {quote.material_total > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Material</span>
                  <span className="text-gray-700">{formatSEK(quote.material_total)}</span>
                </div>
              )}
              {(quote.labor_total > 0 || quote.material_total > 0) && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Delsumma</span>
                  <span className="text-gray-700">
                    {formatSEK(quote.subtotal || quote.labor_total + quote.material_total)}
                  </span>
                </div>
              )}
              {quote.discount_amount != null && quote.discount_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Rabatt</span>
                  <span className="text-emerald-600">-{formatSEK(quote.discount_amount)}</span>
                </div>
              )}
              {quote.vat_amount != null && quote.vat_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Moms{quote.vat_rate ? ` (${quote.vat_rate}%)` : ''}
                  </span>
                  <span className="text-gray-700">{formatSEK(quote.vat_amount)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold pt-2 border-t border-gray-300">
                <span className="text-gray-900">Totalt</span>
                <span className="text-gray-900">{formatSEK(quote.total)}</span>
              </div>
            </div>
          </div>

          {/* ROT/RUT box */}
          {quote.rot_rut_type && quote.rot_rut_deduction && quote.rot_rut_deduction > 0 && (
            <div className="mt-6 p-5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
              <h4 className="text-sm font-semibold text-emerald-600 uppercase tracking-wider mb-3">
                {quote.rot_rut_type === 'rot' ? 'ROT-avdrag' : 'RUT-avdrag'}
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Totalt belopp</span>
                  <span className="text-gray-700">{formatSEK(quote.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">
                    {quote.rot_rut_type === 'rot' ? 'ROT-avdrag' : 'RUT-avdrag'}
                  </span>
                  <span className="text-emerald-600">-{formatSEK(quote.rot_rut_deduction)}</span>
                </div>
                <div className="flex justify-between text-base font-bold pt-2 border-t border-emerald-500/20">
                  <span className="text-gray-900">Du betalar</span>
                  <span className="text-emerald-600">
                    {formatSEK(quote.customer_pays ?? quote.total - quote.rot_rut_deduction)}
                  </span>
                </div>
                {quote.personnummer && (
                  <div className="flex justify-between pt-2 text-xs">
                    <span className="text-gray-400">Personnummer</span>
                    <span className="text-gray-500">{quote.personnummer}</span>
                  </div>
                )}
                {quote.fastighetsbeteckning && (
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Fastighetsbeteckning</span>
                    <span className="text-gray-500">{quote.fastighetsbeteckning}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Attachments */}
        {quote.attachments && quote.attachments.length > 0 && (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-4">
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
                  <div className="w-8 h-8 bg-teal-100 rounded-lg flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4 text-teal-700" />
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

        {/* Signature Card */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-4">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center">
              <PenTool className="w-5 h-5 text-sky-700" />
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
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 transition-all"
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
              className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-teal-600"
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
            className="w-full py-4 bg-teal-600 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-8">
          Drivs av{' '}
          <span className="text-teal-600 font-medium">Handymate</span>
        </p>
      </div>
    </div>
  )
}
