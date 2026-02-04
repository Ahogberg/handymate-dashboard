'use client'

import { useEffect, useState } from 'react'
import {
  Users,
  Plus,
  Search,
  Phone,
  Mail,
  MapPin,
  X,
  Loader2,
  Trash2,
  Edit,
  Upload,
  Megaphone,
  Send,
  CheckCircle,
  MessageSquare,
  Eye
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
  address_line: string | null
  created_at: string
}

interface Campaign {
  campaign_id: string
  name: string
  message: string
  status: 'draft' | 'scheduled' | 'sending' | 'sent'
  scheduled_at: string | null
  sent_at: string | null
  recipient_count: number
  delivered_count: number
  created_at: string
}

export default function CustomersPage() {
  const business = useBusiness()
  const [activeTab, setActiveTab] = useState<'customers' | 'campaigns'>('customers')

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState({ name: '', phone_number: '', email: '', address_line: '' })

  // Campaigns state
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'draft' | 'sent'>('all')

  // Shared state
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    if (business.business_id) {
      fetchData()
    }
  }, [business.business_id])

  async function fetchData() {
    setLoading(true)

    // Fetch customers
    const { data: customersData } = await supabase
      .from('customer')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    // Fetch campaigns
    const { data: campaignsData } = await supabase
      .from('sms_campaign')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    setCustomers(customersData || [])
    setCampaigns(campaignsData || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  // === CUSTOMER FUNCTIONS ===
  const openCreateModal = () => {
    setEditingCustomer(null)
    setForm({ name: '', phone_number: '', email: '', address_line: '' })
    setModalOpen(true)
  }

  const openEditModal = (customer: Customer, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
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
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCustomerDelete = async (customerId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Är du säker på att du vill ta bort denna kund?')) return

    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_customer', data: { customerId } }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast('Kund borttagen!', 'success')
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  // === CAMPAIGN FUNCTIONS ===
  const handleCampaignDelete = async (campaignId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna kampanj?')) return

    await supabase
      .from('sms_campaign')
      .delete()
      .eq('campaign_id', campaignId)

    fetchData()
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">Utkast</span>
      case 'scheduled':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Schemalagd</span>
      case 'sending':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Skickar...</span>
      case 'sent':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Skickad</span>
      default:
        return null
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // === COMPUTED VALUES ===
  const filteredCustomers = customers.filter(customer =>
    customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone_number?.includes(searchTerm) ||
    customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredCampaigns = campaigns.filter(c => {
    if (campaignFilter === 'draft') return c.status === 'draft'
    if (campaignFilter === 'sent') return c.status === 'sent'
    return true
  })

  const totalSent = campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.recipient_count, 0)
  const totalDelivered = campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.delivered_count, 0)

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Customer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
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
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Kunder</h1>
            <p className="text-sm sm:text-base text-zinc-400">CRM och kundkommunikation</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('customers')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
                  activeTab === 'customers'
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Kundlista</span>
                <span className="sm:hidden">Kunder</span>
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-zinc-800/50 rounded-full">{customers.length}</span>
              </button>
              <button
                onClick={() => setActiveTab('campaigns')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
                  activeTab === 'campaigns'
                    ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Megaphone className="w-4 h-4" />
                Kampanjer
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-zinc-800/50 rounded-full">{campaigns.length}</span>
              </button>
            </div>

            {/* Primary actions */}
            {activeTab === 'customers' && (
              <div className="flex items-center gap-2 sm:ml-auto">
                <Link
                  href="/dashboard/customers/import"
                  className="flex items-center justify-center px-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-xl font-medium text-white hover:bg-zinc-700 min-h-[44px]"
                >
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Importera</span>
                </Link>
                <button
                  onClick={openCreateModal}
                  className="flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
                >
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Ny kund</span>
                </button>
              </div>
            )}

            {activeTab === 'campaigns' && (
              <Link
                href="/dashboard/campaigns/new"
                className="sm:ml-auto flex items-center justify-center px-4 py-2.5 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ny kampanj
              </Link>
            )}
          </div>

          {/* Search and filters on second row */}
          {activeTab === 'customers' && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Sök kund..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 min-h-[44px]"
              />
            </div>
          )}

          {activeTab === 'campaigns' && (
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1 overflow-x-auto">
              {[
                { id: 'all', label: 'Alla' },
                { id: 'draft', label: 'Utkast' },
                { id: 'sent', label: 'Skickade' }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCampaignFilter(f.id as 'all' | 'draft' | 'sent')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-h-[40px] ${
                    campaignFilter === f.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Campaign Stats */}
        {activeTab === 'campaigns' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{campaigns.length}</p>
                  <p className="text-xs text-zinc-500">Kampanjer</p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Send className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{totalSent}</p>
                  <p className="text-xs text-zinc-500">Skickade</p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{totalDelivered}</p>
                  <p className="text-xs text-zinc-500">Levererade</p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0}%</p>
                  <p className="text-xs text-zinc-500">Leveransgrad</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {activeTab === 'customers' && (
          <>
            {/* Customer Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredCustomers.map((customer) => (
                <Link
                  href={`/dashboard/customers/${customer.customer_id}`}
                  key={customer.customer_id}
                  className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-zinc-800 p-4 sm:p-5 hover:bg-zinc-800/50 transition-all block"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl flex items-center justify-center">
                        <span className="text-white font-bold text-base sm:text-lg">
                          {customer.name ? customer.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '?'}
                        </span>
                      </div>
                      <div className="ml-3 sm:ml-4">
                        <h3 className="font-semibold text-white text-sm sm:text-base">{customer.name || 'Okänd'}</h3>
                        <p className="text-xs sm:text-sm text-zinc-500">Sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}</p>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={(e) => openEditModal(customer, e)}
                        className="p-2.5 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleCustomerDelete(customer.customer_id, e)}
                        className="p-2.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center text-xs sm:text-sm">
                      <Phone className="w-4 h-4 text-zinc-500 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="text-zinc-300 truncate">{customer.phone_number || '-'}</span>
                    </div>
                    <div className="flex items-center text-xs sm:text-sm">
                      <Mail className="w-4 h-4 text-zinc-500 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="text-zinc-300 truncate">{customer.email || '-'}</span>
                    </div>
                    <div className="flex items-center text-xs sm:text-sm">
                      <MapPin className="w-4 h-4 text-zinc-500 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="text-zinc-300 truncate">{customer.address_line || '-'}</span>
                    </div>
                  </div>
                </Link>
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
          </>
        )}

        {activeTab === 'campaigns' && (
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800">
            {filteredCampaigns.length === 0 ? (
              <div className="p-12 text-center">
                <Megaphone className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-400 mb-2">
                  {campaignFilter === 'draft' ? 'Inga utkast' : campaignFilter === 'sent' ? 'Inga skickade kampanjer' : 'Inga kampanjer ännu'}
                </p>
                <Link
                  href="/dashboard/campaigns/new"
                  className="text-violet-400 hover:text-violet-300 text-sm"
                >
                  Skapa din första kampanj →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-zinc-800">
                {filteredCampaigns.map((campaign) => (
                  <div key={campaign.campaign_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center border border-violet-500/30 mr-4">
                          <MessageSquare className="w-5 h-5 text-violet-400" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-medium text-white truncate">{campaign.name}</p>
                            {getStatusBadge(campaign.status)}
                          </div>
                          <p className="text-sm text-zinc-500 truncate mt-1">{campaign.message}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 ml-4">
                        <div className="text-right hidden sm:block">
                          <div className="flex items-center text-sm text-zinc-400">
                            <Users className="w-4 h-4 mr-1" />
                            {campaign.recipient_count} mottagare
                          </div>
                          <p className="text-xs text-zinc-600 mt-1">
                            {campaign.sent_at ? `Skickad ${formatDate(campaign.sent_at)}` : `Skapad ${formatDate(campaign.created_at)}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {campaign.status === 'draft' && (
                            <Link
                              href={`/dashboard/campaigns/${campaign.campaign_id}`}
                              className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                          )}
                          {campaign.status === 'draft' && (
                            <button
                              onClick={() => handleCampaignDelete(campaign.campaign_id)}
                              className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {campaign.status === 'sent' && (
                            <Link
                              href={`/dashboard/campaigns/${campaign.campaign_id}`}
                              className="px-3 py-1.5 text-xs font-medium text-violet-400 hover:text-violet-300 bg-violet-500/10 border border-violet-500/30 rounded-lg"
                            >
                              Visa resultat
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
