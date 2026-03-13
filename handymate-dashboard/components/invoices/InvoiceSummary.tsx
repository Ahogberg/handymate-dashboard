'use client'

import { InvoiceTotals } from '@/lib/types/invoice'

interface InvoiceSummaryProps {
  totals: InvoiceTotals
  vatRate: number
  rotRutType?: string
  personalNumber?: string
  propertyDesignation?: string
  onFieldChange?: (field: string, value: string) => void
}

export default function InvoiceSummary({
  totals,
  vatRate,
  rotRutType,
  personalNumber,
  propertyDesignation,
  onFieldChange,
}: InvoiceSummaryProps) {
  const hasRotRut = rotRutType === 'rot' || rotRutType === 'rut'
  const deduction = rotRutType === 'rot' ? totals.rotDeduction : totals.rutDeduction
  const customerPays = rotRutType === 'rot' ? totals.rotCustomerPays : totals.rutCustomerPays

  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-6 py-5">
      <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Summering</div>

      <div className="space-y-1">
        <div className="flex justify-between py-[5px] text-[13px]">
          <span className="text-[#64748B]">Delsumma</span>
          <span className="text-[#64748B]">{totals.subtotal.toLocaleString('sv-SE')} kr</span>
        </div>

        {totals.discountAmount > 0 && (
          <div className="flex justify-between py-[5px] text-[13px]">
            <span className="text-[#64748B]">Rabatt</span>
            <span className="text-[#64748B]">−{totals.discountAmount.toLocaleString('sv-SE')} kr</span>
          </div>
        )}

        <div className="flex justify-between py-[5px] text-[13px]">
          <span className="text-[#64748B]">Moms {vatRate}%</span>
          <span className="text-[#64748B]">{totals.vat.toLocaleString('sv-SE')} kr</span>
        </div>

        {/* ROT/RUT line */}
        {hasRotRut && deduction > 0 && (
          <div className="flex justify-between py-[5px] text-[13px] text-[#0F766E]">
            <span>{rotRutType!.toUpperCase()}-avdrag ({rotRutType === 'rot' ? '30%' : '50%'})</span>
            <span>−{deduction.toLocaleString('sv-SE')} kr</span>
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between border-t border-thin border-[#E2E8F0] mt-2 pt-3 text-[15px] font-medium text-[#1E293B]">
          <span>Totalt</span>
          <span>{totals.total.toLocaleString('sv-SE')} kr</span>
        </div>
      </div>

      {/* Kund betalar box */}
      {hasRotRut && deduction > 0 && (
        <div className="bg-[#CCFBF1] rounded-lg px-4 py-3.5 mt-3 flex justify-between items-center">
          <span className="text-[12px] text-[#0F766E]">Kund betalar</span>
          <span className="text-[20px] font-medium text-[#0F766E]">
            {customerPays.toLocaleString('sv-SE')} kr
          </span>
        </div>
      )}

      {/* ROT/RUT required fields */}
      {hasRotRut && onFieldChange && (
        <div className="mt-4 pt-4 border-t border-thin border-[#E2E8F0] space-y-3">
          <div>
            <label className="block text-[12px] text-[#64748B] mb-1">Personnummer</label>
            <input
              type="text"
              value={personalNumber || ''}
              onChange={(e) => onFieldChange('personalNumber', e.target.value)}
              placeholder="YYYYMMDD-XXXX"
              className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
            />
          </div>
          {rotRutType === 'rot' && (
            <div>
              <label className="block text-[12px] text-[#64748B] mb-1">Fastighetsbeteckning</label>
              <input
                type="text"
                value={propertyDesignation || ''}
                onChange={(e) => onFieldChange('propertyDesignation', e.target.value)}
                placeholder="T.ex. Stockholm Söder 1:23"
                className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
