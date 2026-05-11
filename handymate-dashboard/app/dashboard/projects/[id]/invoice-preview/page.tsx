'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronRight,
  Lock,
  Loader2,
  AlertCircle,
  AlertTriangle,
  FileText,
  Send,
  Edit3,
  CheckCircle2,
  X,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────
// Typer matchar response-shape från GET /api/projects/[id]/invoice-preview
// ─────────────────────────────────────────────────────────────────

interface QuoteItem {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  item_type?: string
  sort_order?: number
  group_name?: string | null
}

interface AtaItem {
  name?: string
  description?: string
  quantity?: number
  unit?: string
  unit_price?: number
  rot_rut_type?: string | null
}

interface SignedAta {
  change_id: string
  ata_number: number
  description: string
  change_type: string
  signed_at: string | null
  signed_by_name: string | null
  total: number
  items: AtaItem[]
}

interface InvoicePreviewData {
  _deployVersion?: string
  project: {
    project_id: string
    name: string
    customer_id: string | null
    quote_id: string | null
    status: string
    completed_at: string | null
  }
  customer: {
    customer_id: string
    name: string
    phone_number: string | null
    email: string | null
    address_line: string | null
    personal_number: string | null
    property_designation: string | null
  } | null
  business: {
    business_id: string
    name: string | null
    org_number: string | null
    bankgiro_number: string | null
    plusgiro_number: string | null
    bank_account: string | null
  } | null
  quote: {
    quote_id: string
    quote_number: string | null
    total: number
    signed_at: string | null
    items: QuoteItem[]
  } | null
  signedAtas: SignedAta[]
  pendingAtas: any[]
  invoicedAtas: any[]
  quoteTotal: number
  signedAtasTotal: number
  invoicedAtasTotal: number
  rotRutSummary: {
    type: 'ROT' | 'RUT'
    eligible_amount: number
    deduction_percent: 30 | 50
    deduction_amount: number
    customer_pays: number
  } | null
  totalExclVat: number
  vatAmount: number
  totalInclVat: number
  nextInvoiceNumber: string
}

// ─────────────────────────────────────────────────────────────────
// Format-helpers (samma som parent page.tsx för konsistens)
// ─────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return amount.toLocaleString('sv-SE') + ' kr'
}

function formatDate(date: string | null): string {
  if (!date) return ''
  return new Date(date).toLocaleDateString('sv-SE')
}

// ─────────────────────────────────────────────────────────────────
// Page-component
// ─────────────────────────────────────────────────────────────────

