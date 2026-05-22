'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Loader2,
  Lock,
  RefreshCw,
} from 'lucide-react'
import { useCurrentUser } from '@/lib/CurrentUserContext'

/**
 * ProjectQuoteSpec (Etapp 3.2, 2026-05-22).
 *
 * Minimal läsbar offert-spec i projektet — "vad lovade offerten?".
 * Hämtar via /api/projects/[id]/quote-context (helpern
 * getProjectQuoteContext).
 *
 * Designkontrakt:
 * - Self-contained: bara projectId in, UI ut
 * - Flyttbar — överlever Etapp 4 meny-redesign
 * - has_quote=false → tomt-meddelande, ingen krasch
 * - Visar arbete + material som separata tabeller + textblock + PDF-länk
 * - Återanvänder INTE 'Visa offert'-knappen (den finns kvar i projekt-
 *   headern som genväg till full offert-redigering — kompletterar denna)
 *
 * Rollmodell (Andreas 2026-05-22 — samma princip som intern timkostnad):
 * - ALLA i projektet: beskrivning + antal + enhet (arbetsinstruktion)
 * - OWNER/ADMIN: dessutom unit_price + total + summor (pris-info)
 * - Icke-OWA: pris-kolumner streckade med Lock-ikon, beskrivningar synliga
 * - Textblock: synligt för alla (vad kunden lovades, inte intern marginal)
 */

interface QuoteLineRow {
  id: string
  description: string
  quantity: number
  unit: string
  unit_price: number
  total: number
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  article_number: string | null
  item_type: 'item' | 'heading' | 'text' | 'subtotal' | 'discount'
}

interface ProjectQuoteContext {
  has_quote: boolean
  quote_id: string | null
  quote_number: string | null
  status: string | null
  total_kr: number
  vat_rate: number
  vat_amount: number
  rader: {
    arbete: QuoteLineRow[]
    material: QuoteLineRow[]
    rubriker_och_texter: QuoteLineRow[]
  }
  textblock: {
    introduktion: string | null
    avslutning: string | null
    ej_inkluderat: string | null
    ata_villkor: string | null
    betalningsvillkor: string | null
    villkor: string | null
  }
  meta: {
    valid_until: string | null
    sent_at: string | null
    accepted_at: string | null
    declined_at: string | null
    project_address: string | null
  }
  dokument: {
    pdf_url: string
  } | null
  legacy: {
    using_jsonb_fallback: boolean
  }
  /** Server-side stripping: API:t har satt pris-fält till 0 för icke-OWA.
      Komponenten döljer pris-kolumner när detta är true OAVSETT vad
      isOwnerOrAdmin säger lokalt (server är källan till sanning). */
  prices_redacted?: boolean
}

