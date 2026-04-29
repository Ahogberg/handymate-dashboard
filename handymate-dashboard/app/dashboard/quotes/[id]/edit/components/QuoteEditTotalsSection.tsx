'use client'

interface QuoteTotals {
  laborTotal: number
  materialTotal: number
  serviceTotal: number
  subtotal: number
  discountAmount: number
  vat: number
  total: number
  rotDeduction: number
  rotCustomerPays: number
  rutDeduction: number
  rutCustomerPays: number
}

interface QuoteEditTotalsSectionProps {
  totals: QuoteTotals
  vatRate: number
  discountPercent: number
  setDiscountPercent: (n: number) => void
  hasRotItems: boolean
  hasRutItems: boolean
  formatCurrency: (n: number) => string
}

export function QuoteEditTotalsSection({
  totals,
  vatRate,
  discountPercent,
  setDiscountPercent,
  hasRotItems,
  hasRutItems,
  formatCurrency,
}: QuoteEditTotalsSectionProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
        Summering <span className="normal-case font-medium text-slate-400">(exkl. moms)</span>
      </p>

      <div className="space-y-2">
        <Row label="Arbete" value={formatCurrency(totals.laborTotal)} />
        <Row label="Material" value={formatCurrency(totals.materialTotal)} />
        {totals.serviceTotal > 0 && (
          <Row label="Tjänster" value={formatCurrency(totals.serviceTotal)} />
        )}
        <Row label={`Moms ${vatRate}%`} value={formatCurrency(totals.vat)} />

        {discountPercent > 0 && totals.discountAmount > 0 && (
          <div className="flex justify-between items-baseline text-green-700">
            <span className="text-sm font-medium">Rabatt {discountPercent}%</span>
            <span className="font-heading text-sm font-semibold tabular-nums">
              −{formatCurrency(totals.discountAmount)}
            </span>
          </div>
        )}

        {hasRotItems && totals.rotDeduction > 0 && (
          <div className="flex justify-between items-baseline text-primary-700">
            <span className="text-sm font-medium">ROT-avdrag 30%</span>
            <span className="font-heading text-sm font-semibold tabular-nums">
              −{formatCurrency(totals.rotDeduction)}
            </span>
          </div>
        )}

        {hasRutItems && totals.rutDeduction > 0 && (
          <div className="flex justify-between items-baseline text-primary-700">
            <span className="text-sm font-medium">RUT-avdrag 50%</span>
            <span className="font-heading text-sm font-semibold tabular-nums">
              −{formatCurrency(totals.rutDeduction)}
            </span>
          </div>
        )}

        <div className="pt-3 mt-1 border-t border-slate-200 flex justify-between items-baseline">
          <span className="font-heading text-base font-bold text-slate-900 tracking-tight">
            Totalt <span className="text-xs font-medium text-slate-400">inkl. moms</span>
          </span>
          <span className="font-heading text-lg font-bold text-slate-900 tabular-nums tracking-tight">
            {formatCurrency(totals.total)}
          </span>
        </div>
      </div>

      {/* Kund betalar box */}
      {(hasRotItems || hasRutItems) && (totals.rotDeduction > 0 || totals.rutDeduction > 0) && (
        <div className="bg-primary-50 border border-primary-100 rounded-xl px-4 py-3.5 mt-4 flex justify-between items-baseline">
          <span className="text-xs font-semibold uppercase tracking-wider text-primary-700">Kund betalar</span>
          <span className="font-heading text-xl font-bold text-primary-700 tabular-nums tracking-tight">
            {formatCurrency(hasRotItems ? totals.rotCustomerPays : totals.rutCustomerPays)}
          </span>
        </div>
      )}

      {/* Discount input */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-slate-100">
        <span className="text-sm text-slate-500">Rabatt</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={discountPercent}
            onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)}
            className="w-16 px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-900 text-sm text-right tabular-nums bg-white focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
            min={0}
            max={100}
          />
          <span className="text-slate-500 text-sm">%</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm text-slate-900 tabular-nums font-medium">{value}</span>
    </div>
  )
}
