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
  Eye,
  Building2,
  User,
  Home,
  Tag,
  AlertTriangle,
  Merge
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
  customer_type?: 'private' | 'company' | 'brf'
  org_number?: string | null
  contact_person?: string | null
  invoice_address?: string | null
  visit_address?: string | null
  reference?: string | null
  apartment_count?: number | null
  personal_number?: string | null
  property_designation?: string | null
  customer_number?: string | null
}

interface CustomerTag {
  tag_id: string
  name: string
  color: string
  customer_count: number
}

interface DuplicateGroup {
  match_type: 'phone' | 'email' | 'name_address'
  match_value: string
  customers: Array<{
    customer_id: string
    name: string
    phone_number: string
    email: string | null
    created_at: string
  }>
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
  const [activeTab, setActiveTab] = useState<'customers' | 'campaigns' | 'duplicates'>('customers')

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState({
    name: '', phone_number: '', email: '', address_line: '', personal_number: '', property_designation: '',
    customer_type: 'private' as 'private' | 'company' | 'brf',
    org_number: '', contact_person: '', invoice_address: '', visit_address: '', reference: '', apartment_count: '',
    segment_id: '', contract_type_id: '', price_list_id: '',
    default_payment_days: '30', invoice_email: true,
  })

  // Pricing structure data
  const [pricingSegments, setPricingSegments] = useState<{ id: string; name: string }[]>([])
  const [pricingContractTypes, setPricingContractTypes] = useState<{ id: string; name: string }[]>([])
  const [pricingPriceLists, setPricingPriceLists] = useState<{ id: string; name: string; segment_id: string | null }[]>([])

  // Tags state (C1)
  const [tags, setTags] = useState<CustomerTag[]>([])
  const [customerTags, setCustomerTags] = useState<Map<string, string[]>>(new Map()) // customer_id → tag_ids
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('')
  const [showTagModal, setShowTagModal] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366f1')

  // Duplicates state (C3)
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [mergingGroup, setMergingGroup] = useState<DuplicateGroup | null>(null)

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

    // Fetch tags (C1)
    const { data: tagsData } = await supabase
      .from('customer_tag')
      .select('tag_id, name, color')
      .eq('business_id', business.business_id)
      .order('name')

    // Fetch tag assignments
    const { data: assignmentsData } = await supabase
      .from('customer_tag_assignment')
      .select('customer_id, tag_id')

    const tagMap = new Map<string, string[]>()
    for (const a of assignmentsData || []) {
      const existing = tagMap.get(a.customer_id) || []
      existing.push(a.tag_id)
      tagMap.set(a.customer_id, existing)
    }

    const tagsWithCount = (tagsData || []).map((t: any) => ({
      ...t,
      customer_count: (assignmentsData || []).filter((a: any) => a.tag_id === t.tag_id).length,
    }))

    setCustomers(customersData || [])
    setTags(tagsWithCount)
    setCustomerTags(tagMap)
    setCampaigns(campaignsData || [])

