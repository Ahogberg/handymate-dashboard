'use client'

import { useState, useRef } from 'react'
import {
  Plus,
  Trash2,
  GripVertical,
  Type,
  AlignLeft,
  Calculator,
  Percent,
  Package
} from 'lucide-react'
import { InvoiceItem, InvoiceItemType } from '@/lib/types/invoice'
import {
  createDefaultInvoiceItem,
  recalculateItems,
  generateInvoiceItemId
} from '@/lib/invoice-calculations'

interface LineItemEditorProps {
  items: InvoiceItem[]
  onChange: (items: InvoiceItem[]) => void
  rotRutType?: string
}

const UNITS = [
  { value: 'st', label: 'st' },
  { value: 'timmar', label: 'timmar' },
  { value: 'h', label: 'h' },
  { value: 'm', label: 'm' },
  { value: 'm²', label: 'm²' },
  { value: 'm³', label: 'm³' },
  { value: 'kg', label: 'kg' },
  { value: 'l', label: 'l' },
  { value: 'paket', label: 'paket' },
]

const ITEM_TYPE_CONFIG: Record<InvoiceItemType, { label: string; color: string; bgColor: string }> = {
  item: { label: 'Rad', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  heading: { label: 'Rubrik', color: 'text-sky-700', bgColor: 'bg-teal-50' },
  text: { label: 'Fritext', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  subtotal: { label: 'Delsumma', color: 'text-amber-600', bgColor: 'bg-amber-50' },
  discount: { label: 'Rabatt', color: 'text-green-600', bgColor: 'bg-green-50' },
}

export default function LineItemEditor({ items, onChange, rotRutType }: LineItemEditorProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  const addItem = (type: InvoiceItemType) => {
    const sortOrder = items.length
    const newItem = createDefaultInvoiceItem(type, sortOrder)
    const updated = [...items, newItem]
    onChange(recalculateItems(updated))
  }

  const updateItem = (index: number, updates: Partial<InvoiceItem>) => {
    const newItems = items.map((item, i) => {
      if (i !== index) return item
      const updated = { ...item, ...updates }
      // Auto-calc total for regular items
      if ((updated.item_type || 'item') === 'item' && ('quantity' in updates || 'unit_price' in updates)) {
        updated.total = updated.quantity * updated.unit_price
      }
      if (updated.item_type === 'discount' && ('quantity' in updates || 'unit_price' in updates)) {
        updated.total = -(Math.abs(updated.quantity) * Math.abs(updated.unit_price))
      }
      return updated
    })
    onChange(recalculateItems(newItems))
  }

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index)
    onChange(recalculateItems(newItems))
  }

  // Drag & drop handlers
  const handleDragStart = (index: number) => {
    dragRef.current = index
    setDragIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    setDragOverIndex(index)
  }

  const handleDrop = (index: number) => {
    if (dragRef.current === null) return
    const fromIndex = dragRef.current
    if (fromIndex === index) return

    const newItems = [...items]
    const [moved] = newItems.splice(fromIndex, 1)
    newItems.splice(index, 0, moved)

    // Update sort_order
    const reordered = newItems.map((item, i) => ({ ...item, sort_order: i }))
    onChange(recalculateItems(reordered))
    setDragIndex(null)
    setDragOverIndex(null)
    dragRef.current = null
  }

  const handleDragEnd = () => {
    setDragIndex(null)
    setDragOverIndex(null)
    dragRef.current = null
  }

  const renderItemRow = (item: InvoiceItem, index: number) => {
    const itemType = item.item_type || 'item'
    const typeConfig = ITEM_TYPE_CONFIG[itemType]
    const isDragging = dragIndex === index
    const isDragOver = dragOverIndex === index

    return (
      <div
        key={item.id}
        draggable
        onDragStart={() => handleDragStart(index)}
        onDragOver={(e) => handleDragOver(e, index)}
        onDrop={() => handleDrop(index)}
        onDragEnd={handleDragEnd}
        className={`group rounded-xl border transition-all ${
          isDragging ? 'opacity-50 border-teal-300' :
          isDragOver ? 'border-teal-400 bg-teal-50/50' :
          'border-gray-200 bg-white hover:border-gray-300'
        }`}
      >
        <div className="p-3 sm:p-4">
          {/* Type badge + drag handle */}
          <div className="flex items-center gap-2 mb-3">
            <div className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500">
              <GripVertical className="w-4 h-4" />
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${typeConfig.bgColor} ${typeConfig.color}`}>
              {typeConfig.label}
            </span>
            {(itemType === 'item' && rotRutType) && (
              <label className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
                <input
                  type="checkbox"
                  checked={rotRutType === 'rot' ? item.is_rot_eligible : item.is_rut_eligible}
                  onChange={(e) => {
                    if (rotRutType === 'rot') {
                      updateItem(index, { is_rot_eligible: e.target.checked, is_rut_eligible: false })
                    } else {
                      updateItem(index, { is_rut_eligible: e.target.checked, is_rot_eligible: false })
                    }
                  }}
                  className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                />
                {rotRutType.toUpperCase()}-berättigad
              </label>
            )}
            <button
              onClick={() => removeItem(index)}
              className="ml-auto p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {/* Heading row */}
          {itemType === 'heading' && (
            <input
              type="text"
              value={item.description}
              onChange={(e) => updateItem(index, { description: e.target.value })}
              placeholder="Rubrik..."
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 font-semibold focus:outline-none focus:ring-2 focus:ring-teal-500/50"
            />
          )}

          {/* Text row */}
          {itemType === 'text' && (
            <textarea
              value={item.description}
              onChange={(e) => updateItem(index, { description: e.target.value })}
              placeholder="Fritext..."
              rows={2}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none"
            />
          )}

          {/* Subtotal row */}
          {itemType === 'subtotal' && (
            <div className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg">
              <input
                type="text"
                value={item.description}
                onChange={(e) => updateItem(index, { description: e.target.value })}
                className="bg-transparent text-amber-700 font-medium focus:outline-none"
              />
              <span className="text-amber-700 font-semibold">
                {item.total.toLocaleString('sv-SE')} kr
              </span>
            </div>
          )}

          {/* Regular item or discount row */}
          {(itemType === 'item' || itemType === 'discount') && (
            <div className="flex flex-col md:flex-row md:items-end gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-xs text-gray-400 mb-1">Beskrivning</label>
                <input
                  type="text"
                  value={item.description}
                  onChange={(e) => updateItem(index, { description: e.target.value })}
                  placeholder={itemType === 'discount' ? 'Rabattbeskrivning...' : 'Beskrivning...'}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="w-20">
                  <label className="block text-xs text-gray-400 mb-1">Antal</label>
                  <input
                    type="number"
                    step="0.5"
                    value={item.quantity}
                    onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs text-gray-400 mb-1">Enhet</label>
                  <select
                    value={item.unit}
                    onChange={(e) => updateItem(index, { unit: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  >
                    {UNITS.map(u => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-xs text-gray-400 mb-1">à-pris</label>
                  <input
                    type="number"
                    value={Math.abs(item.unit_price)}
                    onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div className="w-28 text-right">
                  <label className="block text-xs text-gray-400 mb-1">Summa</label>
                  <p className={`py-2 font-medium text-sm ${itemType === 'discount' ? 'text-green-600' : 'text-gray-900'}`}>
                    {itemType === 'discount' && '-'}
                    {Math.abs(item.total).toLocaleString('sv-SE')} kr
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Rader</h2>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-xl mb-4">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-400 mb-2">Inga rader ännu</p>
          <p className="text-sm text-gray-400">Lägg till rader med knapparna nedan</p>
        </div>
      ) : (
        <div className="space-y-2 mb-4">
          {items.map((item, index) => renderItemRow(item, index))}
        </div>
      )}

      {/* Add buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => addItem('item')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-teal-50 border border-teal-200 rounded-xl text-sky-700 hover:bg-teal-100 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Rad
        </button>
        <button
          onClick={() => addItem('heading')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Type className="w-3.5 h-3.5" />
          Rubrik
        </button>
        <button
          onClick={() => addItem('text')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <AlignLeft className="w-3.5 h-3.5" />
          Fritext
        </button>
        <button
          onClick={() => addItem('subtotal')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Calculator className="w-3.5 h-3.5" />
          Delsumma
        </button>
        <button
          onClick={() => addItem('discount')}
          className="flex items-center gap-1.5 px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors"
        >
          <Percent className="w-3.5 h-3.5" />
          Rabatt
        </button>
      </div>
    </div>
  )
}
