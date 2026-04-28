'use client'

import { AlertTriangle, ClipboardList, CreditCard } from 'lucide-react'
import { formatCurrency, getUnitLabel } from '../helpers'
import type { Quote, QuoteItem } from '../types'

interface QuoteSpecificationTableProps {
  quote: Quote
}

/**
 * Renderar offertens specifikation (rader/poster) — tre olika varianter:
 * 1. Strukturerade items från quote_items (heading/item/text/subtotal/discount)
 * 2. Legacy items från quote.items[] med type: labor/material/service
 *
 * Följs av tilläggssektioner: ej inkluderat, ÄTA-villkor, betalningsplan.
 * Specifikationen renderas alltid; tilläggen bara när data finns.
 */
export function QuoteSpecificationTable({ quote }: QuoteSpecificationTableProps) {
  const hasStructuredItems = quote.quote_items && quote.quote_items.length > 0

  return (
    <>
      {/* Items */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Specifikation</h2>
        {hasStructuredItems
          ? renderStructuredItems(quote.quote_items!, quote)
          : renderLegacyItems(quote.items || [])}
      </div>

      {/* Ej inkluderat */}
      {quote.not_included && (
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 sm:p-6">
          <h2 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Ej inkluderat
          </h2>
          <p className="text-red-700 whitespace-pre-wrap text-sm">{quote.not_included}</p>
        </div>
      )}

      {/* ÄTA-villkor */}
      {quote.ata_terms && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 sm:p-6">
          <h2 className="font-semibold text-amber-800 mb-3 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-amber-500" />
            ÄTA-villkor
          </h2>
          <p className="text-amber-700 whitespace-pre-wrap text-sm">{quote.ata_terms}</p>
        </div>
      )}

      {/* Payment plan */}
      {quote.payment_plan && quote.payment_plan.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
          <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary-600" />
            Betalningsplan
          </h2>
          {quote.payment_terms_text && (
            <p className="text-gray-500 text-sm mb-4">{quote.payment_terms_text}</p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 pr-4 text-gray-500 font-medium">Delbetaling</th>
                  <th className="text-right py-2 px-4 text-gray-500 font-medium">Andel</th>
                  <th className="text-right py-2 px-4 text-gray-500 font-medium">Belopp</th>
                  <th className="text-left py-2 pl-4 text-gray-500 font-medium">Förfaller</th>
                </tr>
              </thead>
              <tbody>
                {quote.payment_plan.map((entry, idx) => (
                  <tr key={idx} className="border-b border-gray-100 last:border-0">
                    <td className="py-2.5 pr-4 text-gray-900">{entry.label}</td>
                    <td className="py-2.5 px-4 text-right text-gray-600">{entry.percent}%</td>
                    <td className="py-2.5 px-4 text-right text-gray-900 font-medium">{formatCurrency(entry.amount)}</td>
                    <td className="py-2.5 pl-4 text-gray-500">{entry.due_description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

function renderStructuredItems(items: QuoteItem[], quote: Quote) {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-1">
      {sorted.map(item => {
        switch (item.item_type) {
          case 'heading':
            return (
              <div
                key={item.id}
                className="bg-primary-50 border border-[#E2E8F0] rounded-lg px-4 py-2.5 mt-3 first:mt-0"
              >
                <p className="font-semibold text-primary-800 text-sm">{item.description}</p>
              </div>
            )

          case 'item':
            return (
              <div
                key={item.id}
                className="flex justify-between items-center py-2.5 px-2 border-b border-gray-100"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-gray-900">{item.description}</p>
                    {item.is_rot_eligible && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 rounded">
                        ROT
                      </span>
                    )}
                    {item.is_rut_eligible && (
                      <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 rounded">
                        RUT
                      </span>
                    )}
                  </div>
                  {(quote.show_quantities !== false || quote.show_unit_prices !== false) && (
                    <p className="text-sm text-gray-400">
                      {quote.show_quantities !== false && (
                        <>
                          {item.quantity} {getUnitLabel(item.unit)}
                        </>
                      )}
                      {quote.show_quantities !== false && quote.show_unit_prices !== false && ' × '}
                      {quote.show_unit_prices !== false && formatCurrency(item.unit_price)}
                    </p>
                  )}
                </div>
                <p className="text-gray-900 font-medium ml-4 whitespace-nowrap">
                  {formatCurrency(item.total)}
                </p>
              </div>
            )

          case 'text':
            return (
              <div key={item.id} className="py-2 px-2">
                <p className="text-gray-500 italic text-sm">{item.description}</p>
              </div>
            )

          case 'subtotal':
            return (
              <div
                key={item.id}
                className="flex justify-between items-center py-2.5 px-2 border-t border-gray-300 bg-gray-50 rounded"
              >
                <p className="font-semibold text-gray-900">{item.description || 'Delsumma'}</p>
                <p className="font-semibold text-gray-900">{formatCurrency(item.total)}</p>
              </div>
            )

          case 'discount':
            return (
              <div
                key={item.id}
                className="flex justify-between items-center py-2.5 px-2 border-b border-gray-100"
              >
                <p className="text-emerald-600">{item.description}</p>
                <p className="text-emerald-600 font-medium">-{formatCurrency(Math.abs(item.total))}</p>
              </div>
            )

          default:
            return null
        }
      })}
    </div>
  )
}

function renderLegacyItems(items: any[]) {
  return (
    <>
      {/* Labor */}
      {items.filter((i: any) => i.type === 'labor').length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-primary-600 mb-2">Arbete</h3>
          <div className="space-y-2">
            {items
              .filter((i: any) => i.type === 'labor')
              .map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                  <div>
                    <p className="text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-400">
                      {item.quantity} {getUnitLabel(item.unit)} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Materials */}
      {items.filter((i: any) => i.type === 'material').length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-emerald-600 mb-2">Material</h3>
          <div className="space-y-2">
            {items
              .filter((i: any) => i.type === 'material')
              .map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                  <div>
                    <p className="text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-400">
                      {item.quantity} {getUnitLabel(item.unit)} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Services */}
      {items.filter((i: any) => i.type === 'service').length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-amber-400 mb-2">Tjänster</h3>
          <div className="space-y-2">
            {items
              .filter((i: any) => i.type === 'service')
              .map((item: any, idx: number) => (
                <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-200">
                  <div>
                    <p className="text-gray-900">{item.name}</p>
                  </div>
                  <p className="text-gray-900 font-medium">{formatCurrency(item.total)}</p>
                </div>
              ))}
          </div>
        </div>
      )}
    </>
  )
}
