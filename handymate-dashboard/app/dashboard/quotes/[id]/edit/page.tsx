'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import ProductSearchModal from '@/components/ProductSearchModal'
import type { TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import type { QuotePreviewData } from '@/components/quotes/QuotePreview'
import { supabase } from '@/lib/supabase'
import {
  calculatePaymentPlan,
  generateItemId,
  recalculateItems,
} from '@/lib/quote-calculations'
import { getAllCategories } from '@/lib/constants/categories'
import {
  type DetailLevel,
  type PaymentPlanEntry,
  type QuoteItem,
  type QuoteStandardText,
} from '@/lib/types/quote'

import { useQuoteCalculations } from '../../_shared/useQuoteCalculations'
import { useQuoteItems } from '../../_shared/useQuoteItems'
import { usePriceListLookup } from '../../_shared/usePriceListLookup'
import { QuoteProductSearchModal } from '../../_shared/QuoteProductSearchModal'
import { ProductModal, type ProductInitialValues, type ProductSavePayload } from '@/components/products/ProductModal'

import { QuoteEditHeader } from './components/QuoteEditHeader'
import { QuoteEditCustomerSection } from './components/QuoteEditCustomerSection'
import { QuoteEditItemsSection } from './components/QuoteEditItemsSection'
import { QuoteEditRotSection } from './components/QuoteEditRotSection'
import { QuoteEditStandardTextsSection } from './components/QuoteEditStandardTextsSection'
import { QuoteEditPaymentPlanSection } from './components/QuoteEditPaymentPlanSection'
import { QuoteEditDisplaySettingsSection } from './components/QuoteEditDisplaySettingsSection'
import { QuoteEditTemplatePicker } from './components/QuoteEditTemplatePicker'
import { QuoteEditPreviewPanel } from './components/QuoteEditPreviewPanel'
import { QuoteEditTotalsSection } from './components/QuoteEditTotalsSection'
import { QuoteEditSaveTemplateModal } from './components/QuoteEditSaveTemplateModal'
import { QuoteEditMobilePreviewModal } from './components/QuoteEditMobilePreviewModal'

// ─── Types ───────────────────────────────────────────────────────────

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number?: string
  property_designation?: string
}

interface PricingSettings {
  hourly_rate: number
  callout_fee: number
  minimum_hours: number
  vat_rate: number
  rot_enabled: boolean
  rot_percent: number
  rut_enabled: boolean
  rut_percent: number
  payment_terms: number
  warranty_years: number
}

