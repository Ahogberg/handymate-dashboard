'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Loader2, Pencil, Check, X } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import { SYSTEM_CATEGORIES } from '@/lib/constants/categories'

interface CustomCategory {
  id: string
  slug: string
  label: string
  rot_eligible: boolean
  rut_eligible: boolean
}

export default function QuoteCategoriesPage() {
  const business = useBusiness()
  const toast = useToast()
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<CustomCategory[]>([])
  const [newLabel, setNewLabel] = useState('')
  const [newRot, setNewRot] = useState(false)
  const [newRut, setNewRut] = useState(false)
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editRot, setEditRot] = useState(false)
  const [editRut, setEditRut] = useState(false)

  useEffect(() => {
    fetchCategories()
  }, [business.business_id])

  async function fetchCategories() {
    try {
      const res = await fetch('/api/quote-categories')
      if (!res.ok) throw new Error('Fetch failed')
      const data = await res.json()
      setCategories(data.categories || [])
    } catch {
      console.error('Failed to fetch custom categories')
    }
    setLoading(false)
  }

  async function addCategory() {
    if (!newLabel.trim()) return
    setAdding(true)
    try {
      const res = await fetch('/api/quote-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: newLabel.trim(),
          rot_eligible: newRot,
          rut_eligible: newRut,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte skapa kategori')
      } else {
        setCategories(prev => [...prev, data.category])
        setNewLabel('')
        setNewRot(false)
        setNewRut(false)
        toast.success('Kategori skapad')
      }
    } catch {
      toast.error('Kunde inte skapa kategori')
    }
    setAdding(false)
  }

  async function updateCategory(id: string) {
    try {
      const res = await fetch('/api/quote-categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          label: editLabel.trim(),
          rot_eligible: editRot,
          rut_eligible: editRut,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte uppdatera')
      } else {
        setCategories(prev => prev.map(c => c.id === id ? data.category : c))
        setEditingId(null)
        toast.success('Kategori uppdaterad')
      }
    } catch {
      toast.error('Kunde inte uppdatera')
    }
  }

  async function deleteCategory(id: string) {
    try {
      const res = await fetch(`/api/quote-categories?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        toast.error('Kunde inte ta bort kategori')
      } else {
        setCategories(prev => prev.filter(c => c.id !== id))
        toast.success('Kategori borttagen')
      }
    } catch {
      toast.error('Kunde inte ta bort kategori')
    }
  }

  function startEdit(cat: CustomCategory) {
    setEditingId(cat.id)
    setEditLabel(cat.label)
    setEditRot(cat.rot_eligible)
    setEditRut(cat.rut_eligible)
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
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
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Offertkategorier</h1>
            <p className="text-sm text-gray-500 mt-0.5">Kategorisera offertrader för bättre struktur och delsummor.</p>
          </div>
        </div>

        {/* System categories */}
        <div className="bg-white border border-gray-200 rounded-xl mb-4">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Systemkategorier</h2>
            <p className="text-xs text-gray-400 mt-0.5">Dessa kategorier ingår som standard och kan inte tas bort.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {SYSTEM_CATEGORIES.map(cat => (
              <div key={cat.slug} className="flex items-center gap-3 px-5 py-2.5 text-sm text-gray-700">
                <span className="flex-1">{cat.label}</span>
                {cat.rot && (
                  <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">ROT</span>
                )}
                {cat.rut && (
                  <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">RUT</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Custom categories */}
        <div className="bg-white border border-gray-200 rounded-xl mb-4">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900 text-sm">Egna kategorier</h2>
            <p className="text-xs text-gray-400 mt-0.5">Skapa kategorier specifika för ditt företag.</p>
          </div>
          <div className="divide-y divide-gray-100">
            {categories.length === 0 && (
              <div className="px-5 py-8 text-center text-gray-400 text-sm">
                Inga egna kategorier ännu. Lägg till nedan.
              </div>
            )}
            {categories.map(cat => (
              <div key={cat.id} className="flex items-center gap-3 px-5 py-3">
                {editingId === cat.id ? (
                  <>
                    <input
                      type="text"
                      value={editLabel}
                      onChange={e => setEditLabel(e.target.value)}
                      className="flex-1 min-w-0 bg-transparent border border-gray-200 rounded-lg px-3 py-1.5 text-gray-900 text-sm focus:outline-none focus:border-primary-600"
                    />
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input type="checkbox" checked={editRot} onChange={e => { setEditRot(e.target.checked); if (e.target.checked) setEditRut(false) }} className="w-3.5 h-3.5 rounded" />
                      ROT
                    </label>
                    <label className="flex items-center gap-1 text-xs text-gray-500">
                      <input type="checkbox" checked={editRut} onChange={e => { setEditRut(e.target.checked); if (e.target.checked) setEditRot(false) }} className="w-3.5 h-3.5 rounded" />
                      RUT
                    </label>
                    <button onClick={() => updateCategory(cat.id)} className="p-1.5 text-primary-700 hover:text-primary-700">
                      <Check className="w-4 h-4" />
                    </button>
                    <button onClick={() => setEditingId(null)} className="p-1.5 text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-900">{cat.label}</span>
                    {cat.rot_eligible && (
                      <span className="text-[10px] font-medium text-primary-700 bg-primary-50 px-1.5 py-0.5 rounded">ROT</span>
                    )}
                    {cat.rut_eligible && (
                      <span className="text-[10px] font-medium text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">RUT</span>
                    )}
                    <button onClick={() => startEdit(cat)} className="p-1.5 text-gray-300 hover:text-gray-600 transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteCategory(cat.id)} className="p-1.5 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
          {/* Add new category */}
          <div className="px-5 py-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addCategory() }}
                placeholder="Ny kategori, t.ex. Snickeri"
                className="flex-1 min-w-0 bg-transparent border border-gray-200 rounded-lg px-3 py-2 text-gray-900 text-sm focus:outline-none focus:border-primary-600 placeholder-gray-300"
              />
              <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                <input type="checkbox" checked={newRot} onChange={e => { setNewRot(e.target.checked); if (e.target.checked) setNewRut(false) }} className="w-3.5 h-3.5 rounded" />
                ROT
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                <input type="checkbox" checked={newRut} onChange={e => { setNewRut(e.target.checked); if (e.target.checked) setNewRot(false) }} className="w-3.5 h-3.5 rounded" />
                RUT
              </label>
              <button
                onClick={addCategory}
                disabled={!newLabel.trim() || adding}
                className="flex items-center gap-1 px-3 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Lägg till
              </button>
            </div>
          </div>
        </div>

        {/* Info box */}
        <div className="bg-primary-50 border border-primary-300 rounded-xl p-5 text-sm text-primary-700">
          <p className="font-medium mb-1">Tips</p>
          <p>Kategorier hjälper dig att gruppera offertrader. Aktivera &quot;Visa delsummor per kategori&quot; i offertens visningsinställningar för att visa delsummor per kategorigrupp i offerten.</p>
        </div>
      </div>
    </div>
  )
}
