'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  Timer,
  FileText,
  Save,
  Send
} from 'lucide-react'
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
    // Fetch customers, time entries, and business config in parallel
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

    // Pre-populate from quote
    if (fromQuoteId) {
      await loadFromQuote(fromQuoteId)
    }

    // Pre-populate from time entries for customer
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

  // When customer changes, load their ROT/RUT info
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

      // Set customer if not set
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
    const totals = calculateInvoiceTotals(items, 0, vatRate)

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
  const previewNumber = `${invoicePrefix}-${new Date().getFullYear()}-${String(nextNumber).padStart(3, '0')}`
  const previewOCR = generateOCR(String(nextNumber))

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {/* Time Entry Modal */}
      {showTimeEntries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Välj tidrapporter</h3>

            {timeEntries.length === 0 ? (
              <p className="text-gray-400 py-8 text-center">Inga ofakturerade tidrapporter</p>
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
                        className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                          selectedTimeEntries.includes(entryId)
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-gray-50 border-gray-200 hover:border-gray-300'
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
                          className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <p className="text-gray-900 font-medium">
                            {new Date(entry.work_date).toLocaleDateString('sv-SE')} - {hours.toFixed(1)}h
                          </p>
                          <p className="text-sm text-gray-500">
                            {entry.customer?.name || 'Ingen kund'} - {entry.description || 'Ingen beskrivning'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-gray-900 font-medium">{totalCost.toLocaleString('sv-SE')} kr</p>
                        </div>
                      </label>
                    )
                  })}
              </div>
            )}

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setShowTimeEntries(false); setSelectedTimeEntries([]) }}
                className="px-4 py-2 text-gray-500 hover:text-gray-900"
              >
                Avbryt
              </button>
              <button
                onClick={addTimeEntriesToInvoice}
                disabled={selectedTimeEntries.length === 0}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                Lägg till ({selectedTimeEntries.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/invoices" className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Ny faktura</h1>
              <p className="text-sm text-gray-500">
                Förhandsgranskning: {previewNumber} | OCR: {previewOCR}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTimeEntries(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-200"
            >
              <Timer className="w-4 h-4" />
              Från tidrapport
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || items.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Skapa faktura
            </button>
          </div>
        </div>

        {/* Layout: editor + sidebar */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Main editor */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Customer & basic settings */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Kund</label>
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">Välj kund...</option>
                    {customers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Betalningsvillkor</label>
                  <select
                    value={dueDays}
                    onChange={(e) => setDueDays(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value={10}>10 dagar</option>
                    <option value={15}>15 dagar</option>
                    <option value={20}>20 dagar</option>
                    <option value={30}>30 dagar</option>
                    <option value={45}>45 dagar</option>
                    <option value={60}>60 dagar</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Fakturadatum</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Momssats</label>
                  <select
                    value={vatRate}
                    onChange={(e) => setVatRate(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value={25}>25%</option>
                    <option value={12}>12%</option>
                    <option value={6}>6%</option>
                    <option value={0}>0% (momsfri)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Vår referens</label>
                  <input
                    type="text"
                    value={ourReference}
                    onChange={(e) => setOurReference(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Er referens</label>
                  <input
                    type="text"
                    value={yourReference}
                    onChange={(e) => setYourReference(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {/* ROT/RUT */}
              <div className="mt-4">
                <label className="block text-xs text-gray-400 mb-1">ROT/RUT-avdrag</label>
                <select
                  value={rotRutType}
                  onChange={(e) => setRotRutType(e.target.value)}
                  className="w-full max-w-xs px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="">Inget avdrag</option>
                  <option value="rot">ROT-avdrag (30%)</option>
                  <option value="rut">RUT-avdrag (50%)</option>
                </select>
              </div>
            </div>

            {/* Line items */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <LineItemEditor
                items={items}
                onChange={handleItemsChange}
                rotRutType={rotRutType || undefined}
              />
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="lg:w-80 flex-shrink-0">
            <div className="lg:sticky lg:top-8">
              <InvoiceSummary
                totals={totals}
                vatRate={vatRate}
                rotRutType={rotRutType || undefined}
                personalNumber={personalNumber}
                propertyDesignation={propertyDesignation}
                onFieldChange={handleFieldChange}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
