'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { InvoiceItem, InvoiceItemType } from '@/lib/types/invoice'
import {
  createDefaultInvoiceItem,
  recalculateItems,
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

export default function LineItemEditor({ items, onChange, rotRutType }: LineItemEditorProps) {
  const [showAdvancedTypes, setShowAdvancedTypes] = useState(false)

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

  return (
    <div>
      <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Fakturarader</div>

      {/* Table header (desktop) */}
      {items.length > 0 && (
        <div className="hidden md:grid md:grid-cols-[1fr_72px_88px_96px_32px] gap-2 pb-2 border-b border-thin border-[#E2E8F0] mb-1">
          <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1]">Beskrivning</span>
          <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1] text-right">Antal</span>
          <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1] text-right">Enhet</span>
          <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1] text-right">Pris/enhet</span>
          <span />
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-8 text-[#CBD5E1] text-[13px]">
          <p>Inga rader ännu. Lägg till poster nedan.</p>
        </div>
      ) : (
        <div>
          {items.map((item, index) => {
            const itemType = item.item_type || 'item'
            const isEditable = itemType === 'item' || itemType === 'discount'
            const showTotal = itemType === 'item' || itemType === 'discount' || itemType === 'subtotal'

            return (
              <div key={item.id}>
                {/* Desktop row */}
                <div className="hidden md:grid md:grid-cols-[1fr_72px_88px_96px_32px] gap-2 items-center py-2 border-b border-thin border-[#F1F5F9]">
                  <input
                    type="text"
                    value={item.description}
                    onChange={(e) => updateItem(index, { description: e.target.value })}
                    placeholder={itemType === 'heading' ? 'Rubriktext' : itemType === 'text' ? 'Fritext...' : 'Beskrivning'}
                    className="w-full px-2.5 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  />
                  {isEditable ? (
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                      className="w-full px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-right focus:outline-none focus:border-[#0F766E]"
                      min={0}
                      step="0.5"
                    />
                  ) : (
                    <span />
                  )}
                  {isEditable ? (
                    <select
                      value={item.unit}
                      onChange={(e) => updateItem(index, { unit: e.target.value })}
                      className="w-full px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                    >
                      {UNITS.map((u) => (
                        <option key={u.value} value={u.value}>{u.label}</option>
                      ))}
                    </select>
                  ) : (
                    <span />
                  )}
                  {isEditable ? (
                    <input
                      type="number"
                      value={Math.abs(item.unit_price)}
                      onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                      className="w-full px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-right focus:outline-none focus:border-[#0F766E]"
                      min={0}
                    />
                  ) : showTotal ? (
                    <span className="text-[13px] text-[#1E293B] text-right">{Math.abs(item.total).toLocaleString('sv-SE')} kr</span>
                  ) : (
                    <span />
                  )}
                  <button
                    onClick={() => removeItem(index)}
                    className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#CBD5E1] hover:text-red-500 flex items-center justify-center text-[16px]"
                  >
                    ×
                  </button>
                </div>

                {/* Mobile row */}
                <div className="md:hidden py-3 border-b border-thin border-[#F1F5F9] space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) => updateItem(index, { description: e.target.value })}
                      placeholder="Beskrivning"
                      className="flex-1 px-2.5 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                    />
                    <button
                      onClick={() => removeItem(index)}
                      className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#CBD5E1] hover:text-red-500 flex items-center justify-center text-[16px] shrink-0"
                    >
                      ×
                    </button>
                  </div>
                  {isEditable && (
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, { quantity: Number(e.target.value) })}
                        className="w-16 px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-center focus:outline-none focus:border-[#0F766E]"
                        min={0}
                        step="0.5"
                      />
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(index, { unit: e.target.value })}
                        className="w-20 px-1 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                      >
                        {UNITS.map((u) => (
                          <option key={u.value} value={u.value}>{u.label}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        value={Math.abs(item.unit_price)}
                        onChange={(e) => updateItem(index, { unit_price: Number(e.target.value) })}
                        className="w-24 px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-right focus:outline-none focus:border-[#0F766E]"
                        min={0}
                      />
                      <span className="text-[13px] text-[#1E293B] font-medium flex-1 text-right whitespace-nowrap">
                        {Math.abs(item.total).toLocaleString('sv-SE')} kr
                      </span>
                    </div>
                  )}
                  {isEditable && rotRutType && (
                    <div className="flex items-center gap-3 text-[12px]">
                      <label className="flex items-center gap-1 cursor-pointer">
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
                          className="w-3.5 h-3.5 rounded border-gray-300 text-[#0F766E] focus:ring-[#0F766E]"
                        />
                        <span className="text-[#64748B]">{rotRutType.toUpperCase()}-berättigad</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add row button */}
      <div className="flex items-center gap-4 pt-2.5">
        <button
          onClick={() => addItem('item')}
          className="flex items-center gap-2 text-[13px] text-[#0F766E] bg-transparent border-none cursor-pointer"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#0F766E" strokeWidth="1"/><path d="M8 5v6M5 8h6" stroke="#0F766E" strokeWidth="1.2" strokeLinecap="round"/></svg>
          Lägg till rad
        </button>

        <div className="relative">
          <button
            onClick={() => setShowAdvancedTypes(!showAdvancedTypes)}
            className="text-[12px] text-[#94A3B8] hover:text-[#64748B] transition-colors flex items-center gap-1"
          >
            Fler alternativ
            <ChevronDown className="w-3 h-3" />
          </button>
          {showAdvancedTypes && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowAdvancedTypes(false)} />
              <div className="absolute left-0 top-6 z-20 bg-white border-thin border-[#E2E8F0] rounded-lg shadow-lg w-44 overflow-hidden">
                <button onClick={() => { addItem('heading'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Rubrik</button>
                <button onClick={() => { addItem('text'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Fritext</button>
                <button onClick={() => { addItem('subtotal'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Delsumma</button>
                <button onClick={() => { addItem('discount'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Rabatt</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
