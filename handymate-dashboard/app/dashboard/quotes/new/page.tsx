'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import ProductSearchModal from '@/components/ProductSearchModal'
import type { TemplatePreviewPayload } from '@/components/quotes/TemplatePreviewFrame'
import type { QuotePreviewData } from '@/components/quotes/QuotePreview'
import type { QuoteTemplateData } from '@/lib/quote-templates/types'
import { generateItemId, recalculateItems } from '@/lib/quote-calculations'
import { getAllCategories, type CustomCategory } from '@/lib/constants/categories'
import {
  type DetailLevel,
  type PaymentPlanEntry,
  type QuoteItem,
  type QuoteStandardText,
  type QuoteTemplate,
} from '@/lib/types/quote'

import { useQuoteCalculations } from '../_shared/useQuoteCalculations'
import { useQuoteItems } from '../_shared/useQuoteItems'
import { usePriceListLookup } from '../_shared/usePriceListLookup'
import { QuoteProductSearchModal, type ProductSearchResult } from '../_shared/QuoteProductSearchModal'

// Återanvända komponenter från edit-sprinten
import { QuoteEditRotSection } from '../[id]/edit/components/QuoteEditRotSection'
import { QuoteEditStandardTextsSection } from '../[id]/edit/components/QuoteEditStandardTextsSection'
import { QuoteEditPaymentPlanSection } from '../[id]/edit/components/QuoteEditPaymentPlanSection'
import { QuoteEditDisplaySettingsSection } from '../[id]/edit/components/QuoteEditDisplaySettingsSection'
import { QuoteEditTotalsSection } from '../[id]/edit/components/QuoteEditTotalsSection'
import { QuoteEditMobilePreviewModal } from '../[id]/edit/components/QuoteEditMobilePreviewModal'
import { QuoteEditSaveTemplateModal } from '../[id]/edit/components/QuoteEditSaveTemplateModal'

// Nya komponenter unika för new-vyn
import { QuoteNewHeader } from './components/QuoteNewHeader'
import { QuoteNewAIHelper } from './components/QuoteNewAIHelper'
import { QuoteNewCustomerSection } from './components/QuoteNewCustomerSection'
import { QuoteNewItemsSection } from './components/QuoteNewItemsSection'
import { QuoteNewAttachmentsCard } from './components/QuoteNewAttachmentsCard'
import { QuoteNewTemplatePanel } from './components/QuoteNewTemplatePanel'
import { QuoteNewPreviewPanel } from './components/QuoteNewPreviewPanel'
import { QuoteNewPriceWarningsBanner } from './components/QuoteNewPriceWarningsBanner'

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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT — orchestrator
// ═══════════════════════════════════════════════════════════════════════════════

