'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Plus, Pencil, Trash2, Loader2, X, Copy, Check, Tags,
} from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────

interface Segment {
  id: string
  name: string
  description: string | null
  color: string
  is_default: boolean
  sort_order: number
}

interface ContractType {
  id: string
  name: string
  type: string
  description: string | null
  is_default: boolean
  sort_order: number
}

interface PriceList {
  id: string
  name: string
  description: string | null
  segment_id: string | null
  contract_type_id: string | null
  is_default: boolean
  hourly_rate_normal: number | null
  hourly_rate_ob1: number | null
  hourly_rate_ob2: number | null
  hourly_rate_emergency: number | null
  material_markup_pct: number | null
  callout_fee: number | null
  segment: { id: string; name: string; color: string } | null
  contract_type: { id: string; name: string; type: string } | null
}

interface PriceListItem {
  id?: string
  name: string
  description: string | null
  unit: string
  price: number
  category_slug: string | null
  is_rot_eligible: boolean
  is_rut_eligible: boolean
  sort_order: number
}

type Tab = 'segments' | 'contracts' | 'pricelists'

const CONTRACT_TYPES = [
  { value: 'fixed', label: 'Fast pris' },
  { value: 'running', label: 'Löpande' },
  { value: 'framework', label: 'Ramavtal' },
  { value: 'insurance', label: 'Försäkring' },
]

// ─── Main Component ──────────────────────────────────────────

