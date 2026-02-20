'use client'

import { useEffect, useState } from 'react'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import {
  Package,
  Plus,
  Search,
  Filter,
  ArrowDownCircle,
  ArrowUpCircle,
  AlertTriangle,
  Loader2,
  Trash2,
  Edit,
  X,
  Check,
  MapPin,
  ClipboardList,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

interface InventoryItem {
  id: string
  name: string
  description: string | null
  sku: string | null
  category: string
  unit: string
  quantity: number
  min_quantity: number
  unit_cost: number
  location: string | null
  supplier: string | null
  last_restocked_at: string | null
  updated_at: string
}

interface Transaction {
  id: string
  inventory_id: string
  project_id: string | null
  type: 'in' | 'out' | 'adjustment'
  quantity: number
  note: string | null
  created_by: string | null
  created_at: string
  inventory?: { name: string; unit: string }
}

const CATEGORIES = [
  { value: '', label: 'Alla' },
  { value: 'material', label: 'Material' },
  { value: 'verktyg', label: 'Verktyg' },
  { value: 'förbrukning', label: 'Förbrukning' },
]

const LOCATIONS = ['Bilen', 'Förrådet', 'Kontoret']

export default function InventoryPage() {
  const business = useBusiness()
  const { hasFeature: canAccess } = useBusinessPlan()
  const [items, setItems] = useState<InventoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [locationFilter, setLocationFilter] = useState('')
  const [lowStockOnly, setLowStockOnly] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showTransactionModal, setShowTransactionModal] = useState<{ item: InventoryItem; type: 'in' | 'out' } | null>(null)
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null)
  const [saving, setSaving] = useState(false)
  const [showHistory, setShowHistory] = useState<string | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  useEffect(() => {
    if (business.business_id) fetchItems()
  }, [business.business_id])

  async function fetchItems() {
    setLoading(true)
    const { data } = await supabase
      .from('inventory')
      .select('*')
      .eq('business_id', business.business_id)
      .order('name', { ascending: true })
    setItems((data || []) as InventoryItem[])
    setLoading(false)
  }

  async function fetchHistory(inventoryId: string) {
    setHistoryLoading(true)
    const { data } = await supabase
      .from('inventory_transaction')
      .select('*')
      .eq('inventory_id', inventoryId)
      .order('created_at', { ascending: false })
      .limit(20)
    setTransactions((data || []) as Transaction[])
    setHistoryLoading(false)
  }

  async function handleAdd(formData: any) {
    setSaving(true)
    const { error } = await supabase.from('inventory').insert({
      business_id: business.business_id,
      ...formData,
    })
    setSaving(false)
    if (!error) {
      setShowAddModal(false)
      fetchItems()
    }
  }

  async function handleUpdate(id: string, updates: any) {
    setSaving(true)
    await supabase.from('inventory').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
    setSaving(false)
    setEditingItem(null)
    fetchItems()
  }

  async function handleDelete(id: string) {
    if (!confirm('Ta bort denna artikel?')) return
    await supabase.from('inventory').delete().eq('id', id)
    fetchItems()
  }

  async function handleTransaction(inventoryId: string, type: 'in' | 'out', quantity: number, note: string, projectId?: string) {
    setSaving(true)
    const quantityChange = type === 'out' ? -Math.abs(quantity) : Math.abs(quantity)

    const { error: txError } = await supabase.from('inventory_transaction').insert({
      business_id: business.business_id,
      inventory_id: inventoryId,
      type,
      quantity: quantityChange,
      note: note || null,
      project_id: projectId || null,
    })

    if (!txError) {
      // Update quantity on inventory
      const item = items.find(i => i.id === inventoryId)
      if (item) {
        const updates: any = { quantity: item.quantity + quantityChange, updated_at: new Date().toISOString() }
        if (type === 'in') updates.last_restocked_at = new Date().toISOString()
        await supabase.from('inventory').update(updates).eq('id', inventoryId)
      }
    }

    setSaving(false)
    setShowTransactionModal(null)
    fetchItems()
  }

  // Filtered items
  const filtered = items.filter(item => {
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) && !(item.sku || '').toLowerCase().includes(search.toLowerCase())) return false
    if (categoryFilter && item.category !== categoryFilter) return false
    if (locationFilter && item.location !== locationFilter) return false
    if (lowStockOnly && item.quantity > item.min_quantity) return false
    return true
  })

  const lowStockCount = items.filter(i => i.quantity <= i.min_quantity && i.min_quantity > 0).length
  const totalValue = items.reduce((sum, i) => sum + i.quantity * i.unit_cost, 0)

  if (!canAccess('inventory')) return <UpgradePrompt featureKey="inventory" />

  return (
    <div className="p-4 md:p-6 md:ml-64 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-7 h-7 text-blue-600" />
            Lager
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {items.length} artiklar · Värde: {totalValue.toLocaleString('sv-SE')} kr
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          Ny artikel
        </button>
      </div>

      {/* Low stock warning */}
      {lowStockCount > 0 && (
        <button
          onClick={() => setLowStockOnly(!lowStockOnly)}
          className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
            lowStockOnly
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-amber-50/50 border-amber-100 text-amber-600 hover:bg-amber-50'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          {lowStockCount} artikel{lowStockCount > 1 ? 'ar' : ''} med lågt saldo
        </button>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Sök artikel eller artikelnr..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select
          value={locationFilter}
          onChange={e => setLocationFilter(e.target.value)}
          className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="">Alla platser</option>
          {LOCATIONS.map(l => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
      </div>

      {/* Items list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-12 text-center">
          <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-1">{items.length === 0 ? 'Inga lagerartiklar' : 'Inga träffar'}</p>
          <p className="text-sm text-gray-400">
            {items.length === 0 ? 'Lägg till din första artikel för att börja' : 'Prova att ändra filtret'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => {
            const isLow = item.quantity <= item.min_quantity && item.min_quantity > 0
            return (
              <div
                key={item.id}
                className={`bg-white shadow-sm rounded-xl border p-4 ${
                  isLow ? 'border-amber-200 bg-amber-50/30' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-medium text-gray-900 truncate">{item.name}</h3>
                      {isLow && <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
                      {item.sku && <span>Art: {item.sku}</span>}
                      <span className="capitalize">{item.category}</span>
                      {item.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{item.location}
                        </span>
                      )}
                      {item.supplier && <span>{item.supplier}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0">
                    {/* Quantity display */}
                    <div className="text-right">
                      <p className={`text-lg font-bold ${isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                        {item.quantity} <span className="text-xs font-normal text-gray-400">{item.unit}</span>
                      </p>
                      {item.unit_cost > 0 && (
                        <p className="text-xs text-gray-400">{item.unit_cost} kr/{item.unit}</p>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setShowTransactionModal({ item, type: 'in' })}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Fyll på"
                      >
                        <ArrowDownCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setShowTransactionModal({ item, type: 'out' })}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ta ut"
                      >
                        <ArrowUpCircle className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => {
                          setShowHistory(showHistory === item.id ? null : item.id)
                          if (showHistory !== item.id) fetchHistory(item.id)
                        }}
                        className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors"
                        title="Historik"
                      >
                        <ClipboardList className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setEditingItem(item)}
                        className="p-2 text-gray-400 hover:bg-gray-50 rounded-lg transition-colors"
                        title="Redigera"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Ta bort"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* History panel */}
                {showHistory === item.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100">
                    <p className="text-xs font-medium text-gray-500 mb-2">Senaste transaktioner</p>
                    {historyLoading ? (
                      <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    ) : transactions.length === 0 ? (
                      <p className="text-xs text-gray-400">Inga transaktioner</p>
                    ) : (
                      <div className="space-y-1">
                        {transactions.map(tx => (
                          <div key={tx.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${
                                tx.type === 'in' ? 'text-emerald-600' : tx.type === 'out' ? 'text-red-600' : 'text-gray-600'
                              }`}>
                                {tx.type === 'in' ? '+' : ''}{tx.quantity} {item.unit}
                              </span>
                              <span className="text-gray-400">{tx.note || (tx.type === 'in' ? 'Påfyllning' : tx.type === 'out' ? 'Uttag' : 'Justering')}</span>
                            </div>
                            <span className="text-gray-400">
                              {new Date(tx.created_at).toLocaleDateString('sv-SE')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add Item Modal */}
      {showAddModal && (
        <AddItemModal
          saving={saving}
          onClose={() => setShowAddModal(false)}
          onSave={handleAdd}
        />
      )}

      {/* Edit Item Modal */}
      {editingItem && (
        <EditItemModal
          item={editingItem}
          saving={saving}
          onClose={() => setEditingItem(null)}
          onSave={(updates) => handleUpdate(editingItem.id, updates)}
        />
      )}

      {/* Transaction Modal */}
      {showTransactionModal && (
        <TransactionModal
          item={showTransactionModal.item}
          type={showTransactionModal.type}
          saving={saving}
          onClose={() => setShowTransactionModal(null)}
          onSave={handleTransaction}
          businessId={business.business_id}
        />
      )}
    </div>
  )
}

// ── Modals ──────────────────────────────────────────────────────

function AddItemModal({ saving, onClose, onSave }: {
  saving: boolean
  onClose: () => void
  onSave: (data: any) => void
}) {
  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [category, setCategory] = useState('material')
  const [unit, setUnit] = useState('st')
  const [quantity, setQuantity] = useState('0')
  const [minQuantity, setMinQuantity] = useState('0')
  const [unitCost, setUnitCost] = useState('0')
  const [location, setLocation] = useState('')
  const [supplier, setSupplier] = useState('')

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Ny lagerartikel</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Namn *</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Artikelnr (SKU)</label>
              <input value={sku} onChange={e => setSku(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="material">Material</option>
                <option value="verktyg">Verktyg</option>
                <option value="förbrukning">Förbrukning</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Antal</label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enhet</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="st">st</option>
                <option value="m">m</option>
                <option value="m²">m²</option>
                <option value="kg">kg</option>
                <option value="l">l</option>
                <option value="paket">paket</option>
                <option value="rulle">rulle</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min. antal</label>
              <input type="number" value={minQuantity} onChange={e => setMinQuantity(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inköpspris (kr/{unit})</label>
              <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plats</label>
              <select value={location} onChange={e => setLocation(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">Välj plats</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leverantör</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-800">Avbryt</button>
          <button
            onClick={() => onSave({ name, sku: sku || null, category, unit, quantity: parseFloat(quantity), min_quantity: parseFloat(minQuantity), unit_cost: parseFloat(unitCost), location: location || null, supplier: supplier || null })}
            disabled={!name || saving}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}

function EditItemModal({ item, saving, onClose, onSave }: {
  item: InventoryItem
  saving: boolean
  onClose: () => void
  onSave: (updates: any) => void
}) {
  const [name, setName] = useState(item.name)
  const [sku, setSku] = useState(item.sku || '')
  const [category, setCategory] = useState(item.category)
  const [unit, setUnit] = useState(item.unit)
  const [minQuantity, setMinQuantity] = useState(String(item.min_quantity))
  const [unitCost, setUnitCost] = useState(String(item.unit_cost))
  const [location, setLocation] = useState(item.location || '')
  const [supplier, setSupplier] = useState(item.supplier || '')

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Redigera artikel</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Namn</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Artikelnr</label>
              <input value={sku} onChange={e => setSku(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Kategori</label>
              <select value={category} onChange={e => setCategory(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="material">Material</option>
                <option value="verktyg">Verktyg</option>
                <option value="förbrukning">Förbrukning</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Enhet</label>
              <select value={unit} onChange={e => setUnit(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="st">st</option>
                <option value="m">m</option>
                <option value="m²">m²</option>
                <option value="kg">kg</option>
                <option value="l">l</option>
                <option value="paket">paket</option>
                <option value="rulle">rulle</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min. antal</label>
              <input type="number" value={minQuantity} onChange={e => setMinQuantity(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Inköpspris</label>
              <input type="number" value={unitCost} onChange={e => setUnitCost(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plats</label>
              <select value={location} onChange={e => setLocation(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">Välj plats</option>
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Leverantör</label>
              <input value={supplier} onChange={e => setSupplier(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600">Avbryt</button>
          <button
            onClick={() => onSave({ name, sku: sku || null, category, unit, min_quantity: parseFloat(minQuantity), unit_cost: parseFloat(unitCost), location: location || null, supplier: supplier || null })}
            disabled={!name || saving}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TransactionModal({ item, type, saving, onClose, onSave, businessId }: {
  item: InventoryItem
  type: 'in' | 'out'
  saving: boolean
  onClose: () => void
  onSave: (inventoryId: string, type: 'in' | 'out', quantity: number, note: string, projectId?: string) => void
  businessId: string
}) {
  const [quantity, setQuantity] = useState('1')
  const [note, setNote] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<{ project_id: string; name: string }[]>([])

  useEffect(() => {
    if (type === 'out') {
      supabase
        .from('project')
        .select('project_id, name')
        .eq('business_id', businessId)
        .in('status', ['active', 'planning'])
        .order('name')
        .then(({ data }: any) => setProjects((data || []) as any))
    }
  }, [type, businessId])

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">
            {type === 'in' ? 'Fyll på' : 'Ta ut'}: {item.name}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-500">
            Nuvarande saldo: <span className="font-medium text-gray-900">{item.quantity} {item.unit}</span>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Antal ({item.unit})</label>
            <input type="number" min="0.01" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
          {type === 'out' && projects.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Projekt (valfritt)</label>
              <select value={projectId} onChange={e => setProjectId(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                <option value="">Inget projekt</option>
                {projects.map(p => <option key={p.project_id} value={p.project_id}>{p.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notering</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder={type === 'in' ? 'T.ex. inköp från Ahlsell' : 'T.ex. till badrumsrenovering'} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400" />
          </div>
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-600">Avbryt</button>
          <button
            onClick={() => onSave(item.id, type, parseFloat(quantity), note, projectId || undefined)}
            disabled={!quantity || parseFloat(quantity) <= 0 || saving}
            className={`px-6 py-2.5 rounded-xl text-sm font-medium text-white disabled:opacity-50 ${
              type === 'in'
                ? 'bg-gradient-to-r from-emerald-500 to-green-500'
                : 'bg-gradient-to-r from-blue-500 to-cyan-500'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : type === 'in' ? 'Fyll på' : 'Ta ut'}
          </button>
        </div>
      </div>
    </div>
  )
}
