'use client'

import { useEffect, useState } from 'react'
import { Users, Plus, Search, Phone, Mail, MapPin, X, Loader2, Trash2, Edit } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import { Upload } from 'lucide-react'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
  address_line: string | null
  created_at: string
}

export default function CustomersPage() {
  const business = useBusiness()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  
  const [form, setForm] = useState({ name: '', phone_number: '', email: '', address_line: '' })

  useEffect(() => {
    fetchCustomers()
  }, [business.business_id])

  async function fetchCustomers() {
    const { data } = await supabase
      .from('customer')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    setCustomers(data || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const openCreateModal = () => {
    setEditingCustomer(null)
    setForm({ name: '', phone_number: '', email: '', address_line: '' })
    setModalOpen(true)
  }

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer)
    setForm({
      name: customer.name || '',
      phone_number: customer.phone_number || '',
      email: customer.email || '',
      address_line: customer.address_line || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.name || !form.phone_number) {
      showToast('Namn och telefon krävs', 'error')
      return
    }

    setActionLoading(true)
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingCustomer ? 'update_customer' : 'create_customer',
          data: editingCustomer 
            ? { customerId: editingCustomer.customer_id, ...form }
            : { ...form, businessId: business.business_id }
        }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast(editingCustomer ? 'Kund uppdaterad!' : 'Kund skapad!', 'success')
      setModalOpen(false)
      fetchCustomers()
    } catch (error) {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (customerId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna kund?')) return

    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_customer', data: { customerId } }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast('Kund borttagen!', 'success')
      fetchCustomers()
    } catch (error) {
      showToast('Något gick fel', 'error')
    }
  }

  const filteredCustomers = customers.filter(customer =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone_number?.includes(searchTerm) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {editingCustomer ? 'Redigera kund' : 'Ny kund'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Namn *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Telefon *</label>
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  placeholder="+46..."
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">E-post</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Adress</label>
                <input
                  type="text"
                  value={form.address_line}
                  onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white">
                Avbryt
              </button>
              <button
                onClick={handleSubmit}
                disabled={actionLoading}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingCustomer ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Kunder</h1>
            <p className="text-zinc-400">{customers.length} kunder totalt</p>
          </div>
          <div className="flex space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Sök kund..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>
<div className="flex items-center gap-3">
  <Link
    href="/dashboard/customers/import"
    className="flex items-center px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl font-medium text-white hover:bg-zinc-700"
  >
    <Upload className="w-4 h-4 mr-2" />
    Importera
  </Link>
  <button 
    onClick={openCreateModal}
    className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90"
  >
    <Plus className="w-4 h-4 mr-2" />
    Ny kund
  </button>
</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCustomers.map((customer) => (
            <Link href={`/dashboard/customers/${customer.customer_id}`} key={customer.customer_id} className="p-4 hover:bg-zinc-800/50 transition-all cursor-pointer block">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center">
                  <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
                    <span className="text-white font-bold text-lg">
                      {customer.name ? customer.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '?'}
                    </span>
                  </div>
                  <div className="ml-4">
                    <h3 className="font-semibold text-white">{customer.name || 'Okänd'}</h3>
                    <p className="text-sm text-zinc-500">Sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}</p>
                  </div>
                </div>
                <div className="flex space-x-1">
                  <button 
                    onClick={() => openEditModal(customer)}
                    className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => handleDelete(customer.customer_id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center text-sm">
                  <Phone className="w-4 h-4 text-zinc-500 mr-3" />
                  <span className="text-zinc-300">{customer.phone_number || '-'}</span>
                </div>
                <div className="flex items-center text-sm">
                  <Mail className="w-4 h-4 text-zinc-500 mr-3" />
                  <span className="text-zinc-300">{customer.email || '-'}</span>
                </div>
                <div className="flex items-center text-sm">
                  <MapPin className="w-4 h-4 text-zinc-500 mr-3" />
                  <span className="text-zinc-300">{customer.address_line || '-'}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filteredCustomers.length === 0 && (
          <div className="text-center py-12">
            <Users className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
            <p className="text-zinc-500">{searchTerm ? 'Inga kunder hittades' : 'Inga kunder ännu'}</p>
            {!searchTerm && (
              <button onClick={openCreateModal} className="mt-4 text-violet-400 hover:text-violet-300">
                Skapa din första kund →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
