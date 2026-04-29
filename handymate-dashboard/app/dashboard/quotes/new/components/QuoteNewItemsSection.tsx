'use client'

import { useState } from 'react'
import { closestCenter, DndContext, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import ItemRow from '@/components/quotes/ItemRow'
import type { QuoteItem } from '@/lib/types/quote'
import type { CustomCategory } from '@/lib/constants/categories'

interface PriceItem {
  id: string
  category: string
  name: string
  unit: string
  unit_price: number
}

interface QuoteNewItemsSectionProps {
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
  onOpenGrossistSearch: () => void
  onOpenProductSearch: () => void
  // Inline-skapande av kategori — bara new-vyn (edit-vyn använder befintliga)
  onCreateCategory: (label: string, itemId: string) => Promise<void> | void
  showNewCategoryInput: string | null
  setShowNewCategoryInput: (id: string | null) => void
  newCategoryLabel: string
  setNewCategoryLabel: (s: string) => void
}

export function QuoteNewItemsSection({
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
  onOpenGrossistSearch,
  onOpenProductSearch,
  onCreateCategory,
  showNewCategoryInput,
  setShowNewCategoryInput,
  newCategoryLabel,
  setNewCategoryLabel,
}: QuoteNewItemsSectionProps) {
  const [showAdvancedTypes, setShowAdvancedTypes] = useState(false)

  return (
    <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
      <div className="text-[11px] font-semibold tracking-[0.08em] uppercase text-[#475569] mb-4">Offertrader</div>

      {/* Table header (desktop) */}
      {items.length > 0 && (
        <div className="hidden md:grid md:grid-cols-[24px_56px_1fr_56px_64px_80px_80px_140px_72px_28px] gap-1.5 px-2 pb-2 border-b border-gray-200 mb-1">
          <span />
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500 text-center">Typ</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500">Beskrivning</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500 text-center">Antal</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500 text-center">Enhet</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500 text-right">Pris</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500 text-right">Summa</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500 text-center">Kategori</span>
          <span className="text-[10px] font-medium tracking-wider uppercase text-gray-500 text-center">ROT</span>
          <span />
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-8 text-[#CBD5E1] text-[13px]">
          <p>Inga rader ännu. Lägg till poster nedan eller använd AI-hjälp.</p>
        </div>
      ) : (
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1">
              {items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  total={items.length}
                  recalculatedTotal={recalculated[index]?.total ?? item.total}
                  onUpdate={onUpdateItem}
                  onRemove={onRemoveItem}
                  onMove={onMoveItem}
                  allCategories={allCategories}
                  onCreateCategory={onCreateCategory}
                  showNewCategoryInput={showNewCategoryInput}
                  setShowNewCategoryInput={setShowNewCategoryInput}
                  newCategoryLabel={newCategoryLabel}
                  setNewCategoryLabel={setNewCategoryLabel}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Add row buttons */}
      <div className="flex items-center gap-4 pt-2.5">
        <button
          onClick={() => onAddItem('item')}
          className="flex items-center gap-2 text-[13px] text-[#0F766E] bg-transparent border-none cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="#0F766E" strokeWidth="1" />
            <path d="M8 5v6M5 8h6" stroke="#0F766E" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
          Lägg till rad
        </button>

        <button
          onClick={onOpenProductSearch}
          className="flex items-center gap-1.5 text-[13px] text-[#64748B] hover:text-[#0F766E] transition-colors bg-transparent border-none cursor-pointer"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          Sök produkt
        </button>

        <div className="relative">
          <button
            onClick={() => setShowAdvancedTypes(!showAdvancedTypes)}
            className="text-[12px] text-[#94A3B8] hover:text-[#64748B] transition-colors"
          >
            Fler alternativ ▾
          </button>
          {showAdvancedTypes && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowAdvancedTypes(false)} />
              <div className="absolute left-0 top-6 z-20 bg-white border-thin border-[#E2E8F0] rounded-lg shadow-lg w-44 overflow-hidden">
                <button
                  onClick={() => { onAddItem('heading'); setShowAdvancedTypes(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]"
                >
                  Rubrik
                </button>
                <button
                  onClick={() => { onAddItem('text'); setShowAdvancedTypes(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]"
                >
                  Fritext
                </button>
                <button
                  onClick={() => { onAddItem('subtotal'); setShowAdvancedTypes(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]"
                >
                  Delsumma
                </button>
                <button
                  onClick={() => { onAddItem('discount'); setShowAdvancedTypes(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]"
                >
                  Rabatt
                </button>
                <button
                  onClick={() => { onOpenGrossistSearch(); setShowAdvancedTypes(false) }}
                  className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]"
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
        <div className="mt-4 pt-4 border-t border-thin border-[#E2E8F0]">
          <p className="text-[12px] text-[#CBD5E1] mb-2">Snabbval från prislista:</p>
          <div className="flex flex-wrap gap-2">
            {priceList.slice(0, 8).map(item => (
              <button
                key={item.id}
                onClick={() => onAddFromPriceList(item)}
                className="px-3 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#64748B] text-[12px] hover:border-[#0F766E] hover:text-[#0F766E] bg-transparent transition-colors"
              >
                {item.name}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 pt-4 border-t border-thin border-[#E2E8F0]">
          <p className="text-[12px] text-[#94A3B8]">Du har inga sparade artiklar än.</p>
          <a
            href="/dashboard/settings/my-prices"
            target="_blank"
            rel="noopener"
            className="text-[12px] text-[#0F766E] hover:underline mt-1 inline-block"
          >
            + Bygg din prislista →
          </a>
          <p className="text-[10px] text-[#CBD5E1] mt-0.5">Öppnas i ny flik</p>
        </div>
      )}
    </div>
  )
}
