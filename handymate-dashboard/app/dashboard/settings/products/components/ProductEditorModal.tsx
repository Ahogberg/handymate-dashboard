'use client'

import { useEffect, useMemo, useState } from 'react'
import { Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react'
import { resolveLineShares, type SnapshotComponent } from '@/lib/products/build-item-snapshot'
import { PRODUCT_UNIT_OPTIONS } from '@/components/products/ProductModal'
import type { ComponentPayload, ProductCategory, ProductReservation, ProductRow } from '../types'

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
  component_type: 'arbete' | 'material' | 'resa'
  description: string
  article_number: string
  quantity_per_unit: string
  unit: string
  unit_cost: string
  unit_price: string
  is_rot_eligible: boolean
  linked_product_id: string | null
}

interface ProductEditorModalProps {
  initialValues?: { name: string; unit: string; description?: string; category?: 'arbete' | 'material'; laborShare?: number }
  /** Befintlig produkt vid redigering, null vid skapande */
  product: ProductRow | null
  categories: ProductCategory[]
  saving: boolean
  /**
   * components och reservationIds är null för NYA produkter (båda kräver ett
   * produkt-id) — sidan hoppar då över PUT mot respektive delresurs-rutt.
   */
  onSave: (
    payload: Record<string, unknown>,
    components: ComponentPayload[] | null,
    reservationIds: string[] | null
  ) => void
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
  initialValues,
  categories,
  saving,
  onSave,
  onClose,
  onError,
}: ProductEditorModalProps) {
  const [name, setName] = useState(product?.name ?? initialValues?.name ?? '')
  const [description, setDescription] = useState(product?.description ?? initialValues?.description ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [unit, setUnit] = useState(product?.unit ?? initialValues?.unit ?? 'st')
  // Noll betyder "aldrig prissatt", inte "kostar noll" — fältet ska då stå
  // tomt. Med en nolla i rutan får hantverkaren rensa den innan han skriver,
  // och artikeln påstår sig vara gratis medan han tittar på den.
  const [salesPrice, setSalesPrice] = useState(
    product?.sales_price ? product.sales_price.toString() : ''
  )
  // Samma "tomt = okänt"-disciplin som säljpriset — vi känner inte
  // hantverkarens inköpsavtal, och 0 skulle se ut som 100 % marginal i
  // efterkalkylen (samma resonemang som seedProducts redan följer för
  // seedade artiklar, lib/seed-defaults.ts).
  const [purchasePrice, setPurchasePrice] = useState(
    product?.purchase_price ? product.purchase_price.toString() : ''
  )
  const [vatRate, setVatRate] = useState(product?.vat_rate?.toString() ?? '0.25')
  const [rotEligible, setRotEligible] = useState(product?.rot_eligible ?? false)
  const [rutEligible, setRutEligible] = useState(product?.rut_eligible ?? false)
  const [isActive, setIsActive] = useState(product?.is_active ?? true)
  const [isFavorite, setIsFavorite] = useState(product?.is_favorite ?? false)
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')

  // Andel arbete: null i DB = ingen ROT-split. 0 är GILTIGT (ren material).
  const [shareEnabled, setShareEnabled] = useState((product?.default_labor_share ?? initialValues?.laborShare) != null)
  const [sharePct, setSharePct] = useState(
    (product?.default_labor_share ?? initialValues?.laborShare) != null ? Math.round((product?.default_labor_share ?? initialValues?.laborShare ?? 0) * 100) : 60
  )
  const [travelSharePct, setTravelSharePct] = useState(Math.round((product?.default_travel_share ?? 0) * 100))

  const [rows, setRows] = useState<ComponentDraft[]>(
    (product?.components ?? []).map(c => ({
      component_type: c.component_type,
      description: c.description,
      article_number: c.article_number ?? '',
      quantity_per_unit: String(c.quantity_per_unit),
      unit: c.unit,
      unit_cost: String(c.unit_cost),
      unit_price: String(c.unit_price ?? c.unit_cost),
      is_rot_eligible: c.component_type === 'arbete' && c.is_rot_eligible !== false,
      linked_product_id: c.linked_product_id ?? null,
    }))
  )

  // Förbehåll kopplade till artikeln (sql/v91_reservations.sql) — precis
  // som komponenterna ovan kräver kopplingen ett produkt-id, så bara
  // BEFINTLIGA produkter hämtar och kan ändra dem.
  const [reservationOptions, setReservationOptions] = useState<ProductReservation[]>([])
  const [linkedReservations, setLinkedReservations] = useState<ProductReservation[]>([])
  const [reservationSearch, setReservationSearch] = useState('')
  const [loadingReservations, setLoadingReservations] = useState(false)

  useEffect(() => {
    if (!product) return
    let cancelled = false
    setLoadingReservations(true)
    Promise.all([
      fetch('/api/reservations').then(r => (r.ok ? r.json() : { reservations: [] })),
      fetch(`/api/products/${product.id}/reservations`).then(r => (r.ok ? r.json() : { reservations: [] })),
    ])
      .then(([allRes, linkedRes]) => {
        if (cancelled) return
        setReservationOptions(allRes.reservations || [])
        setLinkedReservations(linkedRes.reservations || [])
      })
      .catch(() => {
        if (!cancelled) onError('Kunde inte hämta förbehåll')
      })
      .finally(() => {
        if (!cancelled) setLoadingReservations(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.id])

  const reservationHits = useMemo(() => {
    const q = reservationSearch.trim().toLowerCase()
    if (!q) return []
    const linkedIds = new Set(linkedReservations.map(r => r.id))
    return reservationOptions
      .filter(
        r =>
          !linkedIds.has(r.id) &&
          (r.title.toLowerCase().includes(q) || r.content.toLowerCase().includes(q))
      )
      .slice(0, 8)
  }, [reservationSearch, reservationOptions, linkedReservations])

  function addReservation(r: ProductReservation) {
    setLinkedReservations(prev => (prev.some(x => x.id === r.id) ? prev : [...prev, r]))
    setReservationSearch('')
  }

  function removeReservation(id: string) {
    setLinkedReservations(prev => prev.filter(r => r.id !== id))
  }

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
          article_number: r.article_number.trim() || null,
          unit_price: parseFloat(r.unit_price) || 0,
          is_rot_eligible: r.component_type === 'arbete' && r.is_rot_eligible,
          linked_product_id: r.linked_product_id,
        }))
        .filter(c => c.quantity_per_unit > 0),
    [rows]
  )
  const calcCost = calcComponents.reduce((s, c) => s + c.quantity_per_unit * c.unit_cost, 0)
  const liveShares = resolveLineShares(calcComponents, shareEnabled ? sharePct / 100 : null, travelSharePct / 100)

  // Live marginal — samma formel som PUT/POST /api/products räknar
  // markup_percent med, bara en förhandsvisning innan sparning.
  const marginPct = useMemo(() => {
    const purchase = parseFloat(purchasePrice)
    const sale = parseFloat(salesPrice)
    if (!(purchase > 0) || !(sale > 0)) return null
    return Math.round(((sale - purchase) / purchase) * 100)
  }, [purchasePrice, salesPrice])

  function updateRow(index: number, patch: Partial<ComponentDraft>) {
    setRows(prev => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  function addRow() {
    setRows(prev => [
      ...prev,
      { component_type: 'arbete', description: '', article_number: '', quantity_per_unit: '1', unit: 'tim', unit_cost: '', unit_price: '', is_rot_eligible: true, linked_product_id: null },
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
    // Tomt prisfält betyder "inte prissatt än" — ett giltigt tillstånd sedan
    // registret började seedas prislöst. Utan det här skulle hantverkaren
    // blockeras från att ens byta namn på en artikel han inte satt pris på.
    // Skräp i fältet ska däremot fortfarande stoppas.
    const sales = salesPrice.trim() === '' ? 0 : parseFloat(salesPrice)
    if (Number.isNaN(sales) || sales < 0) {
      onError('Ange ett giltigt pris')
      return
    }

    // Samma "tomt = okänt"-princip som säljpriset — null skiljer "vet inte"
    // från "0 kr i inköp", vilket annars hade sett ut som 100 % marginal.
    const purchase = purchasePrice.trim() === '' ? null : parseFloat(purchasePrice)
    if (purchase !== null && (Number.isNaN(purchase) || purchase < 0)) {
      onError('Ange en giltig egenkostnad')
      return
    }

    // Orörda komponentrader släpps tyst: tom beskrivning + tom/0-kostnad +
    // mängd kvar på defaulten '1'. Delvis ifyllda måste vara giltiga.
    const keptRows = rows.filter(r => {
      const untouched =
        r.description.trim() === '' &&
        (r.unit_cost.trim() === '' || parseFloat(r.unit_cost) === 0) &&
        (r.unit_price.trim() === '' || parseFloat(r.unit_price) === 0) &&
        (r.quantity_per_unit.trim() === '' || r.quantity_per_unit.trim() === '1')
      return !untouched
    })
    const components: ComponentPayload[] = []
    for (const r of keptRows) {
      const qty = parseFloat(r.quantity_per_unit)
      const cost = parseFloat(r.unit_cost)
      const price = parseFloat(r.unit_price)
      if (!r.description.trim() || Number.isNaN(qty) || qty <= 0 || Number.isNaN(cost) || cost < 0 || Number.isNaN(price) || price < 0) {
        onError('Varje komponent behöver beskrivning, mängd över 0, kostnad och à-pris (0 eller mer)')
        return
      }
      components.push({
        component_type: r.component_type,
        description: r.description.trim(),
        article_number: r.article_number.trim() || null,
        quantity_per_unit: qty,
        unit: r.unit || 'st',
        unit_cost: cost,
        unit_price: price,
        is_rot_eligible: r.component_type === 'arbete' && r.is_rot_eligible,
        linked_product_id: r.linked_product_id,
      })
    }

    const payload: Record<string, unknown> = {
      ...(product ? { id: product.id } : {}),
      name: name.trim(),
      description: description.trim() || null,
      sku: sku.trim() || null,
      unit,
      sales_price: sales,
      purchase_price: purchase,
      vat_rate: parseFloat(vatRate),
      rot_eligible: rotEligible,
      rut_eligible: rutEligible,
      is_active: isActive,
      is_favorite: isFavorite,
      category_id: categoryId || null,
    }
    // Andel arbete är bara relevant utan komponenter (komponenterna vinner annars)
    if (components.length === 0) {
      if ((shareEnabled ? sharePct : 0) + travelSharePct > 100) {
        onError('Arbetsandel och reseandel får tillsammans inte överstiga 100 %')
        return
      }
      payload.default_labor_share = shareEnabled ? Math.min(100, Math.max(0, sharePct)) / 100 : null
      payload.default_travel_share = Math.min(100, Math.max(0, travelSharePct)) / 100
      if (shareEnabled || travelSharePct > 0) {
        payload.share_source = 'owner'
        payload.share_confirmed_at = new Date().toISOString()
      }
    } else {
      payload.share_source = 'components'
      payload.share_confirmed_at = new Date().toISOString()
    }

    if (!product && initialValues?.category) payload.category = initialValues.category

    onSave(
      payload,
      product ? components : null,
      product ? linkedReservations.map(r => r.id) : null
    )
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
              {/* Inte längre obligatoriskt: en artikel utan pris är ett
                  giltigt tillstånd — priset sätts första gången den används.
                  Stjärnan hade lovat en spärr som inte finns. */}
              <label className={LABEL_CLS}>Pris (exkl. moms)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={salesPrice}
                  onChange={e => setSalesPrice(e.target.value)}
                  placeholder="Inget pris satt"
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLS}>Egenkostnad (exkl. moms)</label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={purchasePrice}
                  onChange={e => setPurchasePrice(e.target.value)}
                  placeholder="Okänd"
                  className={`${INPUT_CLS} pr-8`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">kr</span>
              </div>
            </div>
            <div className="flex flex-col justify-end pb-2.5">
              {marginPct !== null && (
                <p className="text-sm font-medium text-slate-700">
                  Marginal: <span className={marginPct < 0 ? 'text-red-600' : 'text-slate-900'}>{marginPct} %</span>
                </p>
              )}
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
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-500">Arbetsandel
                    <input type="number" min={0} max={100 - travelSharePct} value={sharePct}
                      onChange={e => setSharePct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className={INPUT_CLS} />
                  </label>
                  <label className="text-xs text-slate-500">Reseandel
                    <input type="number" min={0} max={100 - sharePct} value={travelSharePct}
                      onChange={e => setTravelSharePct(Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className={INPUT_CLS} />
                  </label>
                  <p className="col-span-2 text-sm font-medium text-slate-700">
                    Arbete {sharePct} % · Material {Math.max(0, 100 - sharePct - travelSharePct)} % · Resa {travelSharePct} %
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Arbete och resa får tillsammans vara högst 100 %. Resten är material.
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
                          onClick={() => updateRow(index, { component_type: 'material', is_rot_eligible: false })}
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                            row.component_type === 'material'
                              ? 'bg-primary-700 text-white'
                              : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Material
                        </button>
                        <button
                          type="button"
                          onClick={() => updateRow(index, { component_type: 'resa', is_rot_eligible: false })}
                          className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                            row.component_type === 'resa' ? 'bg-primary-700 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          Resa
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
                    <input type="text" value={row.article_number} onChange={e => updateRow(index, { article_number: e.target.value })}
                      placeholder="Artikelnummer (valfritt)" className={INPUT_CLS} />
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                        <label className="block text-[11px] text-slate-400 mb-1">Kostnad (exkl. moms)</label>
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
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">À-pris ut</label>
                        <input type="number" min="0" step="0.01" value={row.unit_price}
                          onChange={e => updateRow(index, { unit_price: e.target.value })} placeholder="0" className={INPUT_CLS} />
                      </div>
                    </div>
                    {row.component_type === 'arbete' && (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        <input type="checkbox" checked={row.is_rot_eligible}
                          onChange={e => updateRow(index, { is_rot_eligible: e.target.checked })} /> ROT-berättigat arbete
                      </label>
                    )}
                  </div>
                ))}

                {rows.length > 0 && (
                  <p className="text-sm font-semibold text-primary-700 bg-primary-50 border border-primary-100 rounded-xl px-4 py-2.5">
                    Kalkylkostnad per {unitLabel}: {formatKr(calcCost)} kr · Arbete {Math.round((liveShares.laborShare ?? 0) * 100)} % · Resa {Math.round((liveShares.travelShare ?? 0) * 100)} %
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Förbehåll kopplade till artikeln (sql/v91_reservations.sql) —
              samma tabell som förbehålls-editorn skriver till, så en koppling
              gjord härifrån dyker upp under "Reservationer" där automatiskt. */}
          <div className="pt-2 border-t border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 mb-1">
              Förbehåll som gäller den här artikeln
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Föreslås automatiskt i offerter som innehåller artikeln, och listas under
              "Reservationer" när den finns med.
            </p>

            {!product ? (
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
                Spara produkten först för att koppla förbehåll
              </p>
            ) : (
              <>
                {linkedReservations.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {linkedReservations.map(r => (
                      <span
                        key={r.id}
                        className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-primary-50 border border-primary-100 text-primary-800 text-sm rounded-full"
                      >
                        {r.title}
                        <button
                          type="button"
                          onClick={() => removeReservation(r.id)}
                          aria-label={`Ta bort kopplingen ${r.title}`}
                          className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-primary-100"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={reservationSearch}
                    onChange={e => setReservationSearch(e.target.value)}
                    placeholder={loadingReservations ? 'Hämtar förbehåll…' : 'Sök förbehåll att koppla…'}
                    disabled={loadingReservations}
                    className={`${INPUT_CLS} pl-10`}
                  />
                </div>
                {reservationHits.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {reservationHits.map(r => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => addReservation(r)}
                          className="w-full text-left px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg hover:border-primary-300 hover:bg-primary-50/40"
                        >
                          {r.title}
                          <span className="block text-[11px] text-slate-400 truncate">{r.content}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
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
