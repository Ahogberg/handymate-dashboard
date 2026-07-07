'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Package,
  Pencil,
  Plus,
  Search,
  Star,
  Wrench,
  X,
} from 'lucide-react'
import { useToast } from '@/components/Toast'
import { PRODUCT_UNIT_OPTIONS } from '@/components/products/ProductModal'
import { CategoryTree, type CategoryFilter } from './components/CategoryTree'
import { ProductEditorModal } from './components/ProductEditorModal'
import type { ComponentPayload, ProductCategory, ProductRow } from './types'

const MIGRATION_FLAG = 'hm_produktbank_migration_seen'

export default function ProductsPage() {
  const toast = useToast()
  const [products, setProducts] = useState<ProductRow[]>([])
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showBanner, setShowBanner] = useState(false)
  const [mobileTreeOpen, setMobileTreeOpen] = useState(false)
  const bannerChecked = useRef(false)

  const fetchProducts = useCallback(async (searchTerm: string) => {
    try {
      const params = new URLSearchParams()
      params.set('include', 'components')
      params.set('include_inactive', 'true')
      if (searchTerm) params.set('search', searchTerm)
      const res = await fetch(`/api/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        const list: ProductRow[] = data.products || []
        setProducts(list)
        // Kategori-bannern: en gång, bara om produkter saknar kategori
        if (!bannerChecked.current && !searchTerm) {
          bannerChecked.current = true
          try {
            if (
              list.length > 0 &&
              !localStorage.getItem(MIGRATION_FLAG) &&
              list.some(p => !p.category_id)
            ) {
              setShowBanner(true)
            }
          } catch { /* localStorage otillgänglig — hoppa över bannern */ }
        }
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/products/categories')
      if (res.ok) {
        const data = await res.json()
        setCategories(data.categories || [])
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  // Sökningen går via API:ts search-param (namn + artikelnr), debounce 300 ms
  useEffect(() => {
    const t = setTimeout(() => fetchProducts(search), search ? 300 : 0)
    return () => clearTimeout(t)
  }, [search, fetchProducts])

  // Kategorifiltret appliceras klient-side: huvudrubrik tar med sina underrubriker
  const visibleProducts = useMemo(() => {
    if (filter === 'all') return products
    if (filter === 'none') return products.filter(p => !p.category_id)
    const main = categories.find(c => c.id === filter)
    const ids = new Set(main ? [main.id, ...main.children.map(c => c.id)] : [filter])
    return products.filter(p => p.category_id != null && ids.has(p.category_id))
  }, [products, filter, categories])

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const main of categories) {
      map.set(main.id, main.name)
      for (const child of main.children) map.set(child.id, child.name)
    }
    return map
  }, [categories])

  const filterLabel =
    filter === 'all' ? 'Alla produkter'
    : filter === 'none' ? 'Utan kategori'
    : categoryNameById.get(filter) || 'Alla produkter'

  // ── Kategorihantering ────────────────────────────────────────────────
  async function createCategory(name: string, parentId: string | null) {
    try {
      const res = await fetch('/api/products/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parent_id: parentId }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Kunde inte skapa kategorin')
        return
      }
      fetchCategories()
    } catch {
      toast.error('Kunde inte skapa kategorin')
    }
  }

  async function renameCategory(id: string, name: string) {
    try {
      const res = await fetch('/api/products/categories', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Kunde inte byta namn')
        return
      }
      fetchCategories()
    } catch {
      toast.error('Kunde inte byta namn')
    }
  }

  async function deleteCategory(category: ProductCategory) {
    const ok = confirm(
      `Ta bort kategorin "${category.name}"? Produkter behåller sina priser men tappar kategorin.`
    )
    if (!ok) return
    try {
      const res = await fetch(`/api/products/categories?id=${category.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Kunde inte ta bort kategorin')
        return
      }
      // Var den borttagna kategorin (eller ett av dess barn) vald → visa alla
      const removedIds = new Set([category.id, ...category.children.map(c => c.id)])
      if (filter !== 'all' && filter !== 'none' && removedIds.has(filter)) {
        setFilter('all')
      }
      fetchCategories()
      fetchProducts(search) // produkter i kategorin har fått category_id = null
    } catch {
      toast.error('Kunde inte ta bort kategorin')
    }
  }

  // ── Produkthantering ─────────────────────────────────────────────────
  async function toggleActive(product: ProductRow) {
    const next = !product.is_active
    setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_active: next } : p)))
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, is_active: next }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_active: !next } : p)))
      toast.error('Kunde inte ändra status')
    }
  }

  async function toggleFavorite(product: ProductRow) {
    const next = !product.is_favorite
    setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_favorite: next } : p)))
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, is_favorite: next }),
      })
      if (!res.ok) throw new Error()
      fetchProducts(search) // favoriter sorteras först — hämta om listan
    } catch {
      setProducts(prev => prev.map(p => (p.id === product.id ? { ...p, is_favorite: !next } : p)))
      toast.error('Kunde inte ändra favorit')
    }
  }

  async function handleSave(payload: Record<string, unknown>, components: ComponentPayload[] | null) {
    setSaving(true)
    try {
      const isEdit = !!payload.id
      const res = await fetch('/api/products', {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'Kunde inte spara produkten')
        return
      }
      const { product } = await res.json()
      if (components !== null && product?.id) {
        const compRes = await fetch(`/api/products/${product.id}/components`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ components }),
        })
        if (!compRes.ok) {
          const d = await compRes.json().catch(() => ({}))
          toast.error(d.error || 'Produkten sparades men inte komponenterna')
          fetchProducts(search)
          return
        }
      }
      toast.success(isEdit ? 'Produkten uppdaterad' : 'Produkten skapad')
      setEditingProduct(null)
      setShowNewModal(false)
      fetchProducts(search)
    } catch {
      toast.error('Kunde inte spara produkten')
    } finally {
      setSaving(false)
    }
  }

  function dismissBanner() {
    try { localStorage.setItem(MIGRATION_FLAG, '1') } catch { /* ignore */ }
    setShowBanner(false)
  }

  const formatUnit = (unit: string) =>
    PRODUCT_UNIT_OPTIONS.find(u => u.value === unit)?.label || unit

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  const tree = (
    <CategoryTree
      categories={categories}
      selected={filter}
      onSelect={f => { setFilter(f); setMobileTreeOpen(false) }}
      onCreate={createCategory}
      onRename={renameCategory}
      onDelete={deleteCategory}
    />
  )

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/settings" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Produkter & priser</h1>
            <p className="text-sm text-gray-500 mt-0.5">Din produktbank — kategorier, priser och komponentkalkyler för offerter</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="hidden sm:inline">Ny produkt</span><span className="sm:hidden">Ny</span>
          </button>
        </div>

        {/* Kategori-banner (produkter som saknar kategori) */}
        {showBanner && (
          <div className="flex items-start gap-3 mb-4 bg-primary-50 border border-primary-200 rounded-xl px-4 py-3">
            <p className="flex-1 text-sm text-primary-700">
              Produkter utan kategori — sätt kategorier så blir sökningen i offerter bättre.
            </p>
            <button
              onClick={dismissBanner}
              aria-label="Stäng meddelandet"
              className="p-1 -m-1 text-primary-700/60 hover:text-primary-700 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="lg:grid lg:grid-cols-[260px_1fr] lg:gap-6 lg:items-start">
          {/* Kategorier — hopfällbar sektion på mobil */}
          <div className="lg:hidden mb-4">
            <button
              onClick={() => setMobileTreeOpen(o => !o)}
              className="w-full flex items-center justify-between px-4 py-3 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-gray-900"
            >
              <span>Kategorier · {filterLabel}</span>
              <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${mobileTreeOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileTreeOpen && (
              <div className="mt-2 bg-white border border-[#E2E8F0] rounded-xl p-2">{tree}</div>
            )}
          </div>

          {/* Kategorier — vänsterspalt på desktop */}
          <aside className="hidden lg:block bg-white border border-[#E2E8F0] rounded-xl p-3 sticky top-4">
            <h2 className="px-3 pt-1 pb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
              Kategorier
            </h2>
            {tree}
          </aside>

          {/* Produktlista */}
          <div>
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Sök på namn eller artikelnummer..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500"
              />
            </div>

            <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
              <div className="divide-y divide-gray-100">
                {visibleProducts.length === 0 && (
                  <div className="px-5 py-12 text-center">
                    <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-400 text-sm">
                      {search || filter !== 'all'
                        ? 'Inga produkter matchar sökningen eller filtret'
                        : 'Inga produkter ännu'}
                    </p>
                    {!search && filter === 'all' && (
                      <button
                        onClick={() => setShowNewModal(true)}
                        className="mt-3 text-sm text-primary-700 hover:text-primary-800 font-medium"
                      >
                        + Lägg till din första produkt
                      </button>
                    )}
                  </div>
                )}

                {visibleProducts.map(product => {
                  const componentCount = product.components?.length ?? 0
                  return (
                    <div
                      key={product.id}
                      className={`flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition ${
                        product.is_active ? '' : 'opacity-60'
                      }`}
                    >
                      <button
                        onClick={() => toggleFavorite(product)}
                        aria-label={product.is_favorite ? 'Ta bort favorit' : 'Markera som favorit'}
                        className={`shrink-0 ${product.is_favorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'} transition`}
                      >
                        <Star className="w-4 h-4" fill={product.is_favorite ? 'currentColor' : 'none'} />
                      </button>

                      <button
                        onClick={() => setEditingProduct(product)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 truncate">{product.name}</span>
                          {product.sku && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-gray-100 text-gray-500 rounded-full">
                              Art.nr {product.sku}
                            </span>
                          )}
                          {product.category_id && categoryNameById.get(product.category_id) && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-primary-50 text-primary-700 rounded-full">
                              {categoryNameById.get(product.category_id)}
                            </span>
                          )}
                          {product.rot_eligible && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-600 rounded">ROT</span>
                          )}
                          {product.rut_eligible && (
                            <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-600 rounded">RUT</span>
                          )}
                          {componentCount > 0 && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-amber-50 text-amber-700 rounded-full"
                              title={`${componentCount} komponenter i kalkylen`}
                            >
                              <Wrench className="w-3 h-3" /> {componentCount}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {product.sales_price.toLocaleString('sv-SE')} kr/{formatUnit(product.unit)}
                        </p>
                      </button>

                      {/* Aktiv-toggle */}
                      <button
                        role="switch"
                        aria-checked={product.is_active}
                        aria-label={product.is_active ? 'Aktiv — tryck för att inaktivera' : 'Inaktiv — tryck för att aktivera'}
                        onClick={() => toggleActive(product)}
                        className={`relative shrink-0 w-9 h-5 rounded-full transition-colors ${
                          product.is_active ? 'bg-primary-700' : 'bg-gray-300'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${
                            product.is_active ? 'left-[18px]' : 'left-0.5'
                          }`}
                        />
                      </button>

                      <button
                        onClick={() => setEditingProduct(product)}
                        aria-label="Redigera produkt"
                        className="shrink-0 p-1.5 text-gray-400 hover:text-primary-700 transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Info box */}
            <div className="mt-4 bg-primary-50 border border-[#E2E8F0] rounded-xl p-5 text-sm text-primary-700">
              <p className="font-medium mb-1">Tips</p>
              <p>
                Produkterna kan snabbsökas i offertformuläret på namn eller artikelnummer.
                Lägg till komponenter på en produkt så räknas arbetsandelen ut automatiskt för ROT-avdraget.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Redigerare */}
      {(showNewModal || editingProduct) && (
        <ProductEditorModal
          product={editingProduct}
          categories={categories}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowNewModal(false); setEditingProduct(null) }}
          onError={msg => toast.error(msg)}
        />
      )}
    </div>
  )
}
