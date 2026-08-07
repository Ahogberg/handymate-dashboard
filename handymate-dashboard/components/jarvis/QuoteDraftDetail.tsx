'use client'

import { PencilRuler } from 'lucide-react'
import type { QuoteSummary } from '@/lib/jarvis/quote-preview-summary'

function formatKr(n: number): string {
  return `${new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(n)} kr`
}

interface QuoteDraftDetailProps {
  summary: QuoteSummary
  /** Villkoren som följer med utkastet — giltighetstid, betalning, mall. */
  conditions?: string[]
  /** Det AI:n föreslår att offerten INTE ska omfatta. */
  notIncluded?: string[]
}

/**
 * Offertutkastet uppfällt i flödet (2026-08-07).
 *
 * ═══ GRÄNSEN, SOM ÄR HELA POÄNGEN ═══
 *
 * **Hemskärmen granskar, sidorna producerar.**
 *
 * Här går att LÄSA varje rad, se ROT-beräkningen och villkoren, och sedan
 * godkänna eller avvisa. Allt som **ändrar dokumentets innehåll** — priser,
 * rader, mall, bilagor — kräver offertverktyget, via en enda högerställd
 * utgång.
 *
 * Det är den gränsen som gör Godkänn till ett löfte: det man läste är exakt
 * det som sparas. Skulle rader gå att ändra här hade kortet och offerten
 * kunnat glida isär igen — samma felklass som B4 rättade i offertflödet.
 *
 * Utgången är medvetet SEKUNDÄR och bär `pencil-ruler`, inte en pennikon:
 * den leder till ett ritbord, inte till ett fält man rättar i förbifarten.
 */
export function QuoteDraftDetail({ summary, conditions, notIncluded }: QuoteDraftDetailProps) {
  if (!summary.ready) return null

  const avdrag = summary.rows.filter(r => r.deduction)

  return (
    <div className="grid md:grid-cols-[1fr_280px] gap-5 mb-3">
      {/* Radtabellen */}
      <div className="min-w-0">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 pb-2 border-b border-slate-200">
          <span>Rad</span>
          <span>Belopp</span>
        </div>

        {summary.lines.map((line, i) => (
          <div
            key={`${line.description}-${i}`}
            className="flex justify-between items-center gap-3 text-sm text-slate-700 py-2.5 border-b border-slate-100"
          >
            <span className="min-w-0">
              {line.description}
              {line.qualifier && <span className="text-slate-400 text-xs"> · {line.qualifier}</span>}
            </span>
            <span className="font-heading font-semibold shrink-0">{formatKr(line.amount)}</span>
          </div>
        ))}

        {/* Avdragsraderna i teal med streckad överram — visuellt skilda från
            arbetet de räknas på, så ingen läser dem som ytterligare en post. */}
        {avdrag.map(r => (
          <div
            key={r.label}
            className="flex justify-between gap-3 text-sm text-primary-700 py-2.5 border-t border-dashed border-slate-200"
          >
            <span>{r.label}</span>
            <span className="font-heading font-semibold shrink-0">−{formatKr(r.amount)}</span>
          </div>
        ))}

        <div className="flex justify-between items-baseline pt-3 border-t border-slate-200">
          <span className="text-sm font-semibold text-slate-900">Kunden betalar</span>
          <span className="font-heading text-2xl font-bold text-slate-900">{formatKr(summary.customerPays)}</span>
        </div>
      </div>

      {/* Villkoren */}
      <div className="flex flex-col gap-2.5 min-w-0">
        {conditions && conditions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {conditions.map(c => (
              <span key={c} className="text-xs font-medium text-slate-700 border border-slate-200 rounded-full px-3 py-1.5">
                {c}
              </span>
            ))}
          </div>
        )}

        {notIncluded && notIncluded.length > 0 && (
          <div>
            <div className="text-[13px] font-semibold text-slate-800 mb-1.5">Ingår inte</div>
            <ul className="m-0 pl-4 text-[13px] text-slate-500 leading-relaxed list-disc space-y-0.5">
              {notIncluded.slice(0, 4).map(n => <li key={n}>{n}</li>)}
            </ul>
          </div>
        )}

        <p className="text-xs text-slate-400 leading-normal m-0">
          Offerten sparas som utkast. Du skickar den när du är nöjd.
        </p>
      </div>
    </div>
  )
}

/** Utgången till offertverktyget — den enda vägen att ändra innehållet. */
export function QuoteToolExit({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="ml-auto inline-flex items-center gap-1.5 h-10 px-4 bg-white border border-slate-300 text-slate-700 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
    >
      <PencilRuler className="w-[15px] h-[15px]" />
      Ändra rader &amp; priser i offertverktyget
    </a>
  )
}
