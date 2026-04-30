'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

import { CustomersHeader } from './components/CustomersHeader'
import { CustomersTabs } from './components/CustomersTabs'
import { CustomersFilterBar } from './components/CustomersFilterBar'
import { CustomerCard } from './components/CustomerCard'
import { CustomerEmptyState } from './components/CustomerEmptyState'
import { CustomerModal } from './components/CustomerModal'
import { CampaignStats } from './components/CampaignStats'
import { CampaignFilterTabs } from './components/CampaignFilterTabs'
import { CampaignsList } from './components/CampaignsList'
import { DuplicatesPanel } from './components/DuplicatesPanel'
import { TagManagementModal } from './components/TagManagementModal'
import { DealPromptModal } from './components/DealPromptModal'
import type { Campaign, Customer, CustomerForm, CustomerTag, DuplicateGroup, PricingOption } from './components/types'

export default function CustomersPage() {
  const business = useBusiness()
  const [activeTab, setActiveTab] = useState<'customers' | 'campaigns' | 'duplicates'>('customers')

  // Customers state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null)
  const [form, setForm] = useState<CustomerForm>({
    name: '',
    phone_number: '',
    email: '',
    address_line: '',
    personal_number: '',
    property_designation: '',
    customer_type: 'private',
    org_number: '',
    contact_person: '',
    invoice_address: '',
    visit_address: '',
    reference: '',
    apartment_count: '',
    segment_id: '',
    contract_type_id: '',
    price_list_id: '',
    default_payment_days: '30',
    invoice_email: true,
  })

  // Pricing structure data
  const [pricingSegments, setPricingSegments] = useState<PricingOption[]>([])
  const [pricingContractTypes, setPricingContractTypes] = useState<PricingOption[]>([])
  const [pricingPriceLists, setPricingPriceLists] = useState<PricingOption[]>([])

  // Tags state (C1)
  const [tags, setTags] = useState<CustomerTag[]>([])
  const [customerTags, setCustomerTags] = useState<Map<string, string[]>>(new Map())
  const [selectedTagFilter, setSelectedTagFilter] = useState<string>('')
  const [ltvFilter, setLtvFilter] = useState<'' | 'vip' | 'inactive_vip'>('')
  const [sortBy, setSortBy] = useState<'name' | 'ltv' | 'recent'>('name')
  const [showTagModal, setShowTagModal] = useState(false)
  const [dealPrompt, setDealPrompt] = useState<{ customerId: string; customerName: string } | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState('#6366f1')

  // Duplicates state (C3)
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])

  // Campaigns state
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [campaignFilter, setCampaignFilter] = useState<'all' | 'draft' | 'sent'>('all')

  // Shared state
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false,
    message: '',
    type: 'success',
  })

  useEffect(() => {
    if (business.business_id) {
      fetchData()
    }
  }, [business.business_id])

  async function fetchData() {
    setLoading(true)

    // Fetch customers — begränsa till 500 senaste för browserprestanda.
    // Äldre kunder nås via sök.
    const CUSTOMER_FETCH_LIMIT = 500
    const { data: customersData } = await supabase
      .from('customer')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(CUSTOMER_FETCH_LIMIT)

    const { data: campaignsData } = await supabase
      .from('sms_campaign')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    const { data: tagsData } = await supabase
      .from('customer_tag')
      .select('tag_id, name, color')
      .eq('business_id', business.business_id)
      .order('name')

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

    try {
      const [segRes, ctRes, plRes] = await Promise.all([
        fetch('/api/pricing/segments').then(r => r.json()).catch(() => ({ segments: [] })),
        fetch('/api/pricing/contract-types').then(r => r.json()).catch(() => ({ contractTypes: [] })),
        fetch('/api/pricing/price-lists').then(r => r.json()).catch(() => ({ priceLists: [] })),
      ])
      setPricingSegments(segRes.segments || [])
      setPricingContractTypes(ctRes.contractTypes || [])
      setPricingPriceLists(plRes.priceLists || [])
    } catch {
      /* non-blocking */
    }

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
      name: '',
      phone_number: '',
      email: '',
      address_line: '',
      personal_number: '',
      property_designation: '',
      customer_type: 'private',
      org_number: '',
      contact_person: '',
      invoice_address: '',
      visit_address: '',
      reference: '',
      apartment_count: '',
      segment_id: '',
      contract_type_id: '',
      price_list_id: '',
      default_payment_days: '30',
      invoice_email: true,
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
      default_payment_days: (customer as any).default_payment_days
        ? String((customer as any).default_payment_days)
        : '30',
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
            : { ...form, businessId: business.business_id },
        }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      const result = await response.json().catch(() => null)
      showToast(editingCustomer ? 'Kund uppdaterad!' : 'Kund skapad!', 'success')
      setModalOpen(false)
      fetchData()

      if (!editingCustomer && result?.customer) {
        const customerName = form.name || result.customer.name || 'kunden'
        const customerId = result.customer.customer_id || result.customer.id
        if (customerId) {
          setDealPrompt({ customerId, customerName })
        }
      }
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

      if (!response.ok) {
        const errData = await response.json().catch(() => ({ error: 'Kunde inte ta bort kunden' }))
        showToast(errData.error || 'Kunde inte ta bort kunden', 'error')
        return
      }

      showToast('Kund borttagen!', 'success')
      fetchData()
    } catch (err: any) {
      showToast(err?.message || 'Kunde inte nå servern — försök igen', 'error')
    }
  }

  // === CAMPAIGN FUNCTIONS ===
  const handleCampaignDelete = async (campaignId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna kampanj?')) return
    await supabase.from('sms_campaign').delete().eq('campaign_id', campaignId)
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
      fetchData()
      fetchDuplicates()
    } catch {
      showToast('Kunde inte slå ihop kunder', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })

  // === COMPUTED VALUES ===
  const filteredCustomers = customers
    .filter(customer => {
      const matchesSearch =
        !searchTerm ||
        customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone_number?.includes(searchTerm) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase())

      const matchesTag =
        !selectedTagFilter || (customerTags.get(customer.customer_id) || []).includes(selectedTagFilter)

      const ltv = customer.lifetime_value || 0
      const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000)
      const matchesLtv =
        !ltvFilter ||
        (ltvFilter === 'vip' && ltv >= 50000) ||
        (ltvFilter === 'inactive_vip' &&
          ltv >= 50000 &&
          customer.last_job_date &&
          new Date(customer.last_job_date) < sixMonthsAgo)

      return matchesSearch && matchesTag && matchesLtv
    })
    .sort((a, b) => {
      if (sortBy === 'ltv') return (b.lifetime_value || 0) - (a.lifetime_value || 0)
      if (sortBy === 'recent') return (b.created_at || '').localeCompare(a.created_at || '')
      return (a.name || '').localeCompare(b.name || '')
    })

  const filteredCampaigns = campaigns.filter(c => {
    if (campaignFilter === 'draft') return c.status === 'draft'
    if (campaignFilter === 'sent') return c.status === 'sent'
    return true
  })

  const totalSent = campaigns.filter(c => c.status === 'sent').reduce((sum, c) => sum + c.recipient_count, 0)
  const totalDelivered = campaigns
    .filter(c => c.status === 'sent')
    .reduce((sum, c) => sum + c.delivered_count, 0)

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div
          className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
            toast.type === 'success'
              ? 'bg-emerald-100 border-emerald-200 text-emerald-600'
              : 'bg-red-100 border-red-200 text-red-600'
          }`}
        >
          {toast.message}
        </div>
      )}

      <CustomerModal
        open={modalOpen}
        editingCustomer={editingCustomer}
        form={form}
        setForm={setForm}
        pricingSegments={pricingSegments}
        pricingContractTypes={pricingContractTypes}
        pricingPriceLists={pricingPriceLists}
        actionLoading={actionLoading}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSubmit}
      />

      <div className="relative">
        <CustomersHeader />

        <div className="flex flex-col gap-4 mb-6">
          <CustomersTabs
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            customerCount={customers.length}
            campaignCount={campaigns.length}
            onFetchDuplicates={fetchDuplicates}
            onCreateCustomer={openCreateModal}
          />

          {activeTab === 'customers' && (
            <CustomersFilterBar
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              tags={tags}
              selectedTagFilter={selectedTagFilter}
              setSelectedTagFilter={setSelectedTagFilter}
              ltvFilter={ltvFilter}
              setLtvFilter={setLtvFilter}
              sortBy={sortBy}
              setSortBy={setSortBy}
              onOpenTagModal={() => setShowTagModal(true)}
            />
          )}

          {activeTab === 'campaigns' && <CampaignFilterTabs filter={campaignFilter} setFilter={setCampaignFilter} />}
        </div>

        {activeTab === 'campaigns' && (
          <CampaignStats
            campaignCount={campaigns.length}
            totalSent={totalSent}
            totalDelivered={totalDelivered}
          />
        )}

        {activeTab === 'customers' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {filteredCustomers.map(customer => (
                <CustomerCard
                  key={customer.customer_id}
                  customer={customer}
                  tagIds={customerTags.get(customer.customer_id) || []}
                  tags={tags}
                  onEdit={openEditModal}
                  onDelete={handleCustomerDelete}
                />
              ))}
            </div>

            {filteredCustomers.length === 0 && (
              <CustomerEmptyState hasSearch={!!searchTerm} onCreate={openCreateModal} />
            )}
          </>
        )}

        {activeTab === 'campaigns' && (
          <CampaignsList
            campaigns={filteredCampaigns}
            filter={campaignFilter}
            formatDate={formatDate}
            onDelete={handleCampaignDelete}
          />
        )}

        {activeTab === 'duplicates' && (
          <DuplicatesPanel
            duplicates={duplicates}
            actionLoading={actionLoading}
            onMerge={handleMergeDuplicates}
          />
        )}
      </div>

      <TagManagementModal
        open={showTagModal}
        tags={tags}
        newTagName={newTagName}
        setNewTagName={setNewTagName}
        newTagColor={newTagColor}
        setNewTagColor={setNewTagColor}
        actionLoading={actionLoading}
        onClose={() => setShowTagModal(false)}
        onCreate={handleCreateTag}
        onDelete={handleDeleteTag}
      />

      {dealPrompt && (
        <DealPromptModal
          customerId={dealPrompt.customerId}
          customerName={dealPrompt.customerName}
          onDismiss={() => setDealPrompt(null)}
        />
      )}
    </div>
  )
}