export default function PricingSettingsPage() {
  const [tab, setTab] = useState<Tab>('segments')
  const [loading, setLoading] = useState(true)
  const [segments, setSegments] = useState<Segment[]>([])
  const [contractTypes, setContractTypes] = useState<ContractType[]>([])
  const [priceLists, setPriceLists] = useState<PriceList[]>([])

  // Edit modals
  const [editSegment, setEditSegment] = useState<Segment | null>(null)
  const [editContract, setEditContract] = useState<ContractType | null>(null)
  const [editPriceList, setEditPriceList] = useState<PriceList | null>(null)
  const [priceListItems, setPriceListItems] = useState<PriceListItem[]>([])
  const [saving, setSaving] = useState(false)

  // New item form for segments/contracts
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState('fixed')

  useEffect(() => {
    fetchAll()
  }, [])

  async function fetchAll() {
    setLoading(true)
    const [segRes, ctRes, plRes] = await Promise.all([
      fetch('/api/pricing/segments').then(r => r.json()),
      fetch('/api/pricing/contract-types').then(r => r.json()),
      fetch('/api/pricing/price-lists').then(r => r.json()),
    ])
    setSegments(segRes.segments || [])
    setContractTypes(ctRes.contractTypes || [])
    setPriceLists(plRes.priceLists || [])
    setLoading(false)
  }

  // ─── Segment CRUD ──────────────────────────────────────────

  async function addSegment() {
    if (!newName.trim()) return
    await fetch('/api/pricing/segments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    setNewName('')
    fetchAll()
  }

  async function saveSegment() {
    if (!editSegment) return
    setSaving(true)
    await fetch(`/api/pricing/segments/${editSegment.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editSegment.name, description: editSegment.description, color: editSegment.color }),
    })
    setSaving(false)
    setEditSegment(null)
    fetchAll()
  }

  async function deleteSegment(id: string) {
    if (!confirm('Ta bort denna kundtyp?')) return
    await fetch(`/api/pricing/segments/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  // ─── Contract Type CRUD ────────────────────────────────────

  async function addContractType() {
    if (!newName.trim()) return
    await fetch('/api/pricing/contract-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    })
    setNewName('')
    fetchAll()
  }

  async function saveContractType() {
    if (!editContract) return
    setSaving(true)
    await fetch(`/api/pricing/contract-types/${editContract.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editContract.name, type: editContract.type, description: editContract.description }),
    })
    setSaving(false)
    setEditContract(null)
    fetchAll()
  }

  async function deleteContractType(id: string) {
    if (!confirm('Ta bort denna avtalsform?')) return
    await fetch(`/api/pricing/contract-types/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  // ─── Price List CRUD ───────────────────────────────────────

  async function createPriceList() {
    const res = await fetch('/api/pricing/price-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ny prislista' }),
    })
    const data = await res.json()
    if (data.priceList) {
      await fetchAll()
      openPriceListEditor(data.priceList)
    }
  }

  async function openPriceListEditor(pl: PriceList) {
    setEditPriceList(pl)
    // Fetch items
    const res = await fetch(`/api/pricing/price-lists/${pl.id}`)
    const data = await res.json()
    setPriceListItems(data.priceList?.items || [])
  }

  async function savePriceList() {
    if (!editPriceList) return
    setSaving(true)

    // Save price list
    await fetch(`/api/pricing/price-lists/${editPriceList.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editPriceList.name,
        description: editPriceList.description,
        segment_id: editPriceList.segment_id || null,
        contract_type_id: editPriceList.contract_type_id || null,
        hourly_rate_normal: editPriceList.hourly_rate_normal,
        hourly_rate_ob1: editPriceList.hourly_rate_ob1,
        hourly_rate_ob2: editPriceList.hourly_rate_ob2,
        hourly_rate_emergency: editPriceList.hourly_rate_emergency,
        material_markup_pct: editPriceList.material_markup_pct,
        callout_fee: editPriceList.callout_fee,
      }),
    })

    // Save items
    await fetch(`/api/pricing/price-lists/${editPriceList.id}/items`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: priceListItems }),
    })

    setSaving(false)
    setEditPriceList(null)
    fetchAll()
  }

  async function duplicatePriceList(pl: PriceList) {
    const res = await fetch('/api/pricing/price-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: pl.name + ' (kopia)',
        segment_id: pl.segment_id,
        contract_type_id: pl.contract_type_id,
        hourly_rate_normal: pl.hourly_rate_normal,
        hourly_rate_ob1: pl.hourly_rate_ob1,
        hourly_rate_ob2: pl.hourly_rate_ob2,
        hourly_rate_emergency: pl.hourly_rate_emergency,
        material_markup_pct: pl.material_markup_pct,
        callout_fee: pl.callout_fee,
      }),
    })
    const data = await res.json()

    // Copy items if source has them
    if (data.priceList) {
      const srcRes = await fetch(`/api/pricing/price-lists/${pl.id}`)
      const srcData = await srcRes.json()
      if (srcData.priceList?.items?.length > 0) {
        await fetch(`/api/pricing/price-lists/${data.priceList.id}/items`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: srcData.priceList.items }),
        })
      }
    }
    fetchAll()
  }

  async function deletePriceList(id: string) {
    if (!confirm('Ta bort denna prislista?')) return
    await fetch(`/api/pricing/price-lists/${id}`, { method: 'DELETE' })
    fetchAll()
  }

  // ─── Price list item helpers ───────────────────────────────

  function addPriceListItem() {
    setPriceListItems(prev => [...prev, {
      name: '', description: null, unit: 'tim', price: 0,
      category_slug: null, is_rot_eligible: false, is_rut_eligible: false,
      sort_order: prev.length,
    }])
  }

  function updatePriceListItem(index: number, updates: Partial<PriceListItem>) {
    setPriceListItems(prev => prev.map((item, i) => i === index ? { ...item, ...updates } : item))
  }

  function removePriceListItem(index: number) {
    setPriceListItems(prev => prev.filter((_, i) => i !== index))
  }

  // ─── Render helpers ────────────────────────────────────────

  const tabs: { key: Tab; label: string }[] = [
    { key: 'segments', label: 'Kundtyper' },
    { key: 'contracts', label: 'Avtalsformer' },
    { key: 'pricelists', label: 'Prislistor' },
  ]

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/settings" className="text-gray-400 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Prisstruktur</h1>
          <p className="text-gray-500 text-sm">Hantera kundtyper, avtalsformer och prislistor</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══ Segments Tab ═══ */}
      {tab === 'segments' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ny kundtyp..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
              onKeyDown={e => e.key === 'Enter' && addSegment()}
            />
            <button
              onClick={addSegment}
              disabled={!newName.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Lägg till
            </button>
          </div>

          {segments.map(seg => (
            <div key={seg.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{seg.name}</p>
                {seg.description && <p className="text-xs text-gray-500">{seg.description}</p>}
              </div>
              {seg.is_default && (
                <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">Standard</span>
              )}
              <button onClick={() => setEditSegment({ ...seg })} className="p-1 text-gray-400 hover:text-gray-900">
                <Pencil className="w-4 h-4" />
              </button>
              {!seg.is_default && (
                <button onClick={() => deleteSegment(seg.id)} className="p-1 text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {segments.length === 0 && (
            <p className="text-center text-gray-400 py-8">Du har inga kundtyper än — lägg till din första ovan.</p>
          )}
        </div>
      )}

      {/* ═══ Contract Types Tab ═══ */}
      {tab === 'contracts' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-4">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ny avtalsform..."
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
              onKeyDown={e => e.key === 'Enter' && addContractType()}
            />
            <select
              value={newType}
              onChange={e => setNewType(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
            >
              {CONTRACT_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
            <button
              onClick={addContractType}
              disabled={!newName.trim()}
              className="flex items-center gap-1 px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 transition-colors disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Lägg till
            </button>
          </div>

          {contractTypes.map(ct => (
            <div key={ct.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{ct.name}</p>
                <p className="text-xs text-gray-400">
                  {CONTRACT_TYPES.find(t => t.value === ct.type)?.label || ct.type}
                </p>
              </div>
              {ct.is_default && (
                <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">Standard</span>
              )}
              <button onClick={() => setEditContract({ ...ct })} className="p-1 text-gray-400 hover:text-gray-900">
                <Pencil className="w-4 h-4" />
              </button>
              {!ct.is_default && (
                <button onClick={() => deleteContractType(ct.id)} className="p-1 text-gray-400 hover:text-red-600">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {contractTypes.length === 0 && (
            <p className="text-center text-gray-400 py-8">Du har inga avtalsformer än — lägg till din första ovan.</p>
          )}
        </div>
      )}

      {/* ═══ Price Lists Tab ═══ */}
      {tab === 'pricelists' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={createPriceList}
              className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Ny prislista
            </button>
          </div>

          {priceLists.map(pl => (
            <div key={pl.id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-900">{pl.name}</h3>
                    {pl.is_default && (
                      <span className="text-xs bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">Standard</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {pl.segment && <span>{pl.segment.name}</span>}
                    {pl.segment && pl.contract_type && <span>•</span>}
                    {pl.contract_type && <span>{pl.contract_type.name}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    {pl.hourly_rate_normal && <span>{pl.hourly_rate_normal} kr/tim</span>}
                    {pl.material_markup_pct != null && <span>Material +{pl.material_markup_pct}%</span>}
                    {pl.callout_fee != null && pl.callout_fee > 0 && <span>Utryckn. {pl.callout_fee} kr</span>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => openPriceListEditor(pl)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                  >
                    Redigera
                  </button>
                  <button
                    onClick={() => duplicatePriceList(pl)}
                    className="p-1.5 text-gray-400 hover:text-gray-700"
                    title="Kopiera"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  {!pl.is_default && (
                    <button
                      onClick={() => deletePriceList(pl.id)}
                      className="p-1.5 text-gray-400 hover:text-red-600"
                      title="Ta bort"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {priceLists.length === 0 && (
            <p className="text-center text-gray-400 py-8">Inga prislistor ännu. Skapa en ny prislista.</p>
          )}
        </div>
      )}

      {/* ═══ Edit Segment Modal ═══ */}
      {editSegment && (
        <Modal onClose={() => setEditSegment(null)}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Redigera kundtyp</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Namn</label>
              <input
                value={editSegment.name}
                onChange={e => setEditSegment({ ...editSegment, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Beskrivning</label>
              <input
                value={editSegment.description || ''}
                onChange={e => setEditSegment({ ...editSegment, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Färg</label>
              <input
                type="color"
                value={editSegment.color}
                onChange={e => setEditSegment({ ...editSegment, color: e.target.value })}
                className="w-12 h-8 rounded border border-gray-300 cursor-pointer"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setEditSegment(null)} className="px-4 py-2 text-sm text-gray-500">Avbryt</button>
            <button onClick={saveSegment} disabled={saving} className="px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Edit Contract Type Modal ═══ */}
      {editContract && (
        <Modal onClose={() => setEditContract(null)}>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Redigera avtalsform</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Namn</label>
              <input
                value={editContract.name}
                onChange={e => setEditContract({ ...editContract, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Typ</label>
              <select
                value={editContract.type}
                onChange={e => setEditContract({ ...editContract, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
              >
                {CONTRACT_TYPES.map(ct => (
                  <option key={ct.value} value={ct.value}>{ct.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Beskrivning</label>
              <input
                value={editContract.description || ''}
                onChange={e => setEditContract({ ...editContract, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6">
            <button onClick={() => setEditContract(null)} className="px-4 py-2 text-sm text-gray-500">Avbryt</button>
            <button onClick={saveContractType} disabled={saving} className="px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50">
              {saving ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </Modal>
      )}

      {/* ═══ Price List Editor Modal ═══ */}
      {editPriceList && (
        <Modal onClose={() => setEditPriceList(null)} wide>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Redigera: {editPriceList.name}
          </h3>

          <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
            {/* Basic info */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Namn</label>
                <input
                  value={editPriceList.name}
                  onChange={e => setEditPriceList({ ...editPriceList, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Segment</label>
                <select
                  value={editPriceList.segment_id || ''}
                  onChange={e => setEditPriceList({ ...editPriceList, segment_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Inget segment</option>
                  {segments.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Avtalsform</label>
                <select
                  value={editPriceList.contract_type_id || ''}
                  onChange={e => setEditPriceList({ ...editPriceList, contract_type_id: e.target.value || null })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">Ingen avtalsform</option>
                  {contractTypes.map(ct => (
                    <option key={ct.id} value={ct.id}>{ct.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Hourly rates */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Timpriser (exkl. moms)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Normal</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editPriceList.hourly_rate_normal || ''}
                      onChange={e => setEditPriceList({ ...editPriceList, hourly_rate_normal: Number(e.target.value) || null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      placeholder="895"
                    />
                    <span className="text-xs text-gray-400 shrink-0">kr/tim</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">OB 1 (kväll)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editPriceList.hourly_rate_ob1 || ''}
                      onChange={e => setEditPriceList({ ...editPriceList, hourly_rate_ob1: Number(e.target.value) || null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <span className="text-xs text-gray-400 shrink-0">kr/tim</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">OB 2 (natt/helg)</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editPriceList.hourly_rate_ob2 || ''}
                      onChange={e => setEditPriceList({ ...editPriceList, hourly_rate_ob2: Number(e.target.value) || null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <span className="text-xs text-gray-400 shrink-0">kr/tim</span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Jour/utryckning</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      value={editPriceList.hourly_rate_emergency || ''}
                      onChange={e => setEditPriceList({ ...editPriceList, hourly_rate_emergency: Number(e.target.value) || null })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <span className="text-xs text-gray-400 shrink-0">kr/tim</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Material + callout */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Material</p>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500 shrink-0">Påslag</span>
                  <input
                    type="number"
                    value={editPriceList.material_markup_pct ?? ''}
                    onChange={e => setEditPriceList({ ...editPriceList, material_markup_pct: Number(e.target.value) })}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Startavgift</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={editPriceList.callout_fee ?? ''}
                    onChange={e => setEditPriceList({ ...editPriceList, callout_fee: Number(e.target.value) })}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    placeholder="0"
                  />
                  <span className="text-xs text-gray-400">kr</span>
                </div>
              </div>
            </div>

            {/* Specific items */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">Specifika rader</p>
                <button
                  onClick={addPriceListItem}
                  className="flex items-center gap-1 text-xs text-primary-700 font-medium hover:underline"
                >
                  <Plus className="w-3 h-3" />
                  Lägg till
                </button>
              </div>

              {priceListItems.length === 0 ? (
                <p className="text-xs text-gray-400 py-4 text-center">Inga specifika rader ännu</p>
              ) : (
                <div className="space-y-2">
                  {priceListItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                      <input
                        value={item.name}
                        onChange={e => updatePriceListItem(i, { name: e.target.value })}
                        placeholder="Namn"
                        className="flex-1 min-w-0 px-2 py-1 border border-gray-200 rounded text-sm bg-white"
                      />
                      <select
                        value={item.unit}
                        onChange={e => updatePriceListItem(i, { unit: e.target.value })}
                        className="w-16 px-1 py-1 border border-gray-200 rounded text-sm bg-white"
                      >
                        <option value="tim">tim</option>
                        <option value="st">st</option>
                        <option value="m">m</option>
                        <option value="m²">m²</option>
                        <option value="kr">kr</option>
                      </select>
                      <input
                        type="number"
                        value={item.price || ''}
                        onChange={e => updatePriceListItem(i, { price: Number(e.target.value) })}
                        placeholder="Pris"
                        className="w-20 px-2 py-1 border border-gray-200 rounded text-sm bg-white text-right"
                      />
                      <span className="text-xs text-gray-400 shrink-0">kr</span>
                      <label className="flex items-center gap-1 shrink-0" title="ROT-berättigad">
                        <input
                          type="checkbox"
                          checked={item.is_rot_eligible}
                          onChange={e => updatePriceListItem(i, { is_rot_eligible: e.target.checked })}
                          className="rounded border-gray-300 text-primary-700 focus:ring-primary-600"
                        />
                        <span className="text-xs text-gray-500">ROT</span>
                      </label>
                      <button onClick={() => removePriceListItem(i)} className="p-1 text-gray-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-6 pt-4 border-t border-gray-100">
            <button onClick={() => setEditPriceList(null)} className="px-4 py-2 text-sm text-gray-500">
              Avbryt
            </button>
            <button
              onClick={savePriceList}
              disabled={saving}
              className="px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50"
            >
              {saving ? 'Sparar...' : 'Spara'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ─── Modal component ─────────────────────────────────────────

function Modal({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className={`bg-white rounded-2xl shadow-xl p-6 w-full ${wide ? 'max-w-2xl' : 'max-w-md'}`}>
        {children}
      </div>
    </div>
  )
}
