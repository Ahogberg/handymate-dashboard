'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  Loader2,
  ChevronDown,
  GripVertical,
  Eye,
  X,
  Trash2,
  Paperclip,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import Link from 'next/link'
import ProductSearchModal from '@/components/ProductSearchModal'
import QuotePreview, { type QuotePreviewData } from '@/components/quotes/QuotePreview'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { SelectedProduct } from '@/lib/suppliers/types'
import {
  QuoteItem,
  PaymentPlanEntry,
  QuoteStandardText,
  DetailLevel,
  RotRutType,
} from '@/lib/types/quote'
import SharedItemRow from '@/components/quotes/ItemRow'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  calculateQuoteTotals,
  generateItemId,
  createDefaultItem,
  recalculateItems,
  calculatePaymentPlan,
  validatePaymentPlan,
} from '@/lib/quote-calculations'
import {
  SYSTEM_CATEGORIES,
  getAllCategories,
  getCategoryRotRut,
  type CustomCategory,
} from '@/lib/constants/categories'

// ---------------------------------------------------------------------------
// Local types
// ---------------------------------------------------------------------------

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  personal_number?: string
  property_designation?: string
}

interface PriceItem {
  id: string
  category: string
  name: string
  unit: string
  unit_price: number
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

const UNIT_OPTIONS = [
  { value: 'st', label: 'st' },
  { value: 'tim', label: 'tim' },
  { value: 'm', label: 'm' },
  { value: 'm2', label: 'm²' },
  { value: 'lm', label: 'lm' },
  { value: 'kg', label: 'kg' },
  { value: 'pauschal', label: 'pauschal' },
]


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  }>
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

/** Normalize legacy unit values to the new set */
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

// ---------------------------------------------------------------------------
// Standard Text Picker (inline dropdown)
// ---------------------------------------------------------------------------

