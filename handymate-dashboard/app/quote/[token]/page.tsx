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

interface QuoteData {
  quote_id: string
  business_name: string
  title?: string
  description?: string
  items: QuoteItem[]
  labor_total: number
  material_total: number
  subtotal: number
  discount?: number
  vat?: number
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
  signed_by?: string
  customer_name?: string
  customer_email?: string
}

// ── Currency formatter ─────────────────────────────────────────────────────────

const formatSEK = (amount: number) =>
  new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)

// ── Component ──────────────────────────────────────────────────────────────────

type PageState = 'loading' | 'error' | 'already_signed' | 'viewing' | 'signing' | 'success'

export default function QuoteSignPage() {
  const params = useParams()
  const token = params.token as string

  const [state, setState] = useState<PageState>('loading')
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [name, setName] = useState('')
  const [hasDrawn, setHasDrawn] = useState(false)

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

        setQuote(data)

        if (data.customer_name) {
          setName(data.customer_name)
        }

        if (data.status === 'accepted' || data.signed_at) {
          setState('already_signed')
        } else if (data.valid_until && new Date(data.valid_until) < new Date()) {
          setErrorMessage('Offerten har gått ut och kan inte längre signeras.')
          setState('error')
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
    ctx.fillStyle = '#f8fafc' // slate-50
    ctx.fillRect(0, 0, rect.width, rect.height)
    ctx.strokeStyle = '#1e293b' // slate-800
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => {
    if (state === 'viewing') {
      // Small delay to let the DOM render
      const timer = setTimeout(initCanvas, 50)
      return () => clearTimeout(timer)
    }
  }, [state, initCanvas])

  // Reinitialize on resize
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

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  function startDrawing(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault()
    isDrawingRef.current = true
    const point = getCanvasPoint(e)
    if (point) {
      lastPointRef.current = point
    }
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
    if (!name.trim()) return
    if (!hasDrawn) return

    const canvas = canvasRef.current
    if (!canvas) return

    setState('signing')

    try {
      const signatureData = canvas.toDataURL('image/png')

      const res = await fetch(`/api/quotes/public/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          signature_data: signatureData,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setErrorMessage(data.error || 'Kunde inte spara signaturen')
        setState('viewing')
        return
      }

      setState('success')
    } catch {
      setErrorMessage('Något gick fel. Försök igen.')
      setState('viewing')
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

  // ── Render: Loading ────────────────────────────────────────────────────────

  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <p className="text-gray-500 text-sm">Laddar offert...</p>
        </div>
      </div>
    )
  }

  // ── Render: Error ──────────────────────────────────────────────────────────

  if (state === 'error') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-50 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-50 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Handymate</h1>
          </div>

          <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-7 h-7 text-amber-400" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Offerten kunde inte visas</h2>
            <p className="text-gray-500 mb-6">{errorMessage}</p>
            <a
              href="/"
              className="inline-block px-6 py-3 text-sm font-medium text-blue-600 hover:text-blue-500 transition-colors"
            >
              Tillbaka till startsidan
            </a>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Already signed ─────────────────────────────────────────────────

  if (state === 'already_signed' && quote) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-50 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-50 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Handymate</h1>
          </div>

          <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
            <div className="w-14 h-14 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-7 h-7 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Offerten är redan signerad</h2>
            <div className="space-y-2 text-sm text-gray-500">
              {quote.signed_by && (
                <p>
                  Signerad av: <span className="text-gray-900">{quote.signed_by}</span>
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
                Belopp: <span className="text-gray-900 font-semibold">{formatSEK(quote.total)}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Render: Success ────────────────────────────────────────────────────────

  if (state === 'success') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-50 rounded-full blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-50 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-md mx-4">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
              <Zap className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900">Handymate</h1>
          </div>

          <div className="bg-white shadow-sm rounded-3xl border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold mb-2">
              <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                Tack!
              </span>
            </h2>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Offerten är godkänd</h3>
            <p className="text-gray-500 text-sm mb-4">
              Din signatur har sparats. Företaget kommer att kontakta dig med nästa steg.
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
        </div>
      </div>
    )
  }

  // ── Render: Viewing (main quote + signature form) ──────────────────────────

  if (!quote) return null

  const itemGroups = groupItems(quote.items || [])

  return (
    <div className="min-h-screen bg-slate-50 relative overflow-hidden">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-50 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-50 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-500/10">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold">
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              {quote.business_name}
            </span>
          </h1>
          <p className="text-gray-500 mt-1 text-sm">Offert</p>
        </div>

        {/* Quote Details Card */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-6">
          {/* Title & Description */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                <FileText className="w-5 h-5 text-blue-600" />
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
                    <span className="text-blue-600">{group.icon}</span>
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
                            className={
                              idx < items.length - 1 ? 'border-b border-gray-200/50' : ''
                            }
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
              {quote.discount && quote.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Rabatt</span>
                  <span className="text-emerald-600">-{formatSEK(quote.discount)}</span>
                </div>
              )}
              {quote.vat != null && quote.vat > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Moms{quote.vat_rate ? ` (${quote.vat_rate}%)` : ''}
                  </span>
                  <span className="text-gray-700">{formatSEK(quote.vat)}</span>
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

        {/* Signature Card */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 sm:p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <PenTool className="w-5 h-5 text-blue-600" />
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
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
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
          <div className="flex justify-end mb-6">
            <button
              type="button"
              onClick={clearCanvas}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-300 rounded-lg transition-all"
            >
              <Eraser className="w-4 h-4" />
              Rensa
            </button>
          </div>

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
            disabled={state === 'signing' || !name.trim() || !hasDrawn}
            className="w-full py-4 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-semibold text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {state === 'signing' ? (
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

          {/* Validation hints */}
          {(!name.trim() || !hasDrawn) && (
            <div className="mt-3 text-center">
              <p className="text-gray-400 text-xs">
                {!name.trim() && !hasDrawn
                  ? 'Fyll i ditt namn och rita din signatur för att fortsätta'
                  : !name.trim()
                    ? 'Fyll i ditt namn för att fortsätta'
                    : 'Rita din signatur för att fortsätta'}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 pb-8">
          Drivs av{' '}
          <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent font-medium">
            Handymate
          </span>
        </p>
      </div>
    </div>
  )
}
