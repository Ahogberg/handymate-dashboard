'use client'

import { useEffect } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import type { InvoiceItem, InvoiceItemType } from '@/lib/types/invoice'

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

const TYPE_LABEL: Record<InvoiceItemType, string> = {
  item: 'Rad',
  heading: 'Rubrik',
  text: 'Fritext',
  subtotal: 'Delsumma',
  discount: 'Rabatt',
}

const FIELD_CLS =
  'w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-primary-600'

/**
 * ETAPP 6c (offert-masterplan.md, faktura-sprinten): fakturans motsvarighet
 * till components/quotes/document/RowEditSheet.tsx. Byggd som en TUNN egen
 * variant (inte en återanvändning) — kartläggningens risk-punkt: RowEditSheet
 * tar en QuoteItem och exponerar kategori + grön teknik-val som fakturan
 * inte har någon motsvarighet till (InvoiceItem saknar category_slug helt,
 * och ROT/RUT är EN global avdragstyp per faktura — inte per-rad-val bland
 * rot/rut/grön som offertens rot_rut_type-cykel). Samma 44px-fältstorlek
 * och visuella skal som RowEditSheet för konsekvent känsla.
 */
interface InvoiceRowEditSheetProps {
  item: InvoiceItem | null
  /** '' | 'rot' | 'rut' — fakturans EN globala avdragstyp (se
      InvoiceRotMomsSection). Styr om/vilken ROT/RUT-checkbox visas —
      samma modell som LineItemEditor.tsx:s mobilvy redan använder. */
  rotRutType: string
  onUpdate: (id: string, patch: Partial<InvoiceItem>) => void
  onRemove: (id: string) => void
  onClose: () => void
}

export function InvoiceRowEditSheet({ item, rotRutType, onUpdate, onRemove, onClose }: InvoiceRowEditSheetProps) {
  useEffect(() => {
    if (!item) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [item, onClose])

  if (!item) return null

  const itemType = item.item_type || 'item'
  const isEditable = itemType === 'item' || itemType === 'discount'
  const label = TYPE_LABEL[itemType] || 'Rad'
  const hasRotRut = rotRutType === 'rot' || rotRutType === 'rut'
  const rotRutChecked = rotRutType === 'rot' ? item.is_rot_eligible : item.is_rut_eligible

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center lg:hidden">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/45 rowsheet-fade" aria-hidden />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Redigera ${label.toLowerCase()}`}
        className="relative w-full max-w-lg max-h-[85vh] bg-white rounded-t-2xl shadow-2xl flex flex-col rowsheet-up"
      >
        <div className="flex justify-center pt-2.5 pb-1 shrink-0" aria-hidden>
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Stäng"
            className="p-2 -m-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Beskrivning</label>
            <input
              type="text"
              autoFocus
              value={item.description}
              onChange={e => onUpdate(item.id, { description: e.target.value })}
              placeholder={itemType === 'heading' ? 'Rubriktext' : itemType === 'text' ? 'Fritext…' : 'Beskrivning'}
              className={FIELD_CLS}
            />
          </div>

          {isEditable && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Antal</label>
                <input
                  type="number"
                  value={item.quantity}
                  onFocus={e => e.target.select()}
                  onChange={e => onUpdate(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                  min={0}
                  step="any"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Enhet</label>
                <select value={item.unit} onChange={e => onUpdate(item.id, { unit: e.target.value })} className={FIELD_CLS}>
                  {UNITS.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Á-pris</label>
                <input
                  type="number"
                  value={Math.abs(item.unit_price)}
                  onFocus={e => e.target.select()}
                  onChange={e => onUpdate(item.id, { unit_price: parseFloat(e.target.value) || 0 })}
                  min={0}
                  step="any"
                  className={FIELD_CLS}
                />
              </div>
            </div>
          )}

          {isEditable && hasRotRut && (
            <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rotRutChecked ?? false}
                onChange={e => {
                  if (rotRutType === 'rot') onUpdate(item.id, { is_rot_eligible: e.target.checked, is_rut_eligible: false })
                  else onUpdate(item.id, { is_rut_eligible: e.target.checked, is_rot_eligible: false })
                }}
                className="w-5 h-5 rounded border-slate-300 accent-teal-600 cursor-pointer"
              />
              <span className="text-sm font-medium text-teal-700">{rotRutType.toUpperCase()}-berättigad</span>
            </label>
          )}
        </div>

        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => { onRemove(item.id); onClose() }}
            className="inline-flex items-center gap-1.5 px-4 min-h-[44px] text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Ta bort
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto inline-flex items-center gap-1.5 px-5 min-h-[44px] bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Check className="w-4 h-4" />
            Klart
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes rowsheet-fade-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes rowsheet-slide-up { from { transform: translateY(100%) } to { transform: translateY(0) } }
        .rowsheet-fade { animation: rowsheet-fade-in 180ms ease; }
        .rowsheet-up { animation: rowsheet-slide-up 260ms cubic-bezier(0.34, 1.56, 0.64, 1); }
      `}</style>
    </div>
  )
}