    // Fetch pricing structure (non-blocking)
    try {
      const [segRes, ctRes, plRes] = await Promise.all([
        fetch('/api/pricing/segments').then(r => r.json()).catch(() => ({ segments: [] })),
        fetch('/api/pricing/contract-types').then(r => r.json()).catch(() => ({ contractTypes: [] })),
        fetch('/api/pricing/price-lists').then(r => r.json()).catch(() => ({ priceLists: [] })),
      ])
      setPricingSegments(segRes.segments || [])
      setPricingContractTypes(ctRes.contractTypes || [])
      setPricingPriceLists(plRes.priceLists || [])
    } catch { /* non-blocking */ }

    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  // === CUSTOMER FUNCTIONS ===
  const openCreateModal = () => {
    setEditingCustomer(null)
    setForm({
      name: '', phone_number: '', email: '', address_line: '', personal_number: '', property_designation: '',
      customer_type: 'private', org_number: '', contact_person: '', invoice_address: '', visit_address: '', reference: '', apartment_count: '',
      segment_id: '', contract_type_id: '', price_list_id: '',
      default_payment_days: '30', invoice_email: true,
    })
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
      personal_number: customer.personal_number || '',
      property_designation: customer.property_designation || '',
      customer_type: customer.customer_type || 'private',
      org_number: customer.org_number || '',
      contact_person: customer.contact_person || '',
      invoice_address: customer.invoice_address || '',
      visit_address: customer.visit_address || '',
      reference: customer.reference || '',
      apartment_count: customer.apartment_count ? String(customer.apartment_count) : '',
      segment_id: (customer as any).segment_id || '',
      contract_type_id: (customer as any).contract_type_id || '',
      price_list_id: (customer as any).price_list_id || '',
      default_payment_days: (customer as any).default_payment_days ? String((customer as any).default_payment_days) : '30',
      invoice_email: (customer as any).invoice_email !== false,
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

  // === TAG FUNCTIONS (C1) ===
  const handleCreateTag = async () => {
    if (!newTagName.trim()) return
    setActionLoading(true)
    try {
      const response = await fetch('/api/customers/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName, color: newTagColor }),
      })
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.error || 'Något gick fel')
      }
      showToast('Tagg skapad!', 'success')
      setNewTagName('')
      setShowTagModal(false)
      fetchData()
    } catch (err: any) {
      showToast(err.message || 'Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleTag = async (customerId: string, tagId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const currentTags = customerTags.get(customerId) || []
    const hasTag = currentTags.includes(tagId)
    try {
      await fetch('/api/customers/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customerId, tag_id: tagId, action: hasTag ? 'remove' : 'assign' }),
      })
      // Optimistic update
      const newMap = new Map(customerTags)
      if (hasTag) {
        newMap.set(customerId, currentTags.filter(t => t !== tagId))
      } else {
        newMap.set(customerId, [...currentTags, tagId])
      }
      setCustomerTags(newMap)
    } catch {
      showToast('Kunde inte uppdatera tagg', 'error')
    }
  }

  const handleDeleteTag = async (tagId: string) => {
    if (!confirm('Ta bort taggen? Den tas bort från alla kunder.')) return
    try {
      await fetch(`/api/customers/tags?tagId=${tagId}`, { method: 'DELETE' })
      fetchData()
    } catch {
      showToast('Kunde inte ta bort tagg', 'error')
    }
  }

  // === DUPLICATE FUNCTIONS (C3) ===
  const fetchDuplicates = async () => {
    try {
      const response = await fetch('/api/customers/duplicates')
      if (!response.ok) throw new Error()
      const data = await response.json()
      setDuplicates(data.duplicates || [])
    } catch {
      showToast('Kunde inte hämta dubbletter', 'error')
    }
  }

  const handleMergeDuplicates = async (keepId: string, mergeIds: string[]) => {
    if (!confirm(`Slå ihop ${mergeIds.length} kund(er) till den valda? Bokningar, fakturor m.m. flyttas över.`)) return
    setActionLoading(true)
    try {
      const response = await fetch('/api/customers/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keep_id: keepId, merge_ids: mergeIds }),
      })
      if (!response.ok) throw new Error()
      showToast('Kunder sammanslagna!', 'success')
      setMergingGroup(null)
      fetchData()
      fetchDuplicates()
    } catch {
      showToast('Kunde inte slå ihop kunder', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'draft':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-300">Utkast</span>
      case 'scheduled':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-amber-100 text-amber-600 border border-amber-200">Schemalagd</span>
      case 'sending':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-teal-100 text-teal-500 border border-teal-500/30">Skickar...</span>
      case 'sent':
        return <span className="px-2.5 py-1 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">Skickad</span>
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
  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = !searchTerm ||
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.phone_number?.includes(searchTerm) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesTag = !selectedTagFilter ||
      (customerTags.get(customer.customer_id) || []).includes(selectedTagFilter)

    return matchesSearch && matchesTag
  })

  const filteredCampaigns = campaigns.filter(c => {
    if (campaignFilter === 'draft') return c.status === 'draft'
    if (campaignFilter === 'sent') return c.status === 'sent'
    return true
  })

  const totalSent = campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.recipient_count, 0)
  const totalDelivered = campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.delivered_count, 0)

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-teal-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Customer Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm sm:p-4">
          <div className="bg-white border border-gray-200 rounded-t-2xl sm:rounded-2xl p-6 w-full sm:max-w-md max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingCustomer ? 'Redigera kund' : 'Ny kund'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer type selector */}
              <div>
                <label className="block text-sm text-gray-500 mb-2">Kundtyp</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'private', label: 'Privatperson', icon: User },
                    { value: 'company', label: 'Företag', icon: Building2 },
                    { value: 'brf', label: 'BRF', icon: Home },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setForm({ ...form, customer_type: value })}
                      className={`flex flex-col items-center gap-1 p-3 rounded-xl border text-sm font-medium transition-all min-h-[44px] ${
                        form.customer_type === value
                          ? 'bg-teal-50 border-teal-400 text-teal-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">
                  {form.customer_type === 'private' ? 'Namn *' : form.customer_type === 'company' ? 'Företagsnamn *' : 'Föreningsnamn *'}
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              {/* Org number for company/BRF */}
              {(form.customer_type === 'company' || form.customer_type === 'brf') && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Organisationsnummer</label>
                  <input
                    type="text"
                    value={form.org_number}
                    onChange={(e) => setForm({ ...form, org_number: e.target.value })}
                    placeholder="XXXXXX-XXXX"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              )}

              {/* Contact person for company/BRF */}
              {(form.customer_type === 'company' || form.customer_type === 'brf') && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Kontaktperson</label>
                  <input
                    type="text"
                    value={form.contact_person}
                    onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-1">Telefon *</label>
                <input
                  type="tel"
                  value={form.phone_number}
                  onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
                  placeholder="+46..."
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">E-post</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Adress</label>
                <input
                  type="text"
                  value={form.address_line}
                  onChange={(e) => setForm({ ...form, address_line: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
              </div>

              {/* Reference for company/BRF */}
              {(form.customer_type === 'company' || form.customer_type === 'brf') && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Referens / Er märkning</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm({ ...form, reference: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              )}

              {/* Invoice address for company/BRF */}
              {(form.customer_type === 'company' || form.customer_type === 'brf') && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Fakturaadress</label>
                  <input
                    type="text"
                    value={form.invoice_address}
                    onChange={(e) => setForm({ ...form, invoice_address: e.target.value })}
                    placeholder="Om annan än besöksadress"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              )}

              {/* Apartment count for BRF */}
              {form.customer_type === 'brf' && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Antal lägenheter</label>
                  <input
                    type="number"
                    value={form.apartment_count}
                    onChange={(e) => setForm({ ...form, apartment_count: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              )}

              {/* Personal number only for private */}
              {form.customer_type === 'private' && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Personnummer</label>
                  <input
                    type="text"
                    value={form.personal_number}
                    onChange={(e) => setForm({ ...form, personal_number: e.target.value })}
                    placeholder="YYYYMMDD-XXXX"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                  <p className="text-xs text-gray-400 mt-1">Krävs för ROT/RUT-avdrag</p>
                </div>
              )}

              {/* Payment terms */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Betalningsvillkor</label>
                  <select
                    value={form.default_payment_days}
                    onChange={(e) => setForm({ ...form, default_payment_days: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  >
                    <option value="10">10 dagar</option>
                    <option value="15">15 dagar</option>
                    <option value="20">20 dagar</option>
                    <option value="30">30 dagar</option>
                    <option value="45">45 dagar</option>
                    <option value="60">60 dagar</option>
                  </select>
                </div>
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.invoice_email}
                      onChange={(e) => setForm({ ...form, invoice_email: e.target.checked })}
                      className="rounded border-gray-300 text-teal-700 focus:ring-teal-500"
                    />
                    <span className="text-sm text-gray-600">Skicka faktura via e-post</span>
                  </label>
                </div>
              </div>

              {/* Pricing: Segment, Contract type, Price list */}
              {pricingSegments.length > 0 && (
                <div className="grid grid-cols-1 gap-3 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Kundtyp / Segment</label>
                    <select
                      value={form.segment_id}
                      onChange={e => {
                        const segId = e.target.value
                        setForm(prev => ({ ...prev, segment_id: segId }))
                        // Auto-suggest price list based on segment
                        const suggested = pricingPriceLists.find(pl => pl.segment_id === segId)
                        if (suggested) setForm(prev => ({ ...prev, segment_id: segId, price_list_id: suggested.id }))
                      }}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    >
                      <option value="">Välj segment...</option>
                      {pricingSegments.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Avtalsform</label>
                    <select
                      value={form.contract_type_id}
                      onChange={e => setForm({ ...form, contract_type_id: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    >
                      <option value="">Välj avtalsform...</option>
                      {pricingContractTypes.map(ct => (
                        <option key={ct.id} value={ct.id}>{ct.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Prislista</label>
                    <select
                      value={form.price_list_id}
                      onChange={e => setForm({ ...form, price_list_id: e.target.value })}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                    >
                      <option value="">Välj prislista...</option>
                      {pricingPriceLists.map(pl => (
                        <option key={pl.id} value={pl.id}>{pl.name}</option>
                      ))}
                    </select>
                    {form.price_list_id && form.segment_id && (
                      <p className="text-xs text-gray-400 mt-1">Auto-vald baserat på segment</p>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-1">Fastighetsbeteckning</label>
                <input
                  type="text"
                  value={form.property_designation}
                  onChange={(e) => setForm({ ...form, property_designation: e.target.value })}
                  placeholder="T.ex. Stockholm Söder 1:23"
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">Krävs för ROT-avdrag</p>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-500 hover:text-gray-900">
                Avbryt
              </button>
              <button
                onClick={handleSubmit}
                disabled={actionLoading}
                className="flex items-center px-4 py-2 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">Kunder</h1>
            <p className="text-sm sm:text-base text-gray-500">CRM och kundkommunikation</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex bg-white border border-gray-200 rounded-xl p-1">
              <button
                onClick={() => setActiveTab('customers')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
                  activeTab === 'customers'
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Kundlista</span>
                <span className="sm:hidden">Kunder</span>
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-50 rounded-full">{customers.length}</span>
              </button>
              <button
                onClick={() => setActiveTab('campaigns')}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
                  activeTab === 'campaigns'
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                <Megaphone className="w-4 h-4" />
                Kampanjer
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-gray-50 rounded-full">{campaigns.length}</span>
              </button>
              <button
                onClick={() => { setActiveTab('duplicates'); fetchDuplicates() }}
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex-1 sm:flex-none min-h-[44px] ${
                  activeTab === 'duplicates'
                    ? 'bg-teal-600 text-white'
                    : 'text-gray-500 hover:text-white'
                }`}
              >
                <Merge className="w-4 h-4" />
                <span className="hidden sm:inline">Dubbletter</span>
                <span className="sm:hidden">Dupl.</span>
              </button>
            </div>

            {/* Primary actions */}
            {activeTab === 'customers' && (
              <div className="flex items-center gap-2 sm:ml-auto">
                <Link
                  href="/dashboard/customers/import"
                  className="flex items-center justify-center px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl font-medium text-gray-900 hover:bg-gray-200 min-h-[44px]"
                >
                  <Upload className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Importera</span>
                </Link>
                <button
                  onClick={openCreateModal}
                  className="flex items-center justify-center px-4 py-2.5 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
                >
                  <Plus className="w-4 h-4 sm:mr-2" />
                  <span className="hidden sm:inline">Ny kund</span>
                </button>
              </div>
            )}

            {activeTab === 'campaigns' && (
              <Link
                href="/dashboard/campaigns/new"
                className="sm:ml-auto flex items-center justify-center px-4 py-2.5 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 min-h-[44px]"
              >
                <Plus className="w-4 h-4 mr-2" />
                Ny kampanj
              </Link>
            )}
          </div>

          {/* Search and filters on second row */}
          {activeTab === 'customers' && (
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-auto sm:max-w-xs flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Sök kund..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 min-h-[44px]"
                />
              </div>
              {/* Tag filter chips */}
              {tags.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={() => setSelectedTagFilter('')}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                      !selectedTagFilter ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    Alla
                  </button>
                  {tags.map(tag => (
                    <button
                      key={tag.tag_id}
                      onClick={() => setSelectedTagFilter(selectedTagFilter === tag.tag_id ? '' : tag.tag_id)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1 ${
                        selectedTagFilter === tag.tag_id
                          ? 'text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                      style={selectedTagFilter === tag.tag_id ? { backgroundColor: tag.color } : undefined}
                    >
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                      <span className="opacity-60">({tag.customer_count})</span>
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setShowTagModal(true)}
                className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                title="Hantera taggar"
              >
                <Tag className="w-4 h-4" />
              </button>
            </div>
          )}

          {activeTab === 'campaigns' && (
            <div className="flex bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
              {[
                { id: 'all', label: 'Alla' },
                { id: 'draft', label: 'Utkast' },
                { id: 'sent', label: 'Skickade' }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCampaignFilter(f.id as 'all' | 'draft' | 'sent')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap min-h-[40px] ${
                    campaignFilter === f.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-900'
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
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-sky-700" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{campaigns.length}</p>
                  <p className="text-xs text-gray-400">Kampanjer</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                  <Send className="w-5 h-5 text-teal-500" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{totalSent}</p>
                  <p className="text-xs text-gray-400">Skickade</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{totalDelivered}</p>
                  <p className="text-xs text-gray-400">Levererade</p>
                </div>
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900">{totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0}%</p>
                  <p className="text-xs text-gray-400">Leveransgrad</p>
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
                  className="bg-white shadow-sm rounded-xl sm:rounded-2xl border border-gray-200 p-4 sm:p-5 hover:bg-gray-50 transition-all block"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center">
                      <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${
                        customer.customer_type === 'company' ? 'bg-gradient-to-br from-amber-400 to-orange-500' :
                        customer.customer_type === 'brf' ? 'bg-gradient-to-br from-emerald-400 to-teal-500' :
                        'bg-teal-600'
                      }`}>
                        <span className="text-white font-bold text-base sm:text-lg">
                          {customer.name ? customer.name.split(' ').map(n => n[0]).join('').substring(0, 2) : '?'}
                        </span>
                      </div>
                      <div className="ml-3 sm:ml-4">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 text-sm sm:text-base">{customer.name || 'Okänd'}</h3>
                          {customer.customer_type === 'company' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 rounded-md">Företag</span>
                          )}
                          {customer.customer_type === 'brf' && (
                            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-md">BRF</span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-gray-400">{customer.customer_number && <span className="text-gray-500 font-medium">{customer.customer_number} · </span>}Sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}</p>
                      </div>
                    </div>
                    <div className="flex space-x-1">
                      <button
                        onClick={(e) => openEditModal(customer, e)}
                        className="p-2.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleCustomerDelete(customer.customer_id, e)}
                        className="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center text-xs sm:text-sm">
                      <Phone className="w-4 h-4 text-gray-400 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="text-gray-700 truncate">{customer.phone_number || '-'}</span>
                    </div>
                    <div className="flex items-center text-xs sm:text-sm">
                      <Mail className="w-4 h-4 text-gray-400 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="text-gray-700 truncate">{customer.email || '-'}</span>
                    </div>
                    <div className="flex items-center text-xs sm:text-sm">
                      <MapPin className="w-4 h-4 text-gray-400 mr-2 sm:mr-3 flex-shrink-0" />
                      <span className="text-gray-700 truncate">{customer.address_line || '-'}</span>
                    </div>
                  </div>
                  {/* Tag chips (C1) */}
                  {(customerTags.get(customer.customer_id) || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                      {(customerTags.get(customer.customer_id) || []).map(tagId => {
                        const tag = tags.find(t => t.tag_id === tagId)
                        if (!tag) return null
                        return (
                          <span
                            key={tagId}
                            className="px-2 py-0.5 text-[10px] font-medium rounded-full text-white"
                            style={{ backgroundColor: tag.color }}
                          >
                            {tag.name}
                          </span>
                        )
                      })}
                    </div>
                  )}
                </Link>
              ))}
            </div>

            {filteredCustomers.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-400">{searchTerm ? 'Inga kunder hittades' : 'Inga kunder ännu'}</p>
                {!searchTerm && (
                  <button onClick={openCreateModal} className="mt-4 text-sky-700 hover:text-teal-600">
                    Skapa din första kund →
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === 'campaigns' && (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200">
            {filteredCampaigns.length === 0 ? (
              <div className="p-12 text-center">
                <Megaphone className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500 mb-2">
                  {campaignFilter === 'draft' ? 'Inga utkast' : campaignFilter === 'sent' ? 'Inga skickade kampanjer' : 'Inga kampanjer ännu'}
                </p>
                <Link
                  href="/dashboard/campaigns/new"
                  className="text-sky-700 hover:text-teal-600 text-sm"
                >
                  Skapa din första kampanj →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {filteredCampaigns.map((campaign) => (
                  <div key={campaign.campaign_id} className="p-4 hover:bg-gray-100/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className="w-10 h-10 bg-gradient-to-br from-teal-600/20 to-teal-500/20 rounded-xl flex items-center justify-center border border-teal-300 mr-4">
                          <MessageSquare className="w-5 h-5 text-sky-700" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            <p className="font-medium text-gray-900 truncate">{campaign.name}</p>
                            {getStatusBadge(campaign.status)}
                          </div>
                          <p className="text-sm text-gray-400 truncate mt-1">{campaign.message}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-6 ml-4">
                        <div className="text-right hidden sm:block">
                          <div className="flex items-center text-sm text-gray-500">
                            <Users className="w-4 h-4 mr-1" />
                            {campaign.recipient_count} mottagare
                          </div>
                          <p className="text-xs text-gray-400 mt-1">
                            {campaign.sent_at ? `Skickad ${formatDate(campaign.sent_at)}` : `Skapad ${formatDate(campaign.created_at)}`}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {campaign.status === 'draft' && (
                            <Link
                              href={`/dashboard/campaigns/${campaign.campaign_id}`}
                              className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
                            >
                              <Eye className="w-4 h-4" />
                            </Link>
                          )}
                          {campaign.status === 'draft' && (
                            <button
                              onClick={() => handleCampaignDelete(campaign.campaign_id)}
                              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                          {campaign.status === 'sent' && (
                            <Link
                              href={`/dashboard/campaigns/${campaign.campaign_id}`}
                              className="px-3 py-1.5 text-xs font-medium text-sky-700 hover:text-teal-600 bg-teal-50 border border-teal-300 rounded-lg"
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
        {/* Duplicates Tab (C3) */}
        {activeTab === 'duplicates' && (
          <div className="space-y-4">
            {duplicates.length === 0 ? (
              <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-12 text-center">
                <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                <p className="text-gray-500">Inga dubbletter hittades!</p>
                <p className="text-sm text-gray-400 mt-1">Alla kunder verkar vara unika.</p>
              </div>
            ) : (
              <>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-amber-800">Potentiella dubbletter hittade</p>
                    <p className="text-sm text-amber-600 mt-1">
                      {duplicates.length} grupp(er) med möjliga dubbletter. Granska och slå ihop vid behov.
                    </p>
                  </div>
                </div>
                {duplicates.map((group, gi) => (
                  <div key={gi} className="bg-white shadow-sm rounded-2xl border border-gray-200 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <span className={`px-2.5 py-1 text-xs rounded-full font-medium ${
                        group.match_type === 'phone' ? 'bg-teal-100 text-teal-700' :
                        group.match_type === 'email' ? 'bg-purple-100 text-purple-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {group.match_type === 'phone' ? 'Samma telefon' : group.match_type === 'email' ? 'Samma e-post' : 'Samma namn + adress'}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {group.customers.map((c, ci) => (
                        <div key={c.customer_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                          <div>
                            <p className="font-medium text-gray-900">{c.name}</p>
                            <p className="text-sm text-gray-500">{c.phone_number} {c.email && `· ${c.email}`}</p>
                            <p className="text-xs text-gray-400">Skapad {new Date(c.created_at).toLocaleDateString('sv-SE')}</p>
                          </div>
                          <button
                            onClick={() => handleMergeDuplicates(
                              c.customer_id,
                              group.customers.filter(o => o.customer_id !== c.customer_id).map(o => o.customer_id)
                            )}
                            disabled={actionLoading}
                            className="px-3 py-1.5 text-xs font-medium bg-teal-50 text-sky-700 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50"
                          >
                            Behåll denna
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Tag Management Modal (C1) */}
      {showTagModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-gray-900">Hantera taggar</h3>
              <button onClick={() => setShowTagModal(false)} className="p-2 text-gray-400 hover:text-gray-900">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Create new tag */}
            <div className="flex items-center gap-2 mb-6">
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                className="w-10 h-10 rounded-lg border border-gray-200 cursor-pointer"
              />
              <input
                type="text"
                placeholder="Ny tagg..."
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateTag()}
                className="flex-1 px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500/50"
              />
              <button
                onClick={handleCreateTag}
                disabled={!newTagName.trim() || actionLoading}
                className="px-4 py-2.5 bg-teal-600 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                Skapa
              </button>
            </div>

            {/* Existing tags */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {tags.length === 0 ? (
                <p className="text-center text-gray-400 py-4">Inga taggar skapade ännu</p>
              ) : (
                tags.map(tag => (
                  <div key={tag.tag_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color }} />
                      <span className="text-sm font-medium text-gray-900">{tag.name}</span>
                      <span className="text-xs text-gray-400">({tag.customer_count} kunder)</span>
                    </div>
                    <button
                      onClick={() => handleDeleteTag(tag.tag_id)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
