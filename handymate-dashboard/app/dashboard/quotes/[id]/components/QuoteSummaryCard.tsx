'use client'

import { formatCurrency } from '../helpers'
import type { Quote } from '../types'

interface QuoteSummaryCardProps {
  quote: Quote
}

export function QuoteSummaryCard({ quote }: QuoteSummaryCardProps) {
  const hasNewRotRut = (quote.rot_work_cost && quote.rot_work_cost > 0) || (quote.rut_work_cost && quote.rut_work_cost > 0)

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
      <h2 className="font-semibold text-gray-900 mb-4">Summering</h2>

      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Arbete</span>
          <span className="text-gray-900">{formatCurrency(quote.labor_total)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Material</span>
          <span className="text-gray-900">{formatCurrency(quote.material_total)}</span>
        </div>
        <div className="border-t border-gray-300 pt-3 flex justify-between">
          <span className="text-gray-500">Netto (exkl. moms)</span>
          <span className="text-gray-900">{formatCurrency(quote.subtotal)}</span>
        </div>
        {quote.discount_amount > 0 && (
          <div className="flex justify-between text-emerald-600">
            <span>Rabatt ({quote.discount_percent}%)</span>
            <span>-{formatCurrency(quote.discount_amount)}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-gray-500">Moms ({quote.vat_rate}%)</span>
          <span className="text-gray-900">{formatCurrency(quote.vat_amount)}</span>
        </div>
        <div className="border-t border-gray-300 pt-3 flex justify-between text-lg font-semibold">
          <span className="text-gray-900">Totalt inkl. moms</span>
          <span className="text-gray-900">{formatCurrency(quote.total)}</span>
        </div>

        {/* New ROT/RUT display with structured fields */}
        {hasNewRotRut ? (
          <>
            {quote.rot_work_cost && quote.rot_work_cost > 0 && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mt-4">
                <p className="text-xs font-semibold text-emerald-700 mb-2">ROT-avdrag</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Arbetskostnad (ROT)</span>
                    <span className="text-gray-900">{formatCurrency(quote.rot_work_cost)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-600">
                    <span>ROT-avdrag (30%)</span>
                    <span>-{formatCurrency(quote.rot_deduction || 0)}</span>
                  </div>
                  <div className="border-t border-emerald-500/30 pt-2 mt-1">
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-900">Kund betalar</span>
                      <span className="text-emerald-600">{formatCurrency(quote.rot_customer_pays || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {quote.rut_work_cost && quote.rut_work_cost > 0 && (
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 mt-4">
                <p className="text-xs font-semibold text-purple-700 mb-2">RUT-avdrag</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Arbetskostnad (RUT)</span>
                    <span className="text-gray-900">{formatCurrency(quote.rut_work_cost)}</span>
                  </div>
                  <div className="flex justify-between text-purple-600">
                    <span>RUT-avdrag (50%)</span>
                    <span>-{formatCurrency(quote.rut_deduction || 0)}</span>
                  </div>
                  <div className="border-t border-purple-500/30 pt-2 mt-1">
                    <div className="flex justify-between font-semibold">
                      <span className="text-gray-900">Kund betalar</span>
                      <span className="text-purple-600">{formatCurrency(quote.rut_customer_pays || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Legacy ROT/RUT display */
          quote.rot_rut_type && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-emerald-600">{quote.rot_rut_type.toUpperCase()}-avdrag</span>
                <span className="text-emerald-600">-{formatCurrency(quote.rot_rut_deduction)}</span>
              </div>
              <div className="border-t border-emerald-500/30 pt-2 mt-2">
                <div className="flex justify-between font-semibold">
                  <span className="text-gray-900">Kund betalar</span>
                  <span className="text-emerald-600">{formatCurrency(quote.customer_pays)}</span>
                </div>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}
