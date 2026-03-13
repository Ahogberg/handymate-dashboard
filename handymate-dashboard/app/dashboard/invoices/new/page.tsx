'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import { InvoiceItem } from '@/lib/types/invoice'
import { calculateInvoiceTotals, recalculateItems, createDefaultInvoiceItem } from '@/lib/invoice-calculations'
import { generateOCR } from '@/lib/ocr'
import LineItemEditor from '@/components/invoices/LineItemEditor'
import InvoiceSummary from '@/components/invoices/InvoiceSummary'
import Link from 'next/link'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string | null
  address_line: string | null
  personal_number?: string
  property_designation?: string
}

interface TimeEntry {
  time_entry_id?: string
  entry_id?: string
  work_date: string
  hours_worked?: number
  duration_minutes?: number
  hourly_rate: number | null
  materials_cost?: number | null
  description: string | null
  customer_id: string | null
  customer?: { name: string }
  invoice_id: string | null
}

export default function NewInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])

  // Form state
  const [customerId, setCustomerId] = useState(searchParams.get('customerId') || '')
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [vatRate, setVatRate] = useState(25)
  const [rotRutType, setRotRutType] = useState<string>('')
  const [dueDays, setDueDays] = useState(30)
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0])
  const [ourReference, setOurReference] = useState('')
  const [yourReference, setYourReference] = useState('')
  const [personalNumber, setPersonalNumber] = useState('')
  const [propertyDesignation, setPropertyDesignation] = useState('')

  // Business config
  const [invoicePrefix, setInvoicePrefix] = useState('FV')
  const [nextNumber, setNextNumber] = useState(1)

  // Time entry selection modal
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<string[]>([])
  const [showTimeEntries, setShowTimeEntries] = useState(false)

  // Pre-population from URL params
  const fromQuoteId = searchParams.get('fromQuote')
  const fromTimeEntriesCustomer = searchParams.get('fromTimeEntries')

  useEffect(() => {
    if (business.business_id) {
      fetchData()
    }
  }, [business.business_id])

  async function fetchData() {
    const [customersRes, timeRes, configRes] = await Promise.all([
      supabase
        .from('customer')
        .select('customer_id, name, phone_number, email, address_line, personal_number, property_designation')
        .eq('business_id', business.business_id)
        .order('name'),
      supabase
        .from('time_entry')
        .select(`*, customer:customer_id (name)`)
        .eq('business_id', business.business_id)
        .is('invoice_id', null)
        .order('work_date', { ascending: false }),
      supabase
        .from('business_config')
        .select('default_payment_days, invoice_prefix, next_invoice_number, default_hourly_rate')
        .eq('business_id', business.business_id)
        .single()
    ])

    setCustomers(customersRes.data || [])
    setTimeEntries(timeRes.data || [])

    if (configRes.data) {
      setDueDays(configRes.data.default_payment_days || 30)
      setInvoicePrefix(configRes.data.invoice_prefix || 'FV')
      setNextNumber(configRes.data.next_invoice_number || 1)
    }

    if (fromQuoteId) {
      await loadFromQuote(fromQuoteId)
    }

    if (fromTimeEntriesCustomer) {
      setCustomerId(fromTimeEntriesCustomer)
    }

    setLoading(false)
  }

  async function loadFromQuote(quoteId: string) {
    try {
      const res = await fetch(`/api/invoices/from-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quoteId, dry_run: true })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.items) setItems(data.items)
        if (data.customer_id) setCustomerId(data.customer_id)
        if (data.rot_rut_type) setRotRutType(data.rot_rut_type)
        if (data.personnummer) setPersonalNumber(data.personnummer)
        if (data.fastighetsbeteckning) setPropertyDesignation(data.fastighetsbeteckning)
      }
    } catch {
      // Silently fail – user can add items manually
    }
  }

  useEffect(() => {
    if (customerId) {
      const customer = customers.find(c => c.customer_id === customerId)
      if (customer?.personal_number) setPersonalNumber(customer.personal_number)
      if (customer?.property_designation) setPropertyDesignation(customer.property_designation)
    }
  }, [customerId, customers])

  const handleItemsChange = useCallback((newItems: InvoiceItem[]) => {
    setItems(newItems)
  }, [])

  const addTimeEntriesToInvoice = () => {
    const selected = timeEntries.filter(te =>
      selectedTimeEntries.includes(te.time_entry_id || te.entry_id || '')
    )
    const newItems: InvoiceItem[] = []

    for (const entry of selected) {
      const hours = entry.hours_worked || (entry.duration_minutes ? entry.duration_minutes / 60 : 0)
      const rate = entry.hourly_rate || 500
      newItems.push(createDefaultInvoiceItem('item', items.length + newItems.length))
      const idx = newItems.length - 1
      newItems[idx] = {
        ...newItems[idx],
        description: entry.description || `Arbete ${new Date(entry.work_date).toLocaleDateString('sv-SE')}`,
        quantity: Math.round(hours * 100) / 100,
        unit: 'timmar',
        unit_price: rate,
        total: Math.round(hours * rate * 100) / 100,
        type: 'labor',
        is_rot_eligible: rotRutType === 'rot',
        is_rut_eligible: rotRutType === 'rut',
      }

      if (entry.materials_cost && entry.materials_cost > 0) {
        const matItem = createDefaultInvoiceItem('item', items.length + newItems.length)
        newItems.push({
          ...matItem,
          description: `Material (${new Date(entry.work_date).toLocaleDateString('sv-SE')})`,
          quantity: 1,
          unit: 'st',
          unit_price: entry.materials_cost,
          total: entry.materials_cost,
          type: 'material',
        })
      }

      if (!customerId && entry.customer_id) {
        setCustomerId(entry.customer_id)
      }
    }

    setItems(recalculateItems([...items, ...newItems]))
    setShowTimeEntries(false)
    setSelectedTimeEntries([])
  }

  const handleFieldChange = (field: string, value: string) => {
    if (field === 'personalNumber') setPersonalNumber(value)
    if (field === 'propertyDesignation') setPropertyDesignation(value)
  }

  const handleCreate = async () => {
    if (items.length === 0) {
      toast.warning('Lägg till minst en rad')
      return
    }

    setCreating(true)

    try {
      const response = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          customer_id: customerId || null,
          items,
          vat_rate: vatRate,
          rot_rut_type: rotRutType || null,
          due_days: dueDays,
          invoice_date: invoiceDate,
          our_reference: ourReference || null,
          your_reference: yourReference || null,
          personnummer: personalNumber || null,
          fastighetsbeteckning: propertyDesignation || null,
          time_entry_ids: selectedTimeEntries.length > 0 ? selectedTimeEntries : undefined,
          quote_id: fromQuoteId || undefined,
        })
      })

      if (!response.ok) throw new Error('Kunde inte skapa faktura')

      const data = await response.json()
      toast.success('Faktura skapad!')
      router.push(`/dashboard/invoices/${data.invoice.invoice_id}`)
    } catch {
      toast.error('Något gick fel')
    } finally {
      setCreating(false)
    }
  }

  const totals = calculateInvoiceTotals(items, 0, vatRate)

  if (loading) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#0F766E] animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Time Entry Selection Modal */}
      {showTimeEntries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-4">
          <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-8 py-7 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <span className="text-[16px] font-medium text-[#1E293B]">Välj tidrapporter</span>
              <button
                onClick={() => { setShowTimeEntries(false); setSelectedTimeEntries([]) }}
                className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#94A3B8] hover:text-[#1E293B] flex items-center justify-center text-[16px]"
              >
                ×
              </button>
            </div>

            {timeEntries.filter(te => !customerId || te.customer_id === customerId).length === 0 ? (
              <p className="text-[#94A3B8] py-8 text-center text-[13px]">Inga ofakturerade tidrapporter</p>
            ) : (
              <div className="space-y-2">
                {timeEntries
                  .filter(te => !customerId || te.customer_id === customerId)
                  .map((entry) => {
                    const entryId = entry.time_entry_id || entry.entry_id || ''
                    const hours = entry.hours_worked || (entry.duration_minutes ? entry.duration_minutes / 60 : 0)
                    const laborCost = hours * (entry.hourly_rate || 500)
                    const totalCost = laborCost + (entry.materials_cost || 0)

                    return (
                      <label
                        key={entryId}
                        className={`flex items-center gap-4 p-4 rounded-lg border-thin cursor-pointer transition-all ${
                          selectedTimeEntries.includes(entryId)
                            ? 'bg-[#F0FDFA] border-[#0F766E]'
                            : 'bg-[#F8FAFC] border-[#E2E8F0] hover:border-[#CBD5E1]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTimeEntries.includes(entryId)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTimeEntries([...selectedTimeEntries, entryId])
                            } else {
                              setSelectedTimeEntries(selectedTimeEntries.filter(id => id !== entryId))
                            }
                          }}
                          className="w-4 h-4 rounded border-[#E2E8F0] text-[#0F766E] focus:ring-[#0F766E]"
                        />
                        <div className="flex-1">
                          <p className="text-[13px] font-medium text-[#1E293B]">
                            {new Date(entry.work_date).toLocaleDateString('sv-SE')} — {hours.toFixed(1)}h
                          </p>
                          <p className="text-[12px] text-[#94A3B8]">
                            {entry.customer?.name || 'Ingen kund'} — {entry.description || 'Ingen beskrivning'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[13px] font-medium text-[#1E293B]">{totalCost.toLocaleString('sv-SE')} kr</p>
                        </div>
                      </label>
                    )
                  })}
              </div>
            )}

            <div className="flex gap-2 mt-6 pt-5 border-t border-thin border-[#E2E8F0]">
              <button
                onClick={() => { setShowTimeEntries(false); setSelectedTimeEntries([]) }}
                className="px-4 py-2.5 bg-transparent text-[#64748B] border-thin border-[#E2E8F0] rounded-lg text-[13px] cursor-pointer"
              >
                Avbryt
              </button>
              <button
                onClick={addTimeEntriesToInvoice}
                disabled={selectedTimeEntries.length === 0}
                className="flex-1 py-2.5 bg-[#0F766E] text-white border-none rounded-lg text-[14px] font-medium cursor-pointer disabled:opacity-50"
              >
                Lägg till ({selectedTimeEntries.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Link href="/dashboard/invoices" className="text-[13px] text-[#64748B] hover:text-[#1E293B] transition-colors">
              ← Fakturor
            </Link>
            <span className="text-[18px] font-medium text-[#1E293B] ml-3">Ny faktura</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          {/* Main Content */}
          <div className="flex flex-col gap-4">
            {/* Kund och datum */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Kund och datum</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Kund *</label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value="">Välj kund...</option>
                    {customers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Fakturadatum</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Betalningsvillkor</label>
                  <select
                    value={dueDays}
                    onChange={(e) => setDueDays(Number(e.target.value))}
                    className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value={14}>14 dagar</option>
                    <option value={30}>30 dagar</option>
                    <option value={60}>60 dagar</option>
                    <option value={0}>Förskott</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Importera rader */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Importera rader</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {fromQuoteId ? (
                  <div className="px-4 py-3 border-thin border-[#0F766E] rounded-lg bg-[#F0FDFA] text-left">
                    <div className="text-[13px] font-medium text-[#1E293B]">Importerad från offert</div>
                    <div className="text-[12px] text-[#94A3B8]">Rader hämtade automatiskt</div>
                  </div>
                ) : (
                  <button
                    onClick={() => router.push('/dashboard/quotes')}
                    className="px-4 py-4 border-thin border-[#E2E8F0] rounded-lg bg-[#F8FAFC] cursor-pointer text-left hover:border-[#0F766E] hover:bg-[#F0FDFA] transition-colors"
                  >
                    <div className="text-[13px] font-medium text-[#1E293B]">Från offert</div>
                    <div className="text-[12px] text-[#94A3B8]">Hämta rader från godkänd offert</div>
                  </button>
                )}
                <button
                  onClick={() => setShowTimeEntries(true)}
                  className="px-4 py-4 border-thin border-[#E2E8F0] rounded-lg bg-[#F8FAFC] cursor-pointer text-left hover:border-[#0F766E] hover:bg-[#F0FDFA] transition-colors"
                >
                  <div className="text-[13px] font-medium text-[#1E293B]">Från tidrapport</div>
                  <div className="text-[12px] text-[#94A3B8]">Fakturera rapporterade timmar</div>
                </button>
              </div>
            </div>

            {/* Fakturarader */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <LineItemEditor
                items={items}
                onChange={handleItemsChange}
                rotRutType={rotRutType || undefined}
              />
            </div>

            {/* ROT-avdrag */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[13px] text-[#1E293B]">ROT-avdrag</span>
                  {!rotRutType && (
                    <div className="text-[12px] text-[#94A3B8] mt-1">Slå på för att aktivera ROT-beräkning</div>
                  )}
                </div>
                <div
                  className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${rotRutType ? 'bg-[#0F766E]' : 'bg-[#CBD5E1]'}`}
                  onClick={() => setRotRutType(rotRutType ? '' : 'rot')}
                >
                  <div className={`absolute w-3.5 h-3.5 bg-white rounded-full top-[3px] transition-all ${rotRutType ? 'left-[19px]' : 'left-[3px]'}`} />
                </div>
              </div>
              {rotRutType && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] text-[#64748B] mb-1">Typ</label>
                    <select
                      value={rotRutType}
                      onChange={(e) => setRotRutType(e.target.value)}
                      className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                    >
                      <option value="rot">ROT-avdrag (30%)</option>
                      <option value="rut">RUT-avdrag (50%)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#64748B] mb-1">Personnummer</label>
                    <input
                      type="text"
                      value={personalNumber}
                      onChange={(e) => setPersonalNumber(e.target.value)}
                      placeholder="YYYYMMDD-XXXX"
                      className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  {rotRutType === 'rot' && (
                    <div className="sm:col-span-2">
                      <label className="block text-[12px] text-[#64748B] mb-1">Fastighetsbeteckning</label>
                      <input
                        type="text"
                        value={propertyDesignation}
                        onChange={(e) => setPropertyDesignation(e.target.value)}
                        placeholder="T.ex. Stockholm Söder 1:23"
                        className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                  )}
                  <p className="text-[12px] text-[#0F766E] sm:col-span-2">
                    {rotRutType === 'rot'
                      ? 'Kunden betalar 70% — Skatteverket betalar resterande 30% direkt till dig.'
                      : 'Kunden betalar 50% — Skatteverket betalar resterande 50% direkt till dig.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-4">
            <InvoiceSummary
              totals={totals}
              vatRate={vatRate}
              rotRutType={rotRutType || undefined}
              personalNumber={personalNumber}
              propertyDesignation={propertyDesignation}
              onFieldChange={handleFieldChange}
            />

            <button
              onClick={handleCreate}
              disabled={creating || items.length === 0}
              className="w-full py-3 bg-[#0F766E] text-white border-none rounded-lg text-[14px] font-medium cursor-pointer disabled:opacity-50"
            >
              {creating ? 'Skapar...' : 'Skapa faktura'}
            </button>
            <button
              className="w-full py-2.5 bg-transparent text-[#64748B] border-thin border-[#E2E8F0] rounded-lg text-[13px] cursor-pointer hover:bg-[#F8FAFC]"
              onClick={() => {
                toast.info('Utkast sparas automatiskt')
              }}
            >
              Spara utkast
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
