'use client'

import { useEffect, useState } from 'react'
import { Heading1, Loader2, Plus, Search, Star, X } from 'lucide-react'
import type { ProductWithComponents } from '@/app/dashboard/quotes/_shared/applyProductToItem'
import { useFavoriteProducts, useProductSearch } from '@/app/dashboard/quotes/_shared/useProductSearch'

interface AddRowSheetProps {
  open: boolean
  /** Vald produkt → raden förfylls via addFromProductBank (snapshot byggs). */
  onSelectProduct: (product: ProductWithComponents) => void
  /** Tom rad, eventuellt med beskrivningen som skrivits. */
  onAddBlankRow: (description: string) => void
  /** Rubrikrad — grupperar offerten. */
  onAddHeading: () => void
  onClose: () => void
}

/**
 * AddRowSheet — mobilens väg att lägga till en offertrad.
 *
 * Varför den finns: canvasens "+ Lägg till rad" gav tidigare en TOM rad utan
 * produktsökning. På mobilen (där canvasen är huvudytan) tog "lägg till
 * badrumsmontage" ~9 interaktioner — skriva beskrivning, antal, enhet, à-pris,
 * kategori och ROT för hand, med priset i huvudet. Listvyns combobox gjorde
 * samma sak på 2-3 men nås inte från mobilens standardvy.
 *
 * Sheeten flyttar listvyns sökning till canvasen: sök → välj → klar rad med
 * pris, enhet, ROT-flagga och fryst komponent-snapshot ifyllt.
 *
 * Mönster och 44px-fält från RowEditSheet (samma overlay, drag-indikator,
 * Escape + scroll-lås, slide-up). Två sheets med samma formspråk är
 * medvetet — hantverkaren lär sig ETT rörelsemönster.
 */
export function AddRowSheet({ open, onSelectProduct, onAddBlankRow, onAddHeading, onClose }: AddRowSheetProps) {
  const [query, setQuery] = useState('')
  const { results, loading } = useProductSearch(query)
  const favorites = useFavoriteProducts(open)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, onClose])

  // Nollställ söktexten mellan öppningar — annars möts hantverkaren av förra
  // radens sökning nästa gång sheeten öppnas.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  if (!open) return null

  const trimmed = query.trim()
  // Favoriterna är genvägen innan något sökts; sedan tar träffarna över.
  const shown = trimmed ? results : favorites
  const showFavoriteHeading = !trimmed && favorites.length > 0

  const pick = (product: ProductWithComponents) => {
    onSelectProduct(product)
    onClose()
  }

  const addBlank = () => {
    onAddBlankRow(trimmed)
    onClose()
  }

  const addHeading = () => {
    onAddHeading()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/45 rowsheet-fade" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Lägg till rad"
        className="relative w-full max-w-lg max-h-[85vh] bg-white rounded-t-2xl shadow-2xl flex flex-col rowsheet-up"
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lägg till rad</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="p-2 -m-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pt-4 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Sök artikel eller skriv en beskrivning…"
              className="w-full min-h-[44px] pl-11 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-600"
            />
            {loading && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
            )}
          </div>
        </div>

        <div className="px-5 pb-2 overflow-y-auto flex-1">
          {showFavoriteHeading && (
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500 mb-2 mt-1">
              <Star className="w-3.5 h-3.5 text-amber-500" />
              Dina vanligaste
            </p>
          )}

          {shown.length > 0 && (
            <ul className="space-y-1.5">
              {shown.map(product => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => pick(product)}
                    className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3.5 py-2.5 text-left bg-white border border-slate-200 rounded-xl hover:border-primary-300 hover:bg-primary-50/40 active:bg-primary-50 transition-colors"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {product.is_favorite && <Star className="w-3 h-3 text-amber-500 shrink-0" />}
                        <span className="text-[15px] text-slate-900 truncate">{product.name}</span>
                        {product.rot_eligible && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-100 uppercase tracking-wider shrink-0">
                            ROT
                          </span>
                        )}
                        {product.rut_eligible && (
                          <span className="px-1.5 py-0.5 text-[9px] font-semibold bg-sky-50 text-sky-700 rounded-full border border-sky-100 uppercase tracking-wider shrink-0">
                            RUT
                          </span>
                        )}
                      </span>
                      {product.sku && <span className="block text-[11px] text-slate-400 truncate mt-0.5">{product.sku}</span>}
                    </span>
                    <span className="text-sm font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                      {product.sales_price?.toLocaleString('sv-SE')} kr/{product.unit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {trimmed && !loading && results.length === 0 && (
            <p className="text-sm text-slate-500 py-3">
              Ingen artikel matchar «{trimmed}». Lägg till den som en egen rad nedan.
            </p>
          )}

          {!trimmed && favorites.length === 0 && (
            <p className="text-sm text-slate-500 py-3">
              Sök i din artikelbank, eller lägg till en egen rad nedan.
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-slate-100 shrink-0 space-y-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={addBlank}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 text-white text-[15px] font-semibold rounded-xl hover:bg-primary-800 active:bg-primary-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            {trimmed ? `Lägg till «${trimmed}»` : 'Lägg till tom rad'}
          </button>
          <button
            type="button"
            onClick={addHeading}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 text-[15px] font-medium rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors"
          >
            <Heading1 className="w-4 h-4" />
            Lägg till rubrik
          </button>
        </div>
      </div>
    </div>
  )
}
