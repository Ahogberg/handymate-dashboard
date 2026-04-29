'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'

export interface ProductSearchResult {
  id: string
  name: string
  sku?: string | null
  unit: string
  sales_price: number
  purchase_price?: number | null
  rot_eligible?: boolean
  rut_eligible?: boolean
  is_favorite?: boolean
}

interface QuoteProductSearchModalProps {
  open: boolean
  onClose: () => void
  onSelect: (product: ProductSearchResult) => void
}

/**
 * Sökmodal för sparade produkter (api/products). Används av både
 * new- och edit-vyn för att importera artiklar från hantverkarens egen
 * prislista. För grossist-sökning används ProductSearchModal.tsx.
 */
export function QuoteProductSearchModal({ open, onClose, onSelect }: QuoteProductSearchModalProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [loading, setLoading] = useState(false)

  const search = useCallback(async (q: string) => {
    setLoading(true)
    try {
      const url = q.trim()
        ? `/api/products?search=${encodeURIComponent(q.trim())}`
        : '/api/products?favorites=true'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setResults(data.products || [])
      }
    } catch {
      // tyst — inga företagsfel ska blockera UI:t
    } finally {
      setLoading(false)
    }
  }, [])

  // Ladda favoriter när modalen öppnas
  useEffect(() => {
    if (open) {
      setQuery('')
      search('')
    }
  }, [open, search])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Search className="w-4.5 h-4.5 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              search(e.target.value)
            }}
            placeholder="Sök bland sparade produkter…"
            autoFocus
            className="flex-1 text-sm text-slate-900 placeholder:text-slate-400 bg-transparent border-none outline-none"
          />
          <button
            onClick={onClose}
            aria-label="Stäng"
            className="p-1.5 -m-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 text-primary-700 animate-spin" />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-1">
              {results.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelect(p)
                    onClose()
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-slate-50 transition-colors text-left"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {p.is_favorite && <span className="text-amber-500 text-xs">★</span>}
                      <span className="text-sm font-medium text-slate-900 truncate">{p.name}</span>
                      {p.rot_eligible && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100">
                          ROT
                        </span>
                      )}
                      {p.rut_eligible && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-700 rounded-full border border-blue-100">
                          RUT
                        </span>
                      )}
                    </div>
                    {p.sku && <p className="text-[11px] text-slate-400 truncate mt-0.5">{p.sku}</p>}
                  </div>
                  <div className="text-right ml-4 shrink-0">
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {p.sales_price?.toLocaleString('sv-SE')} kr
                    </span>
                    <span className="text-[11px] text-slate-400 ml-1">/{p.unit}</span>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <p className="text-sm text-slate-500">
                {query ? 'Inga produkter hittades' : 'Inga favoriter ännu'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Lägg till produkter under Inställningar → Produkter
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
