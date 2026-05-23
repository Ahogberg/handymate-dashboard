'use client'

import { Hammer, Package, Receipt, ShoppingBag, Plus } from 'lucide-react'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'

/**
 * KostnadCard (Etapp 4b steg 2, 2026-05-23).
 *
 * Detaljerad kostnadsuppdelning: arbete (timrader × intern timkostnad) +
 * material (leverantörsfakturor) + extra (project_cost, manuella poster).
 *
 * Helper-mappning:
 * - kostnader.arbete_kr / arbete_timmar → Arbete-rad
 * - kostnader.material_inkop_kr + meta.supplier_invoice_count → Material-rad
 * - kostnader.extra_kr + meta.extra_cost_count → Extra-rad
 * - kostnader.total_kr → Total
 *
 * arbete_kr=null hanteras: visa "—" och muted (sker när arbetskostnad
 * ej konfigurerad — MarginalCard har separat gate för det totalt).
 */

interface KostnadCardProps {
  economics: ProjectEconomics
  onAddManualCost?: () => void
}

function formatKr(n: number | null | undefined): string {
  if (n == null) return '—'
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatHours(h: number): string {
  return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 }).format(h)
}

export function KostnadCard({ economics, onAddManualCost }: KostnadCardProps) {
  const { kostnader, meta } = economics
  const total = kostnader.total_kr
  const isEmpty = total === 0

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-1">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <ShoppingBag className="w-3 h-3" />
          Kostnad
        </span>
        {onAddManualCost && (
          <button
            type="button"
            onClick={onAddManualCost}
            className="inline-flex items-center gap-1 text-xs font-bold text-primary-700 hover:text-primary-600"
          >
            <Plus className="w-3 h-3" /> Manuell kostnad
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500 mb-3.5">
        Netto, exkl moms · arbetstid räknas mot intern timkostnad
      </p>

      <KostnadRow
        icon={<Hammer className="w-4 h-4 text-slate-500" />}
        label="Arbete"
        sub={
          kostnader.arbete_kr != null && kostnader.arbete_timmar > 0
            ? `${formatHours(kostnader.arbete_timmar)} h registrerade`
            : 'inga timmar registrerade än'
        }
        value={kostnader.arbete_kr}
        muted={kostnader.arbete_kr == null || kostnader.arbete_kr === 0}
      />
      <KostnadRow
        icon={<Package className="w-4 h-4 text-slate-500" />}
        label="Material"
        sub={
          meta.supplier_invoice_count > 0
            ? `${meta.supplier_invoice_count} leverantörsfaktur${meta.supplier_invoice_count === 1 ? 'a' : 'or'}`
            : 'inga leverantörsfakturor'
        }
        value={kostnader.material_inkop_kr}
        muted={isEmpty || kostnader.material_inkop_kr === 0}
      />
      <KostnadRow
        icon={<Receipt className="w-4 h-4 text-slate-500" />}
        label="Manuella kostnader"
        sub={
          meta.extra_cost_count > 0
            ? `${meta.extra_cost_count} poster (${Object.entries(kostnader.extra_per_kategori)
                .map(([k, v]) => k)
                .join(', ')})`
            : 'inga registrerade'
        }
        value={kostnader.extra_kr}
        muted={isEmpty || kostnader.extra_kr === 0}
      />

      <div className="mt-1.5 pt-3 border-t-2 border-slate-800 flex items-baseline justify-between">
        <div className="text-sm font-bold text-slate-900">Total kostnad</div>
        <div
          className={`text-xl font-bold tabular-nums tracking-tight ${
            total == null || isEmpty ? 'text-slate-400' : 'text-slate-900'
          }`}
        >
          {total == null ? '—' : isEmpty ? '—' : formatKr(total)}
        </div>
      </div>
    </div>
  )
}

function KostnadRow({
  icon,
  label,
  sub,
  value,
  muted,
}: {
  icon: React.ReactNode
  label: string
  sub: string
  value: number | null
  muted?: boolean
}) {
  return (
    <div
      className={`flex items-center gap-3 py-2.5 border-b border-dashed border-slate-200 ${
        muted ? 'opacity-50' : ''
      }`}
    >
      <span className="w-8 h-8 rounded-lg bg-slate-100 inline-flex items-center justify-center flex-shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
      </div>
      <div className="text-sm font-semibold text-slate-900 tabular-nums">
        {value === null || value === 0 ? '—' : formatKr(value)}
      </div>
    </div>
  )
}
