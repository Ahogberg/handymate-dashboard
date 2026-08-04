'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import { InvoiceItem } from '@/lib/types/invoice'
import { recalculateItems, createDefaultInvoiceItem } from '@/lib/invoice-calculations'
import Link from 'next/link'
import { InvoiceEditor, type InvoiceEditorCustomer, type InvoiceStyle } from '../_shared/InvoiceEditor'

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

function toISODate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/**
 * ETAPP 6c (offert-masterplan.md, faktura-sprinten): tunn wrapper ovanpå
 * InvoiceEditor (_shared) — äger datahämtning (kunder, tidrapporter,
 * offert-import) och skapandet (POST /api/invoices). All redigeringsyta
 * (canvas, Mer-raden, summeringen) bor i InvoiceEditor, delad med
 * [id]/edit/page.tsx.
 */
export default function NewInvoicePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()
  const toast = useToast()

  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [customers, setCustomers] = useState<InvoiceEditorCustomer[]>([])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [defaultPaymentDays, setDefaultPaymentDays] = useState(30)

  // ─── Editor-state (kontrollerat, se InvoiceEditor) ──────────────────
  const [customerId, setCustomerId] = useState(searchParams?.get('customerId') || '')
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [vatRate, setVatRate] = useState(25)
  const [rotRutType, setRotRutType] = useState('')
  const [personalNumber, setPersonalNumber] = useState('')
  const [propertyDesignation, setPropertyDesignation] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(toISODate(new Date()))
  const [dueDate, setDueDate] = useState('')
  const [ourReference, setOurReference] = useState('')
  const [yourReference, setYourReference] = useState('')
  const [introductionText, setIntroductionText] = useState('')
  const [conclusionText, setConclusionText] = useState('')
  const [templateStyle, setTemplateStyle] = useState<InvoiceStyle | null>(null)

  // Förfallodatum sätts en gång från fakturadatum + företagets standard —
  // rörs sedan fritt av kortet/dokumentets EditableDate (samma modell som
  // offertens validDays, fast som ett absolut datum istället för ett antal
  // dagar — se InvoiceEditor-kommentaren).
  const dueDateInitialized = useRef(false)

  // Time entry selection modal
  const [selectedTimeEntries, setSelectedTimeEntries] = useState<string[]>([])
  const [showTimeEntries, setShowTimeEntries] = useState(false)

  const fromQuoteId = searchParams?.get('fromQuote')
  const fromTimeEntriesCustomer = searchParams?.get('fromTimeEntries')

  useEffect(() => {
    if (business.business_id) fetchData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id])

  async function fetchData() {
    const [customersApiRes, timeRes, configRes] = await Promise.all([
      fetch('/api/customers').then(r => r.json()),
      supabase
        .from('time_entry')
        .select(`*, customer:customer_id (name)`)
        .eq('business_id', business.business_id)
        .is('invoice_id', null)
        .order('work_date', { ascending: false }),
      supabase
        .from('business_config')
        .select('default_payment_days')
        .eq('business_id', business.business_id)
        .single(),
    ])

    setCustomers(customersApiRes?.customers || customersApiRes?.data || [])
    setTimeEntries(timeRes.data || [])
    const paymentDays = configRes.data?.default_payment_days || 30
    setDefaultPaymentDays(paymentDays)

    // Förfallodatum sätts EN gång, HÄR (inte i en separat effekt beroende
    // på defaultPaymentDays) — annars hinner ett effekt-varv köra med
    // 30-dagars-defaulten INNAN business_config svarat, och den låsta
    // dueDateInitialized-ref:en blockerar sedan omräkning med rätt värde.
    if (!dueDateInitialized.current) {
      dueDateInitialized.current = true
      const d = new Date(invoiceDate + 'T00:00:00')
      d.setDate(d.getDate() + paymentDays)
      setDueDate(toISODate(d))
    }

    if (fromQuoteId) await loadFromQuote(fromQuoteId)
    if (fromTimeEntriesCustomer) setCustomerId(fromTimeEntriesCustomer)

    setLoading(false)
  }

  async function loadFromQuote(quoteId: string) {
    try {
      const res = await fetch(`/api/invoices/from-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quote_id: quoteId, dry_run: true }),
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
      // Tyst — hantverkaren kan lägga till rader manuellt
    }
  }

  useEffect(() => {
    if (!customerId) return
    const customer = customers.find(c => c.customer_id === customerId)
    if (customer?.personal_number) setPersonalNumber(customer.personal_number)
    if (customer?.property_designation) setPropertyDesignation(customer.property_designation)
  }, [customerId, customers])

  function addTimeEntriesToInvoice() {
    const selected = timeEntries.filter(te => selectedTimeEntries.includes(te.time_entry_id || te.entry_id || ''))
    const newItems: InvoiceItem[] = []

    for (const entry of selected) {
      const hours = entry.hours_worked || (entry.duration_minutes ? entry.duration_minutes / 60 : 0)
      const rate = entry.hourly_rate || 500
      const laborItem = createDefaultInvoiceItem('item', items.length + newItems.length)
      newItems.push({
        ...laborItem,
        description: entry.description || `Arbete ${new Date(entry.work_date).toLocaleDateString('sv-SE')}`,
        quantity: Math.round(hours * 100) / 100,
        unit: 'timmar',
        unit_price: rate,
        total: Math.round(hours * rate * 100) / 100,
        type: 'labor',
        is_rot_eligible: rotRutType === 'rot',
        is_rut_eligible: rotRutType === 'rut',
      })

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

      if (!customerId && entry.customer_id) setCustomerId(entry.customer_id)
    }

    setItems(prev => recalculateItems([...prev, ...newItems]))
    setShowTimeEntries(false)
    setSelectedTimeEntries([])
  }

  async function handleCreate() {
    if (items.length === 0) {
      toast.warning('Lägg till minst en rad')
      return
    }
    setCreating(true)
    try {
      const invoiceDateObj = new Date(invoiceDate + 'T00:00:00')
      const dueDateObj = dueDate ? new Date(dueDate + 'T00:00:00') : null
      const dueDays = dueDateObj
        ? Math.round((dueDateObj.getTime() - invoiceDateObj.getTime()) / 86400000)
        : defaultPaymentDays

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
          introduction_text: introductionText || null,
          conclusion_text: conclusionText || null,
          template_style: templateStyle,
          time_entry_ids: selectedTimeEntries.length > 0 ? selectedTimeEntries : undefined,
          quote_id: fromQuoteId || undefined,
        }),
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

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  const sourceInfo = (fromQuoteId || timeEntries.length > 0) && (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
      {fromQuoteId ? (
        <div className="px-3 py-2.5 border border-primary-200 rounded-xl bg-primary-50">
          <div className="text-xs font-semibold text-slate-900">Importerad från offert</div>
          <div className="text-xs text-slate-500 mt-0.5">Rader hämtade automatiskt — redigera fritt nedan.</div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowTimeEntries(true)}
          className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-left hover:border-primary-700 hover:bg-primary-50 transition-colors"
        >
          <div className="text-xs font-semibold text-slate-900">Från tidrapport</div>
          <div className="text-xs text-slate-500 mt-0.5">Fakturera {timeEntries.length} ofakturerade tidrapporter</div>
        </button>
      )}
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50">
      {showTimeEntries && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="bg-white rounded-2xl px-6 py-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <span className="font-heading text-base font-bold text-slate-900">Välj tidrapporter</span>
              <button
                type="button"
                onClick={() => { setShowTimeEntries(false); setSelectedTimeEntries([]) }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {timeEntries.filter(te => !customerId || te.customer_id === customerId).length === 0 ? (
              <p className="text-slate-400 py-8 text-center text-sm">Inga ofakturerade tidrapporter</p>
            ) : (
              <div className="space-y-2">
                {timeEntries
                  .filter(te => !customerId || te.customer_id === customerId)
                  .map(entry => {
                    const entryId = entry.time_entry_id || entry.entry_id || ''
                    const hours = entry.hours_worked || (entry.duration_minutes ? entry.duration_minutes / 60 : 0)
                    const laborCost = hours * (entry.hourly_rate || 500)
                    const totalCost = laborCost + (entry.materials_cost || 0)

                    return (
                      <label
                        key={entryId}
                        className={`flex items-center gap-4 p-3.5 rounded-xl border cursor-pointer transition-all ${
                          selectedTimeEntries.includes(entryId)
                            ? 'bg-primary-50 border-primary-700'
                            : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTimeEntries.includes(entryId)}
                          onChange={e => {
                            setSelectedTimeEntries(prev =>
                              e.target.checked ? [...prev, entryId] : prev.filter(id => id !== entryId),
                            )
                          }}
                          className="w-4 h-4 rounded border-slate-300 text-primary-700 focus:ring-primary-600"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-slate-900">
                            {new Date(entry.work_date).toLocaleDateString('sv-SE')} — {hours.toFixed(1)}h
                          </p>
                          <p className="text-xs text-slate-500">{entry.customer?.name || 'Ingen kund'} — {entry.description || 'Ingen beskrivning'}</p>
                        </div>
                        <div className="text-sm font-medium text-slate-900">{totalCost.toLocaleString('sv-SE')} kr</div>
                      </label>
                    )
                  })}
              </div>
            )}

            <div className="flex gap-2 mt-6 pt-5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setShowTimeEntries(false); setSelectedTimeEntries([]) }}
                className="px-4 py-2.5 text-slate-600 border border-slate-200 rounded-xl text-sm font-semibold hover:bg-slate-50"
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={addTimeEntriesToInvoice}
                disabled={selectedTimeEntries.length === 0}
                className="flex-1 py-2.5 bg-primary-700 hover:bg-primary-600 text-white rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                Lägg till ({selectedTimeEntries.length})
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex items-center mb-5">
          <Link href="/dashboard/invoices" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            ← Fakturor
          </Link>
          <span className="font-heading text-lg font-bold text-slate-900 ml-3">Ny faktura</span>
        </div>

        <InvoiceEditor
          mode="new"
          customers={customers}
          customerId={customerId}
          setCustomerId={setCustomerId}
          items={items}
          setItems={setItems}
          vatRate={vatRate}
          setVatRate={setVatRate}
          rotRutType={rotRutType}
          setRotRutType={setRotRutType}
          personalNumber={personalNumber}
          setPersonalNumber={setPersonalNumber}
          propertyDesignation={propertyDesignation}
          setPropertyDesignation={setPropertyDesignation}
          invoiceDate={invoiceDate}
          setInvoiceDate={setInvoiceDate}
          dueDate={dueDate}
          setDueDate={setDueDate}
          ourReference={ourReference}
          setOurReference={setOurReference}
          yourReference={yourReference}
          setYourReference={setYourReference}
          introductionText={introductionText}
          setIntroductionText={setIntroductionText}
          conclusionText={conclusionText}
          setConclusionText={setConclusionText}
          templateStyle={templateStyle}
          setTemplateStyle={setTemplateStyle}
          saving={creating}
          onSave={handleCreate}
          saveLabel="Skapa faktura"
          savingLabel="Skapar…"
          sourceInfo={sourceInfo}
        />
      </div>
    </div>
  )
}
