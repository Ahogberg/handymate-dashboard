'use client'

import { useRef, useState } from 'react'
import { QuickPriceInput } from '@/components/products/QuickPriceInput'
import { sameUnit } from '@/lib/quotes/job-type-setup'
import { ProductEditorModal } from '@/app/dashboard/settings/products/components/ProductEditorModal'
import type { SetupProduct, SetupTemplate } from '@/lib/quotes/job-type-setup'

interface Props {
  template: SetupTemplate
  products: SetupProduct[]
  busy: boolean
  onWrite: (body: Record<string, unknown>) => Promise<boolean>
  onRefresh: () => Promise<void>
  onBusyChange: (busy: boolean) => void
}

/** Artikeln är gemensam; bara standardmängden hör till jobbtypen. */
export function JobStandardRowsEditor({ template, products, busy, onWrite, onRefresh, onBusyChange }: Props) {
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  const amount = Number(quantity.replace(',', '.'))
  const candidates = products.filter(p => p.name.toLocaleLowerCase('sv').includes(search.toLocaleLowerCase('sv')) || p.id === productId)
  const write = (body: Record<string, unknown>) => onWrite({ ...body, templateId: template.id, updatedAt: template.updatedAt, jobTypeSlug: template.jobTypeSlug })

  async function createProduct(payload: Record<string, unknown>) {
    if (lock.current) return
    lock.current = true; setSaving(true); onBusyChange(true); setError('')
    try {
      const response = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Kunde inte skapa artikeln.')
      if (!result.product?.id || !result.product.is_active) throw new Error('Artikeln är inaktiv. Aktivera den i artikelregistret först.')
      // Persist product before linking. A failed link never asks the user to create it again.
      setCreating(false)
      setProductId(result.product.id); setSearch('')
      await onRefresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Kunde inte skapa artikeln.') }
    finally { lock.current = false; setSaving(false); onBusyChange(false) }
  }

  return <section className="job-standard-editor" aria-label="Standardrader för jobbet">
    <h4>Vad brukar ingå?</h4>
    <p className="job-setup-caption">Börja gärna med 3–5 återkommande nyckelartiklar. Det är en genväg, inte ett krav.</p>
    {template.items.map(item => <StandardQuantityRow key={`${template.id}:${template.updatedAt}:${item.index}`} description={item.description}
      unit={item.unit} quantity={item.quantity ?? 1} busy={busy || saving}
      product={products.find(p => p.id === item.linkedProductId && sameUnit(p.unit, item.unit))}
      onPriceSaving={onBusyChange} onRefresh={onRefresh}
      onSave={quantity => write({ operation: 'quantity', itemIndex: item.index, quantity })}
      onRemove={() => write({ operation: 'remove', itemIndex: item.index })} />)}
    {!template.items.length && <p className="job-setup-note">Lägg till första artikeln så börjar offertförhandsvisningen ta form.</p>}
    <form onSubmit={async e => {
      e.preventDefault()
      if (productId && amount > 0 && await write({ operation: 'append', rows: [{ productId, quantity: amount }] })) { setProductId(''); setQuantity('1') }
    }}>
      <label className="job-setup-label" htmlFor="standard-product-search">Lägg till från ditt artikelregister</label>
      <input id="standard-product-search" placeholder="Sök bland dina artiklar" value={search} onChange={e => setSearch(e.target.value)} disabled={busy || saving} />
      <div className="job-standard-add">
        <select aria-label="Artikel till standardrader" value={productId} onChange={e => setProductId(e.target.value)} disabled={busy || saving}>
          <option value="">Välj artikel</option>
          {candidates.map(p => <option key={p.id} value={p.id}>{p.name} · {p.unit}</option>)}
        </select>
        <label>Mängd<input aria-label="Standardmängd för ny rad" inputMode="decimal" value={quantity} onChange={e => setQuantity(e.target.value)} disabled={busy || saving} /></label>
        <button type="submit" className="job-setup-primary" disabled={busy || saving || !productId || !Number.isFinite(amount) || amount <= 0}>Lägg till rad</button>
      </div>
    </form>
    <button type="button" className="job-setup-text-button" disabled={busy || saving} onClick={() => setCreating(true)}>+ Skapa egen artikel</button>
    <p className="job-setup-caption">Artikelpriset delas av alla jobb som använder artikeln. Standardmängden gäller bara det här jobbet.</p>
    <p className="job-setup-caption">Ändringar gäller kommande offerter. Redan skapade offerter behåller sina rader och priser.</p>
    {error && <p role="alert" className="job-setup-error">{error}</p>}
    {creating && <ProductEditorModal product={null} categories={[]} saving={saving} onSave={createProduct} onClose={() => { if (!saving) setCreating(false) }} onError={setError} />}
  </section>
}

function StandardQuantityRow({ description, quantity, unit, busy, onSave, onRemove, product, onPriceSaving, onRefresh }: {
  product?: SetupProduct; onPriceSaving: (busy: boolean) => void; onRefresh: () => Promise<void>
  description: string; quantity: number; unit: string; busy: boolean; onSave: (n: number) => Promise<boolean>; onRemove: () => Promise<boolean>
}) {
  const [value, setValue] = useState(String(quantity))
  const [editingPrice, setEditingPrice] = useState(false)
  const amount = Number(value.replace(',', '.'))
  return <form className="job-standard-row" onSubmit={e => { e.preventDefault(); if (amount > 0) void onSave(amount) }}>
    <strong>{description}</strong>
    <label>Mängd ({unit})<input aria-label={`Standardmängd för ${description}`} inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} disabled={busy} /></label>
    <div className="job-standard-price"><span>Artikelpris exkl. moms</span>
      {product ? (editingPrice || !(product.salesPrice && product.salesPrice > 0) ? <QuickPriceInput productId={product.id} unit={product.unit}
        initialValue={product.salesPrice ?? undefined} allowDecimals disabled={busy} label={`Pris för ${description}`} onSavingChange={onPriceSaving}
        onSaved={() => { setEditingPrice(false); void onRefresh() }} />
        : <button type="button" disabled={busy} aria-label={`Ändra pris för ${description}`} onClick={() => setEditingPrice(true)}>{product.salesPrice.toLocaleString('sv-SE')} kr/{product.unit} · Ändra</button>)
        : <span>Koppla en artikel nedan</span>}
    </div>
    {amount !== quantity && <button type="submit" disabled={busy || !Number.isFinite(amount) || amount <= 0}>Spara mängd</button>}
    <button type="button" aria-label={`Ta bort ${description} från standardrader`} disabled={busy} onClick={() => void onRemove()}>Ta bort</button>
  </form>
}
