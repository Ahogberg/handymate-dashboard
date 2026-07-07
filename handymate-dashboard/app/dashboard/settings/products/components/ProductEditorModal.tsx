'use client'

import { useMemo, useState } from 'react'
import { Loader2, Plus, Save, Trash2, X } from 'lucide-react'
import { resolveLaborShare, type SnapshotComponent } from '@/lib/products/build-item-snapshot'
import { PRODUCT_UNIT_OPTIONS } from '@/components/products/ProductModal'
import type { ComponentPayload, ProductCategory, ProductRow } from '../types'

const INPUT_CLS =
  'w-full px-3 py-2.5 text-sm bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary-700 focus:ring-2 focus:ring-primary-100 transition-colors'

const LABEL_CLS = 'block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5'

const VAT_OPTIONS = [
  { value: '0.25', label: '25 %' },
  { value: '0.12', label: '12 %' },
  { value: '0.06', label: '6 %' },
  { value: '0', label: '0 %' },
]

interface ComponentDraft {
  component_type: 'arbete' | 'material'
  description: string
  quantity_per_unit: string
  unit: string
  unit_cost: string
}

interface ProductEditorModalProps {
  /** Befintlig produkt vid redigering, null vid skapande */
  product: ProductRow | null
  categories: ProductCategory[]
  saving: boolean
  /**
   * components är null för NYA produkter (komponenter kräver ett produkt-id) —
   * sidan hoppar då över PUT mot components-routen.
   */
  onSave: (payload: Record<string, unknown>, components: ComponentPayload[] | null) => void
  onClose: () => void
  onError: (message: string) => void
}

