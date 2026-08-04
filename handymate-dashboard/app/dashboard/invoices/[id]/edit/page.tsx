'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import { InvoiceItem, Invoice } from '@/lib/types/invoice'
import { calculateInvoiceTotals } from '@/lib/invoice-calculations'
import Link from 'next/link'
import { InvoiceEditor, type InvoiceEditorCustomer, type InvoiceStyle } from '../../_shared/InvoiceEditor'

/**
 * ETAPP 6c (offert-masterplan.md, faktura-sprinten): tunn wrapper ovanpå
 * InvoiceEditor (_shared) — speglar new/page.tsx men laddar en befintlig
 * (draft-)faktura + autosparar. Endast utkast kan redigeras (oförändrat
 * beteende — se fetchInvoice).
 */
export default function EditInvoicePage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const toast = useToast()
  const invoiceId = (params as any)?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [customers, setCustomers] = useState<InvoiceEditorCustomer[]>([])

  const [customerId, setCustomerId] = useState('')
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [vatRate, setVatRate] = useState(25)
  const [rotRutType, setRotRutType] = useState('')
  const [personalNumber, setPersonalNumber] = useState('')
  const [propertyDesignation, setPropertyDesignation] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [ourReference, setOurReference] = useState('')
  const [yourReference, setYourReference] = useState('')
  const [introductionText, setIntroductionText] = useState('')
  const [conclusionText, setConclusionText] = useState('')
  const [templateStyle, setTemplateStyle] = useState<InvoiceStyle | null>(null)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const initialLoadDone = useRef(false)

  useEffect(() => {
    if (business.business_id && invoiceId) {
      fetchInvoice()
      fetchCustomers()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id, invoiceId])

  async function fetchCustomers() {
    try {
      const res = await fetch('/api/customers')
      const data = await res.json()
      setCustomers(data?.customers || [])
    } catch {
      // silent — kundlistan är inte kritisk för att redigera fakturarader
    }
  }

  async function fetchInvoice() {
    const { data, error } = await supabase
      .from('invoice')
      .select(`*, customer:customer_id ( customer_id, name, phone_number, email, address_line )`)
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
      performed_by_name: item.performed_by_name ?? null,
    }))
    setItems(parsedItems)
    setCustomerId(data.customer_id || '')
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
    const style = data.template_style as InvoiceStyle | null | undefined
    if (style && ['modern', 'premium', 'friendly'].includes(style)) setTemplateStyle(style)
    setLoading(false)
    setTimeout(() => { initialLoadDone.current = true }, 500)
  }

  const buildPayload = useCallback(
    () => ({
      invoice_id: invoiceId,
      customer_id: customerId || null,
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
      template_style: templateStyle,
    }),
    [
      invoiceId, customerId, items, vatRate, rotRutType, dueDate, invoiceDate,
      ourReference, yourReference, introductionText, conclusionText,
      personalNumber, propertyDesignation, templateStyle,
    ],
  )

  const handleSave = useCallback(async (silent = false) => {
    if (!invoice) return
    setSaving(true)
    setHasUnsavedChanges(false)

    const totals = calculateInvoiceTotals(items, 0, vatRate)

    try {
      const response = await fetch('/api/invoices', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildPayload(),
          subtotal: totals.subtotal,
          vat_amount: totals.vat,
          total: totals.total,
          rot_rut_deduction: rotRutType === 'rot' ? totals.rotDeduction : rotRutType === 'rut' ? totals.rutDeduction : 0,
          customer_pays: rotRutType === 'rot' ? totals.rotCustomerPays : rotRutType === 'rut' ? totals.rutCustomerPays : totals.total,
        }),
      })

      if (!response.ok) throw new Error('Kunde inte spara')
      if (!silent) toast.success('Faktura sparad!')
    } catch {
      if (!silent) toast.error('Kunde inte spara faktura')
      setHasUnsavedChanges(true)
    } finally {
      setSaving(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice, items, vatRate, rotRutType, buildPayload])

  // Auto-save — 5s debounce, samma mönster som tidigare (utökat med de nya
  // fälten: referenser/texter/stil rör nu också hasUnsavedChanges).
  useEffect(() => {
    if (!initialLoadDone.current) return
    setHasUnsavedChanges(true)
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { handleSave(true) }, 5000)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    customerId, items, vatRate, rotRutType, dueDate, invoiceDate, ourReference,
    yourReference, introductionText, conclusionText, personalNumber,
    propertyDesignation, templateStyle,
  ])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-primary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="flex items-center justify-between gap-4 mb-5">
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/invoices/${invoiceId}`} className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="font-heading text-lg font-bold text-slate-900">
                Redigera faktura #{invoice?.invoice_number}
              </h1>
              <p className="text-xs text-slate-500">
                {invoice?.customer?.name || 'Ingen kund'}
                {hasUnsavedChanges && <span className="ml-2 text-amber-600">Osparade ändringar</span>}
                {saving && <span className="ml-2 text-slate-400">Sparar…</span>}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleSave(false)}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-700 hover:bg-primary-600 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Spara
          </button>
        </div>

        <InvoiceEditor
          mode="edit"
          invoiceId={invoiceId}
          invoiceNumber={invoice?.invoice_number}
          ocrNumber={invoice?.ocr_number}
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
          saving={saving}
          onSave={() => handleSave(false)}
          saveLabel="Spara"
          savingLabel="Sparar…"
        />
      </div>
    </div>
  )
}