// ─── Helpers ─────────────────────────────────────────────────────────

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('sv-SE', {
    style: 'currency',
    currency: 'SEK',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Convert legacy AI/template items (type: labor/material/service) to new QuoteItem format */
function convertLegacyItems(
  legacyItems: Array<{
    id: string
    type: 'labor' | 'material' | 'service'
    name: string
    description?: string
    quantity: number
    unit: string
    unit_price: number
    total: number
  }>,
): QuoteItem[] {
  return legacyItems.map((item, idx) => ({
    id: generateItemId(),
    item_type: 'item' as const,
    description: item.name || item.description || '',
    quantity: item.quantity,
    unit: normalizeUnit(item.unit),
    unit_price: item.unit_price,
    total: item.quantity * item.unit_price,
    is_rot_eligible: item.type === 'labor',
    is_rut_eligible: false,
    sort_order: idx,
  }))
}

function normalizeUnit(unit: string): string {
  const map: Record<string, string> = {
    hour: 'tim',
    timmar: 'tim',
    h: 'tim',
    piece: 'st',
    styck: 'st',
  }
  return map[unit.toLowerCase()] || unit
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function EditQuotePage() {
  const router = useRouter()
  const params = useParams()
  const quoteId = (params as any)?.id as string
  const business = useBusiness()
  const toast = useToast()

  // ─── Loading / global state ─────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ─── Auto-save state ────────────────────────────────────────────────
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const formDataRef = useRef<any>(null)
  const initialLoadDone = useRef(false)
  const quoteNumberRef = useRef<string>('')

  // ─── Standard texts ────────────────────────────────────────────────
  const [allStandardTexts, setAllStandardTexts] = useState<QuoteStandardText[]>([])

  // ─── Form state ────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)
  const [quoteStatus, setQuoteStatus] = useState('draft')

  // ROT/RUT
  const [personnummer, setPersonnummer] = useState('')
  const [fastighetsbeteckning, setFastighetsbeteckning] = useState('')

  // Reference fields
  const [referencePerson, setReferencePerson] = useState('')
  const [customerReference, setCustomerReference] = useState('')
  const [projectAddress, setProjectAddress] = useState('')

  // Standard texts (form content)
  const [introductionText, setIntroductionText] = useState('')
  const [conclusionText, setConclusionText] = useState('')
  const [notIncluded, setNotIncluded] = useState('')
  const [ataTerms, setAtaTerms] = useState('')
  const [paymentTermsText, setPaymentTermsText] = useState('')

  // Payment plan
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanEntry[]>([])

  // Display settings
  const [detailLevel, setDetailLevel] = useState<DetailLevel>('detailed')
  const [showUnitPrices, setShowUnitPrices] = useState(true)
  const [showQuantities, setShowQuantities] = useState(true)
  const [showCategorySubtotals, setShowCategorySubtotals] = useState(false)

  // Template save modal
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Visuell stil
  const [templateStyle, setTemplateStyle] = useState<'modern' | 'premium' | 'friendly' | null>(null)
  const [businessDefaultStyle, setBusinessDefaultStyle] = useState<'modern' | 'premium' | 'friendly'>('modern')

  // Search modals
  const [showGrossistSearch, setShowGrossistSearch] = useState(false)
  const [showProductSearch, setShowProductSearch] = useState(false)

  // Spara-i-prislistan modal — vilken offertrad som ska sparas
  const [productModalRow, setProductModalRow] = useState<QuoteItem | null>(null)
  const [savingProduct, setSavingProduct] = useState(false)

  // Collapsible sections
  const [showStandardTexts, setShowStandardTexts] = useState(false)
  const [showPaymentPlan, setShowPaymentPlan] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)

  // Preview
  const [showPreviewPanel, setShowPreviewPanel] = useState(true)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [debouncedPreviewData, setDebouncedPreviewData] = useState<QuotePreviewData | null>(null)
  const [previewMode, setPreviewMode] = useState<'design' | 'compact'>('design')

  // ─── Shared hooks ──────────────────────────────────────────────────
  const { priceList, customCategories, hydrated: priceListHydrated } = usePriceListLookup(business.business_id)
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories])

  const vatRate = pricingSettings?.vat_rate ?? 25
  const { recalculated, totals, calculatedPaymentPlan, paymentPlanValid } = useQuoteCalculations(
    items,
    discountPercent,
    vatRate,
    paymentPlan,
  )

  const {
    addItem,
    updateItem,
    removeItem,
    moveItem,
    dndSensors,
    handleDragEnd,
    addFromGrossist,
    addFromPriceList,
  } = useQuoteItems(items, setItems, customCategories, !!pricingSettings)

  // ─── Derived: standard texts grouped by type ──────────────────────
  const textsByType = useMemo(() => {
    const map: Record<string, QuoteStandardText[]> = {
      introduction: [],
      conclusion: [],
      not_included: [],
      ata_terms: [],
      payment_terms: [],
    }
    for (const t of allStandardTexts) {
      if (map[t.text_type]) {
        map[t.text_type].push(t)
      }
    }
    return map
  }, [allStandardTexts])

  // ROT/RUT flags
  const hasRotItems = items.some(i => i.is_rot_eligible)
  const hasRutItems = items.some(i => i.is_rut_eligible)

  // ─── Debounced preview data ──────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      const selectedCust = customers.find(c => c.customer_id === selectedCustomer)
      setDebouncedPreviewData({
        title,
        customerName: selectedCust?.name || '',
        customerAddress: selectedCust?.address_line || '',
        validDays,
        items: recalculated,
        discountPercent,
        vatRate,
        introductionText,
        conclusionText,
        notIncluded,
        ataTerms,
        paymentPlan: calculatedPaymentPlan,
        referencePerson,
        customerReference,
        projectAddress,
        detailLevel,
        showUnitPrices,
        showQuantities,
        showCategorySubtotals,
        customCategories,
      })
    }, 500)
    return () => clearTimeout(timer)
  }, [
    title, selectedCustomer, customers, validDays, recalculated, discountPercent, vatRate,
    introductionText, conclusionText, notIncluded, ataTerms, calculatedPaymentPlan,
    referencePerson, customerReference, projectAddress, detailLevel, showUnitPrices,
    showQuantities, showCategorySubtotals, customCategories,
  ])

  // Payload till TemplatePreviewFrame
  const templatePreviewPayload: TemplatePreviewPayload = useMemo(() => {
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + (validDays || 30))
    return {
      quote: {
        quote_id: quoteId,
        quote_number: quoteNumberRef.current || undefined,
        title: title || 'Offert',
        status: quoteStatus,
        items: [],
        subtotal: totals.subtotal,
        discount_percent: discountPercent,
        discount_amount: totals.discountAmount,
        vat_rate: vatRate,
        vat_amount: totals.vat,
        total: totals.total,
        rot_work_cost: totals.rotWorkCost,
        rot_deduction: totals.rotDeduction,
        rot_customer_pays: totals.rotCustomerPays,
        rut_work_cost: totals.rutWorkCost,
        rut_deduction: totals.rutDeduction,
        rut_customer_pays: totals.rutCustomerPays,
        customer_pays: totals.rotCustomerPays || totals.rutCustomerPays || totals.total,
        valid_until: validUntil.toISOString().split('T')[0],
        introduction_text: introductionText || null,
        conclusion_text: conclusionText || null,
        not_included: notIncluded || null,
        ata_terms: ataTerms || null,
        payment_terms_text: paymentTermsText || null,
        reference_person: referencePerson || null,
        customer_reference: customerReference || null,
        project_address: projectAddress || null,
        detail_level: detailLevel,
        show_unit_prices: showUnitPrices,
        show_quantities: showQuantities,
        personnummer: personnummer || null,
        fastighetsbeteckning: fastighetsbeteckning || null,
        template_style: templateStyle,
      },
      quote_items: recalculated.map((it, idx) => ({ ...it, sort_order: idx })),
      customer_id: selectedCustomer || null,
      template_style: templateStyle,
    }
  }, [
    quoteId, title, quoteStatus, totals, validDays, discountPercent, vatRate,
    introductionText, conclusionText, notIncluded, ataTerms, paymentTermsText,
    referencePerson, customerReference, projectAddress, detailLevel,
    showUnitPrices, showQuantities, personnummer, fastighetsbeteckning,
    templateStyle, selectedCustomer, recalculated,
  ])

  // ═══════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!business.business_id || !quoteId) return
    fetchData()
    fetchStandardTexts()
    fetchQuote()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id, quoteId])

  async function fetchData() {
    const [customersApiRes, settingsRes] = await Promise.all([
      fetch('/api/customers').then(r => r.json()),
      supabase
        .from('business_config')
        .select('pricing_settings, quote_template_style')
        .eq('business_id', business.business_id)
        .single(),
    ])

    setCustomers(customersApiRes?.customers || customersApiRes?.data || [])
    const defaultStyle = settingsRes.data?.quote_template_style as 'modern' | 'premium' | 'friendly' | undefined
    if (defaultStyle && ['modern', 'premium', 'friendly'].includes(defaultStyle)) {
      setBusinessDefaultStyle(defaultStyle)
    }
    setPricingSettings(
      settingsRes.data?.pricing_settings || {
        hourly_rate: 650,
        callout_fee: 495,
        minimum_hours: 1,
        vat_rate: 25,
        rot_enabled: true,
        rot_percent: 30,
        rut_enabled: false,
        rut_percent: 50,
        payment_terms: 30,
        warranty_years: 2,
      },
    )
  }

  async function fetchStandardTexts() {
    try {
      const res = await fetch('/api/quote-standard-texts')
      if (!res.ok) return
      const data = await res.json()
      const texts: QuoteStandardText[] = data.texts || []
      setAllStandardTexts(texts)
    } catch {
      // silent
    }
  }

  async function fetchQuote() {
    try {
      const res = await fetch(`/api/quotes?quoteId=${quoteId}`)
      if (!res.ok) {
        toast.error('Kunde inte ladda offerten')
        router.push('/dashboard/quotes')
        return
      }
      const data = await res.json()
      const quote = data.quote

      setSelectedCustomer(quote.customer_id || '')
      setTitle(quote.title || '')
      setDescription(quote.description || '')
      setQuoteStatus(quote.status || 'draft')
      quoteNumberRef.current = quote.quote_number || ''

      if (quote.quote_items && quote.quote_items.length > 0) {
        const loadedItems: QuoteItem[] = quote.quote_items.map((item: any, idx: number) => ({
          id: item.id || generateItemId(),
          item_type: item.item_type || 'item',
          group_name: item.group_name || undefined,
          description: item.description || '',
          quantity: item.quantity || 0,
          unit: item.unit || 'st',
          unit_price: item.unit_price || 0,
          total: item.total || 0,
          cost_price: item.cost_price || undefined,
          article_number: item.article_number || undefined,
          is_rot_eligible: item.is_rot_eligible || false,
          is_rut_eligible: item.is_rut_eligible || false,
          category_slug: item.category_slug || undefined,
          linked_product_id: item.linked_product_id || undefined,
          sort_order: item.sort_order ?? idx,
        }))
        setItems(loadedItems)
      } else if (quote.items && Array.isArray(quote.items) && quote.items.length > 0) {
        setItems(convertLegacyItems(quote.items))
      }

      setIntroductionText(quote.introduction_text || '')
      setConclusionText(quote.conclusion_text || '')
      setNotIncluded(quote.not_included || '')
      setAtaTerms(quote.ata_terms || '')
      setPaymentTermsText(quote.payment_terms_text || '')

      const hasAnyStandardText =
        quote.introduction_text ||
        quote.conclusion_text ||
        quote.not_included ||
        quote.ata_terms ||
        quote.payment_terms_text
      if (!hasAnyStandardText) {
        loadDefaultStandardTexts()
      }

      if (quote.payment_plan && Array.isArray(quote.payment_plan) && quote.payment_plan.length > 0) {
        setPaymentPlan(quote.payment_plan)
        setShowPaymentPlan(true)
      }

      setReferencePerson(quote.reference_person || '')
      setCustomerReference(quote.customer_reference || '')
      setProjectAddress(quote.project_address || '')

      setDetailLevel(quote.detail_level || 'detailed')
      setShowUnitPrices(quote.show_unit_prices ?? true)
      setShowQuantities(quote.show_quantities ?? true)

      const qStyle = quote.template_style as 'modern' | 'premium' | 'friendly' | null | undefined
      if (qStyle && ['modern', 'premium', 'friendly'].includes(qStyle)) {
        setTemplateStyle(qStyle)
      }

      setPersonnummer(quote.personnummer || '')
      setFastighetsbeteckning(quote.fastighetsbeteckning || '')
      setDiscountPercent(quote.discount_percent || 0)

      if (quote.valid_until && quote.created_at) {
        const validUntilDate = new Date(quote.valid_until)
        const createdDate = new Date(quote.created_at)
        const diffMs = validUntilDate.getTime() - createdDate.getTime()
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
        if (diffDays > 0) {
          if (diffDays <= 14) setValidDays(14)
          else if (diffDays <= 30) setValidDays(30)
          else if (diffDays <= 60) setValidDays(60)
          else setValidDays(90)
        }
      }

      if (hasAnyStandardText) {
        setShowStandardTexts(true)
      }

      setLoading(false)
      setTimeout(() => {
        initialLoadDone.current = true
      }, 500)
    } catch (err) {
      console.error('Failed to load quote:', err)
      toast.error('Kunde inte ladda offerten')
      router.push('/dashboard/quotes')
    }
  }

  async function loadDefaultStandardTexts() {
    try {
      const res = await fetch('/api/quote-standard-texts')
      if (!res.ok) return
      const data = await res.json()
      const texts: QuoteStandardText[] = data.texts || []

      const defaultIntro = texts.find(t => t.text_type === 'introduction' && t.is_default)
      const defaultConclusion = texts.find(t => t.text_type === 'conclusion' && t.is_default)
      const defaultNotIncluded = texts.find(t => t.text_type === 'not_included' && t.is_default)
      const defaultAta = texts.find(t => t.text_type === 'ata_terms' && t.is_default)
      const defaultPayment = texts.find(t => t.text_type === 'payment_terms' && t.is_default)

      if (defaultIntro) setIntroductionText(defaultIntro.content)
      if (defaultConclusion) setConclusionText(defaultConclusion.content)
      if (defaultNotIncluded) setNotIncluded(defaultNotIncluded.content)
      if (defaultAta) setAtaTerms(defaultAta.content)
      if (defaultPayment) setPaymentTermsText(defaultPayment.content)
    } catch {
      // silent
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Auto-save
  // ═══════════════════════════════════════════════════════════════════

  const buildPayload = useCallback(
    (statusOverride?: string) => {
      const finalItems = recalculateItems(items).map((item, idx) => ({
        ...item,
        sort_order: idx,
      }))

      return {
        quote_id: quoteId,
        customer_id: selectedCustomer || null,
        status: statusOverride || quoteStatus,
        title,
        description,
        quote_items: finalItems,
        vat_rate: vatRate,
        discount_percent: discountPercent,
        introduction_text: introductionText || null,
        conclusion_text: conclusionText || null,
        not_included: notIncluded || null,
        ata_terms: ataTerms || null,
        payment_terms_text: paymentTermsText || null,
        payment_plan: paymentPlan.length > 0 ? calculatePaymentPlan(totals.total, paymentPlan) : null,
        reference_person: referencePerson || null,
        customer_reference: customerReference || null,
        project_address: projectAddress || null,
        detail_level: detailLevel,
        show_unit_prices: showUnitPrices,
        show_quantities: showQuantities,
        personnummer: hasRotItems || hasRutItems ? personnummer || null : null,
        fastighetsbeteckning: hasRotItems ? fastighetsbeteckning || null : null,
        valid_days: validDays,
        template_style: templateStyle,
      }
    },
    [
      quoteId, selectedCustomer, quoteStatus, title, description, items, vatRate,
      discountPercent, introductionText, conclusionText, notIncluded, ataTerms,
      paymentTermsText, paymentPlan, totals.total, referencePerson, customerReference,
      projectAddress, detailLevel, showUnitPrices, showQuantities, personnummer,
      fastighetsbeteckning, hasRotItems, hasRutItems, validDays, templateStyle,
    ],
  )

  useEffect(() => {
    if (initialLoadDone.current) {
      formDataRef.current = buildPayload()
    }
  }, [buildPayload])

  useEffect(() => {
    if (!initialLoadDone.current) return

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave()
    }, 5000)

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedCustomer, title, description, items, discountPercent, validDays,
    personnummer, fastighetsbeteckning, referencePerson, customerReference,
    projectAddress, introductionText, conclusionText, notIncluded, ataTerms,
    paymentTermsText, paymentPlan, detailLevel, showUnitPrices, showQuantities,
  ])

  useEffect(() => {
    function handleBeforeUnload() {
      if (formDataRef.current && initialLoadDone.current) {
        const payload = JSON.stringify(formDataRef.current)
        navigator.sendBeacon('/api/quotes', payload)
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])

  async function performAutoSave() {
    if (!initialLoadDone.current) return
    setAutoSaveStatus('saving')
    try {
      const payload = buildPayload()
      const res = await fetch('/api/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus('idle'), 3000)
      } else {
        setAutoSaveStatus('error')
      }
    } catch {
      setAutoSaveStatus('error')
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Payment plan handlers
  // ═══════════════════════════════════════════════════════════════════

  function addPaymentPlanEntry() {
    setPaymentPlan(prev => [...prev, { label: '', percent: 0, amount: 0, due_description: '' }])
  }

  function updatePaymentPlanEntry(index: number, field: keyof PaymentPlanEntry, value: any) {
    setPaymentPlan(prev => prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry)))
  }

  function removePaymentPlanEntry(index: number) {
    setPaymentPlan(prev => prev.filter((_, i) => i !== index))
  }

  // ═══════════════════════════════════════════════════════════════════
  // Spara i prislistan — POST /api/products + uppdatera linked_product_id
  // ═══════════════════════════════════════════════════════════════════

  async function saveItemToProducts(payload: ProductSavePayload) {
    if (!productModalRow) return
    setSavingProduct(true)
    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte spara i prislistan')
      } else {
        const newId = data.product?.id
        if (newId) {
          updateItem(productModalRow.id, 'linked_product_id', newId)
        }
        toast.success('Sparad i prislistan')
        setProductModalRow(null)
      }
    } catch (err) {
      console.error('Save to products failed:', err)
      toast.error('Kunde inte spara i prislistan')
    }
    setSavingProduct(false)
  }

  function buildProductInitialValues(row: QuoteItem): ProductInitialValues {
    return {
      name: row.description,
      unit: row.unit,
      sales_price: row.unit_price,
      purchase_price: row.cost_price ?? null,
      sku: row.article_number ?? null,
      category: row.category_slug || 'material_bygg',
      rot_eligible: row.is_rot_eligible,
      rut_eligible: row.is_rut_eligible,
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Save
  // ═══════════════════════════════════════════════════════════════════

  const saveQuote = async (send: boolean = false) => {
    if (send && !selectedCustomer) {
      toast.warning('Välj en kund först för att skicka offerten')
      return
    }

    if (paymentPlan.length > 0 && !paymentPlanValid) {
      toast.warning('Betalningsplanens procentsatser måste summera till 100%')
      return
    }

    setSaving(true)
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }

    try {
      const payload = buildPayload(send ? 'sent' : undefined)
      const res = await fetch('/api/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte spara offerten')
      } else {
        toast.success(send ? 'Offert skickad!' : 'Offert sparad')
        if (send) {
          router.push(`/dashboard/quotes/${quoteId}`)
        } else {
          setAutoSaveStatus('saved')
          setTimeout(() => setAutoSaveStatus('idle'), 3000)
        }
      }
    } catch (err) {
      console.error('Save failed:', err)
      toast.error('Kunde inte spara offerten')
    }
    setSaving(false)
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    try {
      await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description,
          default_items: recalculateItems(items),
          default_payment_plan: paymentPlan,
          introduction_text: introductionText || null,
          conclusion_text: conclusionText || null,
          not_included: notIncluded || null,
          ata_terms: ataTerms || null,
          payment_terms_text: paymentTermsText || null,
          detail_level: detailLevel,
          show_unit_prices: showUnitPrices,
          show_quantities: showQuantities,
          rot_enabled: hasRotItems,
          rut_enabled: hasRutItems,
        }),
      })
      toast.success('Mall sparad!')
      setShowSaveTemplateModal(false)
      setTemplateName('')
    } catch (err) {
      console.error('Failed to save template:', err)
      toast.error('Kunde inte spara mallen')
    }
    setSavingTemplate(false)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════

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
        <QuoteEditHeader quoteNumber={quoteNumberRef.current} autoSaveStatus={autoSaveStatus} />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(620px,46%)] gap-5 items-start">
          {/* ── Left Column — Form ─────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <QuoteEditCustomerSection
              customers={customers}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              validDays={validDays}
              setValidDays={setValidDays}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
            />

            <QuoteEditItemsSection
              items={items}
              recalculated={recalculated}
              allCategories={allCategories}
              customCategories={customCategories}
              priceList={priceList}
              dndSensors={dndSensors}
              onDragEnd={handleDragEnd}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onMoveItem={moveItem}
              onAddFromPriceList={addFromPriceList}
              onOpenProductSearch={() => setShowProductSearch(true)}
              onOpenGrossistSearch={() => setShowGrossistSearch(true)}
              onSaveToProducts={row => setProductModalRow(row)}
            />

            <QuoteEditRotSection
              items={items}
              setItems={setItems}
              hasRotItems={hasRotItems}
              personnummer={personnummer}
              setPersonnummer={setPersonnummer}
              fastighetsbeteckning={fastighetsbeteckning}
              setFastighetsbeteckning={setFastighetsbeteckning}
            />

            <QuoteEditStandardTextsSection
              open={showStandardTexts}
              setOpen={setShowStandardTexts}
              textsByType={textsByType}
              referencePerson={referencePerson}
              setReferencePerson={setReferencePerson}
              customerReference={customerReference}
              setCustomerReference={setCustomerReference}
              projectAddress={projectAddress}
              setProjectAddress={setProjectAddress}
              introductionText={introductionText}
              setIntroductionText={setIntroductionText}
              conclusionText={conclusionText}
              setConclusionText={setConclusionText}
              notIncluded={notIncluded}
              setNotIncluded={setNotIncluded}
              ataTerms={ataTerms}
              setAtaTerms={setAtaTerms}
              paymentTermsText={paymentTermsText}
              setPaymentTermsText={setPaymentTermsText}
            />

            <QuoteEditPaymentPlanSection
              open={showPaymentPlan}
              setOpen={setShowPaymentPlan}
              paymentPlan={paymentPlan}
              calculatedPaymentPlan={calculatedPaymentPlan}
              paymentPlanValid={paymentPlanValid}
              onAddEntry={addPaymentPlanEntry}
              onUpdateEntry={updatePaymentPlanEntry}
              onRemoveEntry={removePaymentPlanEntry}
              formatCurrency={formatCurrency}
            />

            <QuoteEditDisplaySettingsSection
              open={showDisplaySettings}
              setOpen={setShowDisplaySettings}
              detailLevel={detailLevel}
              setDetailLevel={setDetailLevel}
              showUnitPrices={showUnitPrices}
              setShowUnitPrices={setShowUnitPrices}
              showQuantities={showQuantities}
              setShowQuantities={setShowQuantities}
              showCategorySubtotals={showCategorySubtotals}
              setShowCategorySubtotals={setShowCategorySubtotals}
            />
          </div>

          {/* ── Right Column — Sidebar ─────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-1">
            <QuoteEditTemplatePicker
              quoteId={quoteId}
              templateStyle={templateStyle}
              setTemplateStyle={setTemplateStyle}
              businessDefaultStyle={businessDefaultStyle}
            />

            <QuoteEditPreviewPanel
              open={showPreviewPanel}
              setOpen={setShowPreviewPanel}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              templatePreviewPayload={templatePreviewPayload}
              debouncedPreviewData={debouncedPreviewData}
              businessName={business.business_name}
              contactName={business.contact_name}
            />

            <QuoteEditTotalsSection
              totals={totals}
              vatRate={vatRate}
              discountPercent={discountPercent}
              setDiscountPercent={setDiscountPercent}
              hasRotItems={hasRotItems}
              hasRutItems={hasRutItems}
              formatCurrency={formatCurrency}
            />

            {/* Action buttons */}
            <button
              onClick={() => saveQuote(true)}
              disabled={saving || !selectedCustomer}
              className="w-full inline-flex items-center justify-center gap-2 py-3 bg-primary-700 hover:bg-primary-600 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50 shadow-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? 'Sparar…' : 'Skicka offert'}
            </button>
            <button
              onClick={() => saveQuote(false)}
              disabled={saving}
              className="w-full py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition-colors disabled:opacity-50"
            >
              Spara utkast
            </button>
            {items.length > 0 && (
              <button
                onClick={() => { setTemplateName(title); setShowSaveTemplateModal(true) }}
                className="w-full py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-medium rounded-xl transition-colors"
              >
                Spara som mall
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Mobile preview button + modal */}
      <QuoteEditMobilePreviewModal
        open={showPreviewModal}
        setOpen={setShowPreviewModal}
        data={debouncedPreviewData}
        businessName={business.business_name}
        contactName={business.contact_name}
      />

      {/* Modals */}
      <ProductSearchModal
        isOpen={showGrossistSearch}
        onClose={() => setShowGrossistSearch(false)}
        onSelect={p => {
          addFromGrossist(p)
          setShowGrossistSearch(false)
        }}
        businessId={business.business_id}
      />

      <QuoteProductSearchModal
        open={showProductSearch}
        onClose={() => setShowProductSearch(false)}
        onSelect={p => {
          const newItem: QuoteItem = {
            id: generateItemId(),
            item_type: 'item',
            description: p.name,
            article_number: p.sku || undefined,
            quantity: 1,
            unit: p.unit || 'st',
            unit_price: p.sales_price,
            cost_price: p.purchase_price ?? undefined,
            total: p.sales_price,
            is_rot_eligible: !!p.rot_eligible,
            is_rut_eligible: !!p.rut_eligible,
            sort_order: items.length,
          }
          setItems(prev => [...prev, { ...newItem, sort_order: prev.length }])
        }}
      />

      {productModalRow && (
        <ProductModal
          product={null}
          initialValues={buildProductInitialValues(productModalRow)}
          title="Spara i prislistan"
          saving={savingProduct}
          onSave={saveItemToProducts}
          onClose={() => setProductModalRow(null)}
        />
      )}

      <QuoteEditSaveTemplateModal
        show={showSaveTemplateModal}
        onClose={() => setShowSaveTemplateModal(false)}
        templateName={templateName}
        setTemplateName={setTemplateName}
        saving={savingTemplate}
        onSave={saveAsTemplate}
      />
    </div>
  )
}
