'use client'

import { useEffect, useState, useCallback } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import {
  Package,
  Plus,
  AlertTriangle,
  Loader2,
  X,
  ArrowDown,
  ArrowUp,
  Check,
  Trash2,
} from 'lucide-react'

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

interface Location {
  id: string
  name: string
}

interface Project {
  project_id: string
  name: string
}

interface WithdrawalLine {
  itemId: string
  quantity: number
}

export default function PlanningInventoryPage() {
  const business = useBusiness()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLocation, setSelectedLocation] = useState('')
  const [search, setSearch] = useState('')

  // Withdrawal modal
  const [showWithdraw, setShowWithdraw] = useState(false)
  const [withdrawLines, setWithdrawLines] = useState<WithdrawalLine[]>([{ itemId: '', quantity: 1 }])
  const [withdrawProject, setWithdrawProject] = useState('')
  const [withdrawing, setWithdrawing] = useState(false)

  // Restock modal
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null)
  const [restockQty, setRestockQty] = useState(0)
  const [restocking, setRestocking] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [itemRes, locRes, projRes] = await Promise.all([
        fetch('/api/inventory/items'),
        fetch('/api/inventory/locations'),
        fetch('/api/projects?status=active'),
      ])
      if (itemRes.ok) setItems((await itemRes.json()).items || [])
      if (locRes.ok) setLocations((await locRes.json()).locations || [])
      if (projRes.ok) {
        const d = await projRes.json()
        setProjects(d.projects || d.data || [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const filteredItems = items.filter(i => {
    if (selectedLocation && i.location_id !== selectedLocation) return false
    if (search && !i.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const lowStock = filteredItems.filter(i => i.min_stock > 0 && i.current_stock <= i.min_stock)
  const okStock = filteredItems.filter(i => !(i.min_stock > 0 && i.current_stock <= i.min_stock))

  const getStockPercent = (item: InventoryItem) => {
    if (item.min_stock <= 0) return 100
    const max = item.min_stock * 3
    return Math.min(100, Math.round((item.current_stock / max) * 100))
  }

  const handleWithdraw = async () => {
    const validLines = withdrawLines.filter(l => l.itemId && l.quantity > 0)
    if (validLines.length === 0) return
    setWithdrawing(true)
    try {
      const res = await fetch('/api/inventory/movements/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: validLines.map(l => ({ item_id: l.itemId, quantity: l.quantity })),
          project_id: withdrawProject || null,
        }),
      })
      if (res.ok) {
        setShowWithdraw(false)
        setWithdrawLines([{ itemId: '', quantity: 1 }])
        setWithdrawProject('')
        fetchData()
      }
    } finally {
      setWithdrawing(false)
    }
  }

  const handleRestock = async () => {
    if (!restockItem || restockQty <= 0) return
    setRestocking(true)
    try {
      await fetch('/api/inventory/movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_id: restockItem.id,
          movement_type: 'restock',
          quantity: restockQty,
          note: 'Påfyllning',
        }),
      })
      setRestockItem(null)
      setRestockQty(0)
      fetchData()
    } finally {
      setRestocking(false)
    }
  }

  if (loading) {
    return <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 text-teal-600 animate-spin" /></div>
  }

  return (
    <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-600" />
              Lager
            </h1>
            <p className="text-sm text-gray-500">
              {selectedLocation ? locations.find(l => l.id === selectedLocation)?.name || 'Lager' : 'Alla lagerplatser'}
            </p>
          </div>
          <button
            onClick={() => setShowWithdraw(true)}
            disabled={items.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <ArrowDown className="w-4 h-4" />
            Rapportera uttag
          </button>
        </div>

        {/* Filter */}
        <div className="flex gap-3 mb-6">
          <select
            value={selectedLocation}
            onChange={e => setSelectedLocation(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          >
            <option value="">Alla platser</option>
            {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Sök artikel..."
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none"
          />
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-700 mb-2">Inget lager</h3>
            <p className="text-sm text-gray-500">Lägg till artiklar under Inställningar → Lager & Material.</p>
          </div>
        ) : (
          <>
            {/* Lågt saldo */}
            {lowStock.length > 0 && (
              <div className="mb-6">
                <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Behöver fyllas på ({lowStock.length})
                </h2>
                <div className="space-y-2">
                  {lowStock.map(item => (
                    <div key={item.id} className="bg-white border border-red-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium text-gray-900 text-sm">{item.name}</span>
                          {item.location && <span className="text-xs text-gray-400 ml-2">{item.location.name}</span>}
                        </div>
                        <span className="text-sm font-semibold text-red-600">{item.current_stock} {item.unit} / min {item.min_stock} {item.unit}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${getStockPercent(item)}%` }} />
                        </div>
                        <button
                          onClick={() => { setRestockItem(item); setRestockQty(item.min_stock * 2 - item.current_stock) }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-lg text-xs font-medium hover:bg-amber-200 transition-colors"
                        >
                          <ArrowUp className="w-3 h-3" /> Fyll på
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tillräckligt saldo */}
            {okStock.length > 0 && (
              <div>
                {lowStock.length > 0 && (
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Tillräckligt ({okStock.length})</h2>
                )}
                <div className="space-y-2">
                  {okStock.map(item => (
                    <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium text-gray-900 text-sm">{item.name}</span>
                          {item.location && <span className="text-xs text-gray-400 ml-2">{item.location.name}</span>}
                        </div>
                        <span className="text-sm text-gray-700">{item.current_stock} {item.unit}{item.min_stock > 0 ? ` / min ${item.min_stock}` : ''}</span>
                      </div>
                      {item.min_stock > 0 && (
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="h-full bg-teal-500 rounded-full transition-all" style={{ width: `${getStockPercent(item)}%` }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Withdrawal Modal */}
      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Rapportera uttag</h2>
              <button onClick={() => setShowWithdraw(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projekt (valfritt)</label>
                <select value={withdrawProject} onChange={e => setWithdrawProject(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                  <option value="">Välj projekt...</option>
                  {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">Artiklar</label>
                {withdrawLines.map((line, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <select
                      value={line.itemId}
                      onChange={e => {
                        const updated = [...withdrawLines]
                        updated[i] = { ...updated[i], itemId: e.target.value }
                        setWithdrawLines(updated)
                      }}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                    >
                      <option value="">Välj artikel...</option>
                      {items.map(inv => (
                        <option key={inv.id} value={inv.id}>{inv.name} ({inv.current_stock} {inv.unit})</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0.1}
                      step={0.1}
                      value={line.quantity}
                      onChange={e => {
                        const updated = [...withdrawLines]
                        updated[i] = { ...updated[i], quantity: parseFloat(e.target.value) || 0 }
                        setWithdrawLines(updated)
                      }}
                      className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    {withdrawLines.length > 1 && (
                      <button onClick={() => setWithdrawLines(withdrawLines.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setWithdrawLines([...withdrawLines, { itemId: '', quantity: 1 }])}
                  className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" /> Lägg till artikel
                </button>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button
                onClick={handleWithdraw}
                disabled={withdrawing || withdrawLines.every(l => !l.itemId)}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Rapportera uttag
              </button>
              <button onClick={() => setShowWithdraw(false)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600">Avbryt</button>
            </div>
          </div>
        </div>
      )}

      {/* Restock Modal */}
      {restockItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">Fyll på: {restockItem.name}</h2>
              <button onClick={() => setRestockItem(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <p className="text-sm text-gray-500 mb-3">Nuvarande: {restockItem.current_stock} {restockItem.unit}</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Antal att fylla på</label>
              <input
                type="number"
                min={1}
                value={restockQty}
                onChange={e => setRestockQty(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 outline-none"
                autoFocus
              />
              <p className="text-xs text-gray-400 mt-1">Nytt saldo: {restockItem.current_stock + restockQty} {restockItem.unit}</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleRestock}
                disabled={restockQty <= 0 || restocking}
                className="flex-1 bg-teal-600 text-white py-2.5 rounded-lg text-sm font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {restocking ? 'Sparar...' : 'Registrera påfyllning'}
              </button>
              <button onClick={() => setRestockItem(null)} className="px-4 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-600">Avbryt</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