function StandardTextPicker({
  texts,
  onSelect,
}: {
  texts: QuoteStandardText[]
  onSelect: (content: string) => void
}) {
  const [open, setOpen] = useState(false)

  if (texts.length === 0) return null

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="text-xs text-sky-700 hover:text-primary-800 transition-colors"
      >
        Välj standardtext
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 bg-white border border-[#E2E8F0] rounded-lg shadow-lg w-64 max-h-48 overflow-y-auto">
            {texts.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  onSelect(t.content)
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 border-b border-gray-100 last:border-0"
              >
                <span className="font-medium">{t.name}</span>
                {t.is_default && (
                  <span className="ml-1 text-[10px] text-sky-700 bg-primary-50 px-1 rounded">
                    standard
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
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

  // ─── Loading / global state ─────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // ─── Auto-save state ────────────────────────────────────────────────────────
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const formDataRef = useRef<any>(null)
  const initialLoadDone = useRef(false)
  const quoteNumberRef = useRef<string>('')

  // ─── Standard texts (loaded from API) ──────────────────────────────────────
  const [allStandardTexts, setAllStandardTexts] = useState<QuoteStandardText[]>([])

  // ─── Form state ────────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)
  const [quoteStatus, setQuoteStatus] = useState('draft')

  // ROT/RUT personal data
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

  // Template save modal
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // Visuell stil — overridar business default per offert
  const [templateStyle, setTemplateStyle] = useState<'modern' | 'premium' | 'friendly' | null>(null)
  const [businessDefaultStyle, setBusinessDefaultStyle] = useState<'modern' | 'premium' | 'friendly'>('modern')

  // Grossist search modal
  const [showGrossistSearch, setShowGrossistSearch] = useState(false)

  // Category state
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<string | null>(null)
  const [newCategoryLabel, setNewCategoryLabel] = useState('')

  // Collapsible sections
  const [showStandardTexts, setShowStandardTexts] = useState(false)
  const [showPaymentPlan, setShowPaymentPlan] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)

  // Preview
  const [showPreviewPanel, setShowPreviewPanel] = useState(true)
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [debouncedPreviewData, setDebouncedPreviewData] = useState<QuotePreviewData | null>(null)

  // Add-row dropdown
  const [showAdvancedTypes, setShowAdvancedTypes] = useState(false)

  // Category subtotals display
  const [showCategorySubtotals, setShowCategorySubtotals] = useState(false)

  // ─── Derived: standard texts grouped by type ──────────────────────────────
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

  // ─── Derived: all categories ─────────────────────────────────────────────
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories])

  // ─── Derived: totals ──────────────────────────────────────────────────────
  const vatRate = pricingSettings?.vat_rate ?? 25
  const recalculated = useMemo(() => recalculateItems(items), [items])
  const totals = useMemo(
    () => calculateQuoteTotals(recalculated, discountPercent, vatRate),
    [recalculated, discountPercent, vatRate]
  )

  // Does any item have ROT or RUT?
  const hasRotItems = items.some((i) => i.is_rot_eligible)
  const hasRutItems = items.some((i) => i.is_rut_eligible)

  // Payment plan with amounts
  const calculatedPaymentPlan = useMemo(
    () => calculatePaymentPlan(totals.total, paymentPlan),
    [totals.total, paymentPlan]
  )
  const paymentPlanValid = validatePaymentPlan(paymentPlan)

  // ─── Debounced preview data ──────────────────────────────────────────────
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
  }, [title, selectedCustomer, customers, validDays, recalculated, discountPercent, vatRate, introductionText, conclusionText, notIncluded, ataTerms, calculatedPaymentPlan, referencePerson, customerReference, projectAddress, detailLevel, showUnitPrices, showQuantities, showCategorySubtotals, customCategories])

  // ═══════════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!business.business_id || !quoteId) return
    fetchData()
    fetchStandardTexts()
    fetchQuote()
  }, [business.business_id, quoteId])

  async function fetchData() {
    const [customersApiRes, priceListRes, settingsRes, categoriesRes] = await Promise.all([
      fetch('/api/customers').then(r => r.json()),
      supabase
        .from('price_list')
        .select('*')
        .eq('business_id', business.business_id)
        .eq('is_active', true),
      supabase
        .from('business_config')
        .select('pricing_settings, quote_template_style')
        .eq('business_id', business.business_id)
        .single(),
      supabase
        .from('custom_quote_categories')
        .select('*')
        .eq('business_id', business.business_id)
        .order('created_at'),
    ])

    setCustomers(customersApiRes?.customers || customersApiRes?.data || [])
    setPriceList(priceListRes.data || [])
    setCustomCategories((categoriesRes.data as CustomCategory[]) || [])
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
      }
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
      // silent - standard texts are optional
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

      // Basic fields
      setSelectedCustomer(quote.customer_id || '')
      setTitle(quote.title || '')
      setDescription(quote.description || '')
      setQuoteStatus(quote.status || 'draft')
      quoteNumberRef.current = quote.quote_number || ''

      // Items: prefer quote_items, fall back to legacy items
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
          sort_order: item.sort_order ?? idx,
        }))
        setItems(loadedItems)
      } else if (quote.items && Array.isArray(quote.items) && quote.items.length > 0) {
        setItems(convertLegacyItems(quote.items))
      }

      // Standard texts
      setIntroductionText(quote.introduction_text || '')
      setConclusionText(quote.conclusion_text || '')
      setNotIncluded(quote.not_included || '')
      setAtaTerms(quote.ata_terms || '')
      setPaymentTermsText(quote.payment_terms_text || '')

      // If quote has no standard texts at all, load defaults
      const hasAnyStandardText =
        quote.introduction_text ||
        quote.conclusion_text ||
        quote.not_included ||
        quote.ata_terms ||
        quote.payment_terms_text
      if (!hasAnyStandardText) {
        loadDefaultStandardTexts()
      }

      // Payment plan
      if (quote.payment_plan && Array.isArray(quote.payment_plan) && quote.payment_plan.length > 0) {
        setPaymentPlan(quote.payment_plan)
        setShowPaymentPlan(true)
      }

      // Reference fields
      setReferencePerson(quote.reference_person || '')
      setCustomerReference(quote.customer_reference || '')
      setProjectAddress(quote.project_address || '')

      // Display settings
      setDetailLevel(quote.detail_level || 'detailed')
      setShowUnitPrices(quote.show_unit_prices ?? true)
      setShowQuantities(quote.show_quantities ?? true)

      // Visuell stil — null = använd business default
      const qStyle = quote.template_style as 'modern' | 'premium' | 'friendly' | null | undefined
      if (qStyle && ['modern', 'premium', 'friendly'].includes(qStyle)) {
        setTemplateStyle(qStyle)
      }

      // ROT/RUT
      setPersonnummer(quote.personnummer || '')
      setFastighetsbeteckning(quote.fastighetsbeteckning || '')

      // Discount
      setDiscountPercent(quote.discount_percent || 0)

      // Valid days - derive from valid_until and created_at
      if (quote.valid_until && quote.created_at) {
        const validUntilDate = new Date(quote.valid_until)
        const createdDate = new Date(quote.created_at)
        const diffMs = validUntilDate.getTime() - createdDate.getTime()
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
        if (diffDays > 0) {
          // Snap to closest standard option
          if (diffDays <= 14) setValidDays(14)
          else if (diffDays <= 30) setValidDays(30)
          else if (diffDays <= 60) setValidDays(60)
          else setValidDays(90)
        }
      }

      // Open standard texts section if any text exists
      if (hasAnyStandardText) {
        setShowStandardTexts(true)
      }

      setLoading(false)
      // Mark initial load as done so auto-save starts tracking changes
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

      const defaultIntro = texts.find((t) => t.text_type === 'introduction' && t.is_default)
      const defaultConclusion = texts.find((t) => t.text_type === 'conclusion' && t.is_default)
      const defaultNotIncluded = texts.find((t) => t.text_type === 'not_included' && t.is_default)
      const defaultAta = texts.find((t) => t.text_type === 'ata_terms' && t.is_default)
      const defaultPayment = texts.find((t) => t.text_type === 'payment_terms' && t.is_default)

      if (defaultIntro) setIntroductionText(defaultIntro.content)
      if (defaultConclusion) setConclusionText(defaultConclusion.content)
      if (defaultNotIncluded) setNotIncluded(defaultNotIncluded.content)
      if (defaultAta) setAtaTerms(defaultAta.content)
      if (defaultPayment) setPaymentTermsText(defaultPayment.content)
    } catch {
      // silent
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Auto-save
  // ═══════════════════════════════════════════════════════════════════════════

  // Build form data payload (used by auto-save and manual save)
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
        personnummer: (hasRotItems || hasRutItems) ? personnummer || null : null,
        fastighetsbeteckning: hasRotItems ? fastighetsbeteckning || null : null,
        valid_days: validDays,
        template_style: templateStyle, // null = använd business default
      }
    },
    [
      quoteId,
      selectedCustomer,
      quoteStatus,
      title,
      description,
      items,
      vatRate,
      discountPercent,
      introductionText,
      conclusionText,
      notIncluded,
      ataTerms,
      paymentTermsText,
      paymentPlan,
      totals.total,
      referencePerson,
      customerReference,
      projectAddress,
      detailLevel,
      showUnitPrices,
      showQuantities,
      personnummer,
      fastighetsbeteckning,
      hasRotItems,
      hasRutItems,
      validDays,
      templateStyle,
    ]
  )

  // Store latest form data for beforeunload save
  useEffect(() => {
    if (initialLoadDone.current) {
      formDataRef.current = buildPayload()
    }
  }, [buildPayload])

  // Debounced auto-save (5 seconds after last change)
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
  }, [
    selectedCustomer,
    title,
    description,
    items,
    discountPercent,
    validDays,
    personnummer,
    fastighetsbeteckning,
    referencePerson,
    customerReference,
    projectAddress,
    introductionText,
    conclusionText,
    notIncluded,
    ataTerms,
    paymentTermsText,
    paymentPlan,
    detailLevel,
    showUnitPrices,
    showQuantities,
  ])

  // Save on page unload
  useEffect(() => {
    function handleBeforeUnload() {
      if (formDataRef.current && initialLoadDone.current) {
        // Use sendBeacon for reliable save on unload
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Item editor handlers
  // ═══════════════════════════════════════════════════════════════════════════

  const addItem = useCallback(
    (type: QuoteItem['item_type']) => {
      const sortOrder = items.length
      const newItem = createDefaultItem(type, sortOrder)
      if (type === 'item' && pricingSettings) {
        newItem.unit_price = 0
        newItem.quantity = 1
      }
      setItems((prev) => [...prev, newItem])
    },
    [items.length, pricingSettings]
  )

  const updateItem = useCallback((id: string, field: keyof QuoteItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item
        const updated = { ...item, [field]: value }
        // Recalc line total for normal items and discounts
        if (updated.item_type === 'item') {
          updated.total = updated.quantity * updated.unit_price
        } else if (updated.item_type === 'discount') {
          updated.total = -(Math.abs(updated.quantity) * Math.abs(updated.unit_price))
        }
        // Category auto-detection: set ROT/RUT based on category
        if (field === 'category_slug' && value) {
          const catRotRut = getCategoryRotRut(value, customCategories)
          if (catRotRut.rot) {
            updated.is_rot_eligible = true
            updated.is_rut_eligible = false
            updated.rot_rut_type = 'rot'
          } else if (catRotRut.rut) {
            updated.is_rot_eligible = false
            updated.is_rut_eligible = true
            updated.rot_rut_type = 'rut'
          }
        }
        // Sync rot_rut_type with boolean flags
        if (field === 'rot_rut_type') {
          updated.rot_rut_type = (value || null) as RotRutType
          updated.is_rot_eligible = value === 'rot'
          updated.is_rut_eligible = value === 'rut'
        }
        if (field === 'is_rot_eligible' && value === true) {
          updated.is_rut_eligible = false
          updated.rot_rut_type = 'rot'
        }
        if (field === 'is_rut_eligible' && value === true) {
          updated.is_rot_eligible = false
          updated.rot_rut_type = 'rut'
        }
        return updated
      })
    )
  }, [customCategories])

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const moveItem = useCallback((index: number, direction: 'up' | 'down') => {
    setItems((prev) => {
      const newArr = [...prev]
      const targetIdx = direction === 'up' ? index - 1 : index + 1
      if (targetIdx < 0 || targetIdx >= newArr.length) return prev
      ;[newArr[index], newArr[targetIdx]] = [newArr[targetIdx], newArr[index]]
      return newArr.map((item, i) => ({ ...item, sort_order: i }))
    })
  }, [])

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor)
  )

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setItems((prev) => {
      const oldIndex = prev.findIndex((i) => i.id === active.id)
      const newIndex = prev.findIndex((i) => i.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      const newArr = [...prev]
      const [moved] = newArr.splice(oldIndex, 1)
      newArr.splice(newIndex, 0, moved)
      return newArr.map((item, i) => ({ ...item, sort_order: i }))
    })
  }, [])

  const addFromGrossist = useCallback((product: SelectedProduct) => {
    const newItem: QuoteItem = {
      id: generateItemId(),
      item_type: 'item',
      description: product.name,
      article_number: product.sku,
      quantity: 1,
      unit: normalizeUnit(product.unit),
      unit_price: product.sell_price,
      cost_price: product.purchase_price,
      total: product.sell_price,
      is_rot_eligible: false,
      is_rut_eligible: false,
      sort_order: 0,
    }
    setItems((prev) => {
      newItem.sort_order = prev.length
      return [...prev, newItem]
    })
    setShowGrossistSearch(false)
  }, [])

  const addFromPriceList = useCallback((priceItem: PriceItem) => {
    const newItem: QuoteItem = {
      id: generateItemId(),
      item_type: 'item',
      description: priceItem.name,
      quantity: 1,
      unit: normalizeUnit(priceItem.unit),
      unit_price: priceItem.unit_price,
      total: priceItem.unit_price,
      is_rot_eligible: priceItem.category === 'labor',
      is_rut_eligible: false,
      sort_order: 0,
    }
    setItems((prev) => {
      newItem.sort_order = prev.length
      return [...prev, newItem]
    })
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // Payment plan handlers
  // ═══════════════════════════════════════════════════════════════════════════

  function addPaymentPlanEntry() {
    setPaymentPlan((prev) => [
      ...prev,
      { label: '', percent: 0, amount: 0, due_description: '' },
    ])
  }

  function updatePaymentPlanEntry(index: number, field: keyof PaymentPlanEntry, value: any) {
    setPaymentPlan((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, [field]: value } : entry))
    )
  }

  function removePaymentPlanEntry(index: number) {
    setPaymentPlan((prev) => prev.filter((_, i) => i !== index))
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Save
  // ═══════════════════════════════════════════════════════════════════════════

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
    // Cancel any pending auto-save
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Loading
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-[#0F766E] animate-spin" />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Full Form
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <Link
              href="/dashboard/quotes"
              className="text-[13px] text-[#64748B] hover:text-[#1E293B] transition-colors"
            >
              ← Offerter
            </Link>
            <span className="text-[18px] font-medium text-[#1E293B] ml-3">
              Redigera offert
              {quoteNumberRef.current && (
                <span className="ml-1.5 text-[13px] font-normal text-[#94A3B8]">
                  {quoteNumberRef.current}
                </span>
              )}
            </span>
            {/* Auto-save indicator */}
            {autoSaveStatus === 'saving' && (
              <span className="ml-3 text-[11px] text-[#94A3B8] flex items-center gap-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                Sparar...
              </span>
            )}
            {autoSaveStatus === 'saved' && (
              <span className="ml-3 text-[11px] text-[#0F766E] flex items-center gap-1">
                ✓ Sparad
              </span>
            )}
            {autoSaveStatus === 'error' && (
              <span className="ml-3 text-[11px] text-red-500">
                Kunde inte spara
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          {/* ══════════════════════════════════════════════════════════ */}
          {/* Left Column — Form                                       */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-4">
            {/* ── Kund ──────────────────────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Kund</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Kund *</label>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value="">Välj kund...</option>
                    {customers.map((c) => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.name} — {c.phone_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Giltighetstid</label>
                  <select
                    value={validDays}
                    onChange={(e) => setValidDays(parseInt(e.target.value))}
                    className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value={14}>14 dagar</option>
                    <option value={30}>30 dagar</option>
                    <option value={60}>60 dagar</option>
                    <option value={90}>90 dagar</option>
                  </select>
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-[12px] text-[#64748B] mb-1">Titel</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="T.ex. Elinstallation kök"
                  className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div>
                <label className="block text-[12px] text-[#64748B] mb-1">
                  Beskrivning <span className="text-[11px] text-[#CBD5E1]">(valfri)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kort beskrivning av jobbet..."
                  rows={2}
                  className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y"
                />
              </div>
            </div>

            {/* ── Offertrader ────────────────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Offertrader</div>

              {/* Table header (desktop) */}
              {items.length > 0 && (
                <div className="hidden md:grid md:grid-cols-[24px_56px_1fr_56px_64px_80px_80px_100px_64px_28px] gap-1 px-2 pb-2 border-b border-gray-100 mb-1">
                  <span />
                  <span className="text-[9px] tracking-wider uppercase text-gray-400 text-center">Typ</span>
                  <span className="text-[9px] tracking-wider uppercase text-gray-400">Beskrivning</span>
                  <span className="text-[9px] tracking-wider uppercase text-gray-400 text-center">Antal</span>
                  <span className="text-[9px] tracking-wider uppercase text-gray-400 text-center">Enhet</span>
                  <span className="text-[9px] tracking-wider uppercase text-gray-400 text-right">Pris</span>
                  <span className="text-[9px] tracking-wider uppercase text-gray-400 text-right">Summa</span>
                  <span className="text-[9px] tracking-wider uppercase text-gray-400 text-center">Kategori</span>
                  <span className="text-[9px] tracking-wider uppercase text-gray-400 text-center">ROT</span>
                  <span />
                </div>
              )}

              {items.length === 0 ? (
                <div className="text-center py-8 text-[#CBD5E1] text-[13px]">
                  <p>Inga rader ännu. Lägg till poster nedan.</p>
                </div>
              ) : (
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1">
                      {items.map((item, index) => (
                        <SharedItemRow
                          key={item.id}
                          item={item}
                          index={index}
                          total={items.length}
                          recalculatedTotal={recalculated[index]?.total ?? item.total}
                          onUpdate={updateItem}
                          onRemove={removeItem}
                          onMove={moveItem}
                          allCategories={allCategories}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              )}

              {/* Add row buttons */}
              <div className="flex items-center gap-4 pt-2.5">
                <button
                  onClick={() => addItem('item')}
                  className="flex items-center gap-2 text-[13px] text-[#0F766E] bg-transparent border-none cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#0F766E" strokeWidth="1"/><path d="M8 5v6M5 8h6" stroke="#0F766E" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  Lägg till rad
                </button>

                <button
                  onClick={() => setShowGrossistSearch(true)}
                  className="flex items-center gap-1.5 text-[13px] text-[#64748B] hover:text-[#0F766E] transition-colors bg-transparent border-none cursor-pointer"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                  Sök produkt
                </button>

                {/* Advanced types dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setShowAdvancedTypes(!showAdvancedTypes)}
                    className="text-[12px] text-[#94A3B8] hover:text-[#64748B] transition-colors"
                  >
                    Fler alternativ ▾
                  </button>
                  {showAdvancedTypes && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowAdvancedTypes(false)} />
                      <div className="absolute left-0 top-6 z-20 bg-white border-thin border-[#E2E8F0] rounded-lg shadow-lg w-44 overflow-hidden">
                        <button onClick={() => { addItem('heading'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Rubrik</button>
                        <button onClick={() => { addItem('text'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Fritext</button>
                        <button onClick={() => { addItem('subtotal'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Delsumma</button>
                        <button onClick={() => { addItem('discount'); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Rabatt</button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Quick add from price list */}
              {priceList.length > 0 ? (
                <div className="mt-4 pt-4 border-t border-thin border-[#E2E8F0]">
                  <p className="text-[12px] text-[#CBD5E1] mb-2">Snabbval från prislista:</p>
                  <div className="flex flex-wrap gap-2">
                    {priceList.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addFromPriceList(item)}
                        className="px-3 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#64748B] text-[12px] hover:border-[#0F766E] hover:text-[#0F766E] bg-transparent transition-colors"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="mt-4 pt-4 border-t border-thin border-[#E2E8F0]">
                  <p className="text-[12px] text-[#94A3B8]">Du har inga sparade artiklar än.</p>
                  <a href="/dashboard/settings/my-prices" target="_blank" rel="noopener"
                    className="text-[12px] text-[#0F766E] hover:underline mt-1 inline-block">
                    + Bygg din prislista →
                  </a>
                  <p className="text-[10px] text-[#CBD5E1] mt-0.5">Öppnas i ny flik</p>
                </div>
              )}
            </div>

            {/* ── ROT-avdrag ────────────────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => {
                  if (hasRotItems) {
                    setItems(prev => prev.map(item => ({ ...item, is_rot_eligible: false })))
                  } else {
                    setItems(prev => prev.map(item => ({
                      ...item,
                      is_rot_eligible: item.item_type === 'item' && item.unit === 'tim',
                    })))
                  }
                }}
              >
                <span className="text-[13px] text-[#1E293B]">ROT-avdrag</span>
                <div className={`w-9 h-5 rounded-full relative transition-colors ${hasRotItems ? 'bg-[#0F766E]' : 'bg-[#CBD5E1]'}`}>
                  <div className={`absolute w-3.5 h-3.5 bg-white rounded-full top-[3px] transition-all ${hasRotItems ? 'left-[19px]' : 'left-[3px]'}`} />
                </div>
              </div>
              {hasRotItems && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[12px] text-[#64748B] mb-1">Personnummer</label>
                    <input
                      type="text"
                      value={personnummer}
                      onChange={(e) => setPersonnummer(e.target.value)}
                      placeholder="YYYYMMDD-XXXX"
                      className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] text-[#64748B] mb-1">Fastighetsbeteckning</label>
                    <input
                      type="text"
                      value={fastighetsbeteckning}
                      onChange={(e) => setFastighetsbeteckning(e.target.value)}
                      placeholder="T.ex. Stockholm Söder 1:23"
                      className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                    />
                  </div>
                  <p className="text-[12px] text-[#0F766E] sm:col-span-2">
                    Kunden betalar 70% — Skatteverket betalar resterande 30% direkt till dig.
                  </p>
                </div>
              )}
            </div>

            {/* ── Referenser och texter (combined collapsible) ────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
              <button
                type="button"
                onClick={() => setShowStandardTexts(!showStandardTexts)}
                className="w-full flex items-center justify-between px-7 py-4 text-left"
              >
                <span className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1]">Referenser och texter</span>
                <ChevronDown className={`w-4 h-4 text-[#CBD5E1] transition-transform ${showStandardTexts ? 'rotate-180' : ''}`} />
              </button>
              {showStandardTexts && (
                <div className="px-7 pb-6 space-y-4">
                  {/* Reference fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[12px] text-[#64748B] mb-1">Er referens</label>
                      <input
                        type="text"
                        value={referencePerson}
                        onChange={(e) => setReferencePerson(e.target.value)}
                        placeholder="Namn"
                        className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#64748B] mb-1">Kundens referens</label>
                      <input
                        type="text"
                        value={customerReference}
                        onChange={(e) => setCustomerReference(e.target.value)}
                        placeholder="Referensnummer"
                        className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] text-[#64748B] mb-1">Arbetsplatsadress</label>
                      <AddressAutocomplete
                        value={projectAddress}
                        onChange={setProjectAddress}
                        onSelect={(r) => setProjectAddress(r.full_address)}
                        placeholder="Sök adress..."
                        className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                      />
                    </div>
                  </div>

                  {/* Standard texts */}
                  <div className="border-t border-thin border-[#E2E8F0] pt-4 space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">Inledningstext</label>
                        <StandardTextPicker texts={textsByType.introduction} onSelect={setIntroductionText} />
                      </div>
                      <textarea value={introductionText} onChange={(e) => setIntroductionText(e.target.value)} placeholder="Hälsningsfras och inledning..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">Avslutningstext</label>
                        <StandardTextPicker texts={textsByType.conclusion} onSelect={setConclusionText} />
                      </div>
                      <textarea value={conclusionText} onChange={(e) => setConclusionText(e.target.value)} placeholder="Avslutande text..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">Ej inkluderat</label>
                        <StandardTextPicker texts={textsByType.not_included} onSelect={setNotIncluded} />
                      </div>
                      <textarea value={notIncluded} onChange={(e) => setNotIncluded(e.target.value)} placeholder="Vad ingår inte..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">ÄTA-villkor</label>
                        <StandardTextPicker texts={textsByType.ata_terms} onSelect={setAtaTerms} />
                      </div>
                      <textarea value={ataTerms} onChange={(e) => setAtaTerms(e.target.value)} placeholder="Ändrings- och tilläggsarbeten..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">Betalningsvillkor</label>
                        <StandardTextPicker texts={textsByType.payment_terms} onSelect={setPaymentTermsText} />
                      </div>
                      <textarea value={paymentTermsText} onChange={(e) => setPaymentTermsText(e.target.value)} placeholder="Betalningsvillkor..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-y" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Betalningsplan (collapsible) ──────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
              <button
                type="button"
                onClick={() => setShowPaymentPlan(!showPaymentPlan)}
                className="w-full flex items-center justify-between px-7 py-4 text-left"
              >
                <span className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1]">
                  Betalningsplan
                  {paymentPlan.length > 0 && ` (${paymentPlan.length})`}
                </span>
                <ChevronDown className={`w-4 h-4 text-[#CBD5E1] transition-transform ${showPaymentPlan ? 'rotate-180' : ''}`} />
              </button>
              {showPaymentPlan && (
                <div className="px-7 pb-6">
                  {paymentPlan.length === 0 ? (
                    <p className="text-[12px] text-[#94A3B8] mb-3">Ingen betalningsplan. Lägg till delbetalningar nedan.</p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {calculatedPaymentPlan.map((entry, idx) => (
                        <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_1fr_32px] gap-2 items-center bg-[#F8FAFC] rounded-lg p-3">
                          <input type="text" value={entry.label} onChange={(e) => updatePaymentPlanEntry(idx, 'label', e.target.value)} placeholder="T.ex. Vid start" className="px-3 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#1E293B] text-[13px] bg-white focus:outline-none focus:border-[#0F766E]" />
                          <div className="flex items-center gap-1">
                            <input type="number" value={entry.percent} onChange={(e) => updatePaymentPlanEntry(idx, 'percent', parseFloat(e.target.value) || 0)} className="w-full px-2 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#1E293B] text-[13px] text-right bg-white focus:outline-none focus:border-[#0F766E]" />
                            <span className="text-[#94A3B8] text-[13px]">%</span>
                          </div>
                          <span className="text-[13px] text-[#1E293B] font-medium text-right">{formatCurrency(entry.amount)}</span>
                          <input type="text" value={entry.due_description} onChange={(e) => updatePaymentPlanEntry(idx, 'due_description', e.target.value)} placeholder="Förfallodatum/villkor" className="px-3 py-1.5 border-thin border-[#E2E8F0] rounded-lg text-[#1E293B] text-[13px] bg-white focus:outline-none focus:border-[#0F766E]" />
                          <button onClick={() => removePaymentPlanEntry(idx)} className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#CBD5E1] hover:text-red-500 flex items-center justify-center text-[16px]">×</button>
                        </div>
                      ))}
                      {!paymentPlanValid && (
                        <p className="text-[12px] text-red-500">
                          Procentsatserna summerar till {paymentPlan.reduce((s, e) => s + e.percent, 0).toFixed(0)}% (ska vara 100%)
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={addPaymentPlanEntry}
                    className="flex items-center gap-2 text-[13px] text-[#0F766E] bg-transparent border-none cursor-pointer"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#0F766E" strokeWidth="1"/><path d="M8 5v6M5 8h6" stroke="#0F766E" strokeWidth="1.2" strokeLinecap="round"/></svg>
                    Lägg till delbetalning
                  </button>
                </div>
              )}
            </div>

            {/* ── Visningsinställningar (collapsible) ─────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
              <button
                type="button"
                onClick={() => setShowDisplaySettings(!showDisplaySettings)}
                className="w-full flex items-center justify-between px-7 py-4 text-left"
              >
                <span className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1]">Visningsinställningar</span>
                <ChevronDown className={`w-4 h-4 text-[#CBD5E1] transition-transform ${showDisplaySettings ? 'rotate-180' : ''}`} />
              </button>
              {showDisplaySettings && (
                <div className="px-7 pb-6 space-y-4">
                  <div>
                    <label className="block text-[12px] text-[#64748B] mb-1">Detaljnivå</label>
                    <select
                      value={detailLevel}
                      onChange={(e) => setDetailLevel(e.target.value as DetailLevel)}
                      className="w-full sm:w-64 px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                    >
                      <option value="detailed">Detaljerad (alla rader)</option>
                      <option value="subtotals_only">Endast delsummor</option>
                      <option value="total_only">Endast totalsumma</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showUnitPrices} onChange={(e) => setShowUnitPrices(e.target.checked)} className="w-4 h-4 rounded border-[#E2E8F0] text-[#0F766E] focus:ring-[#0F766E]" />
                      <span className="text-[13px] text-[#64748B]">Visa à-priser</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showQuantities} onChange={(e) => setShowQuantities(e.target.checked)} className="w-4 h-4 rounded border-[#E2E8F0] text-[#0F766E] focus:ring-[#0F766E]" />
                      <span className="text-[13px] text-[#64748B]">Visa antal</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={showCategorySubtotals} onChange={(e) => setShowCategorySubtotals(e.target.checked)} className="w-4 h-4 rounded border-[#E2E8F0] text-[#0F766E] focus:ring-[#0F766E]" />
                      <span className="text-[13px] text-[#64748B]">Visa delsummor per kategori</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* Right Column — Sidebar                                    */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-4">
            {/* Stil-väljare — overridar business default per offert */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1]">Offertstil</span>
                {templateStyle && (
                  <button
                    type="button"
                    onClick={() => setTemplateStyle(null)}
                    className="text-[10px] text-[#94A3B8] hover:text-primary-700"
                  >
                    Återställ till standard
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
                      className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-[#E2E8F0] hover:border-primary-300'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#1E293B]">{opt.label}</div>
                      <div className="text-[10px] text-[#94A3B8]">{opt.tagline}</div>
                      {isDefault && <div className="text-[9px] text-primary-700 mt-0.5">Standard</div>}
                    </button>
                  )
                })}
              </div>
              <a
                href={`/api/quotes/pdf?id=${quoteId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-primary-700 hover:text-primary-800 font-medium"
              >
                <Eye className="w-3 h-3" />
                Förhandsgranska design (sparas först)
              </a>
            </div>

            {/* Preview panel (collapsible) */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl hidden lg:block">
              <button
                type="button"
                onClick={() => setShowPreviewPanel(!showPreviewPanel)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <span className="flex items-center gap-2">
                  <Eye className="w-3.5 h-3.5 text-[#CBD5E1]" />
                  <span className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1]">Förhandsgranska</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-[#CBD5E1] transition-transform ${showPreviewPanel ? 'rotate-180' : ''}`} />
              </button>
              {showPreviewPanel && debouncedPreviewData && (
                <div className="px-3 pb-3">
                  <QuotePreview
                    data={debouncedPreviewData}
                    businessName={business.business_name}
                    contactName={business.contact_name}
                  />
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-6 py-5">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Summering <span className="normal-case">(exkl. moms)</span></div>

              <div className="space-y-1">
                <div className="flex justify-between py-[5px] text-[13px]">
                  <span className="text-[#64748B]">Arbete</span>
                  <span className="text-[#64748B]">{formatCurrency(totals.laborTotal)}</span>
                </div>
                <div className="flex justify-between py-[5px] text-[13px]">
                  <span className="text-[#64748B]">Material</span>
                  <span className="text-[#64748B]">{formatCurrency(totals.materialTotal)}</span>
                </div>
                {totals.serviceTotal > 0 && (
                  <div className="flex justify-between py-[5px] text-[13px]">
                    <span className="text-[#64748B]">Tjänster</span>
                    <span className="text-[#64748B]">{formatCurrency(totals.serviceTotal)}</span>
                  </div>
                )}
                <div className="flex justify-between py-[5px] text-[13px]">
                  <span className="text-[#64748B]">Moms {vatRate}%</span>
                  <span className="text-[#64748B]">{formatCurrency(totals.vat)}</span>
                </div>

                {/* Discount */}
                {discountPercent > 0 && totals.discountAmount > 0 && (
                  <div className="flex justify-between py-[5px] text-[13px]">
                    <span className="text-[#64748B]">Rabatt {discountPercent}%</span>
                    <span className="text-[#64748B]">−{formatCurrency(totals.discountAmount)}</span>
                  </div>
                )}

                {/* ROT line */}
                {hasRotItems && totals.rotDeduction > 0 && (
                  <div className="flex justify-between py-[5px] text-[13px] text-[#0F766E]">
                    <span>ROT-avdrag 30%</span>
                    <span>−{formatCurrency(totals.rotDeduction)}</span>
                  </div>
                )}

                {/* RUT line */}
                {hasRutItems && totals.rutDeduction > 0 && (
                  <div className="flex justify-between py-[5px] text-[13px] text-[#0F766E]">
                    <span>RUT-avdrag 50%</span>
                    <span>−{formatCurrency(totals.rutDeduction)}</span>
                  </div>
                )}

                {/* Total */}
                <div className="flex justify-between border-t border-thin border-[#E2E8F0] mt-2 pt-3 text-[15px] font-medium text-[#1E293B]">
                  <span>Totalt <span className="text-[11px] font-normal text-gray-400">inkl. moms</span></span>
                  <span>{formatCurrency(totals.total)}</span>
                </div>
              </div>

              {/* Kund betalar box */}
              {(hasRotItems || hasRutItems) && (totals.rotDeduction > 0 || totals.rutDeduction > 0) && (
                <div className="bg-[#CCFBF1] rounded-lg px-4 py-3.5 mt-3 flex justify-between items-center">
                  <span className="text-[12px] text-[#0F766E]">Kund betalar</span>
                  <span className="text-[20px] font-medium text-[#0F766E]">
                    {formatCurrency(hasRotItems ? totals.rotCustomerPays : totals.rutCustomerPays)}
                  </span>
                </div>
              )}

              {/* Discount input (small) */}
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-thin border-[#E2E8F0]">
                <span className="text-[12px] text-[#94A3B8]">Rabatt</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                    className="w-14 px-2 py-1 border-thin border-[#E2E8F0] rounded text-[#1E293B] text-[13px] text-right bg-white focus:outline-none focus:border-[#0F766E]"
                    min={0}
                    max={100}
                  />
                  <span className="text-[#94A3B8] text-[13px]">%</span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <button
              onClick={() => saveQuote(true)}
              disabled={saving || !selectedCustomer}
              className="w-full py-3 bg-[#0F766E] text-white border-none rounded-lg text-[14px] font-medium cursor-pointer disabled:opacity-50"
            >
              {saving ? 'Sparar...' : 'Skicka offert'}
            </button>
            <button
              onClick={() => saveQuote(false)}
              disabled={saving}
              className="w-full py-2.5 bg-transparent text-[#64748B] border-thin border-[#E2E8F0] rounded-lg text-[13px] cursor-pointer hover:bg-[#F8FAFC] disabled:opacity-50"
            >
              Spara utkast
            </button>
            {items.length > 0 && (
              <button
                onClick={() => { setTemplateName(title); setShowSaveTemplateModal(true) }}
                className="w-full py-2.5 bg-transparent text-[#64748B] border-thin border-[#E2E8F0] rounded-lg text-[13px] cursor-pointer hover:bg-[#F8FAFC]"
              >
                Spara som mall
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile preview button (floating) ────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowPreviewModal(true)}
        className="fixed bottom-6 right-6 z-40 lg:hidden flex items-center gap-2 px-4 py-3 bg-[#0F766E] text-white rounded-full shadow-lg hover:bg-[#0D655D] transition-colors"
      >
        <Eye className="w-4 h-4" />
        <span className="text-sm font-medium">Förhandsgranska</span>
      </button>

      {/* ── Mobile preview modal ─────────────────────────────────── */}
      {showPreviewModal && debouncedPreviewData && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 pt-8 overflow-y-auto lg:hidden"
          onClick={() => setShowPreviewModal(false)}
        >
          <div
            className="bg-[#F8FAFC] rounded-xl w-full max-w-lg relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#E2E8F0]">
              <span className="text-sm font-medium text-[#1E293B]">Förhandsgranska offert</span>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="p-1 text-[#94A3B8] hover:text-[#1E293B] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <QuotePreview
                data={debouncedPreviewData}
                businessName={business.business_name}
                contactName={business.contact_name}
              />
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────── */}

      {/* Grossist search */}
      <ProductSearchModal
        isOpen={showGrossistSearch}
        onClose={() => setShowGrossistSearch(false)}
        onSelect={addFromGrossist}
        businessId={business.business_id}
      />

      {/* Save as Template Modal */}
      {showSaveTemplateModal && (
        <div
          className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4"
          onClick={() => setShowSaveTemplateModal(false)}
        >
          <div
            className="bg-white border-thin border-[#E2E8F0] rounded-xl w-full max-w-md px-8 py-7"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-medium text-[#1E293B] mb-5">Spara som mall</h3>
            <div className="mb-5">
              <label className="block text-[12px] text-[#64748B] mb-1">Mallnamn</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="T.ex. Byte elcentral"
                autoFocus
                className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="px-4 py-2.5 bg-transparent text-[#64748B] border-thin border-[#E2E8F0] rounded-lg text-[13px] cursor-pointer"
              >
                Avbryt
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 py-2.5 bg-[#0F766E] text-white border-none rounded-lg text-[14px] font-medium cursor-pointer disabled:opacity-50"
              >
                {savingTemplate ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

