'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  Save,
  AlertTriangle
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import { InvoiceItem, Invoice } from '@/lib/types/invoice'
import { calculateInvoiceTotals, recalculateItems } from '@/lib/invoice-calculations'
import LineItemEditor from '@/components/invoices/LineItemEditor'
import InvoiceSummary from '@/components/invoices/InvoiceSummary'
import Link from 'next/link'

export default function EditInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const toast = useToast()
  const invoiceId = params.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoice, setInvoice] = useState<Invoice | null>(null)

  // Form state
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [vatRate, setVatRate] = useState(25)
  const [rotRutType, setRotRutType] = useState<string>('')
  const [dueDate, setDueDate] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [ourReference, setOurReference] = useState('')
  const [yourReference, setYourReference] = useState('')
  const [introductionText, setIntroductionText] = useState('')
  const [conclusionText, setConclusionText] = useState('')
  const [personalNumber, setPersonalNumber] = useState('')
  const [propertyDesignation, setPropertyDesignation] = useState('')

  // Auto-save debounce
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  useEffect(() => {
    if (business.business_id && invoiceId) {
      fetchInvoice()
    }
  }, [business.business_id, invoiceId])

  // Auto-save with 5s debounce
  useEffect(() => {
    if (!hasUnsavedChanges || !invoice) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      handleSave(true)
    }, 5000)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [items, vatRate, rotRutType, dueDate, invoiceDate, ourReference, yourReference, introductionText, conclusionText, personalNumber, propertyDesignation, hasUnsavedChanges])

  async function fetchInvoice() {
    const { data, error } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email,
          address_line
        )
      `)
      .eq('invoice_id', invoiceId)
      .single()

    if (error || !data) {
      toast.error('Kunde inte hämta faktura')
      router.push('/dashboard/invoices')
      return
    }

    if (data.status !== 'draft') {
      toast.warning('Bara utkast kan redigeras')
      router.push(`/dashboard/invoices/${invoiceId}`)
      return
    }

    setInvoice(data)
    // Parse items – backwards compat: old items lack item_type
    const parsedItems: InvoiceItem[] = (data.items || []).map((item: any, i: number) => ({
      id: item.id || `legacy_${i}`,
      item_type: item.item_type || 'item',
      group_name: item.group_name,
      description: item.description || '',
      quantity: item.quantity || 0,
      unit: item.unit || 'st',
      unit_price: item.unit_price || 0,
      total: item.total || 0,
      is_rot_eligible: item.is_rot_eligible || false,
      is_rut_eligible: item.is_rut_eligible || false,
      sort_order: item.sort_order ?? i,
      type: item.type,
      cost_price: item.cost_price,
      article_number: item.article_number,
    }))
    setItems(parsedItems)
    setVatRate(data.vat_rate || 25)
    setRotRutType(data.rot_rut_type || '')
    setDueDate(data.due_date || '')
    setInvoiceDate(data.invoice_date || '')
    setOurReference(data.our_reference || '')
    setYourReference(data.your_reference || '')
    setIntroductionText(data.introduction_text || '')
    setConclusionText(data.conclusion_text || '')
    setPersonalNumber(data.personnummer || data.rot_personal_number || '')
    setPropertyDesignation(data.fastighetsbeteckning || data.rot_property_designation || '')
    setLoading(false)
  }

  const handleItemsChange = useCallback((newItems: InvoiceItem[]) => {
    setItems(newItems)
    setHasUnsavedChanges(true)
  }, [])

  const handleSave = async (silent = false) => {
    if (!invoice) return
    setSaving(true)
    setHasUnsavedChanges(false)

    const totals = calculateInvoiceTotals(items, 0, vatRate)

    try {
      const response = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: invoiceId,
          items,
          vat_rate: vatRate,
          rot_rut_type: rotRutType || null,
          due_date: dueDate,
          invoice_date: invoiceDate,
          our_reference: ourReference,
          your_reference: yourReference,
          introduction_text: introductionText,
          conclusion_text: conclusionText,
          personnummer: personalNumber,
          fastighetsbeteckning: propertyDesignation,
          subtotal: totals.subtotal,
          vat_amount: totals.vat,
          total: totals.total,
          rot_rut_deduction: rotRutType === 'rot' ? totals.rotDeduction : rotRutType === 'rut' ? totals.rutDeduction : 0,
          customer_pays: rotRutType === 'rot' ? totals.rotCustomerPays : rotRutType === 'rut' ? totals.rutCustomerPays : totals.total,
        })
      })

      if (!response.ok) throw new Error('Kunde inte spara')
      if (!silent) toast.success('Faktura sparad!')
    } catch {
      if (!silent) toast.error('Kunde inte spara faktura')
      setHasUnsavedChanges(true)
    } finally {
      setSaving(false)
    }
  }

  const handleFieldChange = (field: string, value: string) => {
    if (field === 'personalNumber') setPersonalNumber(value)
    if (field === 'propertyDesignation') setPropertyDesignation(value)
    setHasUnsavedChanges(true)
  }

  const totals = calculateInvoiceTotals(items, 0, vatRate)

  if (loading) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-teal-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <Link href={`/dashboard/invoices/${invoiceId}`} className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Redigera faktura #{invoice?.invoice_number}
              </h1>
              <p className="text-sm text-gray-500">
                {invoice?.customer?.name || 'Ingen kund'}
                {hasUnsavedChanges && <span className="ml-2 text-amber-500">Osparade ändringar</span>}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Spara
          </button>
        </div>

        {/* Layout: editor + sidebar */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Main editor */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Dates & references */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Fakturadatum</label>
                  <input
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => { setInvoiceDate(e.target.value); setHasUnsavedChanges(true) }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Förfallodatum</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => { setDueDate(e.target.value); setHasUnsavedChanges(true) }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Vår referens</label>
                  <input
                    type="text"
                    value={ourReference}
                    onChange={(e) => { setOurReference(e.target.value); setHasUnsavedChanges(true) }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Er referens</label>
                  <input
                    type="text"
                    value={yourReference}
                    onChange={(e) => { setYourReference(e.target.value); setHasUnsavedChanges(true) }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  />
                </div>
              </div>
            </div>

            {/* VAT & ROT/RUT */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Momssats</label>
                  <select
                    value={vatRate}
                    onChange={(e) => { setVatRate(Number(e.target.value)); setHasUnsavedChanges(true) }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  >
                    <option value={25}>25%</option>
                    <option value={12}>12%</option>
                    <option value={6}>6%</option>
                    <option value={0}>0% (momsfri)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">ROT/RUT-avdrag</label>
                  <select
                    value={rotRutType}
                    onChange={(e) => { setRotRutType(e.target.value); setHasUnsavedChanges(true) }}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                  >
                    <option value="">Inget avdrag</option>
                    <option value="rot">ROT-avdrag (30%)</option>
                    <option value="rut">RUT-avdrag (50%)</option>
                  </select>
                </div>
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