interface ProjectQuoteSpecProps {
  projectId: string
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatQty(n: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(n)
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Utkast', cls: 'bg-slate-100 text-slate-600' },
  sent: { label: 'Skickad', cls: 'bg-blue-100 text-blue-700' },
  opened: { label: 'Öppnad', cls: 'bg-amber-100 text-amber-700' },
  accepted: { label: 'Accepterad', cls: 'bg-emerald-100 text-emerald-700' },
  declined: { label: 'Avböjd', cls: 'bg-red-100 text-red-700' },
  expired: { label: 'Utgången', cls: 'bg-slate-100 text-slate-500' },
}

export function ProjectQuoteSpec({ projectId }: ProjectQuoteSpecProps) {
  const { isOwnerOrAdmin } = useCurrentUser()
  const [data, setData] = useState<ProjectQuoteContext | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}/quote-context`)
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          throw new Error(j?.error || `HTTP ${res.status}`)
        }
        const payload = (await res.json()) as ProjectQuoteContext
        setData(payload)
      } catch (err: any) {
        setError(err.message || 'Kunde inte hämta offert-data')
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [projectId],
  )

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-400 animate-spin" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center">
        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-sm text-slate-500">{error || 'Kunde inte ladda offert-data'}</p>
        <button
          type="button"
          onClick={() => fetchData()}
          className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-primary-700 hover:text-primary-600"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Försök igen
        </button>
      </div>
    )
  }

  // has_quote=false → projektet skapades utan offert
  if (!data.has_quote) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
        <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
        <h2 className="font-semibold text-slate-700 mb-1">Projektet skapades utan offert</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">
          Det finns ingen offert kopplad till detta projekt. Eventuell beskrivning eller
          arbets-omfattning ligger direkt på projektet eller i kommunikation med kunden.
        </p>
      </div>
    )
  }

  const statusInfo = data.status ? STATUS_LABELS[data.status] : null
  const totalArbete = data.rader.arbete.reduce((s, r) => s + r.total, 0)
  const totalMaterial = data.rader.material.reduce((s, r) => s + r.total, 0)

  // Server-side stripping vinner. Om server redacted priser → dölj
  // OAVSETT isOwnerOrAdmin (defense-in-depth, undvik client-server drift).
  const showPrices = isOwnerOrAdmin && !data.prices_redacted

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Vad offerten lovade
            </h2>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900">
                {data.quote_number ? `Offert ${data.quote_number}` : 'Offert'}
              </h3>
              {statusInfo && (
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${statusInfo.cls}`}>
                  {statusInfo.label}
                </span>
              )}
              {data.legacy.using_jsonb_fallback && (
                <span className="text-[10px] text-slate-400 italic" title="Offerten lagras i legacy-format">
                  (legacy)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {data.quote_id && (
              <Link
                href={`/dashboard/quotes/${data.quote_id}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Öppna full offert
              </Link>
            )}
            {data.dokument && (
              <a
                href={data.dokument.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                PDF
              </a>
            )}
            <button
              type="button"
              onClick={() => fetchData(true)}
              disabled={refreshing}
              title="Uppdatera"
              className="text-slate-400 hover:text-slate-600 disabled:opacity-50 p-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Moms-uppdelning enligt TD-69 (Andreas 2026-05-22):
            quote.total i databasen är INKL. moms. Netto = total - moms.
            Visar både netto (vad företaget räknar på) och inkl-moms
            (vad kunden betalar) för att matcha offertens egen summering. */}
        {showPrices && (() => {
          const totalInklMoms = data.total_kr
          const momsAmount = data.vat_amount
          const netto = totalInklMoms - momsAmount
          const vatPct = Math.round(data.vat_rate || 25)
          return (
            <div className="mt-4 flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm border-t border-slate-100 pt-3">
              <Stat label="Netto" value={formatKr(netto)} />
              <Stat label={`Moms ${vatPct}%`} value={formatKr(momsAmount)} />
              <Stat label="Totalt inkl. moms" value={formatKr(totalInklMoms)} bold />
            </div>
          )
        })()}

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {data.meta.accepted_at && (
            <Stat label="Accepterad" value={new Date(data.meta.accepted_at).toLocaleDateString('sv-SE')} />
          )}
          {data.meta.sent_at && !data.meta.accepted_at && (
            <Stat label="Skickad" value={new Date(data.meta.sent_at).toLocaleDateString('sv-SE')} />
          )}
          {data.meta.valid_until && (
            <Stat label="Gäller till" value={new Date(data.meta.valid_until).toLocaleDateString('sv-SE')} />
          )}
        </div>
      </section>

      {/* Textblock — introduktion */}
      {data.textblock.introduktion && (
        <TextSection title="Introduktion" content={data.textblock.introduktion} />
      )}

      {/* Arbete-rader */}
      <LinesSection
        title="Arbete"
        rows={data.rader.arbete}
        total={totalArbete}
        emptyMessage="Inga arbets-rader registrerade på offerten."
        showPrices={showPrices}
      />

      {/* Material-rader */}
      <LinesSection
        title="Material"
        rows={data.rader.material}
        total={totalMaterial}
        emptyMessage="Inga material-rader registrerade på offerten."
        showPrices={showPrices}
      />

      {/* Textblock — ej inkluderat */}
      {data.textblock.ej_inkluderat && (
        <TextSection title="Ej inkluderat" content={data.textblock.ej_inkluderat} />
      )}

      {/* Textblock — ÄTA-villkor */}
      {data.textblock.ata_villkor && (
        <TextSection title="ÄTA-villkor" content={data.textblock.ata_villkor} />
      )}

      {/* Textblock — egen villkor-text */}
      {data.textblock.villkor && (
        <TextSection title="Villkor" content={data.textblock.villkor} />
      )}

      {/* Etapp 3.4: Material som referens — för nu räcker det med att
          material-raderna visas ovan. Etapp 4 kopplar till project_material. */}
    </div>
  )
}

function Stat({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`text-sm tabular-nums mt-0.5 ${bold ? 'font-bold text-slate-900' : 'font-semibold text-slate-900'}`}>
        {value}
      </p>
    </div>
  )
}

function TextSection({ title, content }: { title: string; content: string }) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
        {title}
      </h3>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
        {content}
      </p>
    </section>
  )
}

function LinesSection({
  title,
  rows,
  total,
  emptyMessage,
  showPrices,
}: {
  title: string
  rows: QuoteLineRow[]
  total: number
  emptyMessage: string
  /** Owner/admin ser priser. Andra ser bara beskrivning + antal + enhet. */
  showPrices: boolean
}) {
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
          {title}
        </h3>
        {rows.length > 0 && showPrices && (
          <span className="text-sm font-semibold text-slate-900 tabular-nums">
            {formatKr(total)}
          </span>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-400 italic">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto -mx-5 sm:-mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-5 sm:px-6 pb-2">Beskrivning</th>
                <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 pb-2 w-20">Antal</th>
                <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 pb-2 w-16">Enhet</th>
                {showPrices && (
                  <>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-2 pb-2 w-24">À-pris</th>
                    <th className="text-right text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-5 sm:px-6 pb-2 w-28">Summa</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-slate-50 last:border-b-0">
                  <td className="px-5 sm:px-6 py-2 text-slate-700">
                    {r.description}
                    {r.article_number && (
                      <span className="text-[10px] text-slate-400 ml-2">#{r.article_number}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{formatQty(r.quantity)}</td>
                  <td className="px-2 py-2 text-slate-500">{r.unit}</td>
                  {showPrices && (
                    <>
                      <td className="px-2 py-2 text-right text-slate-600 tabular-nums">{formatKr(r.unit_price)}</td>
                      <td className="px-5 sm:px-6 py-2 text-right text-slate-900 tabular-nums font-medium">{formatKr(r.total)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!showPrices && (
            <div className="px-5 sm:px-6 pt-3 flex items-center gap-1.5 text-[11px] text-slate-400">
              <Lock className="w-3 h-3" />
              <span>Priser visas endast för ägare och administratörer</span>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
