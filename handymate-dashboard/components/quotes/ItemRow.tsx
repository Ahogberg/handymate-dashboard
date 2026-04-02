'use client'

import { GripVertical, Trash2 } from 'lucide-react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
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
  item: '',
  heading: 'bg-slate-50',
  text: '',
  subtotal: 'bg-slate-50',
  discount: 'bg-red-50/40',
}

export const ITEM_TYPE_BADGE: Record<QuoteItem['item_type'], { label: string; cls: string }> = {
  item: { label: 'Post', cls: 'bg-primary-50 text-primary-700' },
  heading: { label: 'Rubrik', cls: 'bg-indigo-50 text-indigo-700' },
  text: { label: 'Text', cls: 'bg-gray-100 text-gray-600' },
  subtotal: { label: 'Delsumma', cls: 'bg-gray-200 text-gray-700' },
  discount: { label: 'Rabatt', cls: 'bg-red-50 text-red-700' },
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
  const displayTotal = item.item_type === 'subtotal' ? recalculatedTotal : item.total
  const isCreatingCategory = showNewCategoryInput === item.id && onCreateCategory

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg border hover:border-gray-300 hover:bg-slate-50/50 transition-colors ${rowStyle} ${isDragging ? 'border-primary-500 shadow-lg bg-white' : 'border-gray-200'}`}
    >

      {/* ── Mobile layout (< md) ─────────────────────────────── */}
      <div className="md:hidden p-3 space-y-2">
        {/* Row 1: Description */}
        <div className="flex items-center gap-2">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 touch-none shrink-0"
          >
            <GripVertical className="w-4 h-4" />
          </button>
          <span className={`shrink-0 px-1.5 py-0.5 text-[9px] rounded font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
            placeholder={item.item_type === 'heading' ? 'Rubriktext' : item.item_type === 'text' ? 'Fritext...' : 'Beskrivning'}
            className={`flex-1 min-w-0 px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary-600 ${
              item.item_type === 'heading' ? 'font-bold' : ''} ${item.item_type === 'text' ? 'italic' : ''}`}
          />
          <button onClick={() => onRemove(item.id)} className="p-1 text-gray-300 hover:text-red-500 shrink-0">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Row 2: Antal | Enhet | Pris | Summa */}
        {isEditable && (
          <div className="flex items-center gap-1.5">
            <input type="number" value={item.quantity} onChange={(e) => onUpdate(item.id, 'quantity', parseFloat(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className="w-14 px-1.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-600" min={0} step="any" />
            <select value={item.unit} onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
              className="w-16 px-1 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary-600">
              {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
            <input type="number" value={item.unit_price} onChange={(e) => onUpdate(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
              onFocus={(e) => e.target.select()}
              className="w-20 px-1.5 py-1.5 bg-white border border-gray-200 rounded-lg text-gray-900 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary-600" min={0} step="any" />
            <span className="flex-1 text-right text-xs font-medium text-gray-900 whitespace-nowrap">{formatCurrency(displayTotal)}</span>
          </div>
        )}
        {showTotal && !isEditable && (
          <div className="text-right"><span className="text-xs font-medium text-gray-900">{formatCurrency(displayTotal)}</span></div>
        )}
      </div>

      {/* ── Desktop layout (≥ md) ────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[24px_56px_1fr_56px_64px_80px_80px_100px_64px_28px] gap-1 items-center px-2 py-2">

        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-0.5 text-gray-300 hover:text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity touch-none"
          title="Dra för att flytta"
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Type badge */}
        <span className={`px-1.5 py-0.5 text-[9px] rounded font-medium text-center truncate ${badge.cls}`}>
          {badge.label}
        </span>

        {/* Description — takes all remaining space */}
        <input
          type="text"
          value={item.description}
          onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
          placeholder={item.item_type === 'heading' ? 'Rubriktext' : item.item_type === 'text' ? 'Fritext...' : item.item_type === 'subtotal' ? 'Delsumma' : 'Beskrivning'}
          className={`w-full min-w-0 px-2 py-1.5 bg-white/80 border border-gray-200 rounded-md text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary-600 focus:border-primary-600 ${
            item.item_type === 'heading' ? 'font-bold' : ''} ${item.item_type === 'text' ? 'italic' : ''}`}
        />

        {/* Quantity */}
        {isEditable ? (
          <input type="number" value={item.quantity} onChange={(e) => onUpdate(item.id, 'quantity', parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="w-full min-w-0 px-1 py-1.5 bg-white/80 border border-gray-200 rounded-md text-gray-900 text-xs text-center focus:outline-none focus:ring-1 focus:ring-primary-600" min={0} step="any" />
        ) : <span />}

        {/* Unit */}
        {isEditable ? (
          <select value={item.unit} onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
            className="w-full min-w-0 px-0.5 py-1.5 bg-white/80 border border-gray-200 rounded-md text-gray-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary-600">
            {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        ) : <span />}

        {/* Unit price */}
        {isEditable ? (
          <input type="number" value={item.unit_price} onChange={(e) => onUpdate(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
            onFocus={(e) => e.target.select()}
            className="w-full min-w-0 px-1 py-1.5 bg-white/80 border border-gray-200 rounded-md text-gray-900 text-xs text-right focus:outline-none focus:ring-1 focus:ring-primary-600" min={0} step="any" />
        ) : <span />}

        {/* Total */}
        <span className="text-gray-900 font-medium text-xs text-right whitespace-nowrap truncate">
          {showTotal ? formatCurrency(displayTotal) : ''}
        </span>

        {/* Category */}
        {isEditable ? (
          <div className="min-w-0 overflow-hidden">
            <CategorySelect item={item} allCategories={allCategories} onUpdate={onUpdate}
              isCreatingCategory={!!isCreatingCategory} onCreateCategory={onCreateCategory}
              showNewCategoryInput={showNewCategoryInput} setShowNewCategoryInput={setShowNewCategoryInput}
              newCategoryLabel={newCategoryLabel} setNewCategoryLabel={setNewCategoryLabel} />
          </div>
        ) : <span />}

        {/* ROT/RUT */}
        {isEditable ? (
          <select value={item.rot_rut_type || (item.is_rot_eligible ? 'rot' : item.is_rut_eligible ? 'rut' : '')}
            onChange={(e) => onUpdate(item.id, 'rot_rut_type', e.target.value || null)}
            className="w-full min-w-0 text-[10px] border border-gray-200 rounded-md px-1 py-1 text-gray-600 bg-white focus:ring-1 focus:ring-primary-600">
            <option value="">—</option><option value="rot">ROT</option><option value="rut">RUT</option>
          </select>
        ) : <span />}

        {/* Delete — visible on hover */}
        <button onClick={() => onRemove(item.id)}
          className="p-1 text-gray-200 opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all justify-self-center">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Category select
// ---------------------------------------------------------------------------

function CategorySelect({
  item, allCategories, onUpdate, isCreatingCategory, onCreateCategory,
  showNewCategoryInput, setShowNewCategoryInput, newCategoryLabel, setNewCategoryLabel,
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
      <input type="text" value={newCategoryLabel || ''} autoFocus
        onChange={(e) => setNewCategoryLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (newCategoryLabel || '').trim()) onCreateCategory((newCategoryLabel || '').trim(), item.id)
          else if (e.key === 'Escape') { setShowNewCategoryInput(null); setNewCategoryLabel('') }
        }}
        placeholder="Namn..."
        className="w-full px-1.5 py-1 text-[10px] border border-primary-600 rounded bg-white text-gray-900 focus:outline-none" />
    )
  }

  return (
    <select value={item.category_slug ?? ''}
      onChange={(e) => {
        if (e.target.value === '__new__' && setShowNewCategoryInput && setNewCategoryLabel) {
          setShowNewCategoryInput(item.id); setNewCategoryLabel('')
        } else { onUpdate(item.id, 'category_slug', e.target.value || undefined) }
      }}
      className="w-full min-w-0 px-1 py-1 text-[10px] border border-gray-200 rounded-md bg-white text-gray-500 focus:outline-none focus:border-primary-600">
      <option value="">Kategori</option>
      <optgroup label="Arbete">
        {allCategories.filter(c => c.slug.startsWith('arbete')).map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
      </optgroup>
      <optgroup label="Material">
        {allCategories.filter(c => c.slug.startsWith('material')).map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
      </optgroup>
      <optgroup label="Övrigt">
        {allCategories.filter(c => !c.slug.startsWith('arbete') && !c.slug.startsWith('material')).map(c => <option key={c.slug} value={c.slug}>{c.label}</option>)}
      </optgroup>
      {onCreateCategory && <option value="__new__">+ Ny</option>}
    </select>
  )
}
