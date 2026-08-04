'use client'

import { useEffect } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import type { QuoteItem, QuoteItemType } from '@/lib/types/quote'
import { UNIT_OPTIONS } from '@/components/quotes/ItemRow'

interface RowEditSheetProps {
  /** null → sheeten är stängd (inget att redigera). */
  item: QuoteItem | null
  allCategories: { slug: string; label: string }[]
  onUpdate: (id: string, field: keyof QuoteItem, value: any) => void
  onRemove: (id: string) => void
  onClose: () => void
}

const TYPE_LABEL: Record<QuoteItemType, string> = {
  item: 'Rad',
  heading: 'Rubrik',
  text: 'Fritext',
  subtotal: 'Delsumma',
  discount: 'Rabatt',
  option: 'Tillval',
}

const FIELD_CLS =
  'w-full min-h-[44px] px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-900 text-base focus:outline-none focus:ring-2 focus:ring-primary-600'

/**
 * RowEditSheet — ETAPP 3 (offert-masterplan.md), punkt 2: bottom-sheet-
 * radeditorn som QuoteDocument.tsx:s sheetMode öppnar via onRowTap. Alla
 * fält ≥44px — mobilcanvasens A4-skala gör dagens inline-fält (30px, se
 * kartläggningen) för små för touch, så raden blir tappbar och alla värden
 * redigeras här istället.
 *
 * Tar RAW QuoteItem (inte QuoteTemplateItem) + samma onUpdate/onRemove som
 * ItemRow.tsx (listvyn) — dokumentmotorns QuoteItemPatch/QuoteDocumentHandlers
 * saknar kategori helt (QuoteTemplateItem har inget categorySlug-fält, se
 * lib/quote-templates/types.ts — kategorin är intern bokföringsdata, aldrig
 * kundfacing, och hör därför inte hemma i dokumentdatan). Sidan (new/edit)
 * äger `items`/`allCategories`/`updateItem`/`removeItem` redan — samma
 * enda källa som QuoteItemsSection — så sheeten återanvänder dem rakt av
 * istället för att uppfinna en egen datavåg.
 */
export function RowEditSheet({ item, allCategories, onUpdate, onRemove, onClose }: RowEditSheetProps) {
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

  const isEditable = item.item_type === 'item' || item.item_type === 'discount' || item.item_type === 'option'
  const isOption = item.item_type === 'option'
  const label = TYPE_LABEL[item.item_type]

  const toggleOptionDefault = (checked: boolean) => {
    onUpdate(item.id, 'option_default', checked)
    onUpdate(item.id, 'option_selected', checked)
  }

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
              onChange={e => onUpdate(item.id, 'description', e.target.value)}
              placeholder={
                item.item_type === 'heading' ? 'Rubriktext' : item.item_type === 'text' ? 'Fritext…' : 'Beskrivning'
              }
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
                  onChange={e => onUpdate(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                  min={0}
                  step="any"
                  className={FIELD_CLS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Enhet</label>
                <select value={item.unit} onChange={e => onUpdate(item.id, 'unit', e.target.value)} className={FIELD_CLS}>
                  {UNIT_OPTIONS.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Á-pris</label>
                <input
                  type="number"
                  value={item.unit_price}
                  onFocus={e => e.target.select()}
                  onChange={e => onUpdate(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                  min={0}
                  step="any"
                  className={FIELD_CLS}
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">Kategori</label>
                <select
                  value={item.category_slug ?? ''}
                  onChange={e => onUpdate(item.id, 'category_slug', e.target.value || undefined)}
                  className={FIELD_CLS}
                >
                  <option value="">Välj kategori…</option>
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
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1.5">ROT/RUT</label>
                <select
                  value={item.rot_rut_type || (item.is_rot_eligible ? 'rot' : item.is_rut_eligible ? 'rut' : '')}
                  onChange={e => onUpdate(item.id, 'rot_rut_type', e.target.value || null)}
                  className={FIELD_CLS}
                >
                  <option value="">Inget avdrag</option>
                  <option value="rot">ROT</option>
                  <option value="rut">RUT</option>
                  <optgroup label="Grön teknik">
                    <option value="gron_solceller">Solceller (15%)</option>
                    <option value="gron_lagring">Batteri (50%)</option>
                    <option value="gron_laddpunkt">Laddbox (50%)</option>
                  </optgroup>
                </select>
              </div>
            </div>
          )}

          {isOption && (
            <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={item.option_default ?? false}
                onChange={e => toggleOptionDefault(e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 accent-teal-600 cursor-pointer"
              />
              <span className="text-sm font-medium text-teal-700">Förvald — ikryssat när kunden öppnar offerten</span>
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
