'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Package,
  Search
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Supplier {
  supplier_id: string
  name: string
  contact_email: string | null
}

interface Product {
  product_id: string
  supplier_id: string
  sku: string | null
  name: string
  unit: string
  purchase_price: number | null
  supplier?: { name: string }
}

interface OrderItem {
  product_id?: string
  name: string
  sku?: string
  quantity: number
  unit: string
  unit_price: number
  total: number
}

export default function NewOrderPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [filteredProducts, setFilteredProducts] = useState<Product[]>([])

  // Form state
  const [supplierId, setSupplierId] = useState(searchParams.get('supplierId') || '')
  const [items, setItems] = useState<OrderItem[]>([])
  const [deliveryAddress, setDeliveryAddress] = useState('')
  const [notes, setNotes] = useState('')
  const [productSearch, setProductSearch] = useState('')
  const [showProductSearch, setShowProductSearch] = useState(false)

  useEffect(() => {
    if (business.business_id) {
      fetchData()
    }
  }, [business.business_id])

  useEffect(() => {
    // Filter products when search or supplier changes
    let filtered = products
    if (supplierId) {
      filtered = filtered.filter(p => p.supplier_id === supplierId)
    }
    if (productSearch) {
      const search = productSearch.toLowerCase()
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.sku?.toLowerCase().includes(search)
      )
    }
    setFilteredProducts(filtered.slice(0, 20))
  }, [products, supplierId, productSearch])

  async function fetchData() {
    // Fetch suppliers
    const { data: suppliersData } = await supabase
      .from('supplier')
      .select('supplier_id, name, contact_email')
      .eq('business_id', business.business_id)
      .order('name')

    // Fetch products
    const { data: productsData } = await supabase
      .from('supplier_product')
      .select(`
        product_id,
        supplier_id,
        sku,
        name,
        unit,
        purchase_price,
        supplier:supplier_id (name)
      `)
      .eq('business_id', business.business_id)
      .order('name')
      .limit(500)

    // Fetch business address for default delivery
    const { data: businessData } = await supabase
      .from('business_config')
      .select('address')
      .eq('business_id', business.business_id)
      .single()

    setSuppliers(suppliersData || [])
    setProducts(productsData || [])
    setDeliveryAddress(businessData?.address || '')
    setLoading(false)
  }

  const addProduct = (product: Product) => {
    // Check if already in list
    const existing = items.find(i => i.product_id === product.product_id)
    if (existing) {
      // Increase quantity
      setItems(items.map(i =>
        i.product_id === product.product_id
          ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.unit_price }
          : i
      ))
    } else {
      setItems([...items, {
        product_id: product.product_id,
        name: product.name,
        sku: product.sku || undefined,
        quantity: 1,
        unit: product.unit || 'st',
        unit_price: product.purchase_price || 0,
        total: product.purchase_price || 0
      }])
    }
    setShowProductSearch(false)
    setProductSearch('')
  }

  const addEmptyItem = () => {
    setItems([...items, {
      name: '',
      quantity: 1,
      unit: 'st',
      unit_price: 0,
      total: 0
    }])
  }

  const updateItem = (index: number, field: keyof OrderItem, value: any) => {
    const newItems = [...items]
    newItems[index] = { ...newItems[index], [field]: value }

    // Recalculate total
    if (field === 'quantity' || field === 'unit_price') {
      newItems[index].total = newItems[index].quantity * newItems[index].unit_price
    }

    setItems(newItems)
  }

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index))
  }

  // Calculate total
  const total = items.reduce((sum, item) => sum + item.total, 0)

  const handleCreate = async () => {
    if (items.length === 0) {
      alert('Lägg till minst en produkt')
      return
    }

    setCreating(true)
    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          supplier_id: supplierId || null,
          items,
          delivery_address: deliveryAddress || null,
          notes: notes || null
        })
      })

      if (!response.ok) throw new Error('Kunde inte skapa beställning')

      router.push('/dashboard/orders')
    } catch (error) {
      alert('Något gick fel')
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/orders" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Ny materialbeställning</h1>
            <p className="text-sm text-gray-500">Beställ material från din grossist</p>
          </div>
        </div>

        {/* Form */}
        <div className="space-y-6">
          {/* Supplier & Delivery */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-500 mb-2">Leverantör</label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">Välj leverantör...</option>
                  {suppliers.map(s => (
                    <option key={s.supplier_id} value={s.supplier_id}>
                      {s.name} {!s.contact_email && '(saknar email)'}
                    </option>
                  ))}
                </select>
                {supplierId && !suppliers.find(s => s.supplier_id === supplierId)?.contact_email && (
                  <p className="text-xs text-amber-600 mt-1">Leverantören saknar email - beställningen kan inte skickas digitalt</p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-2">Leveransadress</label>
                <input
                  type="text"
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Adress för leverans"
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="block text-sm text-gray-500 mb-2">Meddelande till leverantör</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ev. önskemål om leverans, brådskande etc."
                rows={2}
                className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
            </div>
          </div>

          {/* Products */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Produkter</h2>
              <div className="flex gap-2">
                <div className="relative">
                  <button
                    onClick={() => setShowProductSearch(!showProductSearch)}
                    className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
                  >
                    <Search className="w-4 h-4" />
                    Sök produkt
                  </button>

                  {showProductSearch && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-gray-100 border border-gray-300 rounded-xl shadow-xl z-10">
                      <div className="p-2">
                        <input
                          type="text"
                          value={productSearch}
                          onChange={(e) => setProductSearch(e.target.value)}
                          placeholder="Sök på namn eller artikelnummer..."
                          className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-60 overflow-y-auto">
                        {filteredProducts.length === 0 ? (
                          <p className="p-4 text-center text-gray-400 text-sm">
                            {products.length === 0 ? 'Inga produkter i prislistan' : 'Inga produkter hittades'}
                          </p>
                        ) : (
                          filteredProducts.map(product => (
                            <button
                              key={product.product_id}
                              onClick={() => addProduct(product)}
                              className="w-full flex items-center justify-between px-4 py-2 text-left hover:bg-gray-200 transition-all"
                            >
                              <div>
                                <p className="text-gray-900 text-sm">{product.name}</p>
                                <p className="text-xs text-gray-400">
                                  {product.sku && `${product.sku} • `}
                                  {product.supplier?.name}
                                </p>
                              </div>
                              <span className="text-gray-500 text-sm">
                                {product.purchase_price?.toLocaleString('sv-SE')} kr
                              </span>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={addEmptyItem}
                  className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-100 border border-blue-300 rounded-xl text-blue-600 hover:bg-blue-500/30"
                >
                  <Plus className="w-4 h-4" />
                  Lägg till rad
                </button>
              </div>
            </div>

            {items.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-300 rounded-xl">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-400 mb-2">Inga produkter ännu</p>
                <p className="text-sm text-gray-400">Sök i prislistan eller lägg till manuellt</p>
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((item, index) => (
                  <div key={index} className="flex flex-wrap items-end gap-3 p-4 bg-gray-50 rounded-xl">
                    {item.sku && (
                      <div className="w-24">
                        <label className="block text-xs text-gray-400 mb-1">Art.nr</label>
                        <p className="py-2 text-gray-500 text-sm font-mono">{item.sku}</p>
                      </div>
                    )}
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-xs text-gray-400 mb-1">Produkt</label>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-gray-400 mb-1">Antal</label>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="w-20">
                      <label className="block text-xs text-gray-400 mb-1">Enhet</label>
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                        className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="st">st</option>
                        <option value="m">m</option>
                        <option value="kg">kg</option>
                        <option value="l">l</option>
                        <option value="förp">förp</option>
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-xs text-gray-400 mb-1">Inköpspris</label>
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(index, 'unit_price', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                    <div className="w-24 text-right">
                      <label className="block text-xs text-gray-400 mb-1">Summa</label>
                      <p className="py-2 text-gray-900 font-medium">{item.total.toLocaleString('sv-SE')} kr</p>
                    </div>
                    <button
                      onClick={() => removeItem(index)}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Total */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6">
            <div className="max-w-sm ml-auto">
              <div className="flex justify-between text-xl font-bold text-gray-900">
                <span>Totalt inköpsvärde</span>
                <span>{total.toLocaleString('sv-SE')} kr</span>
              </div>
              <p className="text-sm text-gray-400 text-right mt-1">exkl. moms</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-4">
            <Link
              href="/dashboard/orders"
              className="px-6 py-3 text-gray-500 hover:text-gray-900"
            >
              Avbryt
            </Link>
            <button
              onClick={handleCreate}
              disabled={creating || items.length === 0}
              className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Skapa beställning
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
