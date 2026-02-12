'use client'

import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Package,
  Plus,
  Upload,
  Search,
  Trash2,
  Edit2,
  X,
  Check,
  Loader2,
  Building,
  FileSpreadsheet,
  ChevronDown,
  ChevronRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

interface Supplier {
  supplier_id: string
  name: string
  customer_number: string | null
  contact_email: string | null
  contact_phone: string | null
  product_count: number
  created_at: string
}

interface Product {
  product_id: string
  supplier_id: string | null
  sku: string | null
  name: string
  category: string | null
  unit: string
  purchase_price: number | null
  sell_price: number | null
  markup_percent: number
  supplier?: {
    supplier_id: string
    name: string
  }
}

interface ImportPreview {
  valid: number
  errors: number
  errorMessages: string[]
  preview: any[]
}

export default function PricelistPage() {
  const business = useBusiness()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // State
  const [loading, setLoading] = useState(true)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [totalProducts, setTotalProducts] = useState(0)

  // Filters
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Modals
  const [showSupplierModal, setShowSupplierModal] = useState(false)
  const [showProductModal, setShowProductModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)

  // Import
  const [importSupplierId, setImportSupplierId] = useState<string | null>(null)
  const [importData, setImportData] = useState<any[]>([])
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null)
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview' | 'importing'>('upload')
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [defaultMarkup, setDefaultMarkup] = useState(20)

  // Forms
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    customer_number: '',
    contact_email: '',
    contact_phone: ''
  })
  const [productForm, setProductForm] = useState({
    supplier_id: '',
    sku: '',
    name: '',
    category: '',
    unit: 'st',
    purchase_price: '',
    sell_price: '',
    markup_percent: '20'
  })

  // Loading states
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success'
  })

  useEffect(() => {
    fetchSuppliers()
    fetchProducts()
  }, [business.business_id, selectedSupplier, selectedCategory, search])

  async function fetchSuppliers() {
    const response = await fetch(`/api/suppliers?businessId=${business.business_id}`)
    const data = await response.json()
    if (data.suppliers) {
      setSuppliers(data.suppliers)
    }
  }

  async function fetchProducts() {
    setLoading(true)
    let url = `/api/suppliers/products?businessId=${business.business_id}`
    if (selectedSupplier) url += `&supplierId=${selectedSupplier}`
    if (selectedCategory) url += `&category=${encodeURIComponent(selectedCategory)}`
    if (search) url += `&search=${encodeURIComponent(search)}`

    const response = await fetch(url)
    const data = await response.json()

    if (data.products) {
      setProducts(data.products)
      setTotalProducts(data.total || data.products.length)
      setCategories(data.categories || [])
    }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const formatCurrency = (amount: number | null) => {
    if (amount === null) return '-'
    return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 }).format(amount) + ' kr'
  }

  // Supplier CRUD
  const handleSaveSupplier = async () => {
    if (!supplierForm.name.trim()) {
      showToast('Ange leverantörsnamn', 'error')
      return
    }

    setSaving(true)
    try {
      const method = editingSupplier ? 'PUT' : 'POST'
      const body = editingSupplier
        ? { supplier_id: editingSupplier.supplier_id, ...supplierForm }
        : { business_id: business.business_id, ...supplierForm }

      const response = await fetch('/api/suppliers', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) throw new Error('Kunde inte spara')

      showToast(editingSupplier ? 'Leverantör uppdaterad' : 'Leverantör skapad', 'success')
      setShowSupplierModal(false)
      setEditingSupplier(null)
      setSupplierForm({ name: '', customer_number: '', contact_email: '', contact_phone: '' })
      fetchSuppliers()
    } catch (error: any) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSupplier = async (supplier: Supplier) => {
    if (!confirm(`Ta bort ${supplier.name}? Detta tar även bort alla produkter.`)) return

    try {
      const response = await fetch(`/api/suppliers?supplierId=${supplier.supplier_id}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Kunde inte ta bort')

      showToast('Leverantör borttagen', 'success')
      fetchSuppliers()
      fetchProducts()
    } catch (error: any) {
      showToast(error.message, 'error')
    }
  }

  // Product CRUD
  const handleSaveProduct = async () => {
    if (!productForm.name.trim()) {
      showToast('Ange produktnamn', 'error')
      return
    }

    setSaving(true)
    try {
      const method = editingProduct ? 'PUT' : 'POST'
      const body: any = {
        name: productForm.name,
        supplier_id: productForm.supplier_id || null,
        sku: productForm.sku || null,
        category: productForm.category || null,
        unit: productForm.unit || 'st',
        purchase_price: productForm.purchase_price ? parseFloat(productForm.purchase_price) : null,
        sell_price: productForm.sell_price ? parseFloat(productForm.sell_price) : null,
        markup_percent: parseFloat(productForm.markup_percent) || 20
      }

      if (editingProduct) {
        body.product_id = editingProduct.product_id
      } else {
        body.business_id = business.business_id
      }

      const response = await fetch('/api/suppliers/products', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) throw new Error('Kunde inte spara')

      showToast(editingProduct ? 'Produkt uppdaterad' : 'Produkt skapad', 'success')
      setShowProductModal(false)
      setEditingProduct(null)
      resetProductForm()
      fetchProducts()
    } catch (error: any) {
      showToast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteProduct = async (product: Product) => {
    if (!confirm(`Ta bort ${product.name}?`)) return

    try {
      const response = await fetch(`/api/suppliers/products?productId=${product.product_id}`, {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Kunde inte ta bort')

      showToast('Produkt borttagen', 'success')
      fetchProducts()
    } catch (error: any) {
      showToast(error.message, 'error')
    }
  }

  const resetProductForm = () => {
    setProductForm({
      supplier_id: '',
      sku: '',
      name: '',
      category: '',
      unit: 'st',
      purchase_price: '',
      sell_price: '',
      markup_percent: '20'
    })
  }

  // Import handling
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()

    if (file.name.endsWith('.csv')) {
      reader.onload = (event) => {
        const text = event.target?.result as string
        parseCSV(text)
      }
      reader.readAsText(file)
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      // For Excel files, we'll use a simple approach - convert to JSON on client
      showToast('Excel-filer stöds snart. Använd CSV för nu.', 'error')
    } else {
      showToast('Endast CSV-filer stöds', 'error')
    }
  }

  const parseCSV = (text: string) => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) {
      showToast('Filen verkar vara tom', 'error')
      return
    }

    // Parse header
    const delimiter = text.includes(';') ? ';' : ','
    const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''))

    // Parse rows
    const rows = lines.slice(1).map(line => {
      const values = line.split(delimiter).map(v => v.trim().replace(/"/g, ''))
      const row: Record<string, string> = {}
      headers.forEach((h, i) => {
        row[h] = values[i] || ''
      })
      return row
    })

    setImportData(rows)
    setImportStep('map')

    // Auto-detect column mapping
    const mapping: Record<string, string> = {}
    const headerLower = headers.map(h => h.toLowerCase())

    if (headerLower.some(h => h.includes('sku') || h.includes('art'))) {
      mapping.sku = headers[headerLower.findIndex(h => h.includes('sku') || h.includes('art'))]
    }
    if (headerLower.some(h => h.includes('namn') || h.includes('name') || h.includes('produkt'))) {
      mapping.name = headers[headerLower.findIndex(h => h.includes('namn') || h.includes('name') || h.includes('produkt'))]
    }
    if (headerLower.some(h => h.includes('kategori') || h.includes('category'))) {
      mapping.category = headers[headerLower.findIndex(h => h.includes('kategori') || h.includes('category'))]
    }
    if (headerLower.some(h => h.includes('pris') || h.includes('price') || h.includes('inköp'))) {
      mapping.purchase_price = headers[headerLower.findIndex(h => h.includes('pris') || h.includes('price') || h.includes('inköp'))]
    }

    setColumnMapping(mapping)
  }

  const handlePreviewImport = async () => {
    if (!columnMapping.name) {
      showToast('Välj vilken kolumn som är produktnamn', 'error')
      return
    }

    setImporting(true)
    try {
      // Map data according to column mapping
      const products = importData.map(row => ({
        sku: columnMapping.sku ? row[columnMapping.sku] : undefined,
        name: row[columnMapping.name],
        category: columnMapping.category ? row[columnMapping.category] : undefined,
        purchase_price: columnMapping.purchase_price ? row[columnMapping.purchase_price] : undefined,
        markup_percent: defaultMarkup
      }))

      const response = await fetch('/api/suppliers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          supplier_id: importSupplierId,
          products,
          mode: 'preview',
          default_markup: defaultMarkup
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      setImportPreview(data)
      setImportStep('preview')
    } catch (error: any) {
      showToast(error.message, 'error')
    } finally {
      setImporting(false)
    }
  }

  const handleImport = async () => {
    setImporting(true)
    setImportStep('importing')

    try {
      const products = importData.map(row => ({
        sku: columnMapping.sku ? row[columnMapping.sku] : undefined,
        name: row[columnMapping.name],
        category: columnMapping.category ? row[columnMapping.category] : undefined,
        purchase_price: columnMapping.purchase_price ? row[columnMapping.purchase_price] : undefined,
        markup_percent: defaultMarkup
      }))

      const response = await fetch('/api/suppliers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          supplier_id: importSupplierId,
          products,
          mode: 'import',
          default_markup: defaultMarkup
        })
      })

      const data = await response.json()
      if (!response.ok) throw new Error(data.error)

      showToast(data.message, 'success')
      closeImportModal()
      fetchSuppliers()
      fetchProducts()
    } catch (error: any) {
      showToast(error.message, 'error')
      setImportStep('preview')
    } finally {
      setImporting(false)
    }
  }

  const closeImportModal = () => {
    setShowImportModal(false)
    setImportSupplierId(null)
    setImportData([])
    setImportPreview(null)
    setImportStep('upload')
    setColumnMapping({})
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const getAvailableColumns = () => {
    if (importData.length === 0) return []
    return Object.keys(importData[0])
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/settings"
            className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Grossistprislista</h1>
            <p className="text-gray-500">Hantera leverantörer och produktpriser</p>
          </div>
        </div>

        {/* Suppliers Section */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building className="w-5 h-5 text-blue-600" />
              Leverantörer
            </h2>
            <button
              onClick={() => {
                setEditingSupplier(null)
                setSupplierForm({ name: '', customer_number: '', contact_email: '', contact_phone: '' })
                setShowSupplierModal(true)
              }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-100 border border-blue-300 rounded-xl text-blue-600 hover:bg-blue-500/30 text-sm"
            >
              <Plus className="w-4 h-4" />
              Lägg till
            </button>
          </div>

          {suppliers.length === 0 ? (
            <p className="text-gray-400 text-center py-8">
              Inga leverantörer ännu. Lägg till din första leverantör för att börja importera priser.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {suppliers.map(supplier => (
                <div
                  key={supplier.supplier_id}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${
                    selectedSupplier === supplier.supplier_id
                      ? 'bg-blue-100 border-blue-300'
                      : 'bg-gray-50 border-gray-300 hover:border-gray-300'
                  }`}
                  onClick={() => setSelectedSupplier(
                    selectedSupplier === supplier.supplier_id ? null : supplier.supplier_id
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-medium text-gray-900 truncate">{supplier.name}</h3>
                      {supplier.customer_number && (
                        <p className="text-xs text-gray-400">Kundnr: {supplier.customer_number}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-1">
                        {supplier.product_count} produkter
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setImportSupplierId(supplier.supplier_id)
                          setShowImportModal(true)
                        }}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Importera produkter"
                      >
                        <Upload className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setEditingSupplier(supplier)
                          setSupplierForm({
                            name: supplier.name,
                            customer_number: supplier.customer_number || '',
                            contact_email: supplier.contact_email || '',
                            contact_phone: supplier.contact_phone || ''
                          })
                          setShowSupplierModal(true)
                        }}
                        className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteSupplier(supplier)
                        }}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Products Section */}
        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-cyan-600" />
              Produkter
              <span className="text-sm font-normal text-gray-400">({totalProducts})</span>
            </h2>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Sök produkter..."
                  className="w-full sm:w-64 pl-10 pr-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
              {categories.length > 0 && (
                <select
                  value={selectedCategory || ''}
                  onChange={(e) => setSelectedCategory(e.target.value || null)}
                  className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="">Alla kategorier</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
              <button
                onClick={() => {
                  setEditingProduct(null)
                  resetProductForm()
                  setShowProductModal(true)
                }}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-100 border border-fuchsia-500/30 rounded-xl text-cyan-600 hover:bg-cyan-500/30 text-sm whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Ny produkt
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Laddar...</div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400">Inga produkter{selectedSupplier ? ' för denna leverantör' : ''}</p>
              <p className="text-gray-400 text-sm mt-1">
                Importera produkter från en CSV-fil eller lägg till manuellt
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase">Produkt</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase hidden sm:table-cell">Kategori</th>
                    <th className="text-left py-3 px-4 text-xs font-medium text-gray-400 uppercase hidden md:table-cell">Leverantör</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">Inköp</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase">Sälj</th>
                    <th className="text-right py-3 px-4 text-xs font-medium text-gray-400 uppercase w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map(product => (
                    <tr key={product.product_id} className="border-b border-gray-200/50 hover:bg-gray-100/30">
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900">{product.name}</div>
                        {product.sku && (
                          <div className="text-xs text-gray-400">{product.sku}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-sm hidden sm:table-cell">
                        {product.category || '-'}
                      </td>
                      <td className="py-3 px-4 text-gray-500 text-sm hidden md:table-cell">
                        {product.supplier?.name || '-'}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-500 text-sm">
                        {formatCurrency(product.purchase_price)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-900 font-medium">
                        {formatCurrency(product.sell_price)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingProduct(product)
                              setProductForm({
                                supplier_id: product.supplier_id || '',
                                sku: product.sku || '',
                                name: product.name,
                                category: product.category || '',
                                unit: product.unit,
                                purchase_price: product.purchase_price?.toString() || '',
                                sell_price: product.sell_price?.toString() || '',
                                markup_percent: product.markup_percent.toString()
                              })
                              setShowProductModal(true)
                            }}
                            className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingSupplier ? 'Redigera leverantör' : 'Ny leverantör'}
              </h3>
              <button onClick={() => setShowSupplierModal(false)} className="text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Namn *</label>
                <input
                  type="text"
                  value={supplierForm.name}
                  onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                  placeholder="T.ex. Ahlsell, Elektroskandia"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Kundnummer</label>
                <input
                  type="text"
                  value={supplierForm.customer_number}
                  onChange={(e) => setSupplierForm({ ...supplierForm, customer_number: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                  placeholder="Ditt kundnummer hos leverantören"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Email</label>
                  <input
                    type="email"
                    value={supplierForm.contact_email}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contact_email: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={supplierForm.contact_phone}
                    onChange={(e) => setSupplierForm({ ...supplierForm, contact_phone: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowSupplierModal(false)}
                className="px-4 py-2 text-gray-500 hover:text-gray-900"
              >
                Avbryt
              </button>
              <button
                onClick={handleSaveSupplier}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingProduct ? 'Redigera produkt' : 'Ny produkt'}
              </h3>
              <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Namn *</label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Artikelnr/SKU</label>
                  <input
                    type="text"
                    value={productForm.sku}
                    onChange={(e) => setProductForm({ ...productForm, sku: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Kategori</label>
                  <input
                    type="text"
                    value={productForm.category}
                    onChange={(e) => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Leverantör</label>
                <select
                  value={productForm.supplier_id}
                  onChange={(e) => setProductForm({ ...productForm, supplier_id: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                >
                  <option value="">Ingen leverantör</option>
                  {suppliers.map(s => (
                    <option key={s.supplier_id} value={s.supplier_id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Inköpspris</label>
                  <input
                    type="number"
                    value={productForm.purchase_price}
                    onChange={(e) => setProductForm({ ...productForm, purchase_price: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                    step="0.01"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Påslag %</label>
                  <input
                    type="number"
                    value={productForm.markup_percent}
                    onChange={(e) => setProductForm({ ...productForm, markup_percent: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Säljpris</label>
                  <input
                    type="number"
                    value={productForm.sell_price}
                    onChange={(e) => setProductForm({ ...productForm, sell_price: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:border-blue-500"
                    step="0.01"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowProductModal(false)}
                className="px-4 py-2 text-gray-500 hover:text-gray-900"
              >
                Avbryt
              </button>
              <button
                onClick={handleSaveProduct}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Spara
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                Importera produkter
              </h3>
              <button onClick={closeImportModal} className="text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Upload */}
            {importStep === 'upload' && (
              <div className="space-y-4">
                <p className="text-gray-500">
                  Ladda upp en CSV-fil med produkter. Filen bör ha kolumner för produktnamn och pris.
                </p>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-300 transition-colors"
                >
                  <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-900 font-medium">Klicka för att välja fil</p>
                  <p className="text-gray-400 text-sm mt-1">CSV-filer (.csv)</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </div>
            )}

            {/* Step 2: Map columns */}
            {importStep === 'map' && (
              <div className="space-y-4">
                <p className="text-gray-500">
                  Välj vilka kolumner i din fil som motsvarar produktdata.
                </p>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Produktnamn *</label>
                    <select
                      value={columnMapping.name || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, name: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900"
                    >
                      <option value="">Välj kolumn</option>
                      {getAvailableColumns().map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Artikelnummer/SKU</label>
                    <select
                      value={columnMapping.sku || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, sku: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900"
                    >
                      <option value="">Välj kolumn</option>
                      {getAvailableColumns().map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Kategori</label>
                    <select
                      value={columnMapping.category || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, category: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900"
                    >
                      <option value="">Välj kolumn</option>
                      {getAvailableColumns().map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Inköpspris</label>
                    <select
                      value={columnMapping.purchase_price || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, purchase_price: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900"
                    >
                      <option value="">Välj kolumn</option>
                      {getAvailableColumns().map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-1">Standardpåslag (%)</label>
                  <input
                    type="number"
                    value={defaultMarkup}
                    onChange={(e) => setDefaultMarkup(parseInt(e.target.value) || 20)}
                    className="w-32 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900"
                  />
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setImportStep('upload')}
                    className="px-4 py-2 text-gray-500 hover:text-gray-900"
                  >
                    Tillbaka
                  </button>
                  <button
                    onClick={handlePreviewImport}
                    disabled={importing || !columnMapping.name}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium disabled:opacity-50"
                  >
                    {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                    Förhandsgranska
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Preview */}
            {importStep === 'preview' && importPreview && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                    <div className="text-2xl font-bold text-emerald-600">{importPreview.valid}</div>
                    <div className="text-sm text-emerald-600/80">Giltiga</div>
                  </div>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center">
                    <div className="text-2xl font-bold text-red-600">{importPreview.errors}</div>
                    <div className="text-sm text-red-600/80">Fel</div>
                  </div>
                  <div className="p-4 bg-gray-100 border border-gray-300 rounded-xl text-center">
                    <div className="text-2xl font-bold text-gray-900">{importData.length}</div>
                    <div className="text-sm text-gray-500">Totalt</div>
                  </div>
                </div>

                {importPreview.errorMessages.length > 0 && (
                  <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
                    <p className="text-sm text-red-600 font-medium mb-2">Fel i filen:</p>
                    <ul className="text-sm text-red-600/80 space-y-1">
                      {importPreview.errorMessages.map((msg, i) => (
                        <li key={i}>{msg}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div>
                  <p className="text-sm text-gray-500 mb-2">Förhandsvisning (första 5):</p>
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-300">
                          <th className="text-left p-2 text-gray-400">Namn</th>
                          <th className="text-left p-2 text-gray-400">SKU</th>
                          <th className="text-right p-2 text-gray-400">Inköp</th>
                          <th className="text-right p-2 text-gray-400">Sälj</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importPreview.preview.slice(0, 5).map((p, i) => (
                          <tr key={i} className="border-b border-gray-200">
                            <td className="p-2 text-gray-900">{p.name}</td>
                            <td className="p-2 text-gray-500">{p.sku || '-'}</td>
                            <td className="p-2 text-right text-gray-500">
                              {p.purchase_price ? `${p.purchase_price} kr` : '-'}
                            </td>
                            <td className="p-2 text-right text-gray-900">
                              {p.sell_price ? `${p.sell_price} kr` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex justify-between mt-6">
                  <button
                    onClick={() => setImportStep('map')}
                    className="px-4 py-2 text-gray-500 hover:text-gray-900"
                  >
                    Tillbaka
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importing || importPreview.valid === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium disabled:opacity-50"
                  >
                    {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                    Importera {importPreview.valid} produkter
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Importing */}
            {importStep === 'importing' && (
              <div className="text-center py-12">
                <Loader2 className="w-12 h-12 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-900 font-medium">Importerar produkter...</p>
                <p className="text-gray-400 text-sm">Detta kan ta en stund</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