function formatKr(n: number): string {
  return n.toLocaleString('sv-SE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

/**
 * Produktredigeraren i produktbanken: grundfält + kategori (2 nivåer) +
 * andel arbete (visas bara utan komponenter) + komponentkalkyl.
 * Arbetsandelen i sammanfattningen räknas med resolveLaborShare —
 * samma funktion som offertmotorn använder (en sanning).
 */
export function ProductEditorModal({
  product,
  categories,
  saving,
  onSave,
  onClose,
  onError,
}: ProductEditorModalProps) {
  const [name, setName] = useState(product?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [unit, setUnit] = useState(product?.unit ?? 'st')
  const [salesPrice, setSalesPrice] = useState(product?.sales_price?.toString() ?? '')
  const [vatRate, setVatRate] = useState(product?.vat_rate?.toString() ?? '0.25')
  const [rotEligible, setRotEligible] = useState(product?.rot_eligible ?? false)
  const [rutEligible, setRutEligible] = useState(product?.rut_eligible ?? false)
  const [isActive, setIsActive] = useState(product?.is_active ?? true)
  const [isFavorite, setIsFavorite] = useState(product?.is_favorite ?? false)
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')

  // Andel arbete: null i DB = ingen ROT-split. 0 är GILTIGT (ren material).
  const [shareEnabled, setShareEnabled] = useState(product?.default_labor_share != null)
  const [sharePct, setSharePct] = useState(
    product?.default_labor_share != null ? Math.round(product.default_labor_share * 100) : 60
  )

  const [rows, setRows] = useState<ComponentDraft[]>(
    (product?.components ?? []).map(c => ({
      component_type: c.component_type,
      description: c.description,
      quantity_per_unit: String(c.quantity_per_unit),
      unit: c.unit,
      unit_cost: String(c.unit_cost),
    }))
  )

  const unitLabel = PRODUCT_UNIT_OPTIONS.find(u => u.value === unit)?.label || unit

  // Live-kalkyl — samma resolveLaborShare som snapshot-byggaren/offertmotorn
  const calcComponents: SnapshotComponent[] = useMemo(
    () =>
      rows
        .map(r => ({
          component_type: r.component_type,
          description: r.description.trim(),
          quantity_per_unit: parseFloat(r.quantity_per_unit) || 0,
          unit: r.unit,
          unit_cost: parseFloat(r.unit_cost) || 0,
        }))
        .filter(c => c.quantity_per_unit > 0),
    [rows]
  )
  const calcCost = calcComponents.reduce((s, c) => s + c.quantity_per_unit * c.unit_cost, 0)
  const liveShare = resolveLaborShare(calcComponents, shareEnabled ? sharePct / 100 : null)

  function updateRow(index: number, patch: Partial<ComponentDraft>) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows(prev => [
      ...prev,
      { component_type: 'arbete', description: '', quantity_per_unit: '1', unit: 'tim', unit_cost: '' },
    ])
  }

  function removeRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index))
  }

  function handleSubmit() {
    if (!name.trim()) {
      onError('Produkten behöver ett namn')
      return
    }
    const sales = parseFloat(salesPrice)
    if (Number.isNaN(sales) || sales < 0) {
      onError('Ange ett giltigt pris')
      return
    }

    // Orörda komponentrader släpps tyst: tom beskrivning + tom/0-kostnad +
    // mängd kvar på defaulten '1'. Delvis ifyllda måste vara giltiga.
    const keptRows = rows.filter(r => {
      const untouched =
        r.description.trim() === '' &&
        (r.unit_cost.trim() === '' || parseFloat(r.unit_cost) === 0) &&
        (r.quantity_per_unit.trim() === '' || r.quantity_per_unit.trim() === '1')
      return !untouched
    })
    const components: ComponentPayload[] = []
    for (const r of keptRows) {
      const qty = parseFloat(r.quantity_per_unit)
      const cost = parseFloat(r.unit_cost)
      if (!r.description.trim() || Number.isNaN(qty) || qty <= 0 || Number.isNaN(cost) || cost < 0) {
        onError('Varje komponent behöver beskrivning, mängd över 0 och kostnad (0 eller mer)')
        return
      }
      components.push({
        component_type: r.component_type,
        description: r.description.trim(),
        quantity_per_unit: qty,
        unit: r.unit || 'st',
        unit_cost: cost,
      })
    }

    const payload: Record<string, unknown> = {
      ...(product ? { id: product.id } : {}),
      name: name.trim(),
      description: description.trim() || null,
      sku: sku.trim() || null,
      unit,
      sales_price: sales,
      vat_rate: parseFloat(vatRate),
      rot_eligible: rotEligible,
      rut_eligible: rutEligible,
      is_active: isActive,
      is_favorite: isFavorite,
      category_id: categoryId || null,
    }
    // Andel arbete är bara relevant utan komponenter (komponenterna vinner annars)
    if (components.length === 0) {
      payload.default_labor_share = shareEnabled ? Math.min(100, Math.max(0, sharePct)) / 100 : null
    }

    onSave(payload, product ? components : null)
  }

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="font-heading text-lg font-bold text-slate-900 tracking-tight">
            {product ? 'Redigera produkt' : 'Ny produkt'}
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
            <label className={LABEL_CLS}>
              Namn <span className="text-red-600 normal-case font-medium">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="T.ex. Fasadmålning"
              autoFocus
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Artikelnummer</label>
              <input
                type="text"
                value={sku}
                onChange={e => setSku(e.target.value)}
                placeholder="Valfritt"
                className={INPUT_CLS}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Kategori</label>
              <select value={categoryId} onChange={e => setCategoryId(e.target.value)} className={INPUT_CLS}>
                <option value="">Ingen kategori</option>
                {categories.map(main =>
                  main.children.length > 0 ? (
                    <optgroup key={main.id} label={main.name}>
                      <option value={main.id}>{main.name}</option>
                      {main.children.map(child => (
                        <option key={child.id} value={child.id}>
                          {child.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : (
                    <option key={main.id} value={main.id}>
                      {main.name}
                    </option>
                  )
                )}
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL_CLS}>Beskrivning</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Valfri beskrivning"
              className={INPUT_CLS}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={LABEL_CLS}>
                Pris <span className="text-red-600 normal-case font-medium">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={salesPrice}
                  onChange={e => setSalesPrice(e.target.value)}
                  placeholder="0"
                  className={`${INPUT_CLS} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">kr</span>
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>Enhet</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className={INPUT_CLS}>
                {PRODUCT_UNIT_OPTIONS.map(u => (
                  <option key={u.value} value={u.value}>
                    {u.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL_CLS}>Moms</label>
              <select value={vatRate} onChange={e => setVatRate(e.target.value)} className={INPUT_CLS}>
                {VAT_OPTIONS.map(v => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

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
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={e => setIsActive(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-100"
              />
              <span className="text-sm text-slate-700">Aktiv (kan väljas i offerter)</span>
            </label>
          </div>

          {/* Andel arbete — bara när produkten saknar komponenter */}
          {rows.length === 0 && (
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shareEnabled}
                  onChange={e => setShareEnabled(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-2 focus:ring-primary-100"
                />
                <span className="text-sm text-slate-700">Ange andel arbete</span>
              </label>
              {shareEnabled && (
                <div className="mt-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={1}
                      value={sharePct}
                      onChange={e => setSharePct(Number(e.target.value))}
                      className="flex-1 accent-[#0F766E]"
                    />
                    <div className="relative w-24 shrink-0">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={sharePct}
                        onChange={e => {
                          const v = Number(e.target.value)
                          setSharePct(Number.isNaN(v) ? 0 : Math.min(100, Math.max(0, v)))
                        }}
                        className={`${INPUT_CLS} pr-7`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">%</span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-700 mt-2">Andel arbete: {sharePct} %</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Används för ROT-beräkning när komponenter saknas
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Komponentkalkyl */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">Komponentkalkyl</h3>
              {product && (
                <button
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800 font-medium"
                >
                  <Plus className="w-4 h-4" /> Lägg till komponent
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 mb-3">
              Intern kalkyl — kunden ser aldrig komponenterna. Arbetsandelen styr ROT-beräkningen.
            </p>

            {!product ? (
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                Spara produkten först för att lägga till komponenter
              </p>
            ) : (
              <div className="space-y-3">
                {rows.map((row, index) => (
                  <div key={index} className="border border-slate-200 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => updateRow(index, { component_type: 'arbete' })}
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                            row.component_type === 'arbete'
                              ? 'bg-primary-700 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Arbete
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRow(index, { component_type: 'material' })}
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                            row.component_type === 'material'
                              ? 'bg-primary-700 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Material
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRow(index)}
                        aria-label="Ta bort komponent"
                        className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={row.description}
                      onChange={e => updateRow(index, { description: e.target.value })}
                      placeholder={row.component_type === 'arbete' ? 'T.ex. Målningsarbete' : 'T.ex. Grundfärg'}
                      className={INPUT_CLS}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Mängd per {unitLabel}</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={row.quantity_per_unit}
                          onChange={e => updateRow(index, { quantity_per_unit: e.target.value })}
                          placeholder="0"
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Enhet</label>
                        <select
                          value={row.unit}
                          onChange={e => updateRow(index, { unit: e.target.value })}
                          className={INPUT_CLS}
                        >
                          {PRODUCT_UNIT_OPTIONS.map(u => (
                            <option key={u.value} value={u.value}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Kostnad</label>
                        <div className="relative">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.unit_cost}
                            onChange={e => updateRow(index, { unit_cost: e.target.value })}
                            placeholder="0"
                            className={`${INPUT_CLS} pr-7`}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400">
                            kr
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {rows.length > 0 && (
                  <p className="text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-xl px-4 py-2.5">
                    Kalkylkostnad per {unitLabel}: {formatKr(calcCost)} kr · Arbetsandel:{' '}
                    {liveShare != null
                      ? `${(liveShare * 100).toLocaleString('sv-SE', { maximumFractionDigits: 1 })} %`
                      : '–'}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-2 sticky bottom-0 bg-white pt-3 rounded-b-2xl">
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
