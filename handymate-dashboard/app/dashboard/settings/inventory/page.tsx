'use client'

import { useEffect, useState, useCallback } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import {
  ArrowLeft,
  Plus,
  Package,
  Truck,
  Warehouse,
  Loader2,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
} from 'lucide-react'

interface Location {
  id: string
  name: string
  description: string | null
  is_default: boolean
}

interface InventoryItem {
  id: string
  name: string
  unit: string
  current_stock: number
  min_stock: number
  cost_price: number
  sell_price: number
  location_id: string
  location?: { id: string; name: string }
}

export default function InventorySettingsPage() {
  const business = useBusiness()
  const [locations, setLocations] = useState<Location[]>([])
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filterLocation, setFilterLocation] = useState('')
  const [search, setSearch] = useState('')

  // New location modal
  const [showNewLocation, setShowNewLocation] = useState(false)
  const [newLocName, setNewLocName] = useState('')
  const [newLocDesc, setNewLocDesc] = useState('')

  // New item modal
  const [showNewItem, setShowNewItem] = useState(false)
  const [newItem, setNewItem] = useState({
    name: '', location_id: '', unit: 'st', min_stock: 0, cost_price: 0, sell_price: 0, current_stock: 0,
  })
  const [saving, setSaving] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [locRes, itemRes] = await Promise.all([
        fetch('/api/inventory/locations'),
        fetch('/api/inventory/items'),
      ])
      if (locRes.ok) {
        const d = await locRes.json()
        setLocations(d.locations || [])
      }
      if (itemRes.ok) {
        const d = await itemRes.json()
        setItems(d.items || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const createLocation = async () => {
    if (!newLocName.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/inventory/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newLocName.trim(), description: newLocDesc.trim() || null }),
      })
      if (res.ok) {
        setShowNewLocation(false)
        setNewLocName('')
        setNewLocDesc('')
        fetchData()
      }
    } finally { setSaving(false) }
  }

  const createItem = async () => {
    if (!newItem.name.trim() || !newItem.location_id) return
    setSaving(true)
    try {
      const res = await fetch('/api/inventory/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem),
      })
      if (res.ok) {
        setShowNewItem(false)
        setNewItem({ name: '', location_id: '', unit: 'st', min_stock: 0, cost_price: 0, sell_price: 0, current_stock: 0 })
        fetchData()
      }
    } finally { setSaving(false) }
  }

  const deleteItem = async (id: string) => {
    if (!confirm('Ta bort artikeln?')) return
    await fetch(`/api/inventory/items/${id}`, { method: 'DELETE' })
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const filteredItems = items.filter(i => {
    if (filterLocation && i.location_id !== filterLocation) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const lowStockCount = items.filter(i => i.min_stock > 0 && i.current_stock <= i.min_stock).length

  if (!business.business_id) {
    return <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 text-primary-700 animate-spin" /></div>
  }

  return (
    <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/settings" className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Lager & Material</h1>
            <p className="text-sm text-gray-500">Hantera lagerplatser och artiklar</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-primary-700 animate-spin" /></div>
        ) : (
          <>
            {/* Lagerplatser */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Lagerplatser</h2>
                <button onClick={() => setShowNewLocation(true)} className="flex items-center gap-1.5 text-sm text-primary-700 hover:text-primary-700 font-medium">
                  <Plus className="w-4 h-4" /> Ny plats
                </button>
              </div>
              {locations.length === 0 ? (
                <p className="text-sm text-gray-400">Inga lagerplatser skapade ännu.</p>
              ) : (
                <div className="space-y-2">
                  {locations.map(loc => (
                    <div key={loc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {loc.name.toLowerCase().includes('bil') ? <Truck className="w-5 h-5 text-primary-700" /> : <Warehouse className="w-5 h-5 text-gray-500" />}
                        <div>
                          <span className="font-medium text-gray-900 text-sm">{loc.name}</span>
                          {loc.is_default && <span className="ml-2 text-xs text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded-full">standard</span>}
                          {loc.description && <p className="text-xs text-gray-400">{loc.description}</p>}
                        </div>
                      </div>
                      <span className="text-xs text-gray-400">{items.filter(i => i.location_id === loc.id).length} artiklar</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Artiklar */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">Artiklar</h2>
                <button
                  onClick={() => {
                    if (locations.length > 0) setNewItem(prev => ({ ...prev, location_id: locations[0].id }))
                    setShowNewItem(true)
                  }}
                  disabled={locations.length === 0}
                  className="flex items-center gap-1.5 text-sm text-primary-700 hover:text-primary-700 font-medium disabled:opacity-50"
                >
                  <Plus className="w-4 h-4" /> Ny artikel
                </button>
              </div>

              {/* Filter */}
              <div className="flex gap-3 mb-4">
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Sök artiklar..."
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                />
                <select
                  value={filterLocation}
                  onChange={e => setFilterLocation(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Alla platser</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>

              {filteredItems.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  {items.length === 0 ? 'Inga artiklar skapade ännu.' : 'Inga artiklar matchar filtret.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredItems.map(item => {
                    const isLow = item.min_stock > 0 && item.current_stock <= item.min_stock
                    return (
                      <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg ${isLow ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm text-gray-900">{item.name}</span>
                            {item.location && <span className="text-xs text-gray-400">{item.location.name}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                            <span className={isLow ? 'text-red-600 font-semibold' : ''}>{item.current_stock} {item.unit}</span>
                            {item.min_stock > 0 && (
                              <span className="flex items-center gap-1">
                                {isLow && <AlertTriangle className="w-3 h-3 text-red-500" />}
                                min {item.min_stock} {item.unit}
                              </span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => deleteItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {lowStockCount > 0 && (
                <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Lågt saldo: {lowStockCount} artikel{lowStockCount > 1 ? 'ar' : ''}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* New Location Modal */}
      {showNewLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Ny lagerplats</h2>
              <button onClick={() => setShowNewLocation(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Namn *</label>
                <input type="text" value={newLocName} onChange={e => setNewLocName(e.target.value)} placeholder="t.ex. Servicebilen" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 outline-none" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Beskrivning</label>
                <input type="text" value={newLocDesc} onChange={e => setNewLocDesc(e.target.value)} placeholder="Valfri beskrivning" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 outline-none" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowNewLocation(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Avbryt</button>
              <button onClick={createLocation} disabled={!newLocName.trim() || saving} className="px-4 py-2 text-sm bg-primary-700 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
                {saving ? 'Sparar...' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Item Modal */}
      {showNewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Ny lagerartikel</h2>
              <button onClick={() => setShowNewItem(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Artikel *</label>
                <input type="text" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="t.ex. Jordfelsbrytare 1-pol" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 outline-none" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lagerplats *</label>
                <select value={newItem.location_id} onChange={e => setNewItem({ ...newItem, location_id: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Enhet</label>
                  <select value={newItem.unit} onChange={e => setNewItem({ ...newItem, unit: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                    {['st', 'm', 'm²', 'kg', 'l', 'rulle'].map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Varningsgräns</label>
                  <input type="number" min={0} value={newItem.min_stock} onChange={e => setNewItem({ ...newItem, min_stock: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Inköpspris (kr)</label>
                  <input type="number" min={0} value={newItem.cost_price} onChange={e => setNewItem({ ...newItem, cost_price: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Försäljningspris (kr)</label>
                  <input type="number" min={0} value={newItem.sell_price} onChange={e => setNewItem({ ...newItem, sell_price: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Antal i lager nu</label>
                <input type="number" min={0} value={newItem.current_stock} onChange={e => setNewItem({ ...newItem, current_stock: parseFloat(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setShowNewItem(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Avbryt</button>
              <button onClick={createItem} disabled={!newItem.name.trim() || !newItem.location_id || saving} className="px-4 py-2 text-sm bg-primary-700 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium">
                {saving ? 'Sparar...' : 'Spara artikel'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
