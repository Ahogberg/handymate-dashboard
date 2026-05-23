'use client'

import { Clock, TrendingUp, Info } from 'lucide-react'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'

/**
 * IntaktCard (Etapp 4b steg 2, 2026-05-23).
 *
 * Detaljerad intäkt-vy med moms-uppdelning enligt TD-69 (Andreas spec
 * 2026-05-22). Två kolumner — netto (vad företaget räknar på) +
 * inkl. moms (vad kunden betalar).
 *
 * Designprincip: netto är primär (teal-färgad rubrik), inkl moms är
 * sekundär (slate-färgad). Moms 25% visas som tydlig genomgångspost-rad.
 */

interface IntaktCardProps {
  economics: ProjectEconomics
  /** VAT-rate från offerten (om finns). Default 25% (svensk standard). */
  vatRate?: number
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

export function IntaktCard({ economics, vatRate = 25 }: IntaktCardProps) {
  const { intakter, meta } = economics

  const offertNetto = intakter.budget_amount
  const ataSignerat = intakter.ata_signerat_kr
  const ataPending = intakter.ata_pending_kr
  const totalNetto = intakter.forvantad_intakt_kr

  const vatMultiplier = 1 + vatRate / 100
  const offertInkl = Math.round(offertNetto * vatMultiplier)
  const ataInkl = Math.round(ataSignerat * vatMultiplier)
  const totalInkl = Math.round(totalNetto * vatMultiplier)
  const moms = totalInkl - totalNetto

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <TrendingUp className="w-3 h-3" />
          Intäkt
        </span>
        <span className="text-[11px] text-slate-400">
          baserat på offert + signerade ÄTA
        </span>
      </div>

      {/* Column headers */}
      <div className="mt-4 grid grid-cols-[1fr_120px_120px] gap-3 pb-2 border-b border-slate-200">
        <div />
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-primary-700">
            Netto
          </div>
          <div className="text-[10px] text-primary-700 mt-0.5">räknas på</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Inkl moms
          </div>
          <div className="text-[10px] text-slate-400 mt-0.5">kunden betalar</div>
        </div>
      </div>

      {/* Lines */}
      <IntaktRow label="Offert" netto={offertNetto} inkl={offertInkl} />
      {meta.ata_count > 0 && (
        <IntaktRow
          label={
            <span>
              ÄTA-tillägg{' '}
              <span className="text-slate-400 font-normal">
                ({meta.ata_count} st, signerade)
              </span>
            </span>
          }
          netto={ataSignerat}
          inkl={ataInkl}
          positive
        />
      )}

      {/* Total */}
      <div className="mt-1.5 pt-2.5 border-t-2 border-slate-800 grid grid-cols-[1fr_120px_120px] gap-3 items-baseline">
        <div className="text-sm font-bold text-slate-900">Totalt</div>
        <div className="text-right text-xl font-bold text-primary-700 tabular-nums tracking-tight">
          {formatKr(totalNetto)}
        </div>
        <div className="text-right text-base font-semibold text-slate-700 tabular-nums">
          {formatKr(totalInkl)}
        </div>
      </div>

      {/* Moms breakdown */}
      <div className="mt-1.5 grid grid-cols-[1fr_120px_120px] gap-3 text-[11px] text-slate-500">
        <div className="inline-flex items-center gap-1">
          <Info className="w-3 h-3 text-slate-400" />
          Moms {vatRate}% (genomgångspost)
        </div>
        <div className="text-right tabular-nums">—</div>
        <div className="text-right tabular-nums">+{formatKr(moms)}</div>
      </div>

      {/* Pending ÄTA notice */}
      {ataPending > 0 && (
        <div className="mt-3.5 px-3 py-2.5 rounded-lg bg-amber-50 border border-amber-300 flex items-start gap-2">
          <Clock className="w-3.5 h-3.5 text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-amber-900 leading-relaxed">
            <strong>+{formatKr(ataPending)}</strong> i ÄTA väntar på signering — räknas
            inte i total intäkt ännu.
          </div>
        </div>
      )}
    </div>
  )
}

function IntaktRow({
  label,
  netto,
  inkl,
  positive,
}: {
  label: React.ReactNode
  netto: number
  inkl: number
  positive?: boolean
}) {
  return (
    <div className="grid grid-cols-[1fr_120px_120px] gap-3 py-3 items-baseline border-b border-dashed border-slate-200">
      <div className="text-sm text-slate-800">{label}</div>
      <div
        className={`text-right text-sm font-semibold tabular-nums ${
          positive ? 'text-emerald-700' : 'text-slate-800'
        }`}
      >
        {positive ? '+' : ''}
        {formatKr(netto)}
      </div>
      <div className="text-right text-[13px] text-slate-500 tabular-nums">
        {positive ? '+' : ''}
        {formatKr(inkl)}
      </div>
    </div>
  )
}
