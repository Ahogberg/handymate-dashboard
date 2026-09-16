'use client'

import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Bookmark, Check, Plus, Trash2, X } from 'lucide-react'
import type { QuoteItem, QuoteItemType } from '@/lib/types/quote'
import { UNIT_OPTIONS } from '@/components/quotes/ItemRow'
import { standardPriceOffer } from '@/lib/products/pricing-state'

interface RowEditSheetProps {
  /** null → sheeten är stängd (inget att redigera). */
  item: QuoteItem | null
  allCategories: { slug: string; label: string }[]
  onUpdate: (id: string, field: keyof QuoteItem, value: any) => void
  onRemove: (id: string) => void
  /** Radordning. Canvasen har ingen drag-and-drop (DocumentScaler skalar A4:an,
      vilket gör draghandtag opålitliga och alldeles för små för touch) — det
      här är mobilens enda väg att flytta en rad utan att lämna vyn.
      Utelämnad → knapparna renderas inte. */
  onMove?: (id: string, direction: 'up' | 'down') => void
  onClose: () => void
  /**
   * Artikelns nuvarande standardpris ur banken, för raden som redigeras.
   * Utelämnad → erbjudandet visas aldrig. Anroparen slår upp det ur den
   * produktlista den redan har (usePriceListLookup), så sheeten inte behöver
   * hämta något själv.
   */
  linkedProductPrice?: number | null
  /** Skriver radens pris till artikeln som nytt standardpris. */
  onSaveAsStandard?: (productId: string, price: number) => void
  /**
   * SPÅR B4 (2026-08-06): spara raden som en ny artikel i banken.
   *
   * Bokmärkesknappen fanns bara i ItemRow, alltså bara i LISTVYN — som inte
   * finns på mobil och inte är standardvyn på desktop. En hantverkare som
   * skrev en fritextrad han använder varje vecka hade därför ingen väg att
   * spara den från den yta han faktiskt arbetar i. Sheeten nås från canvasen
   * på båda breddena.
   *
   * Utelämnad → knappen renderas inte.
   */
  onSaveToBank?: (item: QuoteItem) => void
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
export function RowEditSheet({ item, allCategories, onUpdate, onRemove, onMove, onClose, linkedProductPrice, onSaveAsStandard, onSaveToBank }: RowEditSheetProps) {
  const [shareLaborPct, setShareLaborPct] = useState(0)
  const [shareTravelPct, setShareTravelPct] = useState(0)
  const [confirmingShare, setConfirmingShare] = useState(false)
  const [componentSearch, setComponentSearch] = useState('')
  const [componentHits, setComponentHits] = useState<any[]>([])

  useEffect(() => {
    setShareLaborPct(Math.round(Number(item?.component_snapshot?.labor_share ?? 0) * 100))
    setShareTravelPct(Math.round(Number(item?.component_snapshot?.travel_share ?? 0) * 100))
  }, [item?.id, item?.component_snapshot?.labor_share, item?.component_snapshot?.travel_share])

  useEffect(() => {
    if (!item || componentSearch.trim().length < 2) {
      setComponentHits([])
      return
    }
    const controller = new AbortController()
    fetch(`/api/products?search=${encodeURIComponent(componentSearch)}&include=components`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : { products: [] })
      .then(data => setComponentHits((data.products || []).slice(0, 5)))
      .catch(() => undefined)
    return () => controller.abort()
  }, [componentSearch, item?.id])

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

  const components: any[] = Array.isArray(item.component_snapshot?.components)
    ? item.component_snapshot.components
    : []
  const componentCost = components.reduce((sum, component) => sum + Number(component.quantity_per_unit || 0) * Number(component.unit_cost || 0), 0)
  const componentSale = components.reduce((sum, component) => sum + Number(component.quantity_per_unit || 0) * Number(component.unit_price || 0), 0)

  const writeComponents = (next: any[]) => onUpdate(item.id, 'component_snapshot', {
    product_id: item.component_snapshot?.product_id ?? item.linked_product_id ?? null,
    product_name: item.component_snapshot?.product_name ?? item.description,
    sku: item.component_snapshot?.sku ?? item.article_number ?? null,
    sales_price: item.component_snapshot?.sales_price ?? item.unit_price,
    labor_share: item.component_snapshot?.labor_share ?? (item.is_rot_eligible ? 1 : 0),
    travel_share: item.component_snapshot?.travel_share ?? 0,
    share_source: item.component_snapshot?.share_source ?? 'owner',
    share_confirmed_at: item.component_snapshot?.share_confirmed_at ?? new Date().toISOString(),
    ...(item.component_snapshot || {}),
    components: next,
  })
  const updateComponent = (index: number, patch: Record<string, unknown>) => {
    const next = components.map((component, componentIndex) => componentIndex === index ? { ...component, ...patch } : component)
    writeComponents(next)
  }
  const addComponent = (source?: any) => writeComponents([...components, {
    component_type: source?.default_travel_share === 1 ? 'resa' : source?.rot_eligible ? 'arbete' : 'material',
    description: source?.name ?? '',
    article_number: source?.sku ?? null,
    quantity_per_unit: 1,
    unit: source?.unit ?? 'st',
    unit_cost: source?.purchase_price ?? 0,
    unit_price: source?.sales_price ?? 0,
    is_rot_eligible: Boolean(source?.rot_eligible),
    linked_product_id: source?.id ?? null,
  }])

  const confirmSeedShare = async () => {
    if (!item.linked_product_id || shareLaborPct + shareTravelPct > 100) return
    setConfirmingShare(true)
    const confirmedAt = new Date().toISOString()
    try {
      const response = await fetch('/api/products', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: item.linked_product_id,
          default_labor_share: shareLaborPct / 100,
          default_travel_share: shareTravelPct / 100,
          share_source: 'owner',
          share_confirmed_at: confirmedAt,
        }),
      })
      if (!response.ok) return
      onUpdate(item.id, 'component_snapshot', {
        ...item.component_snapshot,
        labor_share: shareLaborPct / 100,
        travel_share: shareTravelPct / 100,
        share_source: 'owner',
        share_confirmed_at: confirmedAt,
      })
    } finally {
      setConfirmingShare(false)
    }
  }

  const isEditable = item.item_type === 'item' || item.item_type === 'discount' || item.item_type === 'option'
  const isOption = item.item_type === 'option'
  const label = TYPE_LABEL[item.item_type]

  // Beslutet om vi ska erbjuda "Sätt som standard" ligger i en ren funktion —
  // den tiger i tre fall som är lätta att få fel i JSX. Se pricing-state.ts.
  const standardOffer = standardPriceOffer({
    linkedProductId: item.linked_product_id,
    rowPrice: item.unit_price,
    productPrice: linkedProductPrice,
  })

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
                {/* Priset förtjänas av användning (2026-08-06). Registret
                    seedas prislöst — ett ogissat pris är bättre än ett gissat,
                    eftersom systemet quotar det med full självsäkerhet i
                    offerten, telefonagenten och storefronten.

                    Erbjudandet visas BARA när det finns något att spara: rad
                    kopplad till banken, pris ifyllt, och skilt från artikelns.
                    Se lib/products/pricing-state.ts för när vi tiger. */}
                {item.ai_price_missing && item.unit_price > 0 && <label className="mt-2 flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={item.save_to_products === true} onChange={e => onUpdate(item.id, 'save_to_products', e.target.checked)} />
                  Spara även som pris för framtida offerter
                </label>}
                <p className="mt-2 text-xs text-slate-500">Prisändringen gäller denna offert. Artikelns standardpris ändras bara när du väljer det.</p>
                {standardOffer.show && onSaveAsStandard && (
                  <button
                    type="button"
                    onClick={() => onSaveAsStandard(item.linked_product_id!, item.unit_price)}
                    className="mt-2 w-full min-h-[44px] px-3 py-2 text-[13px] font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 rounded-xl transition-colors"
                  >
                    {standardOffer.label}
                  </button>
                )}
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

          {isEditable && item.component_snapshot?.share_source === 'seed' && !item.component_snapshot?.share_confirmed_at && item.is_rot_eligible && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-amber-900">
                Arbete {shareLaborPct} % av {item.total.toLocaleString('sv-SE')} kr, stämmer det?
              </p>
              <p className="text-xs text-amber-800">Det här är en seedad uppskattning. Bekräfta eller justera innan offerten skickas.</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-amber-900">Arbete %
                  <input className={FIELD_CLS} type="number" min={0} max={100 - shareTravelPct} value={shareLaborPct}
                    onChange={event => setShareLaborPct(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />
                </label>
                <label className="text-xs text-amber-900">Resa %
                  <input className={FIELD_CLS} type="number" min={0} max={100 - shareLaborPct} value={shareTravelPct}
                    onChange={event => setShareTravelPct(Math.max(0, Math.min(100, Number(event.target.value) || 0)))} />
                </label>
              </div>
              <button type="button" disabled={confirmingShare || shareLaborPct + shareTravelPct > 100}
                onClick={confirmSeedShare} className="min-h-[44px] w-full rounded-xl bg-amber-900 px-3 text-sm font-semibold text-white disabled:opacity-50">
                {confirmingShare ? 'Sparar…' : 'Bekräfta fördelningen'}
              </button>
            </div>
          )}

          {isEditable && (
            <div className="rounded-xl border border-slate-200 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Rader under artikeln</p>
                  <p className="text-xs text-slate-500">Kostnad {componentCost.toLocaleString('sv-SE')} kr · Utpris {componentSale.toLocaleString('sv-SE')} kr</p>
                </div>
                <button type="button" onClick={() => addComponent()} className="inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-primary-700">
                  <Plus className="h-4 w-4" /> Rad
                </button>
              </div>
              <input className={FIELD_CLS} value={componentSearch} onChange={event => setComponentSearch(event.target.value)} placeholder="Hämta artikel ur katalogen…" />
              {componentHits.length > 0 && (
                <div className="rounded-lg border border-slate-200 divide-y">
                  {componentHits.map(hit => (
                    <button key={hit.id} type="button" onClick={() => { addComponent(hit); setComponentSearch(''); setComponentHits([]) }}
                      className="flex min-h-[44px] w-full items-center justify-between px-3 text-left text-sm hover:bg-slate-50">
                      <span>{hit.name}</span><span className="text-slate-500">{Number(hit.sales_price || 0).toLocaleString('sv-SE')} kr</span>
                    </button>
                  ))}
                </div>
              )}
              {components.map((component, index) => (
                <div key={index} className="rounded-lg border border-slate-200 p-2 space-y-2">
                  <div className="flex gap-2">
                    <select className={FIELD_CLS} value={component.component_type}
                      onChange={event => updateComponent(index, { component_type: event.target.value, is_rot_eligible: event.target.value === 'arbete' ? component.is_rot_eligible !== false : false })}>
                      <option value="arbete">Arbete</option><option value="material">Material</option><option value="resa">Resa</option>
                    </select>
                    <button type="button" aria-label="Ta bort komponentrad" onClick={() => writeComponents(components.filter((_, i) => i !== index))}
                      className="min-h-[44px] min-w-[44px] text-red-600"><Trash2 className="mx-auto h-4 w-4" /></button>
                  </div>
                  <input className={FIELD_CLS} value={component.description || ''} onChange={event => updateComponent(index, { description: event.target.value })} placeholder="Namn" />
                  <input className={FIELD_CLS} value={component.article_number || ''} onChange={event => updateComponent(index, { article_number: event.target.value })} placeholder="Artikelnummer" />
                  <div className="grid grid-cols-2 gap-2">
                    <input aria-label="Antal" className={FIELD_CLS} type="number" min={0} value={component.quantity_per_unit ?? 1} onChange={event => updateComponent(index, { quantity_per_unit: Number(event.target.value) })} />
                    <select aria-label="Enhet" className={FIELD_CLS} value={component.unit || 'st'} onChange={event => updateComponent(index, { unit: event.target.value })}>
                      {UNIT_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <input aria-label="À-pris" className={FIELD_CLS} type="number" min={0} value={component.unit_price ?? 0} onChange={event => updateComponent(index, { unit_price: Number(event.target.value) })} />
                    <input aria-label="Självkostnad" className={FIELD_CLS} type="number" min={0} value={component.unit_cost ?? 0} onChange={event => updateComponent(index, { unit_cost: Number(event.target.value) })} />
                  </div>
                  {component.component_type === 'arbete' && (
                    <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" checked={component.is_rot_eligible !== false}
                      onChange={event => updateComponent(index, { is_rot_eligible: event.target.checked })} /> ROT-berättigat arbete</label>
                  )}
                  {!component.linked_product_id && component.description && (
                    <button type="button" className="min-h-[44px] w-full rounded-lg bg-slate-100 text-sm font-semibold text-slate-700"
                      onClick={async () => {
                        const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
                          name: component.description, sku: component.article_number || null, unit: component.unit || 'st', sales_price: Number(component.unit_price || 0),
                          purchase_price: Number(component.unit_cost || 0), category: component.component_type === 'arbete' ? 'arbete' : 'material',
                          rot_eligible: component.component_type === 'arbete' && component.is_rot_eligible !== false,
                          default_labor_share: component.component_type === 'arbete' ? 1 : 0, default_travel_share: component.component_type === 'resa' ? 1 : 0,
                        }) })
                        if (response.ok) { const data = await response.json(); updateComponent(index, { linked_product_id: data.product?.id || null }) }
                      }}>Spara som artikel</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Dölj för kund (v90): raden syns inte i kundens dokument men
              priset ingår i summan oförändrat. */}
          <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={item.is_hidden ?? false}
              onChange={e => onUpdate(item.id, 'is_hidden', e.target.checked)}
              className="w-5 h-5 rounded border-slate-300 accent-slate-600 cursor-pointer"
            />
            <span className="text-sm font-medium text-slate-700">Dölj för kund — priset ingår ändå i summan</span>
          </label>

          {/* show_components_to_customer har funnits i databasen och i alla
              renderare sedan v67 men aldrig haft något gränssnitt. */}
          {isEditable && item.component_snapshot && (
            <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none">
              <input
                type="checkbox"
                checked={item.show_components_to_customer ?? false}
                onChange={e => onUpdate(item.id, 'show_components_to_customer', e.target.checked)}
                className="w-5 h-5 rounded border-slate-300 accent-primary-700 cursor-pointer"
              />
              <span className="text-sm font-medium text-slate-700">Visa vad som ingår för kunden</span>
            </label>
          )}
        </div>

        {onMove && (
          <div className="flex items-center gap-2 px-5 py-3 border-t border-slate-100 shrink-0">
            <span className="text-xs font-medium text-slate-500">Flytta raden</span>
            <button
              type="button"
              onClick={() => onMove(item.id, 'up')}
              aria-label="Flytta upp"
              className="ml-auto inline-flex items-center justify-center min-w-[44px] min-h-[44px] bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <ArrowUp className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onMove(item.id, 'down')}
              aria-label="Flytta ned"
              className="inline-flex items-center justify-center min-w-[44px] min-h-[44px] bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 active:bg-slate-100 transition-colors"
            >
              <ArrowDown className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-slate-100 shrink-0">
          <button
            type="button"
            onClick={() => { onRemove(item.id); onClose() }}
            className="inline-flex items-center gap-1.5 px-4 min-h-[44px] text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Ta bort
          </button>

          {/* SPÅR B4: bara för riktiga rader med en beskrivning, och bara när
              raden inte redan kommer ur banken. Samma villkor som ItemRow —
              en knapp som erbjuder att spara något redan sparat lär bort
              uppmärksamhet, precis som standardpriserbjudandet ovan. */}
          {onSaveToBank && item.item_type === 'item' && item.description.trim() !== '' && !item.linked_product_id && (
            <button
              type="button"
              onClick={() => { onSaveToBank(item); onClose() }}
              className="inline-flex items-center gap-1.5 px-4 min-h-[44px] text-sm font-semibold text-primary-700 hover:bg-primary-50 rounded-xl transition-colors"
            >
              <Bookmark className="w-4 h-4" />
              Spara i banken
            </button>
          )}

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
