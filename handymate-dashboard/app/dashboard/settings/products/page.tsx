'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Search,
  Star,
  Package,
  Wrench,
  Edit,
} from 'lucide-react'
import {
  ProductModal,
  PRODUCT_UNIT_OPTIONS as UNIT_OPTIONS,
  PRODUCT_CATEGORY_OPTIONS as CATEGORY_OPTIONS,
  type Product,
} from '@/components/products/ProductModal'

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const fetchProducts = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (categoryFilter) params.set('category', categoryFilter)
      const res = await fetch(`/api/products?${params}`)
      if (res.ok) {
        const data = await res.json()
        setProducts(data.products || [])
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [search, categoryFilter])

  useEffect(() => {
    fetchProducts()
  }, [fetchProducts])

  const toggleFavorite = async (product: Product) => {
    try {
      await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id, is_favorite: !product.is_favorite }),
      })
      fetchProducts()
    } catch { /* ignore */ }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ta bort denna produkt?')) return
    try {
      await fetch(`/api/products?id=${id}`, { method: 'DELETE' })
      fetchProducts()
    } catch { /* ignore */ }
  }

  const handleSave = async (data: Partial<Product> & { id?: string }) => {
    setSaving(true)
    try {
      if (data.id) {
        await fetch('/api/products', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      } else {
        await fetch('/api/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        })
      }
      setEditingProduct(null)
      setShowNewModal(false)
      fetchProducts()
    } catch {
      alert('Kunde inte spara produkt')
    } finally {
      setSaving(false)
    }
  }

  const formatUnit = (unit: string) => {
    const opt = UNIT_OPTIONS.find(u => u.value === unit)
    return opt?.label || unit
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/settings" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Produkter & Material</h1>
            <p className="text-sm text-gray-500 mt-0.5">Sök och lägg till produkter direkt i offerter och fakturor</p>
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-4 h-4" /> Ny produkt
          </button>
        </div>

        {/* Search & filter */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Sök produkter..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-primary-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-700 focus:outline-none focus:border-primary-500"
          >
            <option value="">Alla kategorier</option>
            {CATEGORY_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Products list */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="hidden sm:grid grid-cols-[auto_1fr_100px_100px_80px_80px_60px] gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 text-xs text-gray-500 uppercase tracking-wider">
            <div className="w-6" />
            <div>Produkt</div>
            <div className="text-right">Inköp</div>
            <div className="text-right">Pris</div>
            <div className="text-center">Enhet</div>
            <div className="text-center">ROT/RUT</div>
            <div />
          </div>

          <div className="divide-y divide-gray-100">
            {products.length === 0 && (
              <div className="px-5 py-12 text-center">
                <Package className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-gray-400 text-sm">
                  {search ? 'Inga produkter matchar sökningen' : 'Inga produkter ännu'}
                </p>
                {!search && (
                  <button
                    onClick={() => setShowNewModal(true)}
                    className="mt-3 text-sm text-primary-700 hover:text-primary-700 font-medium"
                  >
                    + Lägg till din första produkt
                  </button>
                )}
              </div>
            )}

            {products.map(product => (
              <div
                key={product.id}
                className="grid grid-cols-1 sm:grid-cols-[auto_1fr_100px_100px_80px_80px_60px] gap-2 sm:gap-3 px-5 py-3 items-center hover:bg-gray-50 transition"
              >
                {/* Favorite */}
                <button
                  onClick={() => toggleFavorite(product)}
                  className={`w-6 ${product.is_favorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-400'} transition`}
                >
                  <Star className="w-4 h-4" fill={product.is_favorite ? 'currentColor' : 'none'} />
                </button>

                {/* Name + info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 truncate">{product.name}</span>
                    <span className={`px-1.5 py-0.5 text-[10px] rounded-full ${
                      product.category.startsWith('arbete')
                        ? 'bg-primary-100 text-primary-700'
                        : product.category === 'hyra'
                          ? 'bg-purple-100 text-purple-600'
                          : product.category.startsWith('material')
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-gray-100 text-gray-500'
                    }`}>
                      {CATEGORY_OPTIONS.find(c => c.value === product.category)?.label || product.category}
                    </span>
                  </div>
                  {product.sku && <p className="text-xs text-gray-400 truncate">Art.nr: {product.sku}</p>}
                  {product.description && <p className="text-xs text-gray-400 truncate sm:hidden">{product.description}</p>}
                </div>

                {/* Purchase price */}
                <div className="text-right text-sm text-gray-500 hidden sm:block">
                  {product.purchase_price ? `${product.purchase_price.toLocaleString('sv-SE')} kr` : '—'}
                </div>

                {/* Sales price */}
                <div className="text-right text-sm font-medium text-gray-900 hidden sm:block">
                  {product.sales_price.toLocaleString('sv-SE')} kr
                </div>

                {/* Unit */}
                <div className="text-center text-sm text-gray-500 hidden sm:block">
                  /{formatUnit(product.unit)}
                </div>

                {/* ROT/RUT */}
                <div className="text-center text-xs hidden sm:block">
                  {product.rot_eligible && <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-600 rounded">ROT</span>}
                  {product.rut_eligible && <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded ml-1">RUT</span>}
                  {!product.rot_eligible && !product.rut_eligible && <span className="text-gray-300">—</span>}
                </div>

                {/* Mobile price row */}
                <div className="flex items-center gap-3 sm:hidden text-sm">
                  <span className="font-medium text-gray-900">{product.sales_price.toLocaleString('sv-SE')} kr/{formatUnit(product.unit)}</span>
                  {product.rot_eligible && <span className="px-1.5 py-0.5 text-xs bg-emerald-100 text-emerald-600 rounded">ROT</span>}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 justify-end">
                  <button
                    onClick={() => setEditingProduct(product)}
                    className="p-1.5 text-gray-400 hover:text-primary-700 transition"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(product.id)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Info box */}
        <div className="mt-4 bg-primary-50 border border-[#E2E8F0] rounded-xl p-5 text-sm text-primary-700">
          <p className="font-medium mb-1">Tips</p>
          <p>Produkter du lägger till här kan snabbsökas i offertformuläret. Markera favoriter med stjärnan för snabbåtkomst.</p>
        </div>
      </div>

      {/* New/Edit Modal */}
      {(showNewModal || editingProduct) && (
        <ProductModal
          product={editingProduct}
          saving={saving}
          onSave={handleSave}
          onClose={() => { setShowNewModal(false); setEditingProduct(null) }}
        />
      )}
    </div>
  )
}

