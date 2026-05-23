'use client'

import { Receipt, Check } from 'lucide-react'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'

/**
 * FaktureringsstatusCard (Etapp 4b steg 2, 2026-05-23).
 *
 * Stacked bar med betalt / fakturerat-ej-betalt / kvar att fakturera.
 * Helper-mappning från Etapp 1 (invoice.project_id-koppling):
 * - intakter.betalt_kr → grön del
 * - intakter.fakturerat_kr - betalt_kr → amber del (obetalda fakturor)
 * - forvantad_intakt - fakturerat → slate-200 del (kvar)
 *
 * Visar både netto- och inkl-moms-värden i raderna (TD-69-styrkan).
 */

interface FaktureringsstatusCardProps {
  economics: ProjectEconomics
  /** VAT-rate. Default 25%. */
  vatRate?: number
  onInvoiceProject?: () => void
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

export function FaktureringsstatusCard({
  economics,
  vatRate = 25,
  onInvoiceProject,
}: FaktureringsstatusCardProps) {
  const { intakter } = economics
  const totalBudget = intakter.forvantad_intakt_kr
  const fakturerat = intakter.fakturerat_kr
  const betalt = intakter.betalt_kr
  const obetalt = Math.max(fakturerat - betalt, 0)
  const kvar = Math.max(totalBudget - fakturerat, 0)

  const vatMultiplier = 1 + vatRate / 100
  const allDoneAndPaid =
    totalBudget > 0 && betalt >= totalBudget

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        <Receipt className="w-3 h-3" />
        Faktureringsstatus
      </span>

      {/* Stacked bar */}
      <div className="mt-4">
        <div className="h-3.5 bg-slate-100 rounded-full overflow-hidden flex">
          {betalt > 0 && totalBudget > 0 && (
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${(betalt / totalBudget) * 100}%` }}
            />
          )}
          {obetalt > 0 && totalBudget > 0 && (
            <div
              className="h-full bg-amber-500"
              style={{ width: `${(obetalt / totalBudget) * 100}%` }}
            />
          )}
        </div>
        <div className="flex justify-between mt-1.5 text-[11px] text-slate-500">
          <span>0</span>
          <span className="font-semibold text-slate-700 tabular-nums">
            {formatKr(totalBudget)} netto
          </span>
        </div>
      </div>

      {/* Legend rows */}
      <div className="mt-4 flex flex-col gap-2.5">
        <FaktRow
          colorClass="bg-emerald-500"
          label="Betalt"
          netto={betalt}
          inkl={Math.round(betalt * vatMultiplier)}
          p={totalBudget > 0 ? Math.round((betalt / totalBudget) * 100) : 0}
        />
        <FaktRow
          colorClass="bg-amber-500"
          label="Fakturerat ej betalt"
          netto={obetalt}
          inkl={Math.round(obetalt * vatMultiplier)}
          p={totalBudget > 0 ? Math.round((obetalt / totalBudget) * 100) : 0}
        />
        <FaktRow
          colorClass="bg-slate-200"
          label="Kvar att fakturera"
          netto={kvar}
          inkl={Math.round(kvar * vatMultiplier)}
          p={totalBudget > 0 ? Math.round((kvar / totalBudget) * 100) : 0}
        />
      </div>

      {/* CTA: Fakturera projekt — Etapp 2.3 återinfört */}
      {onInvoiceProject && kvar > 0 && (
        <button
          type="button"
          onClick={onInvoiceProject}
          className="mt-3.5 w-full inline-flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 hover:bg-primary-600 text-white font-bold rounded-xl transition-colors"
        >
          <Receipt className="w-4 h-4" />
          Fakturera projekt ({formatKr(kvar)} netto kvar)
        </button>
      )}

      {/* Allt klart-tillstånd */}
      {allDoneAndPaid && (
        <div className="mt-3.5 px-3 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2">
          <Check className="w-3.5 h-3.5 text-emerald-700 flex-shrink-0" />
          <span className="text-xs text-emerald-700 font-semibold">
            Allt fakturerat och betalt
          </span>
        </div>
      )}
    </div>
  )
}

function FaktRow({
  colorClass,
  label,
  netto,
  inkl,
  p,
}: {
  colorClass: string
  label: string
  netto: number
  inkl: number
  p: number
}) {
  return (
    <div className="flex items-baseline gap-2.5">
      <span className={`w-2.5 h-2.5 rounded-sm ${colorClass} flex-shrink-0 mt-1`} />
      <span className="flex-1 text-sm text-slate-700 font-medium">{label}</span>
      <div className="text-right">
        <div className="text-sm font-bold text-slate-900 tabular-nums">
          {formatKr(netto)}{' '}
          <span className="text-[10px] text-slate-400 font-medium">netto</span>
        </div>
        <div className="text-[11px] text-slate-500 tabular-nums">
          {formatKr(inkl)} inkl · {p}%
        </div>
      </div>
    </div>
  )
}
