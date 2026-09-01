'use client'

import { useEffect, useMemo, useState } from 'react'
import { Check, Library, Loader2, PackagePlus, Search, X } from 'lucide-react'

type CatalogCategory = 'all' | 'arbete' | 'material' | 'hyra' | 'övrigt'

interface CatalogProduct {
  sku: string
  name: string
  description?: string | null
  unit: string
  category: Exclude<CatalogCategory, 'all'>
  deduction: 'rot' | 'rut' | null
  imported: boolean
}

interface ProductCatalogModalProps {
  onClose: () => void
  onImported: (count: number) => void
  onError: (message: string) => void
}

const CATEGORIES: Array<{ value: CatalogCategory; label: string }> = [
  { value: 'all', label: 'Alla' },
  { value: 'arbete', label: 'Arbete' },
  { value: 'material', label: 'Material' },
  { value: 'hyra', label: 'Hyra' },
  { value: 'övrigt', label: 'Övrigt' },
]

export function ProductCatalogModal({ onClose, onImported, onError }: ProductCatalogModalProps) {
  const [products, setProducts] = useState<CatalogProduct[]>([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CatalogCategory>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ limit: '100' })
        if (search.trim()) params.set('search', search.trim())
        if (category !== 'all') params.set('category', category)
        const response = await fetch(`/api/product-catalog?${params}`, { signal: controller.signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data.error || 'Kunde inte läsa biblioteket')
        setProducts(data.products || [])
        setTotal(Number(data.total) || 0)
      } catch (error: any) {
        if (error?.name !== 'AbortError') onError(error?.message || 'Kunde inte läsa biblioteket')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }, search ? 250 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [search, category, onError])

  const selectedCount = selected.size
  const visibleAvailable = useMemo(() => products.filter(product => !product.imported), [products])

  function toggle(sku: string) {
    setSelected(current => {
      const next = new Set(current)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  async function importSelected() {
    if (selectedCount === 0 || saving) return
    setSaving(true)
    try {
      const response = await fetch('/api/product-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skus: Array.from(selected) }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error || 'Kunde inte lägga till artiklarna')
      onImported(Number(data.imported) || 0)
    } catch (error: any) {
      onError(error?.message || 'Kunde inte lägga till artiklarna')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-gray-950/40 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
      <div className="flex max-h-[94vh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl">
        <div className="flex items-start gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <span className="mt-0.5 rounded-xl bg-primary-50 p-2.5 text-primary-700">
            <Library className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="catalog-title" className="text-lg font-bold text-gray-900">Handymates artikelbibliotek</h2>
            <p className="mt-0.5 text-sm text-gray-500">
              Välj bara det ni använder. Artiklarna läggs i er egen bank utan pris, så att inga gissade belopp hamnar i offerter.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Stäng biblioteket" className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Sök exempelvis blandare, fasadmålning eller laddbox..."
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-4 text-sm outline-none focus:border-primary-500"
              autoFocus
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {CATEGORIES.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => setCategory(option.value)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  category === option.value
                    ? 'border-primary-700 bg-primary-700 text-white'
                    : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto px-4 py-3 sm:px-6">
          {loading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary-700" />
            </div>
          ) : products.length === 0 ? (
            <div className="flex h-64 flex-col items-center justify-center text-center">
              <PackagePlus className="mb-3 h-9 w-9 text-gray-300" />
              <p className="font-medium text-gray-700">Inga artiklar matchar</p>
              <p className="mt-1 text-sm text-gray-400">Prova ett annat ord eller välj Alla.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {products.map(product => {
                const checked = selected.has(product.sku)
                return (
                  <button
                    key={product.sku}
                    type="button"
                    disabled={product.imported}
                    onClick={() => toggle(product.sku)}
                    className={`flex w-full items-start gap-3 py-3 text-left transition-colors ${
                      product.imported ? 'cursor-default opacity-55' : 'hover:bg-gray-50'
                    }`}
                  >
                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                      product.imported || checked
                        ? 'border-primary-700 bg-primary-700 text-white'
                        : 'border-gray-300 bg-white'
                    }`}>
                      {(product.imported || checked) && <Check className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-gray-900">{product.name}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{product.unit}</span>
                        {product.deduction && (
                          <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-emerald-700">{product.deduction}</span>
                        )}
                      </span>
                      {product.description && <span className="mt-0.5 block text-sm text-gray-500">{product.description}</span>}
                      <span className="mt-1 block text-xs font-medium text-primary-700">
                        {product.imported ? 'Finns redan i er artikelbank' : 'Pris sätts efter att artikeln lagts till'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          {!loading && total > products.length && (
            <p className="py-3 text-center text-xs text-gray-400">
              Visar de första {products.length} av {total}. Sök för att hitta fler.
            </p>
          )}
          {!loading && visibleAvailable.length === 0 && products.some(product => product.imported) && (
            <p className="py-3 text-center text-xs text-gray-400">Alla visade artiklar finns redan i er bank.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-4 sm:px-6">
          <p className="text-sm text-gray-500">{selectedCount > 0 ? `${selectedCount} valda` : 'Välj en eller flera artiklar'}</p>
          <button
            type="button"
            onClick={importSelected}
            disabled={selectedCount === 0 || saving}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackagePlus className="h-4 w-4" />}
            Lägg till i min artikelbank
          </button>
        </div>
      </div>
    </div>
  )
}
