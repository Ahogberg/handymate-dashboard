'use client'

import { useState } from 'react'
import { ChevronDown, FileText, Plus, Search } from 'lucide-react'
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import SharedItemRow from '@/components/quotes/ItemRow'
import type { QuoteItem } from '@/lib/types/quote'
import type { CustomCategory } from '@/lib/constants/categories'

interface PriceItem {
  id: string
  category: string
  name: string
  unit: string
  unit_price: number
}

interface QuoteEditItemsSectionProps {
  items: QuoteItem[]
  recalculated: QuoteItem[]
  allCategories: ReturnType<typeof import('@/lib/constants/categories').getAllCategories>
  customCategories: CustomCategory[]
  priceList: PriceItem[]
  dndSensors: ReturnType<typeof import('@dnd-kit/core').useSensors>
  onDragEnd: (event: DragEndEvent) => void
  onAddItem: (type: QuoteItem['item_type']) => void
  onUpdateItem: (id: string, field: keyof QuoteItem, value: any) => void
  onRemoveItem: (id: string) => void
  onMoveItem: (index: number, direction: 'up' | 'down') => void
  onAddFromPriceList: (item: PriceItem) => void
  onOpenProductSearch: () => void
  onOpenGrossistSearch: () => void
}

export function QuoteEditItemsSection({
  items,
  recalculated,
  allCategories,
  priceList,
  dndSensors,
  onDragEnd,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onMoveItem,
  onAddFromPriceList,
  onOpenProductSearch,
  onOpenGrossistSearch,
}: QuoteEditItemsSectionProps) {
  const [showAdvancedTypes, setShowAdvancedTypes] = useState(false)

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">Specifikation</p>

      {/* Table header (desktop) */}
      {items.length > 0 && (
        <div className="hidden md:grid md:grid-cols-[24px_56px_1fr_56px_64px_80px_80px_140px_72px_28px] gap-1.5 px-2 pb-2 border-b border-slate-200 mb-1">
          <span />
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500 text-center">Typ</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500">Beskrivning</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500 text-center">Antal</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500 text-center">Enhet</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500 text-right">Pris</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500 text-right">Summa</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500 text-center">Kategori</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-slate-500 text-center">ROT</span>
          <span />
        </div>
      )}

      {items.length === 0 ? (
        <div className="border border-dashed border-slate-200 rounded-xl py-10 px-6 text-center mb-2">
          <FileText className="w-9 h-9 text-slate-300 mx-auto mb-3" strokeWidth={1.5} />
          <p className="text-sm text-slate-500 mb-3">Inga rader ännu</p>
          <button
            type="button"
            onClick={() => onAddItem('item')}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-700 hover:text-primary-600"
          >
            <Plus className="w-3.5 h-3.5" />
            Lägg till första raden
          </button>
        </div>
      ) : (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {items.map((item, index) => (
                <SharedItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  recalculatedTotal={recalculated[index]?.total ?? item.total}
                  onUpdate={onUpdateItem}
                  onRemove={onRemoveItem}
                  onMove={onMoveItem}
                  allCategories={allCategories}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add row buttons — alltid synliga så Sök produkt/grossist är åtkomliga även med tom lista */}
      <div className="flex flex-wrap items-center gap-2 pt-3 mt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={() => onAddItem('item')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-primary-700 border border-primary-200 hover:bg-primary-50 hover:border-primary-300 bg-white rounded-lg transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Lägg till rad
          </button>

          <button
            type="button"
            onClick={onOpenProductSearch}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 border border-slate-200 hover:bg-slate-50 hover:border-slate-300 bg-white rounded-lg transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            Sök produkt
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAdvancedTypes(!showAdvancedTypes)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Fler alternativ
              <ChevronDown className={`w-3 h-3 transition-transform ${showAdvancedTypes ? 'rotate-180' : ''}`} />
            </button>
            {showAdvancedTypes && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowAdvancedTypes(false)} />
                <div className="absolute left-0 top-9 z-20 bg-white border border-slate-200 rounded-xl shadow-lg w-44 overflow-hidden py-1">
                  {[
                    { type: 'heading' as const, label: 'Rubrik' },
                    { type: 'text' as const, label: 'Fritext' },
                    { type: 'subtotal' as const, label: 'Delsumma' },
                    { type: 'discount' as const, label: 'Rabatt' },
                  ].map(opt => (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => {
                        onAddItem(opt.type)
                        setShowAdvancedTypes(false)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      onOpenGrossistSearch()
                      setShowAdvancedTypes(false)
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 border-t border-slate-100"
                  >
                    Sök grossist
                  </button>
                </div>
              </>
            )}
          </div>
      </div>

      {/* Quick add from price list */}
      {priceList.length > 0 ? (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Snabbval från prislista</p>
          <div className="flex flex-wrap gap-2">
            {priceList.slice(0, 8).map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onAddFromPriceList(item)}
                className="px-3 py-1.5 border border-slate-200 hover:border-primary-300 hover:text-primary-700 hover:bg-primary-50 rounded-lg text-slate-600 text-xs font-medium bg-white transition-colors"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-slate-100">
          <p className="text-xs text-slate-500">Du har inga sparade artiklar än.</p>
          <a
            href="/dashboard/settings/my-prices"
            target="_blank"
            rel="noopener"
            className="text-xs font-semibold text-primary-700 hover:text-primary-600 mt-1 inline-block"
          >
            + Bygg din prislista →
          </a>
          <p className="text-[10px] text-slate-400 mt-0.5">Öppnas i ny flik</p>
        </div>
      )}
    </div>
  )
}
