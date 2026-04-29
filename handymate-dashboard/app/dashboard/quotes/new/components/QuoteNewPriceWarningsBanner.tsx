'use client'

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
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
          {warnings.map((w, i) => (
            <p key={i} className="text-xs text-amber-800">
              ⚠️ {w.product_name} är {w.difference_pct}% dyrare än normalpris ({w.quote_price} kr vs {w.normal_price} kr — {w.supplier_name})
            </p>
          ))}
        </div>
      )}
      {alternatives.length > 0 && (
        <div className="bg-primary-50 border border-[#E2E8F0] rounded-lg p-3 space-y-1.5">
          {alternatives.map((a, i) => (
            <p key={i} className="text-xs text-primary-800">
              💡 {a.cheaper_supplier} har {a.product_name} {a.savings_pct}% billigare ({a.cheaper_price} kr)
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
