'use client'

import { AlertTriangle, Lightbulb } from 'lucide-react'

interface PriceWarning {
  product_name: string
  quote_price: number
  normal_price: number
  supplier_name: string
  difference_pct: number
}

interface PriceAlt {
  product_name: string
  cheaper_supplier: string
  cheaper_price: number
  savings_pct: number
}

interface QuoteNewPriceWarningsBannerProps {
  warnings: PriceWarning[]
  alternatives: PriceAlt[]
}

/**
 * Visar prisvarningar och billigare alternativ från grossist-jämförelse.
 * Renderas ovanför summeringssektionen i sidopanelen.
 */
export function QuoteNewPriceWarningsBanner({ warnings, alternatives }: QuoteNewPriceWarningsBannerProps) {
  if (warnings.length === 0 && alternatives.length === 0) return null

  return (
    <div className="space-y-2">
      {warnings.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong className="font-semibold">{w.product_name}</strong> är {w.difference_pct}% dyrare än normalpris (
                <span className="tabular-nums">{w.quote_price} kr</span> vs{' '}
                <span className="tabular-nums">{w.normal_price} kr</span> — {w.supplier_name})
              </p>
            </div>
          ))}
        </div>
      )}
      {alternatives.length > 0 && (
        <div className="bg-primary-50 border border-primary-100 rounded-2xl p-4 space-y-2">
          {alternatives.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <Lightbulb className="w-3.5 h-3.5 text-primary-700 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-primary-800 leading-relaxed">
                <strong className="font-semibold">{a.cheaper_supplier}</strong> har {a.product_name} {a.savings_pct}% billigare (
                <span className="tabular-nums">{a.cheaper_price} kr</span>)
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
