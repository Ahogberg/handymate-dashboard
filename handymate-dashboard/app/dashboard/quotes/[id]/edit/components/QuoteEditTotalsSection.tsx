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
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-6 py-5">
      <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569] mb-4">
        Summering <span className="normal-case">(exkl. moms)</span>
      </div>

      <div className="space-y-1">
        <Row label="Arbete" value={formatCurrency(totals.laborTotal)} />
        <Row label="Material" value={formatCurrency(totals.materialTotal)} />
        {totals.serviceTotal > 0 && (
          <Row label="Tjänster" value={formatCurrency(totals.serviceTotal)} />
        )}
        <Row label={`Moms ${vatRate}%`} value={formatCurrency(totals.vat)} />

        {discountPercent > 0 && totals.discountAmount > 0 && (
          <Row label={`Rabatt ${discountPercent}%`} value={`−${formatCurrency(totals.discountAmount)}`} />
        )}

        {hasRotItems && totals.rotDeduction > 0 && (
          <div className="flex justify-between py-[5px] text-[13px] text-[#0F766E]">
            <span>ROT-avdrag 30%</span>
            <span>−{formatCurrency(totals.rotDeduction)}</span>
          </div>
        )}

        {hasRutItems && totals.rutDeduction > 0 && (
          <div className="flex justify-between py-[5px] text-[13px] text-[#0F766E]">
            <span>RUT-avdrag 50%</span>
            <span>−{formatCurrency(totals.rutDeduction)}</span>
          </div>
        )}

        <div className="flex justify-between border-t border-thin border-[#E2E8F0] mt-2 pt-3 text-[15px] font-medium text-[#1E293B]">
          <span>
            Totalt <span className="text-[11px] font-normal text-gray-400">inkl. moms</span>
          </span>
          <span>{formatCurrency(totals.total)}</span>
        </div>
      </div>

      {/* Kund betalar box */}
      {(hasRotItems || hasRutItems) && (totals.rotDeduction > 0 || totals.rutDeduction > 0) && (
        <div className="bg-[#CCFBF1] rounded-lg px-4 py-3.5 mt-3 flex justify-between items-center">
          <span className="text-[12px] text-[#0F766E]">Kund betalar</span>
          <span className="text-[20px] font-medium text-[#0F766E]">
            {formatCurrency(hasRotItems ? totals.rotCustomerPays : totals.rutCustomerPays)}
          </span>
        </div>
      )}

      {/* Discount input */}
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-thin border-[#E2E8F0]">
        <span className="text-[12px] text-[#94A3B8]">Rabatt</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={discountPercent}
            onChange={e => setDiscountPercent(parseFloat(e.target.value) || 0)}
            className="w-14 px-2 py-1 border-thin border-[#E2E8F0] rounded text-[#1E293B] text-[13px] text-right bg-white focus:outline-none focus:border-[#0F766E]"
            min={0}
            max={100}
          />
          <span className="text-[#94A3B8] text-[13px]">%</span>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-[5px] text-[13px]">
      <span className="text-[#64748B]">{label}</span>
      <span className="text-[#64748B]">{value}</span>
    </div>
  )
}
