'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import type { ProductSearchResult } from './QuoteProductSearchModal'

interface QuoteAddRowComboProps {
  /** Triggas när användaren väljer en sparad produkt från dropdown */
  onSelectProduct: (product: ProductSearchResult) => void
  /** Triggas när användaren trycker Enter utan match — skapar tom rad med
   *  beskrivningen ifylld */
  onAddBlankRow: (description: string) => void
}

/**
 * Kombinerad input för "lägg till rad eller sök produkt". Användaren skriver
 * en beskrivning. Om det matchar en sparad produkt visas dropdown — välj
 * lägger till produkt-raden. Enter utan match skapar tom rad med beskrivningen.
 *
 * Best practice från modern offert-UX (Fortnox 2024-redesign, Tipalti) — en
 * enda input istället för två separata knappar minskar friktion.
 */
export function QuoteAddRowCombo({ onSelectProduct, onAddBlankRow }: QuoteAddRowComboProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [activeIdx, setActiveIdx] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)

  // Debounce-fetch
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/products?search=${encodeURIComponent(query.trim())}`)
        .then(r => r.json())
        .then(data => setResults(data.products || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  function handleSelect(p: ProductSearchResult) {
    onSelectProduct(p)
    setQuery('')
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleAddBlank() {
    const trimmed = query.trim()
    if (!trimmed) return
    onAddBlankRow(trimmed)
    setQuery('')
    setOpen(false)
    setActiveIdx(-1)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (activeIdx >= 0 && results[activeIdx]) {
        handleSelect(results[activeIdx])
      } else {
        handleAddBlank()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setActiveIdx(-1)
    }
  }

  return (
    <div className="relative flex-1 min-w-[220px] max-w-[420px]">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          setActiveIdx(-1)
        }}
        onFocus={() => query && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder="Sök produkt eller skriv ny beskrivning…"
        className="w-full pl-9 pr-3 py-1.5 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors"
      />
      {loading && (
        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 animate-spin" />
      )}

      {open && query && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-white border border-slate-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
          {results.length > 0 && (
            <ul className="py-1">
              {results.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => handleSelect(p)}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors ${
                      activeIdx === i ? 'bg-primary-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {p.is_favorite && <span className="text-amber-500 text-xs">★</span>}
                        <span className="text-sm text-slate-900 truncate">{p.name}</span>
                        {p.rot_eligible && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 uppercase tracking-wider">
                            ROT
                          </span>
                        )}
                      </div>
                      {p.sku && <p className="text-[10px] text-slate-400 truncate mt-0.5">{p.sku}</p>}
                    </div>
                    <span className="text-xs font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                      {p.sales_price?.toLocaleString('sv-SE')} kr/{p.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onMouseDown={e => e.preventDefault()}
            onClick={handleAddBlank}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              results.length > 0 ? 'border-t border-slate-100 text-slate-600' : 'text-primary-700 font-semibold'
            } hover:bg-primary-50/40`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>
              Lägg till "<span className="font-semibold text-slate-900">{query}</span>" som ny rad
            </span>
            <span className="ml-auto text-[10px] text-slate-400 font-mono">Enter</span>
          </button>
        </div>
      )}
    </div>
  )
}
