'use client'

import { ArrowUp, ArrowDown, Trash2 } from 'lucide-react'
import type { QuoteItem } from '@/lib/types/quote'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const UNIT_OPTIONS = [
  { value: 'st', label: 'st' },
  { value: 'tim', label: 'tim' },
  { value: 'm', label: 'm' },
  { value: 'm2', label: 'm²' },
  { value: 'lm', label: 'lm' },
  { value: 'kg', label: 'kg' },
  { value: 'pauschal', label: 'pauschal' },
]

export const ITEM_TYPE_STYLES: Record<QuoteItem['item_type'], string> = {
  item: 'bg-gray-50',
  heading: 'bg-teal-50 font-bold',
  text: 'bg-gray-50 italic',
  subtotal: 'bg-gray-100 font-medium',
  discount: 'bg-red-50',
}

export const ITEM_TYPE_BADGE: Record<QuoteItem['item_type'], { label: string; cls: string }> = {
  item: { label: 'Post', cls: 'bg-teal-100 text-teal-700' },
  heading: { label: 'Rubrik', cls: 'bg-indigo-100 text-indigo-700' },
  text: { label: 'Text', cls: 'bg-gray-200 text-gray-600' },
  subtotal: { label: 'Delsumma', cls: 'bg-gray-300 text-gray-700' },
  discount: { label: 'Rabatt', cls: 'bg-red-100 text-red-700' },
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ItemRowProps {
  item: QuoteItem
  index: number
  total: number
  recalculatedTotal: number
  onUpdate: (id: string, field: keyof QuoteItem, value: any) => void
  onRemove: (id: string) => void
  onMove: (index: number, direction: 'up' | 'down') => void
  allCategories: { slug: string; label: string }[]
  /** If provided, enables inline new-category creation */
  onCreateCategory?: (label: string, itemId: string) => void
  showNewCategoryInput?: string | null
  setShowNewCategoryInput?: (id: string | null) => void
  newCategoryLabel?: string
  setNewCategoryLabel?: (label: string) => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ItemRow({
  item,
  index,
  total: itemCount,
  recalculatedTotal,
  onUpdate,
  onRemove,
  onMove,
  allCategories,
  onCreateCategory,
  showNewCategoryInput,
  setShowNewCategoryInput,
  newCategoryLabel,
  setNewCategoryLabel,
}: ItemRowProps) {
  const badge = ITEM_TYPE_BADGE[item.item_type]
  const rowStyle = ITEM_TYPE_STYLES[item.item_type]
  const isEditable = item.item_type === 'item' || item.item_type === 'discount'
  const showTotal = item.item_type === 'item' || item.item_type === 'discount' || item.item_type === 'subtotal'
  const displayTotal =
    item.item_type === 'subtotal' ? recalculatedTotal : item.total

  const isCreatingCategory = showNewCategoryInput === item.id && onCreateCategory

  return (
    <div className={`rounded-xl p-3 ${rowStyle} border border-gray-200`}>
      {/* ── Mobile layout ──────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => onMove(index, 'up')}
              disabled={index === 0}
              className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => onMove(index, 'down')}
              disabled={index === itemCount - 1}
              className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          </div>
          <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
            placeholder={
              item.item_type === 'heading'
                ? 'Rubriktext'
                : item.item_type === 'text'
                  ? 'Fritext...'
                  : 'Beskrivning'
            }
            className={`flex-1 px-3 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 min-w-0 ${
              item.item_type === 'heading' ? 'font-bold' : ''
            } ${item.item_type === 'text' ? 'italic' : ''}`}
          />
          <button
            onClick={() => onRemove(item.id)}
            className="p-1.5 text-gray-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {isEditable && (
          <div className="flex items-center gap-2 pl-8">
            <input
              type="number"
              value={item.quantity}
              onChange={(e) => onUpdate(item.id, 'quantity', parseFloat(e.target.value) || 0)}
              className="w-16 px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              min={0}
              step="any"
            />
            <select
              value={item.unit}
              onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
              className="w-20 px-1 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={item.unit_price}
              onChange={(e) =>
                onUpdate(item.id, 'unit_price', parseFloat(e.target.value) || 0)
              }
              className="w-24 px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              min={0}
              step="any"
            />
            <span className="text-gray-900 font-medium text-sm flex-1 text-right whitespace-nowrap">
              {formatCurrency(displayTotal)}
            </span>
          </div>
        )}
        {isEditable && (
          <div className="flex items-center gap-3 pl-8 text-xs">
            <CategorySelect
              item={item}
              allCategories={allCategories}
              onUpdate={onUpdate}
              isCreatingCategory={!!isCreatingCategory}
              onCreateCategory={onCreateCategory}
              showNewCategoryInput={showNewCategoryInput}
              setShowNewCategoryInput={setShowNewCategoryInput}
              newCategoryLabel={newCategoryLabel}
              setNewCategoryLabel={setNewCategoryLabel}
            />
            <select
              value={item.rot_rut_type || (item.is_rot_eligible ? 'rot' : item.is_rut_eligible ? 'rut' : '')}
              onChange={(e) => onUpdate(item.id, 'rot_rut_type', e.target.value || null)}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 text-gray-700 bg-white focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">Ingen</option>
              <option value="rot">ROT (30%)</option>
              <option value="rut">RUT (50%)</option>
            </select>
          </div>
        )}
        {showTotal && !isEditable && (
          <div className="flex justify-end pr-8">
            <span className="text-gray-900 font-medium text-sm">
              {formatCurrency(displayTotal)}
            </span>
          </div>
        )}
      </div>

      {/* ── Desktop layout ─────────────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[32px_56px_minmax(180px,1fr)_56px_60px_76px_76px_76px_48px_32px] gap-1.5 items-center">
        {/* Move arrows */}
        <div className="flex flex-col gap-0.5 items-center">
          <button
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={() => onMove(index, 'down')}
            disabled={index === itemCount - 1}
            className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>

        {/* Type badge */}
        <span className={`px-2 py-0.5 text-[10px] rounded font-medium text-center ${badge.cls}`}>
          {badge.label}
        </span>

        {/* Description */}
        <input
          type="text"
          value={item.description}
          onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
          placeholder={
            item.item_type === 'heading'
              ? 'Rubriktext'
              : item.item_type === 'text'
                ? 'Fritext...'
                : item.item_type === 'subtotal'
                  ? 'Delsumma'
                  : 'Beskrivning'
          }
          className={`w-full px-3 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 ${
            item.item_type === 'heading' ? 'font-bold' : ''
          } ${item.item_type === 'text' ? 'italic' : ''}`}
        />

        {/* Quantity */}
        {isEditable ? (
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => onUpdate(item.id, 'quantity', parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            min={0}
            step="any"
          />
        ) : (
          <span />
        )}

        {/* Unit */}
        {isEditable ? (
          <select
            value={item.unit}
            onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
            className="w-full px-1 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}

        {/* Unit price */}
        {isEditable ? (
          <input
            type="number"
            value={item.unit_price}
            onChange={(e) =>
              onUpdate(item.id, 'unit_price', parseFloat(e.target.value) || 0)
            }
            className="w-full px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            min={0}
            step="any"
          />
        ) : (
          <span />
        )}

        {/* Total */}
        <span className="text-gray-900 font-medium text-sm text-right whitespace-nowrap">
          {showTotal ? formatCurrency(displayTotal) : ''}
        </span>

        {/* Category dropdown */}
        {isEditable ? (
          <div className="flex items-center justify-center">
            <CategorySelect
              item={item}
              allCategories={allCategories}
              onUpdate={onUpdate}
              isCreatingCategory={!!isCreatingCategory}
              onCreateCategory={onCreateCategory}
              showNewCategoryInput={showNewCategoryInput}
              setShowNewCategoryInput={setShowNewCategoryInput}
              newCategoryLabel={newCategoryLabel}
              setNewCategoryLabel={setNewCategoryLabel}
            />
          </div>
        ) : (
          <span />
        )}

        {/* ROT/RUT dropdown */}
        {isEditable ? (
          <div className="flex items-center justify-center">
            <select
              value={item.rot_rut_type || (item.is_rot_eligible ? 'rot' : item.is_rut_eligible ? 'rut' : '')}
              onChange={(e) => onUpdate(item.id, 'rot_rut_type', e.target.value || null)}
              className="text-xs border border-gray-200 rounded-md px-1.5 py-0.5 text-gray-700 bg-white focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
            >
              <option value="">—</option>
              <option value="rot">ROT</option>
              <option value="rut">RUT</option>
            </select>
          </div>
        ) : (
          <span />
        )}

        {/* Delete */}
        <button
          onClick={() => onRemove(item.id)}
          className="p-1.5 text-gray-400 hover:text-red-600 justify-self-center"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category select (handles inline creation)
// ---------------------------------------------------------------------------

function CategorySelect({
  item,
  allCategories,
  onUpdate,
  isCreatingCategory,
  onCreateCategory,
  showNewCategoryInput,
  setShowNewCategoryInput,
  newCategoryLabel,
  setNewCategoryLabel,
}: {
  item: QuoteItem
  allCategories: { slug: string; label: string }[]
  onUpdate: (id: string, field: keyof QuoteItem, value: any) => void
  isCreatingCategory: boolean
  onCreateCategory?: (label: string, itemId: string) => void
  showNewCategoryInput?: string | null
  setShowNewCategoryInput?: (id: string | null) => void
  newCategoryLabel?: string
  setNewCategoryLabel?: (label: string) => void
}) {
  if (isCreatingCategory && onCreateCategory && setShowNewCategoryInput && setNewCategoryLabel) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={newCategoryLabel || ''}
          onChange={(e) => setNewCategoryLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (newCategoryLabel || '').trim()) {
              onCreateCategory((newCategoryLabel || '').trim(), item.id)
            } else if (e.key === 'Escape') {
              setShowNewCategoryInput(null)
              setNewCategoryLabel('')
            }
          }}
          placeholder="Namn..."
          autoFocus
          className="w-full px-1.5 py-[5px] text-[11px] border border-[#0F766E] rounded bg-white text-[#1E293B] focus:outline-none"
        />
      </div>
    )
  }

  return (
    <select
      value={item.category_slug ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new__' && setShowNewCategoryInput && setNewCategoryLabel) {
          setShowNewCategoryInput(item.id)
          setNewCategoryLabel('')
        } else {
          onUpdate(item.id, 'category_slug', e.target.value || undefined)
        }
      }}
      className="px-2 py-1 text-[12px] border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] focus:outline-none focus:border-[#0F766E]"
    >
      <option value="">Kategori —</option>
      <optgroup label="Arbete">
        {allCategories.filter(c => c.slug.startsWith('arbete')).map(c => (
          <option key={c.slug} value={c.slug}>{c.label}</option>
        ))}
      </optgroup>
      <optgroup label="Material">
        {allCategories.filter(c => c.slug.startsWith('material')).map(c => (
          <option key={c.slug} value={c.slug}>{c.label}</option>
        ))}
      </optgroup>
      <optgroup label="Övrigt">
        {allCategories.filter(c => !c.slug.startsWith('arbete') && !c.slug.startsWith('material')).map(c => (
          <option key={c.slug} value={c.slug}>{c.label}</option>
        ))}
      </optgroup>
      {onCreateCategory && <option value="__new__">+ Ny kategori</option>}
    </select>
  )
}
