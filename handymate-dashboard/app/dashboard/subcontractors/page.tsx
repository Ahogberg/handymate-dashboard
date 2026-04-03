'use client'

import { useEffect, useState } from 'react'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import {
  Wrench,
  Plus,
  Search,
  X,
  Loader2,
  Trash2,
  Edit,
  Phone,
  Mail,
  Star,
  Building2
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'

interface Subcontractor {
  subcontractor_id: string
  name: string
  company_name: string | null
  org_number: string | null
  phone_number: string | null
  email: string | null
  specialization: string | null
  hourly_rate: number | null
  rating: number | null
  notes: string | null
  status: 'active' | 'inactive' | 'blocked'
  created_at: string
}

export default function SubcontractorsPage() {
  const business = useBusiness()
  const { hasFeature: canAccess } = useBusinessPlan()
  const [subs, setSubs] = useState<Subcontractor[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingSub, setEditingSub] = useState<Subcontractor | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [form, setForm] = useState({
    name: '',
    company_name: '',
    org_number: '',
    phone_number: '',
    email: '',
    specialization: '',
    hourly_rate: '',
    notes: '',
  })

  useEffect(() => {
    if (business.business_id) fetchData()
  }, [business.business_id])

  async function fetchData() {
    setLoading(true)
    try {
      const response = await fetch('/api/subcontractors')
      const data = await response.json()
      setSubs(data.subcontractors || [])
    } catch { /* ignore */ }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const openCreateModal = () => {
    setEditingSub(null)
    setForm({ name: '', company_name: '', org_number: '', phone_number: '', email: '', specialization: '', hourly_rate: '', notes: '' })
    setModalOpen(true)
  }

  const openEditModal = (s: Subcontractor) => {
    setEditingSub(s)
    setForm({
      name: s.name,
      company_name: s.company_name || '',
      org_number: s.org_number || '',
      phone_number: s.phone_number || '',
      email: s.email || '',
      specialization: s.specialization || '',
      hourly_rate: s.hourly_rate ? String(s.hourly_rate) : '',
      notes: s.notes || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name) {
      showToast('Namn krävs', 'error')
      return
    }
    setActionLoading(true)
    try {
      const body = {
        ...form,
        hourly_rate: form.hourly_rate ? parseFloat(form.hourly_rate) : null,
      }
      const response = await fetch('/api/subcontractors', {
        method: editingSub ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingSub ? { subcontractor_id: editingSub.subcontractor_id, ...body } : body),
      })
      if (!response.ok) throw new Error()
      showToast(editingSub ? 'Uppdaterad!' : 'Skapad!', 'success')
      setModalOpen(false)
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Ta bort underleverantör?')) return
    try {
      await fetch(`/api/subcontractors?id=${id}`, { method: 'DELETE' })
      showToast('Borttagen!', 'success')
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const handleToggleStatus = async (sub: Subcontractor) => {
    const newStatus = sub.status === 'active' ? 'inactive' : 'active'
    try {
      await fetch('/api/subcontractors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subcontractor_id: sub.subcontractor_id, status: newStatus }),
      })
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const filtered = subs.filter(s =>
    !searchTerm ||
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.specialization?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const SPECIALIZATIONS = [
    'El', 'VVS', 'Målning', 'Kakel', 'Snickeri', 'Plåt', 'Murning',
    'Golvläggning', 'Takarbete', 'Grävning', 'Betong', 'Isolering', 'Övrigt'
  ]

  if (!canAccess('subcontractors')) return <UpgradePrompt featureKey="subcontractors" />

  if (loading) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-orange-50 rounded-full blur-[128px]" />
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-6 py-3 rounded-xl text-white font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Underleverantörer</h1>
          <p className="text-gray-500 mt-1">Hantera dina underleverantörer och UE-kontakter</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <Wrench className="w-5 h-5 text-orange-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{subs.filter(s => s.status === 'active').length}</p>
                <p className="text-xs text-gray-400">Aktiva</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <Building2 className="w-5 h-5 text-sky-700" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{new Set(subs.map(s => s.specialization).filter(Boolean)).size}</p>
                <p className="text-xs text-gray-400">Specialiseringar</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Star className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{subs.length}</p>
                <p className="text-xs text-gray-400">Totalt</p>
              </div>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Sök namn, företag eller specialisering..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/50 min-h-[44px]"
            />
          </div>
          <button
            onClick={openCreateModal}
            className="sm:ml-auto flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny underleverantör
          </button>
        </div>

        {/* List */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(sub => (
            <div
              key={sub.subcontractor_id}
              className={`bg-white rounded-xl border p-5 transition-all ${
                sub.status === 'active' ? 'border-gray-200 hover:border-gray-300' : 'border-gray-100 opacity-60'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{sub.name}</h3>
                  {sub.company_name && <p className="text-sm text-gray-500">{sub.company_name}</p>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEditModal(sub)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                    <Edit className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(sub.subcontractor_id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {sub.specialization && (
                <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-orange-50 text-orange-600 border border-orange-200 mb-3">
                  {sub.specialization}
                </span>
              )}

              <div className="space-y-2 text-sm">
                {sub.phone_number && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-3.5 h-3.5 text-gray-400" />
                    {sub.phone_number}
                  </div>
                )}
                {sub.email && (
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-3.5 h-3.5 text-gray-400" />
                    <span className="truncate">{sub.email}</span>
                  </div>
                )}
                {sub.hourly_rate && (
                  <p className="text-gray-500">{sub.hourly_rate} kr/h</p>
                )}
              </div>

              <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                <button
                  onClick={() => handleToggleStatus(sub)}
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    sub.status === 'active'
                      ? 'bg-emerald-50 text-emerald-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {sub.status === 'active' ? 'Aktiv' : 'Inaktiv'}
                </button>
                {sub.rating && (
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star key={i} className={`w-3.5 h-3.5 ${i <= sub.rating! ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12">
            <Wrench className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-400">{searchTerm ? 'Inga underleverantörer hittades' : 'Inga underleverantörer ännu'}</p>
            {!searchTerm && (
              <button onClick={openCreateModal} className="mt-4 text-orange-600 hover:text-orange-500">
                Lägg till din första →
              </button>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{editingSub ? 'Redigera' : 'Ny underleverantör'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Namn *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Företagsnamn</label>
                  <input
                    type="text"
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Telefon</label>
                  <input
                    type="tel"
                    value={form.phone_number}
                    onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">E-post</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Org.nummer</label>
                  <input
                    type="text"
                    value={form.org_number}
                    onChange={(e) => setForm({ ...form, org_number: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Timpris (kr)</label>
                  <input
                    type="number"
                    value={form.hourly_rate}
                    onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Specialisering</label>
                <select
                  value={form.specialization}
                  onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                >
                  <option value="">Välj...</option>
                  {SPECIALIZATIONS.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Anteckningar</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/50 resize-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-500 hover:text-gray-900">
                Avbryt
              </button>
              <button
                onClick={handleSubmit}
                disabled={actionLoading}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingSub ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
