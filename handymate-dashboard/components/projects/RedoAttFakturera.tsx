'use client'

import { formatSEK } from '@/lib/format-price'
import type { Fakturaberedskap, FakturaberedskapDel } from '@/lib/projects/fakturaberedskap'

/**
 * "Redo att fakturera?" (Etapp D2, design-integrationsplanen 2026-08-17) —
 * mockupens högerrails-panel i radform, monterad i vänsterkolumnen (som ÄR
 * vår layouts rail-motsvarighet) direkt under "Att göra".
 *
 * Renderar SAMMA beraknaFakturaberedskap-objekt som twin-stripens
 * Fakturaberedskap-kort — en beräkning per render, delad via props.
 * null-aggregat (inget underlag alls) → ingen panel; strip-kortet bär då
 * det ärliga "Underlag saknas".
 *
 * Binära delar (tidrapport, underlag) visas som Klar/Saknas — mockupens
 * "5 av 6" för tidrapporter går inte att räkna ärligt (vi vet bara om
 * gårdagens rapport saknas, inte hur många som "borde" finnas).
 *
 * Fotraden är NEUTRAL: auto-fakturering körs som del av projektstängningen
 * (lib/projects/complete-project.ts) men sidan har ingen billig, redan
 * hämtad källa som bevisar att den är aktiv för businessen — då lovar vi
 * inget ("aldrig 'Karin förbereder automatiskt' utan bevis").
 */

interface RedoAttFaktureraProps {
  beredskap: Fakturaberedskap | null
  /** Ofakturerat belopp — null utan see_financials; kr visas bara med behörighet. */
  uninvoicedKr: number | null
}

function delVarde(del: FakturaberedskapDel, uninvoicedKr: number | null): React.ReactNode {
  const klar = del.done >= del.total
  if (del.total === 1) {
    // Binär del — Klar/Saknas i klarspråk istället för "1 av 1".
    if (del.key === 'underlag' && klar && uninvoicedKr != null && uninvoicedKr > 0) {
      return <span className="tabular-nums font-semibold text-emerald-700">{formatSEK(uninvoicedKr)}</span>
    }
    return klar ? (
      <span className="font-semibold text-emerald-700">Klar</span>
    ) : (
      <span className="font-semibold text-amber-700">Saknas</span>
    )
  }
  return (
    <span className={`tabular-nums font-semibold ${klar ? 'text-emerald-700' : 'text-amber-700'}`}>
      {del.done} av {del.total}
    </span>
  )
}

export function RedoAttFakturera({ beredskap, uninvoicedKr }: RedoAttFaktureraProps) {
  if (!beredskap) return null

  return (
    <div className="bg-white border border-[#E2E8F0] rounded-card p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-[15px] font-semibold text-slate-900">Redo att fakturera?</h2>
        <span className="font-heading text-[15px] font-semibold tabular-nums text-primary-700">
          {beredskap.pct}%
        </span>
      </div>

      <div className="flex flex-col gap-2 text-sm text-slate-700">
        {beredskap.delar.map(del => (
          <div key={del.key} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate">{del.label}</span>
            {delVarde(del, uninvoicedKr)}
          </div>
        ))}
      </div>

      <p className="m-0 mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500 leading-relaxed">
        Komplett underlag gör fakturan klar att skicka.
      </p>
    </div>
  )
}

export default RedoAttFakturera
