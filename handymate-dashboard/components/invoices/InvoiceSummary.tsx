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
  const workCost = rotRutType === 'rot' ? totals.rotWorkCost : totals.rutWorkCost

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wider">Summering</h3>

      <div className="space-y-2.5">
        {/* Labor / Material breakdown */}
        {(totals.laborTotal > 0 || totals.materialTotal > 0) && (
          <>
            <div className="flex justify-between text-sm text-gray-400">
              <span>Arbete</span>
              <span>{totals.laborTotal.toLocaleString('sv-SE')} kr</span>
            </div>
            <div className="flex justify-between text-sm text-gray-400">
              <span>Material</span>
              <span>{totals.materialTotal.toLocaleString('sv-SE')} kr</span>
            </div>
          </>
        )}

        <div className="flex justify-between text-sm text-gray-600 pt-1 border-t border-gray-100">
          <span>Delsumma</span>
          <span>{totals.subtotal.toLocaleString('sv-SE')} kr</span>
        </div>

        {totals.discountAmount > 0 && (
          <div className="flex justify-between text-sm text-green-600">
            <span>Rabatt</span>
            <span>-{totals.discountAmount.toLocaleString('sv-SE')} kr</span>
          </div>
        )}

        <div className="flex justify-between text-sm text-gray-600">
          <span>Moms ({vatRate}%)</span>
          <span>{totals.vat.toLocaleString('sv-SE')} kr</span>
        </div>

        <div className="flex justify-between text-lg font-bold text-gray-900 pt-2 border-t border-gray-200">
          <span>Totalt</span>
          <span>{totals.total.toLocaleString('sv-SE')} kr</span>
        </div>

        {/* ROT/RUT section */}
        {hasRotRut && deduction > 0 && (
          <>
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex justify-between text-sm text-gray-500 mb-1">
                <span>{rotRutType!.toUpperCase()}-berättigat arbete</span>
                <span>{workCost.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-sm text-emerald-600">
                <span>{rotRutType!.toUpperCase()}-avdrag ({rotRutType === 'rot' ? '30%' : '50%'})</span>
                <span>-{deduction.toLocaleString('sv-SE')} kr</span>
              </div>
              <div className="flex justify-between text-lg font-bold text-emerald-700 mt-2 pt-2 border-t border-emerald-200 bg-emerald-50 -mx-5 px-5 py-3 rounded-b-xl -mb-5">
                <span>Att betala</span>
                <span>{customerPays.toLocaleString('sv-SE')} kr</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ROT/RUT required fields */}
      {hasRotRut && onFieldChange && (
        <div className="mt-5 pt-4 border-t border-gray-200 space-y-3">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            {rotRutType!.toUpperCase()}-uppgifter (obligatoriskt)
          </p>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Personnummer</label>
            <input
              type="text"
              value={personalNumber || ''}
              onChange={(e) => onFieldChange('personalNumber', e.target.value)}
              placeholder="ÅÅÅÅMMDD-XXXX"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          {rotRutType === 'rot' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Fastighetsbeteckning</label>
              <input
                type="text"
                value={propertyDesignation || ''}
                onChange={(e) => onFieldChange('propertyDesignation', e.target.value)}
                placeholder="Kommun Trakt 1:23"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
