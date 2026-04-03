'use client'

import { useEffect, useState } from 'react'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import {
  Shield,
  Plus,
  Search,
  X,
  Loader2,
  Trash2,
  Edit,
  AlertTriangle,
  CheckCircle,
  Clock,
  Calendar
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

interface Warranty {
  warranty_id: string
  customer_id: string
  booking_id: string | null
  title: string
  description: string | null
  start_date: string
  end_date: string
  status: 'active' | 'expired' | 'claimed' | 'voided'
  warranty_type: 'standard' | 'extended' | 'manufacturer' | 'custom'
  terms: string | null
  created_at: string
  customer?: { customer_id: string; name: string; phone_number: string }
}

interface Customer {
  customer_id: string
  name: string
}

export default function WarrantiesPage() {
  const business = useBusiness()
  const { hasFeature: canAccess } = useBusinessPlan()
  const [warranties, setWarranties] = useState<Warranty[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWarranty, setEditingWarranty] = useState<Warranty | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [form, setForm] = useState({
    customer_id: '',
    title: '',
    description: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    warranty_type: 'standard' as string,
    terms: '',
  })

  useEffect(() => {
    if (business.business_id) fetchData()
  }, [business.business_id])

  async function fetchData() {
    setLoading(true)
    const response = await fetch('/api/warranties')
    const data = await response.json()
    setWarranties(data.warranties || [])

    const { data: customersData } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', business.business_id)
      .order('name')

    setCustomers(customersData || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const openCreateModal = () => {
    setEditingWarranty(null)
    const today = new Date()
    const nextYear = new Date(today)
    nextYear.setFullYear(nextYear.getFullYear() + 2)
    setForm({
      customer_id: '',
      title: '',
      description: '',
      start_date: today.toISOString().split('T')[0],
      end_date: nextYear.toISOString().split('T')[0],
      warranty_type: 'standard',
      terms: '',
    })
    setModalOpen(true)
  }

  const openEditModal = (w: Warranty) => {
    setEditingWarranty(w)
    setForm({
      customer_id: w.customer_id,
      title: w.title,
      description: w.description || '',
      start_date: w.start_date,
      end_date: w.end_date,
      warranty_type: w.warranty_type,
      terms: w.terms || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.customer_id || !form.title || !form.end_date) {
      showToast('Kund, titel och slutdatum krävs', 'error')
      return
    }
    setActionLoading(true)
    try {
      const response = await fetch('/api/warranties', {
        method: editingWarranty ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingWarranty ? { warranty_id: editingWarranty.warranty_id, ...form } : form),
      })
      if (!response.ok) throw new Error()
      showToast(editingWarranty ? 'Garanti uppdaterad!' : 'Garanti skapad!', 'success')
      setModalOpen(false)
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (warrantyId: string) => {
    if (!confirm('Ta bort garanti?')) return
    try {
      await fetch(`/api/warranties?warrantyId=${warrantyId}`, { method: 'DELETE' })
      showToast('Garanti borttagen!', 'success')
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  const getDaysLeft = (endDate: string) => {
    const diff = new Date(endDate).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'active': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
      case 'expired': return 'bg-gray-100 text-gray-500 border-gray-200'
      case 'claimed': return 'bg-amber-100 text-amber-700 border-amber-200'
      case 'voided': return 'bg-red-100 text-red-700 border-red-200'
      default: return 'bg-gray-100 text-gray-500 border-gray-200'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Aktiv'
      case 'expired': return 'Utgången'
      case 'claimed': return 'Reklamerad'
      case 'voided': return 'Ogiltig'
      default: return status
    }
  }

  const getTypeText = (type: string) => {
    switch (type) {
      case 'standard': return 'Standard'
      case 'extended': return 'Utökad'
      case 'manufacturer': return 'Tillverkare'
      case 'custom': return 'Anpassad'
      default: return type
    }
  }

  const filtered = warranties.filter(w => {
    const matchesSearch = !searchTerm ||
      w.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !filterStatus || w.status === filterStatus
    return matchesSearch && matchesStatus
  })

  const expiringCount = warranties.filter(w => w.status === 'active' && getDaysLeft(w.end_date) <= 30 && getDaysLeft(w.end_date) > 0).length
  const activeCount = warranties.filter(w => w.status === 'active').length

  if (!canAccess('warranty_tracking')) return <UpgradePrompt featureKey="warranty_tracking" />

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
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-emerald-50 rounded-full blur-[128px]" />
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-6 py-3 rounded-xl text-white font-medium shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-500' : 'bg-red-500'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Garantier</h1>
          <p className="text-gray-500 mt-1">Spåra och hantera garantier för utförda arbeten</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{activeCount}</p>
                <p className="text-xs text-gray-400">Aktiva</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{expiringCount}</p>
                <p className="text-xs text-gray-400">Utgår snart</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5 text-gray-500" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{warranties.filter(w => w.status === 'expired').length}</p>
                <p className="text-xs text-gray-400">Utgångna</p>
              </div>
            </div>
          </div>
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center">
                <Calendar className="w-5 h-5 text-sky-700" />
              </div>
              <div>
                <p className="text-xl font-bold text-gray-900">{warranties.length}</p>
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
              placeholder="Sök garanti eller kund..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 min-h-[44px]"
            />
          </div>
          <div className="flex bg-white border border-[#E2E8F0] rounded-xl p-1">
            {[
              { id: '', label: 'Alla' },
              { id: 'active', label: 'Aktiva' },
              { id: 'expired', label: 'Utgångna' },
              { id: 'claimed', label: 'Reklamerade' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  filterStatus === f.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={openCreateModal}
            className="sm:ml-auto flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-primary-600 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
          >
            <Plus className="w-4 h-4 mr-2" />
            Ny garanti
          </button>
        </div>

        {/* Expiring soon warning */}
        {expiringCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-amber-800">{expiringCount} garanti(er) utgår inom 30 dagar</p>
              <p className="text-sm text-amber-600 mt-1">Kontakta kunderna om eventuell förlängning.</p>
            </div>
          </div>
        )}

        {/* Warranty list */}
        <div className="bg-white rounded-xl border border-[#E2E8F0]">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Shield className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400">{searchTerm ? 'Inga garantier hittades' : 'Inga garantier registrerade'}</p>
              {!searchTerm && (
                <button onClick={openCreateModal} className="mt-4 text-emerald-600 hover:text-emerald-500">
                  Skapa din första garanti →
                </button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {filtered.map(w => {
                const daysLeft = getDaysLeft(w.end_date)
                const isExpiringSoon = w.status === 'active' && daysLeft <= 30 && daysLeft > 0
                return (
                  <div key={w.warranty_id} className="p-4 sm:p-5 hover:bg-gray-50/50 transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-gray-900">{w.title}</h3>
                          <span className={`px-2 py-0.5 text-xs rounded-full border font-medium ${getStatusStyle(w.status)}`}>
                            {getStatusText(w.status)}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-primary-50 text-sky-700 border border-[#E2E8F0]">
                            {getTypeText(w.warranty_type)}
                          </span>
                          {isExpiringSoon && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-amber-50 text-amber-600 border border-amber-200 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {daysLeft} dagar kvar
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {w.customer?.name || 'Okänd kund'} · {new Date(w.start_date).toLocaleDateString('sv-SE')} – {new Date(w.end_date).toLocaleDateString('sv-SE')}
                        </p>
                        {w.description && (
                          <p className="text-sm text-gray-400 mt-1 line-clamp-1">{w.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditModal(w)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(w.warranty_id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg min-w-[40px] min-h-[40px] flex items-center justify-center">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">{editingWarranty ? 'Redigera garanti' : 'Ny garanti'}</h3>
              <button onClick={() => setModalOpen(false)} className="p-2 text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Kund *</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Titel *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="T.ex. Badrumsrenovering - Tätskikt"
                  className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Startdatum</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Slutdatum *</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Typ</label>
                <select
                  value={form.warranty_type}
                  onChange={(e) => setForm({ ...form, warranty_type: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
                >
                  <option value="standard">Standard (2 år)</option>
                  <option value="extended">Utökad</option>
                  <option value="manufacturer">Tillverkargaranti</option>
                  <option value="custom">Anpassad</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Beskrivning</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Vad omfattar garantin?"
                  rows={2}
                  className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Villkor</label>
                <textarea
                  value={form.terms}
                  onChange={(e) => setForm({ ...form, terms: e.target.value })}
                  placeholder="Specifika garantivillkor..."
                  rows={2}
                  className="w-full px-4 py-2.5 bg-gray-100 border border-[#E2E8F0] rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 resize-none"
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
                className="flex items-center px-4 py-2 bg-gradient-to-r from-emerald-500 to-primary-600 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingWarranty ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
