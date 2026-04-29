'use client'

import { useState } from 'react'
import { Loader2, Save, X } from 'lucide-react'

export interface Product {
  id: string
  name: string
  description: string | null
  category: string
  sku: string | null
  unit: string
  purchase_price: number | null
  sales_price: number
  markup_percent: number | null
  rot_eligible: boolean
  rut_eligible: boolean
  vat_rate: number
  is_active: boolean
  is_favorite: boolean
}

export const PRODUCT_UNIT_OPTIONS = [
  { value: 'st', label: 'st' },
  { value: 'tim', label: 'tim' },
  { value: 'm2', label: 'm²' },
  { value: 'm', label: 'm' },
  { value: 'kg', label: 'kg' },
  { value: 'l', label: 'l' },
  { value: 'dag', label: 'dag' },
  { value: 'lpm', label: 'lpm' },
  { value: 'paket', label: 'paket' },
]

export const PRODUCT_CATEGORY_OPTIONS = [
  { value: 'arbete_el', label: 'Arbete — El' },
  { value: 'arbete_vvs', label: 'Arbete — VVS' },
  { value: 'arbete_bygg', label: 'Arbete — Bygg' },
  { value: 'arbete_maleri', label: 'Arbete — Måleri' },
  { value: 'material_el', label: 'Material — El' },
  { value: 'material_vvs', label: 'Material — VVS' },
  { value: 'material_bygg', label: 'Material — Bygg' },
  { value: 'hyra', label: 'Hyra' },
  { value: 'ovrigt', label: 'Övrigt' },
]

export interface ProductInitialValues {
  name?: string
  description?: string | null
  category?: string
  sku?: string | null
  unit?: string
  purchase_price?: number | null
  sales_price?: number
  rot_eligible?: boolean
  rut_eligible?: boolean
  is_favorite?: boolean
}

export interface ProductSavePayload {
  id?: string
  name: string
  description: string | null
  category: string
  sku: string | null
  unit: string
  purchase_price: number | null
  sales_price: number
  rot_eligible: boolean
  rut_eligible: boolean
  is_favorite: boolean
}

interface ProductModalProps {
  /**
   * Befintlig produkt vid redigering. Vid skapande: skicka null.
   */
  product: Product | null
  /**
   * Förvalda värden vid skapande. Användbart för "Spara från offertrad" där
   * vi vill förfylla namn/pris/enhet från raden.
   */
  initialValues?: ProductInitialValues
  /**
   * Titel-override. Default är "Ny produkt" / "Redigera produkt". Använd
   * "Spara i prislistan" från offert-flödet.
   */
  title?: string
  saving: boolean
  onSave: (data: ProductSavePayload) => void
  onClose: () => void
}

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

/**
 * Modal för att skapa eller redigera produkt i prislistan. Används från
 * Inställningar → Produkter och från offertskaparen ("Spara i prislistan").
 */
export function ProductModal({
  product,
  initialValues,
  title,
  saving,
  onSave,
  onClose,
}: ProductModalProps) {
  const [name, setName] = useState(product?.name ?? initialValues?.name ?? '')
  const [description, setDescription] = useState(
    product?.description ?? initialValues?.description ?? '',
  )
  const [category, setCategory] = useState(
    product?.category ?? initialValues?.category ?? 'material_bygg',
  )
  const [sku, setSku] = useState(product?.sku ?? initialValues?.sku ?? '')
  const [unit, setUnit] = useState(product?.unit ?? initialValues?.unit ?? 'st')
  const [purchasePrice, setPurchasePrice] = useState(
    product?.purchase_price?.toString() ??
      (initialValues?.purchase_price != null ? String(initialValues.purchase_price) : ''),
  )
  const [salesPrice, setSalesPrice] = useState(
    product?.sales_price?.toString() ??
      (initialValues?.sales_price != null ? String(initialValues.sales_price) : ''),
  )
  const [rotEligible, setRotEligible] = useState(
    product?.rot_eligible ?? initialValues?.rot_eligible ?? false,
  )
  const [rutEligible, setRutEligible] = useState(
    product?.rut_eligible ?? initialValues?.rut_eligible ?? false,
  )
  const [isFavorite, setIsFavorite] = useState(
    product?.is_favorite ?? initialValues?.is_favorite ?? false,
  )

  const purchase = parseFloat(purchasePrice) || 0
  const sales = parseFloat(salesPrice) || 0
  const markup = purchase > 0 ? Math.round(((sales - purchase) / purchase) * 100) : null

  const resolvedTitle = title || (product ? 'Redigera produkt' : 'Ny produkt')

  function handleSubmit() {
    if (!name.trim() || !salesPrice) return
    onSave({
      ...(product ? { id: product.id } : {}),
      name: name.trim(),
      description: description?.trim() || null,
      category,
      sku: sku?.trim() || null,
      unit,
      purchase_price: purchase || null,
      sales_price: sales,
      rot_eligible: rotEligible,
      rut_eligible: rutEligible,
      is_favorite: isFavorite,
    })
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="font-heading text-lg font-bold text-slate-900 tracking-tight">
            {resolvedTitle}
          </h2>
          <button
            onClick={onClose}
            aria-label="Stäng"
            className="p-1.5 -m-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Namn <span className="text-red-600 normal-case font-medium">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="T.ex. Kakel 30×30 vit"
              autoFocus
              className={INPUT_CLS}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
              Beskrivning
            </label>
            <input
              type="text"
              value={description || ''}
              onChange={e => setDescription(e.target.value)}
              placeholder="Valfri beskrivning"
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Kategori
              </label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={INPUT_CLS}>
                {PRODUCT_CATEGORY_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Artikelnummer
              </label>
              <input
                type="text"
                value={sku || ''}
                onChange={e => setSku(e.target.value)}
                placeholder="Valfritt"
                className={INPUT_CLS}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Inköpspris
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={purchasePrice}
                  onChange={e => setPurchasePrice(e.target.value)}
                  placeholder="0"
                  className={`${INPUT_CLS} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">kr</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Försäljningspris <span className="text-red-600 normal-case font-medium">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={salesPrice}
                  onChange={e => setSalesPrice(e.target.value)}
                  placeholder="0"
                  className={`${INPUT_CLS} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">kr</span>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">
                Enhet
              </label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className={INPUT_CLS}>
                {PRODUCT_UNIT_OPTIONS.map(u => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {markup !== null && (
            <p className="text-xs font-semibold text-primary-700">Påslag: {markup}%</p>
          )}

          <div className="space-y-3 pt-2 border-t border-slate-100">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rotEligible}
                onChange={e => {
                  setRotEligible(e.target.checked)
                  if (e.target.checked) setRutEligible(false)
                }}
                className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-100"
              />
              <span className="text-sm text-slate-700">ROT-berättigad</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rutEligible}
                onChange={e => {
                  setRutEligible(e.target.checked)
                  if (e.target.checked) setRotEligible(false)
                }}
                className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-100"
              />
              <span className="text-sm text-slate-700">RUT-berättigad</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isFavorite}
                onChange={e => setIsFavorite(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-2 focus:ring-amber-100"
              />
              <span className="text-sm text-slate-700">Favorit (visas först)</span>
            </label>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !salesPrice}
            className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {product ? 'Spara' : 'Lägg till'}
          </button>
        </div>
      </div>
    </div>
  )
}