export default function InvoicePreviewPage() {
  const params = useParams<{ id: string }>()
  const projectId = params?.id
  const router = useRouter()
  const [data, setData] = useState<InvoicePreviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDismissed, setPendingDismissed] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null)
  const [sending, setSending] = useState(false)
  const [validationError, setValidationError] = useState<{ message: string; fields: string[] } | null>(null)

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type })
    window.setTimeout(() => setToast(null), 3500)
  }

  const handleSendInvoice = async () => {
    if (!projectId || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/create-final-invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const body = await res.json().catch(() => ({}))

      // Pre-flight-fel (TD-27) — visa dialog med fält-lista istället för toast
      if (res.status === 400 && Array.isArray(body.fields) && body.fields.length > 0) {
        setValidationError({
          message: body.error || 'Företaget saknar uppgifter',
          fields: body.fields,
        })
        setSending(false)
        return
      }

      if (!res.ok || body.error) {
        showToast(body.error || 'Kunde inte skapa faktura', 'error')
        setSending(false)
        return
      }

      // TD-29-warning: faktura skapad men ÄTA-status-update failade.
      // Visa toast + redirect så Andreas ser meddelandet i invoice-vyn.
      if (body.warning) {
        console.warn('[invoice-preview] create-final-invoice warning:', body.warning)
        showToast(body.warning, 'error')
      }

      router.push(`/dashboard/invoices/${body.invoice_id}`)
    } catch (e: any) {
      console.error('[invoice-preview] send invoice error:', e)
      showToast(e?.message || 'Något gick fel — försök igen', 'error')
      setSending(false)
    }
  }

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/projects/${projectId}/invoice-preview`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) {
          setError(d.error + (d.stage ? ` (stage: ${d.stage})` : ''))
        } else {
          setData(d as InvoicePreviewData)
        }
        setLoading(false)
      })
      .catch(e => {
        if (cancelled) return
        setError(e?.message || 'Kunde inte ladda förhandsgranskning')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Hämtar fakturaunderlag…</span>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-6">
        <div className="max-w-md bg-white rounded-2xl border border-red-200 shadow-sm p-6">
          <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
            <AlertCircle className="w-5 h-5" />
            Kunde inte ladda förhandsgranskning
          </div>
          <p className="text-sm text-slate-600 mb-4">
            {error || 'Okänt fel'}
          </p>
          <button
            onClick={() => router.back()}
            className="text-sm font-medium text-primary-700 hover:text-primary-800"
          >
            ← Tillbaka
          </button>
        </div>
      </div>
    )
  }

  const today = new Date().toLocaleDateString('sv-SE')

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 mb-3">
          <Link href="/dashboard/projects" className="hover:text-slate-700 transition-colors">
            Projekt
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <Link
            href={`/dashboard/projects/${data.project.project_id}`}
            className="hover:text-slate-700 transition-colors truncate"
          >
            {data.project.name}
          </Link>
          <ChevronRight className="w-3 h-3 text-slate-400" />
          <span className="text-slate-900 font-semibold">Förhandsgranska faktura</span>
        </nav>

        {/* Back-row */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Tillbaka till projekt
          </button>
        </div>

        {/* Två-kolumns layout — vänster: dokument, höger: sidebar (commit 3) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
          <InvoiceDocument data={data} today={today} />

          <InvoiceSidebar
            data={data}
            pendingDismissed={pendingDismissed}
            onDismissPending={() => setPendingDismissed(true)}
            onShowToast={showToast}
            sending={sending}
            onSendInvoice={handleSendInvoice}
          />
        </div>
      </div>

      {/* Validation-error dialog (pre-flight-fel från TD-27) */}
      {validationError && (
        <ValidationErrorDialog
          message={validationError.message}
          fields={validationError.fields}
          onClose={() => setValidationError(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100]">
          <div
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border shadow-xl text-sm font-medium ${
              toast.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : toast.type === 'error'
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {toast.type === 'success' && <CheckCircle2 className="w-4 h-4" />}
            {toast.type === 'error' && <AlertCircle className="w-4 h-4" />}
            {toast.message}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Invoice document (vänster kolumn) — 1262-1359 i mockup
// ─────────────────────────────────────────────────────────────────

function InvoiceDocument({ data, today }: { data: InvoicePreviewData; today: string }) {
  const business = data.business
  const project = data.project

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8 sm:p-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-10 gap-6">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary-700 mb-2">
            Faktura
          </div>
          <div
            className="text-[28px] font-bold text-slate-900 tracking-tight leading-none mb-3 tabular-nums"
            style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
          >
            {data.nextInvoiceNumber}
          </div>
          <div className="text-sm text-slate-500 truncate">
            {project.name} · slutfaktura · {today}
          </div>
        </div>

        {business && (
          <div className="text-right text-sm flex-shrink-0">
            <div className="font-semibold text-slate-900">{business.name || '—'}</div>
            {business.org_number ? (
              <div className="text-slate-500 mt-0.5">Org.nr {business.org_number}</div>
            ) : (
              <div className="text-amber-600 mt-0.5 text-xs">Org.nr saknas</div>
            )}
            {business.bankgiro_number && (
              <div className="text-slate-500 mt-0.5 text-xs">Bg {business.bankgiro_number}</div>
            )}
          </div>
        )}
      </div>

      {/* Section 1 — Enligt offert */}
      {data.quote && data.quote.items.length > 0 && (
        <QuoteSection quote={data.quote} quoteTotal={data.quoteTotal} />
      )}

      {/* Section 2 — Tilläggsarbeten (signerade ÄTA) */}
      {data.signedAtas.length > 0 && (
        <AtaSection atas={data.signedAtas} total={data.signedAtasTotal} />
      )}

      {/* Tom-state om varken offert eller ÄTA */}
      {(!data.quote || data.quote.items.length === 0) && data.signedAtas.length === 0 && (
        <div className="border border-dashed border-slate-300 rounded-xl p-8 text-center mb-8">
          <FileText className="w-8 h-8 mx-auto text-slate-300 mb-2" />
          <div className="text-sm font-medium text-slate-600 mb-1">
            Inget underlag att fakturera
          </div>
          <p className="text-xs text-slate-400">
            Projektet saknar både signerad offert och signerade tilläggsarbeten.
          </p>
        </div>
      )}

      {/* Totals */}
      <TotalSection
        totalExclVat={data.totalExclVat}
        vatAmount={data.vatAmount}
        totalInclVat={data.totalInclVat}
        rotRutSummary={data.rotRutSummary}
      />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section: Enligt offert
// ─────────────────────────────────────────────────────────────────

function QuoteSection({
  quote,
  quoteTotal,
}: {
  quote: NonNullable<InvoicePreviewData['quote']>
  quoteTotal: number
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
        <h2 className="text-base font-bold text-slate-900">Enligt offert</h2>
        {quote.signed_at && (
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Lock className="w-3 h-3" />
            Signerad {formatDate(quote.signed_at)} — låst grund
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-100">
        {quote.items.map(item => (
          <InvoiceLine
            key={item.id}
            description={item.description}
            quantity={item.quantity}
            unit={item.unit}
            unitPrice={item.unit_price}
            total={(item.quantity || 0) * (item.unit_price || 0)}
          />
        ))}
      </div>

      <SectionSubtotal label="Delsumma offert" amount={quoteTotal} />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Section: Tilläggsarbeten
// ─────────────────────────────────────────────────────────────────

function AtaSection({ atas, total }: { atas: SignedAta[]; total: number }) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between mb-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-bold text-slate-900">Tilläggsarbeten</h2>
          <span className="text-[11px] font-bold uppercase tracking-wider bg-primary-700 text-white px-2 py-0.5 rounded-full">
            {atas.length} st
          </span>
        </div>
      </div>

      <div className="space-y-5">
        {atas.map(ata => (
          <div key={ata.change_id}>
            <div className="flex items-baseline justify-between mb-2">
              <div className="text-sm font-semibold text-slate-900">
                ÄTA #{ata.ata_number} · {ata.description}
              </div>
              {ata.signed_at && (
                <div className="text-xs text-slate-400">
                  signerad {formatDate(ata.signed_at)}
                </div>
              )}
            </div>

            {ata.items.length > 0 ? (
              <div className="divide-y divide-slate-100 pl-2 border-l-2 border-primary-100">
                {ata.items.map((item, idx) => {
                  const qty = Number(item.quantity) || 0
                  const price = Number(item.unit_price) || 0
                  return (
                    <InvoiceLine
                      key={`${ata.change_id}-${idx}`}
                      description={item.name || item.description || '—'}
                      quantity={qty}
                      unit={item.unit || 'st'}
                      unitPrice={price}
                      total={qty * price}
                    />
                  )
                })}
              </div>
            ) : (
              <div className="pl-2 border-l-2 border-primary-100">
                <InvoiceLine
                  description={ata.description}
                  quantity={1}
                  unit="st"
                  unitPrice={Math.abs(ata.total)}
                  total={Math.abs(ata.total)}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <SectionSubtotal label="Delsumma tilläggsarbeten" amount={total} highlight />
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────

function InvoiceLine({
  description,
  quantity,
  unit,
  unitPrice,
  total,
}: {
  description: string
  quantity: number
  unit: string
  unitPrice: number
  total: number
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-4 py-2.5 items-baseline">
      <div className="text-sm text-slate-700 min-w-0">{description}</div>
      <div className="text-xs text-slate-400 tabular-nums whitespace-nowrap">
        {quantity} {unit} × {formatCurrency(unitPrice)}
      </div>
      <div className="text-sm font-medium text-slate-900 tabular-nums whitespace-nowrap text-right">
        {formatCurrency(total)}
      </div>
    </div>
  )
}

function SectionSubtotal({
  label,
  amount,
  highlight = false,
}: {
  label: string
  amount: number
  highlight?: boolean
}) {
  return (
    <div
      className={`flex items-baseline justify-between mt-4 pt-3 border-t ${
        highlight ? 'border-primary-200 text-primary-800' : 'border-slate-200 text-slate-700'
      }`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-base font-bold tabular-nums">{formatCurrency(amount)}</span>
    </div>
  )
}

function TotalSection({
  totalExclVat,
  vatAmount,
  totalInclVat,
  rotRutSummary,
}: {
  totalExclVat: number
  vatAmount: number
  totalInclVat: number
  rotRutSummary: InvoicePreviewData['rotRutSummary']
}) {
  return (
    <div className="mt-8 pt-6 border-t-2 border-slate-800">
      <div className="flex items-baseline justify-between py-2 text-sm">
        <span className="text-slate-600">Att betala (exkl. moms)</span>
        <span className="text-slate-900 font-medium tabular-nums">
          {formatCurrency(totalExclVat)}
        </span>
      </div>

      <div className="flex items-baseline justify-between py-2 text-sm">
        <span className="text-slate-600">Moms 25%</span>
        <span className="text-slate-900 font-medium tabular-nums">
          {formatCurrency(vatAmount)}
        </span>
      </div>

      {rotRutSummary && (
        <>
          <div className="flex items-baseline justify-between py-2 text-sm">
            <span className="text-emerald-700">
              {rotRutSummary.type}-avdrag ({rotRutSummary.deduction_percent}% på arbete)
            </span>
            <span className="text-emerald-700 font-medium tabular-nums">
              − {formatCurrency(rotRutSummary.deduction_amount)}
            </span>
          </div>
        </>
      )}

      <div className="flex items-baseline justify-between mt-4 pt-4 border-t border-slate-200">
        <span className="text-sm font-semibold text-slate-700">
          {rotRutSummary ? 'Du betalar' : 'Att betala (inkl. moms)'}
        </span>
        <span
          className="text-[28px] font-bold text-slate-900 tabular-nums leading-none"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          {formatCurrency(rotRutSummary ? rotRutSummary.customer_pays : totalInclVat)}
        </span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Sidebar (höger kolumn) — mockup rad 1361-1411
// ─────────────────────────────────────────────────────────────────

function InvoiceSidebar({
  data,
  pendingDismissed,
  onDismissPending,
  onShowToast,
  sending,
  onSendInvoice,
}: {
  data: InvoicePreviewData
  pendingDismissed: boolean
  onDismissPending: () => void
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void
  sending: boolean
  onSendInvoice: () => void
}) {
  const customerName = data.customer?.name || 'kunden'
  const projectId = data.project.project_id

  // Split signed additions / removals för Sammanställning-kortet.
  // signedAtasTotal från endpoint är redan netto — behöver bruttouppdelning.
  const signedAdditions = data.signedAtas.filter(a => a.change_type !== 'removal')
  const signedRemovals = data.signedAtas.filter(a => a.change_type === 'removal')
  const additionsSum = signedAdditions.reduce((s, a) => s + Math.abs(a.total), 0)
  const removalsSum = signedRemovals.reduce((s, a) => s + Math.abs(a.total), 0)

  const showWarning = data.pendingAtas.length > 0 && !pendingDismissed

  return (
    <aside className="hidden lg:flex lg:flex-col gap-4">
      {/* Warning card — pending ÄTA */}
      {showWarning && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <div className="flex items-start gap-3 mb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-amber-900 mb-1">
                ÄTA #{data.pendingAtas[0].ata_number} saknas på fakturan
              </div>
              <p className="text-sm text-amber-800 leading-relaxed">
                {data.pendingAtas.length === 1
                  ? `Detta tilläggsarbete är inte signerat av ${customerName} än. Skickas inte med automatiskt.`
                  : `${data.pendingAtas.length} tilläggsarbeten är inte signerade av ${customerName} än. Skickas inte med automatiskt.`}
              </p>
            </div>
          </div>

          {data.pendingAtas.length > 1 && (
            <ul className="mb-3 pl-8 space-y-1">
              {data.pendingAtas.map(p => (
                <li key={p.change_id} className="text-xs text-amber-800">
                  ÄTA #{p.ata_number} · {p.description}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-2 mt-3">
            <Link
              href={`/dashboard/projects/${projectId}`}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors"
            >
              <Send className="w-3.5 h-3.5" />
              Skicka för signering först
            </Link>
            <button
              onClick={onDismissPending}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-transparent hover:bg-amber-100 text-amber-800 text-sm font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Hoppa över
            </button>
          </div>
        </div>
      )}

      {/* Sammanställning */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-4">
          Sammanställning
        </div>

        <div className="space-y-3">
          {/* Original-offert */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              Original-offert
            </div>
            <span className="font-medium text-slate-900 tabular-nums">
              {formatCurrency(data.quoteTotal)}
            </span>
          </div>

          {/* Tilläggsarbeten (additions) */}
          {signedAdditions.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                Tilläggsarbeten ({signedAdditions.length})
              </span>
              <span className="font-medium text-emerald-700 tabular-nums">
                + {formatCurrency(additionsSum)}
              </span>
            </div>
          )}

          {/* Avgående */}
          {signedRemovals.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-700">
                Avgående ({signedRemovals.length})
              </span>
              <span className="font-medium text-red-700 tabular-nums">
                − {formatCurrency(removalsSum)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-200 flex items-baseline justify-between">
          <span className="text-sm font-semibold text-slate-700">Totalsumma</span>
          <span className="text-lg font-bold text-slate-900 tabular-nums">
            {formatCurrency(data.totalInclVat)}
          </span>
        </div>
      </div>

      {/* CTA — Skicka faktura */}
      <button
        onClick={onSendInvoice}
        disabled={sending}
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-700 hover:bg-primary-800 disabled:bg-primary-700 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-sm transition-colors"
      >
        {sending ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Skapar faktura…
          </>
        ) : (
          <>
            <Send className="w-4 h-4" />
            Skicka faktura till {customerName}
          </>
        )}
      </button>

      {/* Ghost — Redigera */}
      <button
        onClick={() =>
          onShowToast(
            'Redigera direkt i invoice-vyn efter du klickat "Skicka faktura"',
            'info',
          )
        }
        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-medium transition-colors"
      >
        <Edit3 className="w-4 h-4" />
        Redigera fakturan
      </button>
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────
// Validation-error dialog (pre-flight-fail från TD-27)
// Visas när create-final-invoice POST returnerar 400 med fields-array.
// ─────────────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  business_name: 'Företagsnamn',
  org_number: 'Org.nummer',
  'betalmottagare (bankgiro/plusgiro/bankkonto)':
    'Betalmottagare (bankgiro, plusgiro eller bankkonto)',
}

function ValidationErrorDialog({
  message,
  fields,
  onClose,
}: {
  message: string
  fields: string[]
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-slate-900 mb-1">
              Innan du kan skicka fakturan
            </h3>
            <p className="text-sm text-slate-600">
              Företagsinställningarna saknar uppgifter som krävs för en
              giltig fakturahandling.
            </p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mb-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
            Behöver fyllas i
          </div>
          <ul className="space-y-1.5">
            {fields.map(field => (
              <li key={field} className="flex items-start gap-2 text-sm text-slate-700">
                <span className="text-amber-600 flex-shrink-0 mt-0.5">•</span>
                <span>{FIELD_LABELS[field] || field}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2">
          <Link
            href="/dashboard/settings"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white text-sm font-semibold transition-colors"
          >
            Gå till inställningar
          </Link>
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-sm font-medium transition-colors"
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  )
}
