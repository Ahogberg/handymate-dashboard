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
  X,
  Package,
  Wrench,
  Edit,
  Save,
} from 'lucide-react'

interface Product {
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

const UNIT_OPTIONS = [
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

const CATEGORY_OPTIONS = [
  { value: 'material', label: 'Material' },
  { value: 'arbete', label: 'Arbete' },
  { value: 'hyra', label: 'Hyra' },
  { value: 'övrigt', label: 'Övrigt' },
]

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
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
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
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition-colors"
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
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:border-teal-400"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:border-teal-400"
          >
            <option value="">Alla kategorier</option>
            {CATEGORY_OPTIONS.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        {/* Products list */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
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
                    className="mt-3 text-sm text-teal-600 hover:text-teal-700 font-medium"
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
                      product.category === 'arbete'
                        ? 'bg-teal-100 text-teal-600'
                        : product.category === 'hyra'
                          ? 'bg-purple-100 text-purple-600'
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
                    className="p-1.5 text-gray-400 hover:text-teal-600 transition"
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
        <div className="mt-4 bg-teal-50 border border-teal-200 rounded-xl p-5 text-sm text-teal-700">
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

// --- Product Modal ---

function ProductModal({ product, saving, onSave, onClose }: {
  product: Product | null
  saving: boolean
  onSave: (data: any) => void
  onClose: () => void
}) {
  const [name, setName] = useState(product?.name || '')
  const [description, setDescription] = useState(product?.description || '')
  const [category, setCategory] = useState(product?.category || 'material')
  const [sku, setSku] = useState(product?.sku || '')
  const [unit, setUnit] = useState(product?.unit || 'st')
  const [purchasePrice, setPurchasePrice] = useState(product?.purchase_price?.toString() || '')
  const [salesPrice, setSalesPrice] = useState(product?.sales_price?.toString() || '')
  const [rotEligible, setRotEligible] = useState(product?.rot_eligible || false)
  const [rutEligible, setRutEligible] = useState(product?.rut_eligible || false)
  const [isFavorite, setIsFavorite] = useState(product?.is_favorite || false)

  const purchase = parseFloat(purchasePrice) || 0
  const sales = parseFloat(salesPrice) || 0
  const markup = purchase > 0 ? Math.round(((sales - purchase) / purchase) * 100) : null

  const inputCls = 'w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-teal-400'

  const handleSubmit = () => {
    if (!name.trim() || !salesPrice) return
    onSave({
      ...(product ? { id: product.id } : {}),
      name: name.trim(),
      description: description.trim() || null,
      category,
      sku: sku.trim() || null,
      unit,
      purchase_price: purchase || null,
      sales_price: sales,
      rot_eligible: rotEligible,
      rut_eligible: rutEligible,
      is_favorite: isFavorite,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10 rounded-t-2xl">
          <h2 className="text-lg font-semibold text-gray-900">
            {product ? 'Redigera produkt' : 'Ny produkt'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-900">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Namn *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="T.ex. Kakel 30×30 vit" className={inputCls} />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Beskrivning</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Valfri beskrivning" className={inputCls} />
          </div>

          {/* Category + SKU */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls}>
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Artikelnummer</label>
              <input type="text" value={sku} onChange={e => setSku(e.target.value)} placeholder="Valfritt" className={inputCls} />
            </div>
          </div>

          {/* Prices */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Inköpspris</label>
              <div className="relative">
                <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="0" className={inputCls + ' pr-8'} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kr</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Försäljningspris *</label>
              <div className="relative">
                <input type="number" value={salesPrice} onChange={e => setSalesPrice(e.target.value)} placeholder="0" className={inputCls + ' pr-8'} />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kr</span>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wider mb-1.5 block">Enhet</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className={inputCls}>
                {UNIT_OPTIONS.map(u => (
                  <option key={u.value} value={u.value}>{u.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Markup display */}
          {markup !== null && (
            <p className="text-sm text-teal-600">Påslag: {markup}%</p>
          )}

          {/* Toggles */}
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={rotEligible} onChange={e => { setRotEligible(e.target.checked); if (e.target.checked) setRutEligible(false) }} className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
              <span className="text-sm text-gray-700">ROT-berättigad</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={rutEligible} onChange={e => { setRutEligible(e.target.checked); if (e.target.checked) setRotEligible(false) }} className="w-4 h-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
              <span className="text-sm text-gray-700">RUT-berättigad</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={isFavorite} onChange={e => setIsFavorite(e.target.checked)} className="w-4 h-4 rounded border-gray-300 text-amber-500 focus:ring-amber-400" />
              <span className="text-sm text-gray-700">Favorit (visas först)</span>
            </label>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Avbryt
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !salesPrice}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 rounded-lg text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {product ? 'Spara' : 'Lägg till'}
          </button>
        </div>
      </div>
    </div>
  )
}
