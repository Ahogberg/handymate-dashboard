'use client'

import { useEffect, useState } from 'react'
import {
  Car,
  Plus,
  Trash2,
  X,
  Check,
  Loader2,
  Moon,
  MapPin,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { format, startOfWeek, endOfWeek } from 'date-fns'

interface TravelEntry {
  id: string
  date: string
  from_address: string | null
  to_address: string | null
  distance_km: number
  vehicle_type: string
  mileage_rate: number
  total_amount: number
  has_overnight: boolean
  allowance_amount: number
  meals_provided: string
  description: string | null
  business_user?: { id: string; name: string; color: string } | null
  customer?: { customer_id: string; name: string } | null
}

interface TravelSectionProps {
  currentWeek: Date
}

const VEHICLE_TYPES = [
  { value: 'car', label: 'Egen bil', icon: '🚗', rate: 25.0 },
  { value: 'company_car', label: 'Tjänstebil', icon: '🚙', rate: 0 },
  { value: 'public_transport', label: 'Kollektivt', icon: '🚌', rate: 0 },
  { value: 'bicycle', label: 'Cykel', icon: '🚲', rate: 0 },
]

export default function TravelSection({ currentWeek }: TravelSectionProps) {
  const business = useBusiness()
  const { user: currentUser } = useCurrentUser()
  const [entries, setEntries] = useState<TravelEntry[]>([])
  const [totals, setTotals] = useState({ km: 0, amount: 0, allowance: 0 })
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    from_address: '',
    to_address: '',
    distance_km: '',
    vehicle_type: 'car',
    has_overnight: false,
    meals_provided: 'none',
    allowance_amount: '',
    description: '',
  })

  const ws = format(startOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  const we = format(endOfWeek(currentWeek, { weekStartsOn: 1 }), 'yyyy-MM-dd')

  useEffect(() => {
    if (business.business_id) fetchEntries()
  }, [business.business_id, currentWeek])

  async function fetchEntries() {
    try {
      const res = await fetch(
        `/api/travel-entry?startDate=${ws}&endDate=${we}&businessUserId=${currentUser?.id || ''}`
      )
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
        setTotals(data.totals || { km: 0, amount: 0, allowance: 0 })
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch('/api/travel-entry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          distance_km: parseFloat(form.distance_km) || 0,
          allowance_amount: parseFloat(form.allowance_amount) || 0,
          business_user_id: currentUser?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setShowForm(false)
      setForm({
        date: format(new Date(), 'yyyy-MM-dd'),
        from_address: '',
        to_address: '',
        distance_km: '',
        vehicle_type: 'car',
        has_overnight: false,
        meals_provided: 'none',
        allowance_amount: '',
        description: '',
      })
      fetchEntries()
    } catch (err: any) {
      alert(err.message || 'Kunde inte spara')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Ta bort resa?')) return
    try {
      await fetch(`/api/travel-entry?id=${id}`, { method: 'DELETE' })
      fetchEntries()
    } catch { /* ignore */ }
  }

  const km = parseFloat(form.distance_km) || 0
  const veh = VEHICLE_TYPES.find(v => v.value === form.vehicle_type)
  const estimatedAmount = km * (veh?.rate || 25)

  return (
    <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-orange-500 to-amber-500">
            <Car className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900">Resor & traktamente</h3>
            <p className="text-xs text-gray-500">
              {totals.km > 0 && `${totals.km.toFixed(1)} km · ${Math.round(totals.amount).toLocaleString('sv-SE')} kr`}
              {totals.allowance > 0 && ` · Traktamente ${Math.round(totals.allowance).toLocaleString('sv-SE')} kr`}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl text-white text-sm font-medium hover:opacity-90"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Resa</span>
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Datum</label>
              <input type="date" value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Fordon</label>
              <div className="flex gap-1">
                {VEHICLE_TYPES.map(v => (
                  <button key={v.value}
                    onClick={() => setForm({ ...form, vehicle_type: v.value })}
                    className={`flex-1 py-2 text-center text-lg rounded-lg border transition-colors ${
                      form.vehicle_type === v.value
                        ? 'bg-orange-50 border-orange-300'
                        : 'bg-white border-gray-200'
                    }`}
                    title={v.label}
                  >
                    {v.icon}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Från</label>
              <input type="text" value={form.from_address} placeholder="Startadress"
                onChange={e => setForm({ ...form, from_address: e.target.value })}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Till</label>
              <input type="text" value={form.to_address} placeholder="Destination"
                onChange={e => setForm({ ...form, to_address: e.target.value })}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Avstånd (km)</label>
              <input type="number" min="0" step="0.1" value={form.distance_km} placeholder="0"
                onChange={e => setForm({ ...form, distance_km: e.target.value })}
                className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
            </div>
            <div className="flex items-end">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-2.5 w-full text-center">
                <p className="text-xs text-orange-600">Ersättning</p>
                <p className="text-lg font-bold text-orange-700">{Math.round(estimatedAmount)} kr</p>
              </div>
            </div>
          </div>

          {/* Traktamente */}
          <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-200">
            <button
              onClick={() => setForm({ ...form, has_overnight: !form.has_overnight, allowance_amount: !form.has_overnight ? '290' : '0' })}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors ${
                form.has_overnight ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-gray-50 border-gray-200 text-gray-500'
              }`}
            >
              <Moon className="w-4 h-4" />
              <span className="text-sm">Övernattning</span>
            </button>
            {form.has_overnight && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>Traktamente:</span>
                <div className="flex gap-1">
                  {[{ label: 'Halv', val: '145' }, { label: 'Hel', val: '290' }].map(opt => (
                    <button key={opt.val}
                      onClick={() => setForm({ ...form, allowance_amount: opt.val })}
                      className={`px-3 py-1 rounded-lg border text-xs ${
                        form.allowance_amount === opt.val
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'bg-gray-50 border-gray-200 text-gray-500'
                      }`}
                    >
                      {opt.label} ({opt.val} kr)
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Beskrivning</label>
            <input type="text" value={form.description} placeholder="Resa till kund..."
              onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2.5 bg-white border border-gray-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50" />
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-500 text-sm hover:text-gray-900">Avbryt</button>
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Spara
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="divide-y divide-gray-100">
        {loading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin text-gray-400 mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-6 text-center">
            <Car className="w-8 h-8 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Inga resor denna vecka</p>
          </div>
        ) : (
          entries.map(entry => (
            <div key={entry.id} className="p-3 hover:bg-gray-50 flex items-center gap-3">
              <div className="text-2xl">
                {VEHICLE_TYPES.find(v => v.value === entry.vehicle_type)?.icon || '🚗'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{entry.distance_km} km</span>
                  <span className="text-xs text-gray-500">{Math.round(entry.total_amount)} kr</span>
                  {entry.has_overnight && (
                    <span className="px-1.5 py-0.5 text-xs rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">
                      Traktamente {Math.round(entry.allowance_amount)} kr
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {entry.from_address && entry.to_address
                    ? `${entry.from_address} → ${entry.to_address}`
                    : entry.description || entry.date}
                </p>
              </div>
              <button onClick={() => handleDelete(entry.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
