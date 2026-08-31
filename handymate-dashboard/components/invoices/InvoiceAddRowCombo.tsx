'use client'

/**
 * Fakturans artikelväljare (Prisslingan V2 pass 5, UX4a).
 *
 * Fakturaredigeringen hade INGEN väg till produktbanken — varje rad var
 * fritext + manuellt pris, medan offerten haft snabbsök hela tiden. Samma
 * mönster som QuoteAddRowCombo på den delade useProductSearch-hooken;
 * mappningen till InvoiceItem äger montören (LineItemEditor).
 * Prislösa artiklar visar "Sätt pris" (aldrig "0 kr") — samma språk som
 * alla andra väljare (lib/products/pricing-state.ts).
 */
import { useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { useProductSearch } from '@/lib/products/use-product-search'
import type { ProductWithComponents } from '@/app/dashboard/quotes/_shared/applyProductToItem'
import { priceLabel, priceState } from '@/lib/products/pricing-state'

export function InvoiceAddRowCombo({
  onSelectProduct,
  onAddBlankRow,
}: {
  onSelectProduct: (product: ProductWithComponents) => void
  onAddBlankRow: (description: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const { results, loading } = useProductSearch(query)

  function valj(p: ProductWithComponents) {
    onSelectProduct(p)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  function blankRad() {
    const beskrivning = query.trim()
    if (!beskrivning) return
    onAddBlankRow(beskrivning)
    setQuery('')
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative flex-1 min-w-[220px]">
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setActiveIdx(0) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
          if (e.key === 'Enter') {
            e.preventDefault()
            if (results.length > 0) valj(results[activeIdx])
            else blankRad()
          }
          if (e.key === 'Escape') setOpen(false)
        }}
        placeholder="Sök artikel eller skriv fritt…"
        className="w-full pl-8 pr-8 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] placeholder-[#CBD5E1] focus:outline-none focus:border-[#0F766E]"
      />
      {loading && (
        <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-300 animate-spin pointer-events-none" />
      )}

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto py-1">
          {results.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onMouseDown={e => e.preventDefault()}
              onClick={() => valj(p)}
              onMouseEnter={() => setActiveIdx(i)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                activeIdx === i ? 'bg-primary-50' : 'hover:bg-slate-50'
              }`}
            >
              <span className="min-w-0 flex-1 text-[13px] text-slate-900 truncate">
                {p.is_favorite ? '★ ' : ''}{p.name}
              </span>
              <span className={`shrink-0 text-xs font-semibold tabular-nums whitespace-nowrap ${
                priceState(p.sales_price) === 'osatt' ? 'text-primary-700' : 'text-slate-700'
              }`}>
                {priceLabel(p.sales_price, p.unit)}
              </span>
            </button>
          ))}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={blankRad}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors ${
              results.length > 0 ? 'border-t border-slate-100 text-slate-600' : 'text-primary-700 font-semibold'
            } hover:bg-primary-50/40`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Lägg till "<span className="font-semibold text-slate-900">{query.trim()}</span>" som fri rad</span>
          </button>
        </div>
      )}
    </div>
  )
}
