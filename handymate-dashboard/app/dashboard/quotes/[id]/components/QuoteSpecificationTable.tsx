'use client'

import Link from 'next/link'
import { ClipboardList, CreditCard, FileText, MinusCircle, Plus } from 'lucide-react'
import { formatCurrency, getUnitLabel } from '../helpers'
import type { Quote, QuoteItem } from '../types'

interface QuoteSpecificationTableProps {
  quote: Quote
}

/**
 * Specifikation enligt offert-mall:n (Modern):
 * - Tabell-header med tunn border-top och uppercase eyebrow-labels
 * - Höger-justerade tal med tabular-nums
 * - Subtle zebrar via hover, dividers mellan rader
 * - ROT/RUT-badges enligt designsystemets pill-mönster
 *
 * Empty state: "Lägg till första raden →" med länk till edit-vyn.
 */
export function QuoteSpecificationTable({ quote }: QuoteSpecificationTableProps) {
  const hasStructuredItems = quote.quote_items && quote.quote_items.length > 0
  const hasLegacyItems = !hasStructuredItems && (quote.items || []).length > 0
  const isEmpty = !hasStructuredItems && !hasLegacyItems

  return (
    <>
      {/* Items */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Specifikation</p>
        {hasStructuredItems ? (
          renderStructuredItems(quote.quote_items!, quote)
        ) : hasLegacyItems ? (
          renderLegacyItems(quote.items || [])
        ) : (
          <EmptySpecification quoteId={quote.quote_id} />
        )}
      </div>

      {/* Ej inkluderat */}
      {quote.not_included && (
        <ContentCard
          icon={<MinusCircle className="w-4.5 h-4.5" />}
          title="Ej inkluderat"
          body={quote.not_included}
        />
      )}

      {/* ÄTA-villkor */}
      {quote.ata_terms && (
        <ContentCard
          icon={<ClipboardList className="w-4.5 h-4.5" />}
          title="ÄTA-villkor"
          body={quote.ata_terms}
        />
      )}

      {/* Payment plan */}
      {quote.payment_plan && quote.payment_plan.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
              <CreditCard className="w-4.5 h-4.5" />
            </div>
            <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">Betalningsplan</h2>
          </div>
          {quote.payment_terms_text && (
            <p className="text-sm text-slate-500 mb-4 leading-relaxed">{quote.payment_terms_text}</p>
          )}
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 pr-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Delbetalning</th>
                  <th className="text-right py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Andel</th>
                  <th className="text-right py-2 px-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Belopp</th>
                  <th className="text-left py-2 pl-4 text-[11px] font-semibold uppercase tracking-wider text-slate-500">Förfaller</th>
                </tr>
              </thead>
              <tbody>
                {quote.payment_plan.map((entry, idx) => (
                  <tr key={idx} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50">
                    <td className="py-2.5 pr-4 text-slate-900">{entry.label}</td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-slate-600">{entry.percent}%</td>
                    <td className="py-2.5 px-4 text-right tabular-nums font-medium text-slate-900">{formatCurrency(entry.amount)}</td>
                    <td className="py-2.5 pl-4 text-slate-500">{entry.due_description}</td>
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

function EmptySpecification({ quoteId }: { quoteId: string }) {
  return (
    <div className="border border-dashed border-slate-200 rounded-xl py-10 px-6 text-center">
      <FileText className="w-9 h-9 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
      <p className="text-sm text-slate-500 mb-3">Inga rader ännu</p>
      <Link
        href={`/dashboard/quotes/${quoteId}/edit`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-600"
      >
        <Plus className="w-3.5 h-3.5" />
        Lägg till första raden
      </Link>
    </div>
  )
}

/**
 * Neutralt innehållskort för text-sektioner (Ej inkluderat, ÄTA-villkor).
 * Tidigare tonad i rött/gult som varningsboxar — vilket gav fel signal till
 * kunden eftersom innehållet är information, inte fel.
 */
function ContentCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode
  title: string
  body: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-9 h-9 rounded-full bg-primary-50 text-primary-700 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <h2 className="font-heading text-base font-bold text-slate-900 tracking-tight">{title}</h2>
      </div>
      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed font-body">{body}</p>
    </div>
  )
}

function renderStructuredItems(items: QuoteItem[], quote: Quote) {
  const sorted = [...items].sort((a, b) => a.sort_order - b.sort_order)

  return (
    <div className="space-y-0.5">
      {sorted.map(item => {
        switch (item.item_type) {
          case 'heading':
            return (
              <div
                key={item.id}
                className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2.5 mt-3 first:mt-0"
              >
                <p className="font-heading font-bold text-sm text-slate-900 tracking-tight uppercase">
                  {item.description}
                </p>
              </div>
            )

          case 'item':
            return (
              <div
                key={item.id}
                className="flex justify-between items-start gap-4 py-3 px-2 border-b border-slate-100 hover:bg-slate-50/40 -mx-2 rounded transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm text-slate-900 font-body">{item.description}</p>
                    {item.is_rot_eligible && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-green-50 text-green-700 rounded-full uppercase tracking-wider">
                        ROT
                      </span>
                    )}
                    {item.is_rut_eligible && (
                      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 rounded-full uppercase tracking-wider">
                        RUT
                      </span>
                    )}
                  </div>
                  {(quote.show_quantities !== false || quote.show_unit_prices !== false) && (
                    <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
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
                <p className="font-heading text-sm font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                  {formatCurrency(item.total)}
                </p>
              </div>
            )

          case 'text':
            return (
              <div key={item.id} className="py-2 px-2">
                <p className="text-sm text-slate-500 italic font-body">{item.description}</p>
              </div>
            )

          case 'subtotal':
            return (
              <div
                key={item.id}
                className="flex justify-between items-center gap-4 py-3 px-3 border-t border-slate-300 bg-slate-50 rounded-lg mt-2"
              >
                <p className="font-heading text-sm font-bold text-slate-900 tracking-tight">
                  {item.description || 'Delsumma'}
                </p>
                <p className="font-heading text-sm font-bold text-slate-900 tabular-nums">
                  {formatCurrency(item.total)}
                </p>
              </div>
            )

          case 'discount':
            return (
              <div
                key={item.id}
                className="flex justify-between items-center gap-4 py-3 px-2 border-b border-slate-100"
              >
                <p className="text-sm text-green-700 font-medium">{item.description}</p>
                <p className="font-heading text-sm font-semibold text-green-700 tabular-nums">
                  -{formatCurrency(Math.abs(item.total))}
                </p>
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
  const groups: Array<{ key: string; label: string; items: any[] }> = [
    { key: 'labor', label: 'Arbete', items: items.filter((i: any) => i.type === 'labor') },
    { key: 'material', label: 'Material', items: items.filter((i: any) => i.type === 'material') },
    { key: 'service', label: 'Tjänster', items: items.filter((i: any) => i.type === 'service') },
  ]

  return (
    <div className="space-y-5">
      {groups
        .filter(g => g.items.length > 0)
        .map(g => (
          <div key={g.key}>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">{g.label}</h3>
            <div className="space-y-0.5">
              {g.items.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="flex justify-between items-start gap-4 py-3 px-2 border-b border-slate-100 hover:bg-slate-50/40 -mx-2 rounded transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900 font-body">{item.name}</p>
                    {item.unit_price != null && (
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {item.quantity} {getUnitLabel(item.unit)} × {formatCurrency(item.unit_price)}
                      </p>
                    )}
                  </div>
                  <p className="font-heading text-sm font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                    {formatCurrency(item.total)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
    </div>
  )
}