export default function NewQuotePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()
  const toast = useToast()

  // ─── Loading / global state ─────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  // ─── Standard texts ────────────────────────────────────────────────
  const [allStandardTexts, setAllStandardTexts] = useState<QuoteStandardText[]>([])

  // ─── AI state ──────────────────────────────────────────────────────
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null)
  const [sourceTranscript, setSourceTranscript] = useState<string | null>(null)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [aiTextInput, setAiTextInput] = useState('')
  const [aiConfidence, setAiConfidence] = useState<number | null>(null)
  const [photos, setPhotos] = useState<string[]>([])
  const [photoDescription, setPhotoDescription] = useState('')
  const [showAiHelper, setShowAiHelper] = useState(false)
  const [aiPriceWarning, setAiPriceWarning] = useState<{ message: string; link: string } | null>(null)
  const [aiPhotoCount, setAiPhotoCount] = useState(0)
  const MAX_PHOTOS = 5

  // ─── Form state ────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)

  // Customer price list info
  const [customerPriceListInfo, setCustomerPriceListInfo] = useState<{
    name: string
    segment?: string
    contractType?: string
    hourlyRate?: number
    materialMarkup?: number
    calloutFee?: number
    items?: { name: string; unit: string; price: number; category_slug?: string; is_rot_eligible?: boolean; is_rut_eligible?: boolean }[]
  } | null>(null)

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
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)

  // Visuell stil
  const [templateStyle, setTemplateStyle] = useState<'modern' | 'premium' | 'friendly' | null>(null)
  const [businessDefaultStyle, setBusinessDefaultStyle] = useState<'modern' | 'premium' | 'friendly'>('modern')

  // Modals & search
  const [showGrossistSearch, setShowGrossistSearch] = useState(false)
  const [showProductSearch, setShowProductSearch] = useState(false)

  // Collapsible sections
  const [showStandardTexts, setShowStandardTexts] = useState(false)
  const [showPaymentPlan, setShowPaymentPlan] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)

  // Custom categories — inline create
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<string | null>(null)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')

  // Attachments
  const [attachments, setAttachments] = useState<{ name: string; url: string; size?: number }[]>([])
  const [priceWarnings, setPriceWarnings] = useState<Array<{ product_name: string; quote_price: number; normal_price: number; supplier_name: string; difference_pct: number }>>([])
  const [priceAlts, setPriceAlts] = useState<Array<{ product_name: string; cheaper_supplier: string; cheaper_price: number; savings_pct: number }>>([])
  const [uploadingFile, setUploadingFile] = useState(false)

  // Template panel + preview
  const [showTemplatePanel, setShowTemplatePanel] = useState(false)
  const [showPreviewPanel, setShowPreviewPanel] = useState(true)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [previewMode, setPreviewMode] = useState<'live' | 'design' | 'compact'>('live')
  const [debouncedPreviewData, setDebouncedPreviewData] = useState<QuotePreviewData | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Shared hooks ──────────────────────────────────────────────────
  const {
    priceList,
    customCategories,
    hydrated: priceListHydrated,
  } = usePriceListLookup(business.business_id)

  // Custom categories är lokalt state eftersom vi tillåter inline-skapande;
  // initieras från hook-resultatet när det finns
  const [localCustomCategories, setLocalCustomCategories] = useState<CustomCategory[]>([])
  useEffect(() => {
    if (priceListHydrated) setLocalCustomCategories(customCategories)
  }, [priceListHydrated, customCategories])

  const allCategories = useMemo(
    () => getAllCategories(localCustomCategories),
    [localCustomCategories],
  )

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
  } = useQuoteItems(items, setItems, localCustomCategories, !!pricingSettings)

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
      if (map[t.text_type]) map[t.text_type].push(t)
    }
    return map
  }, [allStandardTexts])

  const hasRotItems = items.some(i => i.is_rot_eligible)
  const hasRutItems = items.some(i => i.is_rut_eligible)

  const selectedCustomerObj = useMemo(
    () => customers.find(c => c.customer_id === selectedCustomer) || null,
    [customers, selectedCustomer],
  )

  // ─── Custom category creation (new-vyn unique) ────────────────────
  async function createCustomCategory(label: string, itemId: string) {
    const slug =
      'custom_' + label.toLowerCase().replace(/[^a-zåäö0-9]/g, '_').replace(/_+/g, '_')
    const { data, error } = await supabase
      .from('custom_quote_categories')
      .insert({
        business_id: business.business_id,
        slug,
        label,
        rot_eligible: false,
        rut_eligible: false,
      })
      .select('*')
      .single()
    if (error) {
      toast.error('Kunde inte skapa kategori')
      return
    }
    const newCat = data as CustomCategory
    setLocalCustomCategories(prev => [...prev, newCat])
    updateItem(itemId, 'category_slug', newCat.slug)
    setShowNewCategoryInput(null)
    setNewCategoryLabel('')
  }

  // ─── Debounced QuotePreview data ─────────────────────────────────
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    previewTimerRef.current = setTimeout(() => {
      setDebouncedPreviewData({
        title,
        customerName: selectedCustomerObj?.name || '',
        customerAddress: selectedCustomerObj?.address_line || '',
        validDays,
        items,
        discountPercent,
        vatRate,
        introductionText,
        conclusionText,
        notIncluded,
        ataTerms,
        paymentPlan,
        referencePerson,
        customerReference,
        projectAddress,
        detailLevel,
        showUnitPrices,
        showQuantities,
        showCategorySubtotals,
        customCategories: localCustomCategories,
      })
    }, 300)
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current)
    }
  }, [
    title, selectedCustomerObj, validDays, items, discountPercent, vatRate,
    introductionText, conclusionText, notIncluded, ataTerms, paymentPlan,
    referencePerson, customerReference, projectAddress, detailLevel, showUnitPrices, showQuantities,
    showCategorySubtotals, localCustomCategories,
  ])

  // ─── TemplatePreviewFrame payload ────────────────────────────────
  const dealIdFromQuery = searchParams?.get('deal_id') || searchParams?.get('lead_id') || null
  const templatePreviewPayload: TemplatePreviewPayload = useMemo(() => {
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + (validDays || 30))
    const subtotalRaw = items.reduce((sum, it: any) => sum + ((it.quantity || 0) * (it.unit_price || 0)), 0)
    const discountAmount = subtotalRaw * (discountPercent / 100)
    const subtotal = subtotalRaw - discountAmount
    const vatAmount = subtotal * (vatRate / 100)
    const total = subtotal + vatAmount
    return {
      quote: {
        title: title || 'Offert',
        description: null,
        status: 'draft',
        items: [],
        subtotal,
        discount_percent: discountPercent,
        discount_amount: discountAmount,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
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
      quote_items: items.map((it, idx) => ({ ...it, sort_order: idx })),
      customer_id: selectedCustomer || null,
      deal_id: dealIdFromQuery,
      template_style: templateStyle,
    }
  }, [
    title, selectedCustomer, validDays, items, discountPercent, vatRate,
    introductionText, conclusionText, notIncluded, ataTerms, paymentTermsText,
    referencePerson, customerReference, projectAddress, detailLevel,
    showUnitPrices, showQuantities, personnummer, fastighetsbeteckning,
    templateStyle, dealIdFromQuery,
  ])

  // ─── Live ModernCanvas data ──────────────────────────────────────
  const liveTemplateData: QuoteTemplateData = useMemo(() => {
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + (validDays || 30))
    const subtotalRaw = items.reduce((sum, it: any) => sum + ((it.quantity || 0) * (it.unit_price || 0)), 0)
    const discountAmount = subtotalRaw * (discountPercent / 100)
    const subtotalExVat = subtotalRaw - discountAmount
    const vatAmount = subtotalExVat * (vatRate / 100)
    const totalIncVat = subtotalExVat + vatAmount
    const formatDate = (d: Date) =>
      d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })

    return {
      business: {
        name: business.business_name || 'Företag',
        orgNumber: (business as any).org_number || '',
        address: (business as any).address || '',
        contactName: business.contact_name || '',
        phone: (business as any).phone_number || '',
        email: business.contact_email || '',
        website: (business as any).website || null,
        bankgiro: (business as any).bankgiro || null,
        plusgiro: (business as any).plusgiro || null,
        swish: (business as any).swish_number || null,
        fSkatt: !!(business as any).f_skatt_registered,
        momsRegnr: (business as any).vat_number || null,
        accentColor: (business as any).accent_color || '#0F766E',
        logoUrl: (business as any).logo_url || null,
        tagline: (business as any).tagline || (business as any).service_area || null,
      },
      customer: {
        name: selectedCustomerObj?.name || 'Kund',
        address: selectedCustomerObj?.address_line || null,
        postalCode: null,
        city: null,
        phone: selectedCustomerObj?.phone_number || null,
        email: selectedCustomerObj?.email || null,
        personnummer: personnummer || null,
        reference: customerReference || null,
      },
      quote: {
        number: 'PREVIEW',
        dealNumber: null,
        issuedDate: formatDate(new Date()),
        validUntilDate: formatDate(validUntil),
        title: title || 'Offert',
        description: null,
        items: items
          .filter((i: any) => (i.item_type || 'item') === 'item')
          .map((i: any) => ({
            name: i.description || '',
            description: null,
            quantity: Number(i.quantity || 0),
            unit: i.unit || 'st',
            unitPrice: Number(i.unit_price || 0),
            total: Number(i.total || 0),
            isRotEligible: !!i.is_rot_eligible,
            isRutEligible: !!i.is_rut_eligible,
          })),
        subtotalExVat,
        vatAmount,
        totalIncVat,
        amountToPay: totalIncVat,
        paymentTerms: paymentTermsText || '30 dagar netto',
        warrantyText: null,
        introductionText: introductionText || null,
        conclusionText: conclusionText || null,
        notIncluded: notIncluded || null,
      },
    }
  }, [business, selectedCustomerObj, title, items, validDays, discountPercent, vatRate, paymentTermsText, introductionText, conclusionText, notIncluded, personnummer, customerReference])

  const liveAvailable = (templateStyle || businessDefaultStyle) === 'modern'

  const liveHandlers = useMemo(
    () => ({
      onTitleChange: setTitle,
      onIntroChange: setIntroductionText,
      onCustomerNameChange: undefined,
      onPaymentTermsChange: setPaymentTermsText,
      onItemChange: (idx: number, updated: any) => {
        const itemRows = items.filter((i: any) => (i.item_type || 'item') === 'item')
        const target = itemRows[idx]
        if (!target) return
        setItems(prev =>
          prev.map(it =>
            it.id === target.id
              ? {
                  ...it,
                  description: updated.name,
                  quantity: updated.quantity,
                  unit_price: updated.unitPrice,
                  total: updated.total,
                }
              : it,
          ),
        )
      },
      onItemAdd: () => {
        const newItem: QuoteItem = {
          id: 'tmp_' + Math.random().toString(36).slice(2, 10),
          item_type: 'item',
          description: '',
          quantity: 1,
          unit: 'st',
          unit_price: 0,
          total: 0,
          is_rot_eligible: false,
          is_rut_eligible: false,
          sort_order: items.length,
        }
        setItems(prev => [...prev, newItem])
      },
      onItemRemove: (idx: number) => {
        const itemRows = items.filter((i: any) => (i.item_type || 'item') === 'item')
        const target = itemRows[idx]
        if (!target) return
        setItems(prev => prev.filter(it => it.id !== target.id))
      },
    }),
    [items],
  )

  // ═══════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!business.business_id) return
    fetchData()
    fetchStandardTexts()

    const transcript = searchParams?.get('transcript')
    const customerId = searchParams?.get('customerId') || searchParams?.get('customer_id')
    const prefillTitle = searchParams?.get('title')
    const dealId = searchParams?.get('deal_id') || searchParams?.get('lead_id')
    if (transcript) {
      setSourceTranscript(transcript)
      setAiTextInput(transcript)
      setShowAiHelper(true)
    }
    if (customerId) setSelectedCustomer(customerId)
    if (prefillTitle) setTitle(prefillTitle)
    if (!referencePerson && business.contact_name) setReferencePerson(business.contact_name)
    if (dealId && customerId) fetchDealDocuments(customerId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business.business_id])

  async function fetchData() {
    const [customersApiRes, settingsRes] = await Promise.all([
      fetch('/api/customers').then(r => r.json()),
      supabase
        .from('business_config')
        .select('pricing_settings, quote_template_style')
        .eq('business_id', business.business_id)
        .single(),
    ])

    if (!customersApiRes || customersApiRes.error) {
      console.error('[NewQuote] Kunde inte hämta kunder:', customersApiRes?.error)
    }
    setCustomers(customersApiRes?.customers || [])
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
    setLoading(false)
  }

  async function fetchStandardTexts() {
    try {
      const res = await fetch('/api/quote-standard-texts')
      if (!res.ok) return
      const data = await res.json()
      const texts: QuoteStandardText[] = data.texts || []
      setAllStandardTexts(texts)

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

  async function fetchDealDocuments(customerId: string) {
    try {
      const res = await fetch(`/api/customers/${customerId}/documents`)
      if (!res.ok) return
      const data = await res.json()
      const docs = (data.documents || []).map((d: any) => ({
        name: d.file_name,
        url: d.file_url,
        size: d.file_size || 0,
      }))
      if (docs.length > 0) setAttachments(docs)
    } catch {
      // silent
    }
  }

  // ─── Attachment upload ───────────────────────────────────────────
  async function handleFileUpload(file: File) {
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Filen är för stor (max 10 MB)')
      return
    }
    setUploadingFile(true)
    try {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `${business.business_id}/quotes/drafts/${timestamp}_${safeName}`
      const arrayBuffer = await file.arrayBuffer()
      const { error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, arrayBuffer, { contentType: file.type, upsert: false })
      if (uploadError) throw uploadError
      const { data: urlData } = supabase.storage.from('customer-documents').getPublicUrl(filePath)
      setAttachments(prev => [
        ...prev,
        { name: file.name, url: urlData.publicUrl, size: file.size },
      ])
    } catch (err) {
      console.error('Upload failed:', err)
      toast.error('Kunde inte ladda upp filen')
    }
    setUploadingFile(false)
  }

  // ─── Supplier price comparison (debounced) ───────────────────────
  useEffect(() => {
    const materialItems = items.filter(i => i.item_type === 'item' && i.unit_price > 0)
    if (materialItems.length === 0) {
      setPriceWarnings([])
      setPriceAlts([])
      return
    }
    const timer = setTimeout(() => {
      fetch('/api/suppliers/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: materialItems.map(i => ({ description: i.description, unit_price: i.unit_price, unit: i.unit })),
        }),
      })
        .then(r => r.json())
        .then(data => {
          setPriceWarnings(data.warnings || [])
          setPriceAlts(data.alternatives || [])
        })
        .catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [items])

  // ─── Auto-fill personal data + price list on customer change ─────
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerPriceListInfo(null)
      return
    }
    const customer = customers.find(c => c.customer_id === selectedCustomer)
    if (!customer) return

    if (customer.personal_number && !personnummer) setPersonnummer(customer.personal_number)
    if (customer.property_designation && !fastighetsbeteckning)
      setFastighetsbeteckning(customer.property_designation)
    if (customer.address_line && !projectAddress) setProjectAddress(customer.address_line)
    if (customer.name && !customerReference) setCustomerReference(customer.name)

    ;(async () => {
      const cust = customer as any
      let priceListId = cust.price_list_id

      if (!priceListId && cust.segment_id) {
        try {
          const segRes = await supabase
            .from('price_lists_v2')
            .select('id')
            .eq('business_id', business.business_id)
            .eq('segment_id', cust.segment_id)
            .limit(1)
            .maybeSingle()
          if (segRes.data?.id) priceListId = segRes.data.id
        } catch {}
      }

      if (!priceListId) {
        try {
          const defRes = await supabase
            .from('price_lists_v2')
            .select('id')
            .eq('business_id', business.business_id)
            .eq('is_default', true)
            .limit(1)
            .maybeSingle()
          if (defRes.data?.id) priceListId = defRes.data.id
        } catch {}
      }

      if (priceListId) {
        fetch(`/api/pricing/price-lists/${priceListId}`)
          .then(r => r.json())
          .then(data => {
            if (data.priceList) {
              const pl = data.priceList
              setCustomerPriceListInfo({
                name: pl.name,
                segment: pl.segment?.name,
                contractType: pl.contract_type?.name,
                hourlyRate: pl.hourly_rate_normal,
                materialMarkup: pl.material_markup_pct,
                calloutFee: pl.callout_fee,
                items: (pl.items || []).map((it: any) => ({
                  name: it.name,
                  unit: it.unit,
                  price: it.price,
                  category_slug: it.category_slug,
                  is_rot_eligible: it.is_rot_eligible,
                  is_rut_eligible: it.is_rut_eligible,
                })),
              })
              if (pl.hourly_rate_normal || pl.callout_fee) {
                setPricingSettings(prev => ({
                  ...(prev || {
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
                  }),
                  hourly_rate: pl.hourly_rate_normal || prev?.hourly_rate || 650,
                  callout_fee: pl.callout_fee ?? prev?.callout_fee ?? 495,
                }))
              }
            }
          })
          .catch(() => {})
      } else {
        setCustomerPriceListInfo(null)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomer])

  // ═══════════════════════════════════════════════════════════════════
  // AI helpers
  // ═══════════════════════════════════════════════════════════════════

  function applyAiResult(quote: any) {
    setTitle(quote.jobTitle || '')
    setDescription(quote.jobDescription || '')
    const converted = convertLegacyItems(quote.items || [])
    if (quote.suggestedDeductionType === 'rot') {
      converted.forEach(item => {
        if (item.unit === 'tim') item.is_rot_eligible = true
      })
    } else if (quote.suggestedDeductionType === 'rut') {
      converted.forEach(item => {
        if (item.unit === 'tim') item.is_rut_eligible = true
      })
    }
    setItems(converted)
    setAiGenerated(true)
    setAiConfidence(quote.confidence || null)
    toast.success('AI genererade offertförslag!')
  }

  function handlePhotoFile(file: File) {
    if (!file.type.startsWith('image/')) return
    if (photos.length >= MAX_PHOTOS) {
      toast.error(`Max ${MAX_PHOTOS} foton`)
      return
    }
    const reader = new FileReader()
    reader.onload = e => {
      const dataUrl = e.target?.result as string
      setPhotos(prev => [...prev, dataUrl])
    }
    reader.readAsDataURL(file)
  }

  function removePhoto(index: number) {
    setPhotos(prev => prev.filter((_, i) => i !== index))
  }

  async function analyzePhoto() {
    if (photos.length === 0) return
    const images = photos.map(p => p.split(',')[1])
    setSourceImageBase64(images[0])
    setGenerating(true)
    try {
      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          textDescription: photoDescription || undefined,
          customerId: selectedCustomer || undefined,
        }),
      })
      const data = await response.json()
      if (data.success) {
        applyAiResult(data.quote)
        setAiPriceWarning(data.priceWarning || null)
        setAiPhotoCount(data.photoCount || photos.length)
        setPhotos([])
        setPhotoDescription('')
      } else {
        toast.error(data.error || 'AI-generering misslyckades')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      toast.error('Nätverksfel vid AI-generering')
    }
    setGenerating(false)
  }

  async function generateFromText(text?: string) {
    const inputText = text || aiTextInput
    if (!inputText.trim()) return
    setGenerating(true)
    try {
      const body: Record<string, string> = { textDescription: inputText }
      if (sourceImageBase64) body.imageBase64 = sourceImageBase64
      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (data.success) {
        setSourceTranscript(inputText)
        applyAiResult(data.quote)
      } else {
        toast.error(data.error || 'AI-generering misslyckades')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      toast.error('Nätverksfel vid AI-generering')
    }
    setGenerating(false)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Template handlers
  // ═══════════════════════════════════════════════════════════════════

  function handleNewTemplateSelect(template: QuoteTemplate) {
    setTitle(template.name)
    setDescription(template.description || '')
    setTemplateId(template.id)

    if (template.default_items && template.default_items.length > 0) {
      const cloned: QuoteItem[] = template.default_items.map((item, idx) => ({
        ...item,
        id: generateItemId(),
        sort_order: idx,
        total: item.item_type === 'item' ? item.quantity * item.unit_price : item.total,
      }))
      setItems(cloned)
    }

    if (template.default_payment_plan && template.default_payment_plan.length > 0) {
      setPaymentPlan(template.default_payment_plan)
      setShowPaymentPlan(true)
    }

    if (template.introduction_text) setIntroductionText(template.introduction_text)
    if (template.conclusion_text) setConclusionText(template.conclusion_text)
    if (template.not_included) setNotIncluded(template.not_included)
    if (template.ata_terms) setAtaTerms(template.ata_terms)
    if (template.payment_terms_text) setPaymentTermsText(template.payment_terms_text)

    setDetailLevel(template.detail_level || 'detailed')
    setShowUnitPrices(template.show_unit_prices ?? true)
    setShowQuantities(template.show_quantities ?? true)

    setShowTemplatePanel(false)
    toast.success(`Mall "${template.name}" tillämpad`)
  }

  function handleTemplateSelect(template: any) {
    if (template.default_items && Array.isArray(template.default_items) && template.default_items.length > 0) {
      handleNewTemplateSelect(template as QuoteTemplate)
      return
    }

    setTitle(template.name)
    setDescription(template.description || '')

    if (template.items && Array.isArray(template.items) && template.items.length > 0) {
      setItems(convertLegacyItems(template.items))
    } else {
      const newItems: QuoteItem[] = []
      const hourlyRate = pricingSettings?.hourly_rate || 650

      if (template.estimated_hours && template.labor_cost) {
        newItems.push({
          id: generateItemId(),
          item_type: 'item',
          description: template.name,
          quantity: template.estimated_hours,
          unit: 'tim',
          unit_price: hourlyRate,
          total: template.estimated_hours * hourlyRate,
          is_rot_eligible: true,
          is_rut_eligible: false,
          sort_order: 0,
        })
      }

      if (template.materials && Array.isArray(template.materials)) {
        template.materials.forEach((mat: any, idx: number) => {
          newItems.push({
            id: generateItemId(),
            item_type: 'item',
            description: mat.name || mat.description || 'Material',
            quantity: mat.quantity || 1,
            unit: normalizeUnit(mat.unit || 'st'),
            unit_price: mat.unitPrice || mat.unit_price || 0,
            total: (mat.quantity || 1) * (mat.unitPrice || mat.unit_price || 0),
            is_rot_eligible: false,
            is_rut_eligible: false,
            sort_order: idx + 1,
          })
        })
      }

      setItems(newItems)
    }

    if (template.rot_rut_type === 'rot' || template.rot_rut_type === 'rut') {
      setItems(prev =>
        prev.map(item => ({
          ...item,
          is_rot_eligible: template.rot_rut_type === 'rot' && item.unit === 'tim',
          is_rut_eligible: template.rot_rut_type === 'rut' && item.unit === 'tim',
        })),
      )
    }

    fetch('/api/quotes/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...template, incrementUsage: true }),
    }).catch(() => {})

    setShowTemplatePanel(false)
    toast.success(`Mall "${template.name}" tillämpad`)
  }

  // ═══════════════════════════════════════════════════════════════════
  // Product search — sparade produkter från api/products
  // ═══════════════════════════════════════════════════════════════════

  const addFromProduct = useCallback((product: ProductSearchResult) => {
    const newItem: QuoteItem = {
      id: generateItemId(),
      item_type: 'item',
      description: product.name,
      article_number: product.sku || undefined,
      quantity: 1,
      unit: normalizeUnit(product.unit),
      unit_price: product.sales_price,
      cost_price: product.purchase_price ?? undefined,
      total: product.sales_price,
      is_rot_eligible: !!product.rot_eligible,
      is_rut_eligible: !!product.rut_eligible,
      sort_order: 0,
    }
    setItems(prev => [...prev, { ...newItem, sort_order: prev.length }])
  }, [])

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
    try {
      const finalItems = recalculateItems(items).map((item, idx) => ({ ...item, sort_order: idx }))

      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer || null,
          status: 'draft',
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
          payment_plan: paymentPlan.length > 0 ? calculatedPaymentPlan : null,
          reference_person: referencePerson || null,
          customer_reference: customerReference || null,
          project_address: projectAddress || null,
          detail_level: detailLevel,
          show_unit_prices: showUnitPrices,
          show_quantities: showQuantities,
          personnummer: hasRotItems || hasRutItems ? personnummer || null : null,
          fastighetsbeteckning: hasRotItems ? fastighetsbeteckning || null : null,
          valid_days: validDays,
          ai_generated: aiGenerated || false,
          ai_confidence: aiConfidence || null,
          source_transcript: sourceTranscript || null,
          template_id: templateId || null,
          template_style: templateStyle,
          attachments: attachments.length > 0 ? attachments : [],
          deal_id: searchParams?.get('deal_id') || searchParams?.get('lead_id') || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte spara offerten')
      } else {
        toast.success(send ? 'Offert sparad — öppnar skicka-vy' : 'Offert sparad som utkast')
        router.push(
          send
            ? `/dashboard/quotes/${data.quote.quote_id}?send=true`
            : `/dashboard/quotes/${data.quote.quote_id}`,
        )
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
        <QuoteNewHeader
          aiGenerated={aiGenerated}
          aiConfidence={aiConfidence}
          aiPriceWarning={aiPriceWarning}
          aiPhotoCount={aiPhotoCount}
        />

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(620px,46%)] gap-5 items-start">
          {/* ── Left Column ───────────────────────────────────────── */}
          <div className="flex flex-col gap-4">
            <QuoteNewAIHelper
              open={showAiHelper}
              setOpen={setShowAiHelper}
              generating={generating}
              photos={photos}
              maxPhotos={MAX_PHOTOS}
              onPhotoFile={handlePhotoFile}
              onRemovePhoto={removePhoto}
              photoDescription={photoDescription}
              setPhotoDescription={setPhotoDescription}
              onAnalyzePhoto={analyzePhoto}
              aiTextInput={aiTextInput}
              setAiTextInput={setAiTextInput}
              onGenerateFromText={() => generateFromText()}
            />

            <QuoteNewCustomerSection
              customers={customers}
              selectedCustomer={selectedCustomer}
              setSelectedCustomer={setSelectedCustomer}
              validDays={validDays}
              setValidDays={setValidDays}
              title={title}
              setTitle={setTitle}
              description={description}
              setDescription={setDescription}
              customerPriceListInfo={customerPriceListInfo}
              items={items}
              setItems={setItems}
            />

            <QuoteNewItemsSection
              items={items}
              recalculated={recalculated}
              allCategories={allCategories}
              customCategories={localCustomCategories}
              priceList={priceList}
              dndSensors={dndSensors}
              onDragEnd={handleDragEnd}
              onAddItem={addItem}
              onUpdateItem={updateItem}
              onRemoveItem={removeItem}
              onMoveItem={moveItem}
              onAddFromPriceList={addFromPriceList}
              onOpenGrossistSearch={() => setShowGrossistSearch(true)}
              onOpenProductSearch={() => setShowProductSearch(true)}
              onCreateCategory={createCustomCategory}
              showNewCategoryInput={showNewCategoryInput}
              setShowNewCategoryInput={setShowNewCategoryInput}
              newCategoryLabel={newCategoryLabel}
              setNewCategoryLabel={setNewCategoryLabel}
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

            <QuoteNewAttachmentsCard
              attachments={attachments}
              setAttachments={setAttachments}
              uploadingFile={uploadingFile}
              onFileUpload={handleFileUpload}
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

          {/* ── Right Column ──────────────────────────────────────── */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto pr-1">
            <QuoteNewTemplatePanel
              open={showTemplatePanel}
              setOpen={setShowTemplatePanel}
              onSelect={handleTemplateSelect}
            />

            {/* Stil-väljare — overridar business default per offert */}
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Offertstil</p>
                {templateStyle && (
                  <button
                    type="button"
                    onClick={() => setTemplateStyle(null)}
                    className="text-xs text-slate-500 hover:text-primary-700 transition-colors"
                  >
                    Återställ
                  </button>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { id: 'modern', label: 'Modern', tagline: 'Ren & tidlös' },
                  { id: 'premium', label: 'Premium', tagline: 'Påkostad' },
                  { id: 'friendly', label: 'Friendly', tagline: 'Varm' },
                ] as const).map(opt => {
                  const effective = templateStyle || businessDefaultStyle
                  const isSelected = effective === opt.id
                  const isDefault = !templateStyle && businessDefaultStyle === opt.id
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTemplateStyle(opt.id)}
                      className={`relative p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-primary-700 bg-primary-50 shadow-sm'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className={`text-xs font-bold tracking-tight ${isSelected ? 'text-primary-700' : 'text-slate-900'}`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{opt.tagline}</div>
                      {isDefault && (
                        <div className="text-[9px] font-semibold uppercase tracking-wider text-primary-700 mt-1.5">
                          Standard
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-3 leading-relaxed">
                Stilen speglas i den färdiga offerten — slutdesignen visas via "Förhandsgranska design" efter sparad offert.
              </p>
            </div>

            <QuoteNewPreviewPanel
              open={showPreviewPanel}
              setOpen={setShowPreviewPanel}
              previewMode={previewMode}
              setPreviewMode={setPreviewMode}
              liveAvailable={liveAvailable}
              liveTemplateData={liveTemplateData}
              liveHandlers={liveHandlers}
              templatePreviewPayload={templatePreviewPayload}
              debouncedPreviewData={debouncedPreviewData}
              businessName={business.business_name}
              contactName={business.contact_name}
            />

            <QuoteNewPriceWarningsBanner warnings={priceWarnings} alternatives={priceAlts} />

            <QuoteEditTotalsSection
              totals={totals}
              vatRate={vatRate}
              discountPercent={discountPercent}
              setDiscountPercent={setDiscountPercent}
              hasRotItems={hasRotItems}
              hasRutItems={hasRutItems}
              formatCurrency={formatCurrency}
            />

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
                onClick={() => {
                  setTemplateName(title)
                  setShowSaveTemplateModal(true)
                }}
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

      {/* Grossist search modal */}
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
        onSelect={addFromProduct}
      />

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
