'use client'

import { formatCurrency } from '../helpers'
import type { Quote } from '../types'

interface QuoteSummaryCardProps {
  quote: Quote
}

/**
 * Total-kort i höger sidopanel. Sticky vid scroll på desktop.
 * Total i Space Grotesk + bold; raderna med subtle dividers.
 */
export function QuoteSummaryCard({ quote }: QuoteSummaryCardProps) {
  const hasNewRotRut = (quote.rot_work_cost && quote.rot_work_cost > 0) || (quote.rut_work_cost && quote.rut_work_cost > 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 lg:sticky lg:top-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Summering</p>

      <div className="space-y-3 text-sm">
        <Row label="Arbete" value={formatCurrency(quote.labor_total)} />
        <Row label="Material" value={formatCurrency(quote.material_total)} />

        <div className="pt-3 border-t border-slate-100">
          <Row label="Netto (exkl. moms)" value={formatCurrency(quote.subtotal)} />
        </div>

        {quote.discount_amount > 0 && (
          <div className="flex justify-between items-baseline text-green-700">
            <span className="text-sm font-medium">Rabatt ({quote.discount_percent}%)</span>
            <span className="font-heading text-sm font-semibold tabular-nums">-{formatCurrency(quote.discount_amount)}</span>
          </div>
        )}

        <Row label={`Moms (${quote.vat_rate}%)`} value={formatCurrency(quote.vat_amount)} />

        <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
          <span className="font-heading text-base font-bold text-slate-900 tracking-tight">Totalt inkl. moms</span>
          <span className="font-heading text-lg font-bold text-slate-900 tabular-nums tracking-tight">
            {formatCurrency(quote.total)}
          </span>
        </div>

        {/* New ROT/RUT display with structured fields */}
        {hasNewRotRut ? (
          <>
            {quote.rot_work_cost && quote.rot_work_cost > 0 && (
              <RotRutBlock
                label="ROT-avdrag"
                workCost={quote.rot_work_cost}
                deduction={quote.rot_deduction || 0}
                customerPays={quote.rot_customer_pays || 0}
                workLabel="Arbetskostnad (ROT)"
                deductionLabel="ROT-avdrag (30%)"
                tone="green"
              />
            )}
            {quote.rut_work_cost && quote.rut_work_cost > 0 && (
              <RotRutBlock
                label="RUT-avdrag"
                workCost={quote.rut_work_cost}
                deduction={quote.rut_deduction || 0}
                customerPays={quote.rut_customer_pays || 0}
                workLabel="Arbetskostnad (RUT)"
                deductionLabel="RUT-avdrag (50%)"
                tone="amber"
              />
            )}
          </>
        ) : (
          /* Legacy ROT/RUT display */
          quote.rot_rut_type && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
              <div className="flex justify-between text-sm mb-1 text-green-700">
                <span>{quote.rot_rut_type.toUpperCase()}-avdrag</span>
                <span className="tabular-nums font-medium">-{formatCurrency(quote.rot_rut_deduction)}</span>
              </div>
              <div className="border-t border-green-200 pt-2 mt-2 flex justify-between items-baseline">
                <span className="font-heading text-sm font-bold text-slate-900 tracking-tight">Kund betalar</span>
                <span className="font-heading text-base font-bold text-green-700 tabular-nums tracking-tight">
                  {formatCurrency(quote.customer_pays)}
                </span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-slate-500">{label}</span>
      <span className="text-slate-900 tabular-nums font-medium">{value}</span>
    </div>
  )
}

function RotRutBlock({
  label,
  workCost,
  deduction,
  customerPays,
  workLabel,
  deductionLabel,
  tone,
}: {
  label: string
  workCost: number
  deduction: number
  customerPays: number
  workLabel: string
  deductionLabel: string
  tone: 'green' | 'amber'
}) {
  const styles =
    tone === 'green'
      ? { bg: 'bg-green-50 border-green-200', accent: 'text-green-700', divider: 'border-green-200' }
      : { bg: 'bg-amber-50 border-amber-200', accent: 'text-amber-700', divider: 'border-amber-200' }

  return (
    <div className={`rounded-xl border p-4 mt-4 ${styles.bg}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-wider mb-2 ${styles.accent}`}>{label}</p>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-600">{workLabel}</span>
          <span className="text-slate-900 tabular-nums">{formatCurrency(workCost)}</span>
        </div>
        <div className={`flex justify-between ${styles.accent}`}>
          <span>{deductionLabel}</span>
          <span className="tabular-nums font-medium">-{formatCurrency(deduction)}</span>
        </div>
        <div className={`pt-2 mt-1 border-t ${styles.divider} flex justify-between items-baseline`}>
          <span className="font-heading text-sm font-bold text-slate-900 tracking-tight">Kund betalar</span>
          <span className={`font-heading text-base font-bold tabular-nums tracking-tight ${styles.accent}`}>
            {formatCurrency(customerPays)}
          </span>
        </div>
      </div>
    </div>
  )
}
