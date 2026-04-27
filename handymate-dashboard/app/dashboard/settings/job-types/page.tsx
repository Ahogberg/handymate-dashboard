'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeft, Plus, Loader2, X, Trash2, Briefcase, GripVertical } from 'lucide-react'
import { useToast } from '@/components/Toast'
import { JOB_TYPE_COLORS } from '@/lib/job-types'

interface JobType {
  id: string
  name: string
  slug: string
  color: string
  default_hourly_rate: number | null
  sort_order: number
  is_active: boolean
}

const SUGGESTIONS = [
  { name: 'Elarbete', color: '#D97706' },
  { name: 'VVS', color: '#2563EB' },
  { name: 'Bygg & Snickeri', color: '#64748B' },
  { name: 'Måleri', color: '#DB2777' },
  { name: 'Tak', color: '#7C3AED' },
  { name: 'Plattsättning', color: '#0F766E' },
  { name: 'Golv', color: '#16A34A' },
  { name: 'Fönsterbyte', color: '#EA580C' },
]

export default function JobTypesPage() {
  const toast = useToast()
  const [jobTypes, setJobTypes] = useState<JobType[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', color: '#0F766E', default_hourly_rate: '' })
  const [saving, setSaving] = useState(false)

  const fetchJobTypes = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/job-types')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setJobTypes(data.job_types || [])
    } catch {
      toast.error('Kunde inte hämta jobbtyper')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    fetchJobTypes()
  }, [fetchJobTypes])

  const openCreate = () => {
    setEditingId(null)
    setForm({ name: '', color: '#0F766E', default_hourly_rate: '' })
    setShowModal(true)
  }

  const openEdit = (jt: JobType) => {
    setEditingId(jt.id)
    setForm({
      name: jt.name,
      color: jt.color,
      default_hourly_rate: jt.default_hourly_rate ? String(jt.default_hourly_rate) : '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Ange ett namn')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        color: form.color,
        default_hourly_rate: form.default_hourly_rate ? parseFloat(form.default_hourly_rate) : null,
      }
      const res = editingId
        ? await fetch(`/api/job-types/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        : await fetch('/api/job-types', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) throw new Error()
      setShowModal(false)
      fetchJobTypes()
      toast.success(editingId ? 'Jobbtyp uppdaterad' : 'Jobbtyp skapad')
    } catch {
      toast.error('Kunde inte spara')
    } finally {
      setSaving(false)
    }
  }

  const handleQuickAdd = async (suggestion: { name: string; color: string }) => {
    try {
      const res = await fetch('/api/job-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(suggestion),
      })
      if (!res.ok) throw new Error()
      fetchJobTypes()
    } catch {
      toast.error('Kunde inte lägga till')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Arkivera denna jobbtyp? Befintliga deals behåller referensen.')) return
    try {
      const res = await fetch(`/api/job-types/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      fetchJobTypes()
      toast.success('Jobbtyp arkiverad')
    } catch {
      toast.error('Kunde inte arkivera')
    }
  }

  return (
    <div className="p-4 md:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard/settings" className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900">Jobbtyper</h1>
            <p className="text-sm text-gray-500">Vilka typer av arbeten ni utför — styr delegering och statistik</p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg hover:bg-primary-800 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Ny jobbtyp
          </button>
        </div>

        {/* Innehåll */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
          </div>
        ) : jobTypes.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-8">
            <Briefcase className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-center text-sm text-gray-700 font-medium mb-1">Inga jobbtyper ännu</p>
            <p className="text-center text-xs text-gray-500 mb-5">Lägg till snabbt från förslagen nedan:</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {SUGGESTIONS.map(s => (
                <button
                  key={s.name}
                  onClick={() => handleQuickAdd(s)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg text-xs text-gray-700 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <Plus className="w-3 h-3 text-gray-400" />
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E2E8F0] divide-y divide-gray-100">
            {jobTypes.map(jt => (
              <div key={jt.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50">
                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: jt.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{jt.name}</p>
                  {jt.default_hourly_rate && (
                    <p className="text-xs text-gray-400">Standardpris: {jt.default_hourly_rate} kr/tim</p>
                  )}
                </div>
                <button
                  onClick={() => openEdit(jt)}
                  className="text-xs text-primary-700 hover:text-primary-800 font-medium"
                >
                  Redigera
                </button>
                <button
                  onClick={() => handleDelete(jt.id)}
                  className="p-1.5 text-gray-400 hover:text-red-600"
                  title="Arkivera"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Info om delegering */}
        <div className="mt-6 p-4 bg-primary-50 border border-primary-100 rounded-xl text-sm text-primary-900">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-medium">💡 Snart kommer</p>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 border border-primary-200">
              Kommer snart
            </span>
          </div>
          <p className="text-xs text-primary-800">
            Snart kommer du kunna koppla jobbtyper till personer i teamet — sätt vilka specialiteter varje person har, så föreslår nya deals automatiskt rätt person.
          </p>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Redigera jobbtyp' : 'Ny jobbtyp'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Namn *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="t.ex. Elarbete"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Färg</label>
                <div className="flex flex-wrap gap-2">
                  {JOB_TYPE_COLORS.map(c => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setForm(p => ({ ...p, color: c.value }))}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c.value ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c.value }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Standardpris per timme (valfritt)</label>
                <div className="relative">
                  <input
                    type="number"
                    value={form.default_hourly_rate}
                    onChange={e => setForm(p => ({ ...p, default_hourly_rate: e.target.value }))}
                    placeholder="850"
                    className="w-full px-3 py-2 pr-12 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-primary-600 outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">kr</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">Förifyller timpris i offerter med denna jobbtyp.</p>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name.trim() || saving}
                className="px-4 py-2 text-sm bg-primary-700 text-white rounded-lg hover:bg-primary-800 font-medium disabled:opacity-50 flex items-center gap-2"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Spara
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
