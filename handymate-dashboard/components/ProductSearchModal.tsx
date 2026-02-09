'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X,
  Search,
  Loader2,
  Package,
  Check,
  AlertCircle,
  ChevronDown,
  Settings,
  Plus,
} from 'lucide-react'
import Link from 'next/link'
import type { SelectedProduct, SupplierProduct } from '@/lib/suppliers/types'

interface SupplierInfo {
  key: string
  name: string
  connected: boolean
}

interface ProductSearchModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (product: SelectedProduct) => void
  businessId: string
  defaultMarkup?: number
}

function formatPrice(value: number): string {
  return value.toLocaleString('sv-SE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' kr'
}

export default function ProductSearchModal({
  isOpen,
  onClose,
  onSelect,
  businessId,
  defaultMarkup = 20,
}: ProductSearchModalProps) {
  const [suppliers, setSuppliers] = useState<SupplierInfo[]>([])
  const [activeSupplier, setActiveSupplier] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<string>('')
  const [categories, setCategories] = useState<string[]>([])
  const [products, setProducts] = useState<SupplierProduct[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingSuppliers, setLoadingSuppliers] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [markups, setMarkups] = useState<Record<string, number>>({})
  const [categoryOpen, setCategoryOpen] = useState(false)

  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch connected suppliers on mount
  useEffect(() => {
    if (!isOpen) return

    async function fetchSuppliers() {
      setLoadingSuppliers(true)
      try {
        const res = await fetch('/api/grossist')
        if (!res.ok) throw new Error('Kunde inte hämta grossister')
        const data = await res.json()
        const connected = (data.suppliers || []).filter(
          (s: SupplierInfo) => s.connected
        )
        setSuppliers(connected)
        if (connected.length > 0 && !activeSupplier) {
          setActiveSupplier(connected[0].key)
        }
      } catch (err: any) {
        setError(err.message || 'Något gick fel')
      } finally {
        setLoadingSuppliers(false)
      }
    }

    fetchSuppliers()
  }, [isOpen])

  // Escape key closes modal
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus search input when supplier changes
  useEffect(() => {
    if (isOpen && activeSupplier) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen, activeSupplier])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setCategory('')
      setProducts([])
      setTotal(0)
      setHasMore(false)
      setError(null)
      setExpandedId(null)
      setMarkups({})
      setCategories([])
    }
  }, [isOpen])

  const searchProducts = useCallback(
    async (searchQuery: string, selectedCategory: string) => {
      if (!activeSupplier || !searchQuery.trim()) {
        setProducts([])
        setTotal(0)
        setHasMore(false)
        return
      }

      setLoading(true)
      setError(null)

      try {
        const params = new URLSearchParams({ q: searchQuery, limit: '20' })
        if (selectedCategory) params.set('category', selectedCategory)

        const res = await fetch(
          `/api/grossist/${activeSupplier}/search?${params.toString()}`
        )
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || 'Sökning misslyckades')
        }

        const data = await res.json()
        setProducts(data.products || [])
        setTotal(data.total || 0)
        setHasMore(data.hasMore || false)

        // Extract unique categories from results
        const cats = Array.from(
          new Set(
            (data.products || [])
              .map((p: SupplierProduct) => p.category)
              .filter(Boolean)
          )
        ) as string[]
        setCategories((prev) => {
          const merged = Array.from(new Set([...prev, ...cats]))
          merged.sort((a, b) => a.localeCompare(b, 'sv'))
          return merged
        })
      } catch (err: any) {
        setError(err.message || 'Något gick fel vid sökning')
        setProducts([])
      } finally {
        setLoading(false)
      }
    },
    [activeSupplier]
  )

  // Debounced search
  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      searchProducts(value, category)
    }, 300)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      searchProducts(query, category)
    }
  }

  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    setCategoryOpen(false)
    if (query.trim()) {
      searchProducts(query, cat)
    }
  }

  const handleSupplierChange = (key: string) => {
    setActiveSupplier(key)
    setProducts([])
    setTotal(0)
    setHasMore(false)
    setExpandedId(null)
    setError(null)
    if (query.trim()) {
      setTimeout(() => searchProducts(query, category), 50)
    }
  }

  const getMarkup = (productId: string) =>
    markups[productId] ?? defaultMarkup

  const calcSellPrice = (purchasePrice: number, markup: number) =>
    purchasePrice * (1 + markup / 100)

  const handleSelect = (product: SupplierProduct) => {
    const markup = getMarkup(product.external_id)
    const purchasePrice = product.purchase_price ?? 0
    const supplierName =
      suppliers.find((s) => s.key === activeSupplier)?.name || activeSupplier || ''

    onSelect({
      source: 'grossist',
      grossist_product_id: product.external_id,
      name: product.name,
      sku: product.sku,
      supplier_name: supplierName,
      unit: product.unit,
      purchase_price: purchasePrice,
      recommended_price: product.recommended_price ?? undefined,
      markup_percent: markup,
      sell_price: Math.round(calcSellPrice(purchasePrice, markup) * 100) / 100,
      image_url: product.image_url,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-2xl max-h-[85vh] bg-[#09090b] border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            Sök produkter hos grossister
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loadingSuppliers ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
              <span className="ml-3 text-zinc-400">Laddar grossister...</span>
            </div>
          ) : suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <Package className="w-12 h-12 text-zinc-600 mb-4" />
              <p className="text-zinc-400 mb-2">Inga anslutna grossister</p>
              <p className="text-zinc-500 text-sm mb-4">
                Anslut en grossist i inställningarna för att söka produkter.
              </p>
              <Link
                href="/dashboard/settings/pricelist"
                onClick={onClose}
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
              >
                <Settings className="w-4 h-4" />
                Gå till inställningar
              </Link>
            </div>
          ) : (
            <>
              {/* Supplier tabs */}
              <div className="flex gap-1 px-6 pt-4 pb-2 overflow-x-auto">
                {suppliers.map((s) => (
                  <button
                    key={s.key}
                    onClick={() => handleSupplierChange(s.key)}
                    className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${
                      activeSupplier === s.key
                        ? 'bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 text-white border border-violet-500/30'
                        : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Search bar + category filter */}
              <div className="flex gap-3 px-6 py-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Sök produkt..."
                    className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25 transition-colors"
                  />
                </div>

                {/* Category dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setCategoryOpen(!categoryOpen)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-zinc-900/50 border border-zinc-800 rounded-lg text-sm text-zinc-400 hover:text-white hover:border-zinc-700 transition-colors whitespace-nowrap"
                  >
                    {category || 'Kategori'}
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  {categoryOpen && (
                    <div className="absolute right-0 top-full mt-1 w-56 max-h-60 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-10">
                      <button
                        onClick={() => handleCategoryChange('')}
                        className={`w-full px-4 py-2 text-sm text-left transition-colors ${
                          !category
                            ? 'text-violet-400 bg-violet-500/10'
                            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                        }`}
                      >
                        Alla kategorier
                      </button>
                      {categories.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => handleCategoryChange(cat)}
                          className={`w-full px-4 py-2 text-sm text-left transition-colors ${
                            category === cat
                              ? 'text-violet-400 bg-violet-500/10'
                              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                      {categories.length === 0 && (
                        <p className="px-4 py-2 text-xs text-zinc-500">
                          Sök för att se kategorier
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div className="mx-6 mb-3 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Loading state */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-5 h-5 text-violet-400 animate-spin" />
                  <span className="ml-3 text-zinc-400 text-sm">Söker...</span>
                </div>
              )}

              {/* Product list */}
              {!loading && products.length > 0 && (
                <div className="px-6 pb-3 space-y-2">
                  {products.map((product) => {
                    const isExpanded = expandedId === product.external_id
                    const markup = getMarkup(product.external_id)
                    const purchasePrice = product.purchase_price ?? 0
                    const sellPrice = calcSellPrice(purchasePrice, markup)

                    return (
                      <div
                        key={product.external_id}
                        className={`border rounded-xl transition-all ${
                          isExpanded
                            ? 'border-violet-500/30 bg-violet-500/5'
                            : 'border-zinc-800 bg-zinc-900/50 hover:border-zinc-700'
                        }`}
                      >
                        {/* Product row */}
                        <button
                          onClick={() =>
                            setExpandedId(
                              isExpanded ? null : product.external_id
                            )
                          }
                          className="w-full px-4 py-3 text-left"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 text-xs text-zinc-500 mb-1">
                                {product.sku && (
                                  <span>Art: {product.sku}</span>
                                )}
                                {product.rsk_number && (
                                  <span>RSK: {product.rsk_number}</span>
                                )}
                                {product.e_number && (
                                  <span>E-nr: {product.e_number}</span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-white truncate">
                                {product.name}
                              </p>
                              <div className="flex items-center gap-3 mt-1">
                                {product.category && (
                                  <span className="text-xs text-zinc-500">
                                    {product.category}
                                  </span>
                                )}
                                {purchasePrice > 0 && (
                                  <span className="text-xs text-zinc-400">
                                    {formatPrice(purchasePrice)}/{product.unit}
                                  </span>
                                )}
                                {product.in_stock ? (
                                  <span className="flex items-center gap-1 text-xs text-emerald-400">
                                    <Check className="w-3 h-3" />I lager
                                    {product.stock_quantity != null &&
                                      ` (${product.stock_quantity})`}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-xs text-red-400">
                                    <X className="w-3 h-3" />
                                    Ej i lager
                                  </span>
                                )}
                              </div>
                            </div>
                            {product.image_url && (
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-12 h-12 rounded-lg object-cover bg-zinc-800 flex-shrink-0"
                              />
                            )}
                          </div>
                        </button>

                        {/* Expanded details */}
                        {isExpanded && (
                          <div className="px-4 pb-4 pt-1 border-t border-zinc-800/50">
                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <div>
                                <label className="block text-xs text-zinc-500 mb-1">
                                  Inköpspris
                                </label>
                                <p className="text-sm font-medium text-white">
                                  {formatPrice(purchasePrice)}
                                </p>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-500 mb-1">
                                  Påslag
                                </label>
                                <div className="flex items-center gap-1">
                                  <input
                                    type="number"
                                    min={0}
                                    max={500}
                                    value={markup}
                                    onChange={(e) =>
                                      setMarkups((prev) => ({
                                        ...prev,
                                        [product.external_id]:
                                          parseFloat(e.target.value) || 0,
                                      }))
                                    }
                                    className="w-20 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-white text-right focus:outline-none focus:border-violet-500/50"
                                  />
                                  <span className="text-sm text-zinc-400">%</span>
                                </div>
                              </div>
                              <div>
                                <label className="block text-xs text-zinc-500 mb-1">
                                  Kundpris
                                </label>
                                <p className="text-sm font-semibold text-violet-400">
                                  {formatPrice(
                                    Math.round(sellPrice * 100) / 100
                                  )}
                                </p>
                              </div>
                            </div>
                            {product.recommended_price != null &&
                              product.recommended_price > 0 && (
                                <p className="text-xs text-zinc-500 mb-3">
                                  Rekommenderat pris:{' '}
                                  {formatPrice(product.recommended_price)}
                                </p>
                              )}
                            <button
                              onClick={() => handleSelect(product)}
                              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
                            >
                              <Plus className="w-4 h-4" />
                              Lägg till
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Empty state after search */}
              {!loading && query.trim() && products.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Search className="w-10 h-10 text-zinc-700 mb-3" />
                  <p className="text-zinc-400 text-sm">Inga resultat</p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Prova ett annat sökord eller byt grossist
                  </p>
                </div>
              )}

              {/* Initial state - no search yet */}
              {!loading && !query.trim() && products.length === 0 && !error && (
                <div className="flex flex-col items-center justify-center py-12">
                  <Search className="w-10 h-10 text-zinc-700 mb-3" />
                  <p className="text-zinc-500 text-sm">
                    Skriv ett sökord för att hitta produkter
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with result count */}
        {!loadingSuppliers && suppliers.length > 0 && products.length > 0 && (
          <div className="px-6 py-3 border-t border-zinc-800 text-xs text-zinc-500">
            Visar {products.length} av {total} resultat
            {hasMore && (
              <span className="ml-1 text-zinc-600">
                - förfina sökningen för att se fler
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
