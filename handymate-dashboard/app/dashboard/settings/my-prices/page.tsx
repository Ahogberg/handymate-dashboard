'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Loader2,
  Save,
  Wrench,
  Package,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'

interface PriceItem {
  id: string
  category: 'labor' | 'material' | 'service'
  name: string
  unit: string
  unit_price: number
  is_active: boolean
  _isNew?: boolean
  _dirty?: boolean
}

const UNIT_OPTIONS = [
  { value: 'timme', label: 'kr/tim' },
  { value: 'st', label: 'kr/st' },
  { value: 'kvm', label: 'kr/m²' },
  { value: 'm', label: 'kr/m' },
  { value: 'lpm', label: 'kr/lpm' },
  { value: 'kg', label: 'kr/kg' },
  { value: 'liter', label: 'kr/l' },
  { value: 'paket', label: 'kr/paket' },
]

export default function MyPricesPage() {
  const business = useBusiness()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState<PriceItem[]>([])

  useEffect(() => {
    fetchPrices()
  }, [business.business_id])

  async function fetchPrices() {
    const { data, error } = await supabase
      .from('price_list')
      .select('*')
      .eq('business_id', business.business_id)
      .order('category')
      .order('name')

    if (error) {
      console.error('Failed to fetch prices:', error)
    }
    setItems((data || []).map((d: any) => ({ ...d, _isNew: false, _dirty: false })))
    setLoading(false)
  }

  const laborItems = items.filter(i => i.category === 'labor' && i.is_active !== false)
  const materialItems = items.filter(i => i.category === 'material' && i.is_active !== false)

  function addItem(category: 'labor' | 'material') {
    const newItem: PriceItem = {
      id: 'pl_new_' + Math.random().toString(36).substr(2, 8),
      category,
      name: '',
      unit: category === 'labor' ? 'timme' : 'st',
      unit_price: 0,
      is_active: true,
      _isNew: true,
      _dirty: true,
    }
    setItems(prev => [...prev, newItem])
  }

  function updateItem(id: string, field: string, value: any) {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, [field]: value, _dirty: true } : item
    ))
  }

  function removeItem(id: string) {
    const item = items.find(i => i.id === id)
    if (!item) return
    if (item._isNew) {
      setItems(prev => prev.filter(i => i.id !== id))
    } else {
      // Soft-delete: mark as inactive
      setItems(prev => prev.map(i =>
        i.id === id ? { ...i, is_active: false, _dirty: true } : i
      ))
    }
  }

  async function saveAll() {
    setSaving(true)
    try {
      const dirtyItems = items.filter(i => i._dirty)
      const newItems = dirtyItems.filter(i => i._isNew && i.name.trim())
      const updatedItems = dirtyItems.filter(i => !i._isNew)

      if (newItems.length > 0) {
        const { error } = await supabase.from('price_list').insert(
          newItems.map(i => ({
            id: i.id.startsWith('pl_new_') ? `pl_${business.business_id}_${Date.now()}_${Math.random().toString(36).substr(2, 4)}` : i.id,
            business_id: business.business_id,
            category: i.category,
            name: i.name,
            unit: i.unit,
            unit_price: i.unit_price,
            is_active: i.is_active,
          }))
        )
        if (error) throw error
      }

      for (const item of updatedItems) {
        const { error } = await supabase
          .from('price_list')
          .update({
            name: item.name,
            unit: item.unit,
            unit_price: item.unit_price,
            is_active: item.is_active,
          })
          .eq('id', item.id)
        if (error) throw error
      }

      toast.success('Priser sparade!')
      await fetchPrices()
    } catch (err: any) {
      console.error('Save error:', err)
      toast.error('Kunde inte spara priser')
    }
    setSaving(false)
  }

  const hasDirty = items.some(i => i._dirty)

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-teal-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/settings" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Mina priser</h1>
            <p className="text-sm text-gray-500 mt-0.5">Dessa priser används av AI:n när den skapar offerter åt dig.</p>
          </div>
          <button
            onClick={saveAll}
            disabled={!hasDirty || saving}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Spara
          </button>
        </div>

        {/* Labor / Services */}
        <div className="bg-white border border-gray-200 rounded-xl mb-4">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Wrench className="w-4 h-4 text-teal-600" />
            <h2 className="font-semibold text-gray-900">Arbete</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {laborItems.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                Inga arbetsrader ännu. Klicka nedan för att lägga till.
              </div>
            )}
            {laborItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                <input
                  type="text"
                  value={item.name}
                  onChange={e => updateItem(item.id, 'name', e.target.value)}
                  placeholder="Tjänstnamn, t.ex. Elinstallation"
                  className="flex-1 min-w-0 bg-transparent border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-teal-500 placeholder-gray-300"
                />
                <input
                  type="number"
                  value={item.unit_price || ''}
                  onChange={e => updateItem(item.id, 'unit_price', Number(e.target.value))}
                  placeholder="0"
                  className="w-24 bg-transparent border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm text-right focus:outline-none focus:border-teal-500"
                />
                <select
                  value={item.unit}
                  onChange={e => updateItem(item.id, 'unit', e.target.value)}
                  className="w-24 bg-transparent border border-gray-200 rounded-lg px-2 py-2 text-gray-600 text-sm focus:outline-none focus:border-teal-500"
                >
                  {UNIT_OPTIONS.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100">
            <button
              onClick={() => addItem('labor')}
              className="flex items-center gap-2 text-sm text-teal-600 hover:text-teal-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Lägg till tjänst
            </button>
          </div>
        </div>

        {/* Material */}
        <div className="bg-white border border-gray-200 rounded-xl mb-4">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
            <Package className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold text-gray-900">Material</h2>
            <span className="text-xs text-gray-400 ml-1">(valfritt)</span>
          </div>
          <div className="divide-y divide-gray-100">
            {materialItems.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                Inga materialrader ännu. Klicka nedan för att lägga till.
              </div>
            )}
            {materialItems.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                <input
                  type="text"
                  value={item.name}
                  onChange={e => updateItem(item.id, 'name', e.target.value)}
                  placeholder="Materialnamn, t.ex. Kakel 30x30"
                  className="flex-1 min-w-0 bg-transparent border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-teal-500 placeholder-gray-300"
                />
                <input
                  type="number"
                  value={item.unit_price || ''}
                  onChange={e => updateItem(item.id, 'unit_price', Number(e.target.value))}
                  placeholder="0"
                  className="w-24 bg-transparent border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm text-right focus:outline-none focus:border-teal-500"
                />
                <select
                  value={item.unit}
                  onChange={e => updateItem(item.id, 'unit', e.target.value)}
                  className="w-24 bg-transparent border border-gray-200 rounded-lg px-2 py-2 text-gray-600 text-sm focus:outline-none focus:border-teal-500"
                >
                  {UNIT_OPTIONS.map(u => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => removeItem(item.id)}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <div className="px-5 py-3 border-t border-gray-100">
            <button
              onClick={() => addItem('material')}
              className="flex items-center gap-2 text-sm text-amber-600 hover:text-amber-700 font-medium"
            >
              <Plus className="w-4 h-4" />
              Lägg till material
            </button>
          </div>
        </div>

        {/* Link to products */}
        <Link
          href="/dashboard/settings/products"
          className="flex items-center justify-between p-4 bg-amber-50 hover:bg-amber-100 rounded-xl border border-amber-200 hover:border-amber-300 transition-all group"
        >
          <div className="flex items-center gap-3">
            <Package className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-medium text-gray-900 text-sm">Produktregister</p>
              <p className="text-xs text-gray-500">Sökbart register med alla produkter, material och artiklar</p>
            </div>
          </div>
          <span className="text-xs text-amber-600 font-medium group-hover:underline">Öppna →</span>
        </Link>

        {/* Info box */}
        <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 text-sm text-teal-700">
          <p className="font-medium mb-1">Tips</p>
          <p>Dessa priser hjälper AI-assistenten att skapa mer korrekta offerter. Du kan när som helst justera priserna på enskilda offerter.</p>
        </div>
      </div>
    </div>
  )
}
