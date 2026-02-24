'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Send,
  Save,
  FileText,
  User,
  Calculator,
  Loader2,
  Search,
  Bookmark,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Type,
  Minus,
  Hash,
  AlignLeft,
  Settings2,
  CreditCard,
  ClipboardList,
  MapPin,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import Link from 'next/link'
import ProductSearchModal from '@/components/ProductSearchModal'
import { SelectedProduct } from '@/lib/suppliers/types'
import {
  QuoteItem,
  PaymentPlanEntry,
  QuoteStandardText,
  DetailLevel,
} from '@/lib/types/quote'
import {
  calculateQuoteTotals,
  generateItemId,
  createDefaultItem,
  recalculateItems,
  calculatePaymentPlan,
  validatePaymentPlan,
} from '@/lib/quote-calculations'

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

const ITEM_TYPE_STYLES: Record<QuoteItem['item_type'], string> = {
  item: 'bg-gray-50',
  heading: 'bg-blue-50 font-bold',
  text: 'bg-gray-50 italic',
  subtotal: 'bg-gray-100 font-medium',
  discount: 'bg-red-50',
}

const ITEM_TYPE_BADGE: Record<QuoteItem['item_type'], { label: string; cls: string }> = {
  item: { label: 'Post', cls: 'bg-blue-100 text-blue-700' },
  heading: { label: 'Rubrik', cls: 'bg-indigo-100 text-indigo-700' },
  text: { label: 'Text', cls: 'bg-gray-200 text-gray-600' },
  subtotal: { label: 'Delsumma', cls: 'bg-gray-300 text-gray-700' },
  discount: { label: 'Rabatt', cls: 'bg-red-100 text-red-700' },
}

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
        className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
      >
        Välj standardtext
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-6 z-20 bg-white border border-gray-200 rounded-lg shadow-lg w-64 max-h-48 overflow-y-auto">
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
                  <span className="ml-1 text-[10px] text-blue-600 bg-blue-50 px-1 rounded">
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
  const quoteId = params.id as string
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

  // Grossist search modal
  const [showGrossistSearch, setShowGrossistSearch] = useState(false)

  // Collapsible sections
  const [showStandardTexts, setShowStandardTexts] = useState(false)
  const [showPaymentPlan, setShowPaymentPlan] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)

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
    const [customersRes, priceListRes, settingsRes] = await Promise.all([
      supabase.from('customer').select('*').eq('business_id', business.business_id),
      supabase
        .from('price_list')
        .select('*')
        .eq('business_id', business.business_id)
        .eq('is_active', true),
      supabase
        .from('business_config')
        .select('pricing_settings')
        .eq('business_id', business.business_id)
        .single(),
    ])

    setCustomers(customersRes.data || [])
    setPriceList(priceListRes.data || [])
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
        // Mutual exclusion: ROT and RUT cannot both be true
        if (field === 'is_rot_eligible' && value === true) {
          updated.is_rut_eligible = false
        }
        if (field === 'is_rut_eligible' && value === true) {
          updated.is_rot_eligible = false
        }
        return updated
      })
    )
  }, [])

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
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Full Form
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]" />
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Link
            href={`/dashboard/quotes/${quoteId}`}
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
              Redigera offert
              {quoteNumberRef.current && (
                <span className="ml-2 text-sm font-normal text-gray-400">
                  {quoteNumberRef.current}
                </span>
              )}
            </h1>
            {/* Auto-save indicator */}
            <div className="h-5">
              {autoSaveStatus === 'saving' && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Sparar...
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  Sparad
                </span>
              )}
              {autoSaveStatus === 'error' && (
                <span className="text-xs text-red-500">
                  Kunde inte spara automatiskt
                </span>
              )}
            </div>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => {
                setTemplateName(title)
                setShowSaveTemplateModal(true)
              }}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-500 hover:text-gray-900 hover:bg-gray-200 text-sm"
            >
              <Bookmark className="w-4 h-4" />
              <span className="hidden sm:inline">Spara mall</span>
            </button>
          )}
          <button
            onClick={() => saveQuote(false)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span className="hidden sm:inline">Spara</span>
          </button>
          <button
            onClick={() => saveQuote(true)}
            disabled={saving || !selectedCustomer}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Skicka</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* ══════════════════════════════════════════════════════════ */}
          {/* Main Content (col-span-2) */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="lg:col-span-2 space-y-6">
            {/* ── Customer & Basic Info ──────────────────────────────── */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-600" />
                Kundinformation
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Kund *</label>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value="">Välj kund...</option>
                    {customers.map((c) => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.name} - {c.phone_number}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Giltighetstid</label>
                  <select
                    value={validDays}
                    onChange={(e) => setValidDays(parseInt(e.target.value))}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value={14}>14 dagar</option>
                    <option value={30}>30 dagar</option>
                    <option value={60}>60 dagar</option>
                    <option value={90}>90 dagar</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-500 mb-1">Titel</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="T.ex. Elinstallation kök"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-500 mb-1">Beskrivning</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Beskriv arbetet som ska utföras..."
                    rows={2}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* ── Reference Fields ───────────────────────────────────── */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-violet-600" />
                Referenser
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Er referens</label>
                  <input
                    type="text"
                    value={referencePerson}
                    onChange={(e) => setReferencePerson(e.target.value)}
                    placeholder="Namn"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Kundens referens</label>
                  <input
                    type="text"
                    value={customerReference}
                    onChange={(e) => setCustomerReference(e.target.value)}
                    placeholder="Referensnummer"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Arbetsplatsadress</label>
                  <input
                    type="text"
                    value={projectAddress}
                    onChange={(e) => setProjectAddress(e.target.value)}
                    placeholder="Adress"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            </div>

            {/* ── Standard Texts (collapsible) ──────────────────────── */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setShowStandardTexts(!showStandardTexts)}
                className="w-full flex items-center justify-between p-4 sm:p-6 text-left"
              >
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <AlignLeft className="w-5 h-5 text-emerald-600" />
                  Standardtexter
                </h2>
                {showStandardTexts ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {showStandardTexts && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 space-y-4 border-t border-gray-100 pt-4">
                  {/* Introduction */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-gray-500">Inledningstext</label>
                      <StandardTextPicker
                        texts={textsByType.introduction}
                        onSelect={setIntroductionText}
                      />
                    </div>
                    <textarea
                      value={introductionText}
                      onChange={(e) => setIntroductionText(e.target.value)}
                      placeholder="Hälsningsfras och inledning..."
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  {/* Conclusion */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-gray-500">Avslutningstext</label>
                      <StandardTextPicker
                        texts={textsByType.conclusion}
                        onSelect={setConclusionText}
                      />
                    </div>
                    <textarea
                      value={conclusionText}
                      onChange={(e) => setConclusionText(e.target.value)}
                      placeholder="Avslutande text..."
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  {/* Not included */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-gray-500">Ej inkluderat</label>
                      <StandardTextPicker
                        texts={textsByType.not_included}
                        onSelect={setNotIncluded}
                      />
                    </div>
                    <textarea
                      value={notIncluded}
                      onChange={(e) => setNotIncluded(e.target.value)}
                      placeholder="Vad ingår inte..."
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  {/* ATA terms */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-gray-500">ÄTA-villkor</label>
                      <StandardTextPicker
                        texts={textsByType.ata_terms}
                        onSelect={setAtaTerms}
                      />
                    </div>
                    <textarea
                      value={ataTerms}
                      onChange={(e) => setAtaTerms(e.target.value)}
                      placeholder="Ändrings- och tilläggsarbeten..."
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  {/* Payment terms */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-gray-500">Betalningsvillkor</label>
                      <StandardTextPicker
                        texts={textsByType.payment_terms}
                        onSelect={setPaymentTermsText}
                      />
                    </div>
                    <textarea
                      value={paymentTermsText}
                      onChange={(e) => setPaymentTermsText(e.target.value)}
                      placeholder="Betalningsvillkor..."
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── Item Editor ────────────────────────────────────────── */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-600" />
                  Offertrader
                </h2>
              </div>

              {/* Add buttons */}
              <div className="flex flex-wrap gap-2 mb-4">
                <button
                  onClick={() => addItem('item')}
                  className="px-3 py-1.5 bg-blue-100 border border-blue-200 rounded-lg text-blue-700 text-sm hover:bg-blue-200 flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" /> Post
                </button>
                <button
                  onClick={() => addItem('heading')}
                  className="px-3 py-1.5 bg-indigo-100 border border-indigo-200 rounded-lg text-indigo-700 text-sm hover:bg-indigo-200 flex items-center gap-1"
                >
                  <Type className="w-3.5 h-3.5" /> Rubrik
                </button>
                <button
                  onClick={() => addItem('text')}
                  className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 text-sm hover:bg-gray-200 flex items-center gap-1"
                >
                  <AlignLeft className="w-3.5 h-3.5" /> Fritext
                </button>
                <button
                  onClick={() => addItem('subtotal')}
                  className="px-3 py-1.5 bg-gray-200 border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-300 flex items-center gap-1"
                >
                  <Hash className="w-3.5 h-3.5" /> Delsumma
                </button>
                <button
                  onClick={() => addItem('discount')}
                  className="px-3 py-1.5 bg-red-100 border border-red-200 rounded-lg text-red-700 text-sm hover:bg-red-200 flex items-center gap-1"
                >
                  <Minus className="w-3.5 h-3.5" /> Rabatt
                </button>
                <button
                  onClick={() => setShowGrossistSearch(true)}
                  className="px-3 py-1.5 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-700 text-sm hover:bg-emerald-200 flex items-center gap-1"
                >
                  <Search className="w-3.5 h-3.5" /> Sök grossist
                </button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Inga rader ännu. Lägg till poster ovan.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {/* Table header (desktop) */}
                  <div className="hidden md:grid md:grid-cols-[40px_70px_1fr_70px_80px_90px_90px_60px_40px] gap-2 px-3 py-1 text-xs text-gray-400 font-medium">
                    <span />
                    <span>Typ</span>
                    <span>Beskrivning</span>
                    <span className="text-center">Antal</span>
                    <span className="text-center">Enhet</span>
                    <span className="text-right">Pris</span>
                    <span className="text-right">Summa</span>
                    <span className="text-center">ROT/RUT</span>
                    <span />
                  </div>

                  {items.map((item, index) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      index={index}
                      total={items.length}
                      recalculatedTotal={recalculated[index]?.total ?? item.total}
                      onUpdate={updateItem}
                      onRemove={removeItem}
                      onMove={moveItem}
                    />
                  ))}
                </div>
              )}

              {/* Quick add from price list */}
              {priceList.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <p className="text-sm text-gray-400 mb-2">Snabbval från prislista:</p>
                  <div className="flex flex-wrap gap-2">
                    {priceList.slice(0, 8).map((item) => (
                      <button
                        key={item.id}
                        onClick={() => addFromPriceList(item)}
                        className="px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-gray-700 text-sm hover:bg-gray-200 hover:text-gray-900"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Payment Plan (collapsible) ──────────────────────────── */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setShowPaymentPlan(!showPaymentPlan)}
                className="w-full flex items-center justify-between p-4 sm:p-6 text-left"
              >
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                  Betalningsplan
                  {paymentPlan.length > 0 && (
                    <span className="text-xs font-normal text-gray-400">
                      ({paymentPlan.length} delbetalning{paymentPlan.length > 1 ? 'ar' : ''})
                    </span>
                  )}
                </h2>
                {showPaymentPlan ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {showPaymentPlan && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-gray-100 pt-4">
                  {paymentPlan.length === 0 ? (
                    <p className="text-sm text-gray-400 mb-3">
                      Ingen betalningsplan. Lägg till delbetalningar nedan.
                    </p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {calculatedPaymentPlan.map((entry, idx) => (
                        <div
                          key={idx}
                          className="grid grid-cols-1 sm:grid-cols-[1fr_80px_100px_1fr_40px] gap-2 items-center bg-gray-50 rounded-lg p-3"
                        >
                          <input
                            type="text"
                            value={entry.label}
                            onChange={(e) =>
                              updatePaymentPlanEntry(idx, 'label', e.target.value)
                            }
                            placeholder="T.ex. Vid start"
                            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              value={entry.percent}
                              onChange={(e) =>
                                updatePaymentPlanEntry(
                                  idx,
                                  'percent',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-full px-2 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                            />
                            <span className="text-gray-400 text-sm">%</span>
                          </div>
                          <span className="text-sm text-gray-700 font-medium text-right">
                            {formatCurrency(entry.amount)}
                          </span>
                          <input
                            type="text"
                            value={entry.due_description}
                            onChange={(e) =>
                              updatePaymentPlanEntry(idx, 'due_description', e.target.value)
                            }
                            placeholder="Förfallodatum/villkor"
                            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                          <button
                            onClick={() => removePaymentPlanEntry(idx)}
                            className="p-1.5 text-gray-400 hover:text-red-600 justify-self-center"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {!paymentPlanValid && (
                        <p className="text-xs text-red-600">
                          Procentsatserna summerar till{' '}
                          {paymentPlan.reduce((s, e) => s + e.percent, 0).toFixed(0)}% (ska vara
                          100%)
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    onClick={addPaymentPlanEntry}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-600 text-sm hover:bg-gray-200"
                  >
                    <Plus className="w-4 h-4" /> Lägg till delbetalning
                  </button>
                </div>
              )}
            </div>

            {/* ── Display Settings (collapsible) ─────────────────────── */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200">
              <button
                type="button"
                onClick={() => setShowDisplaySettings(!showDisplaySettings)}
                className="w-full flex items-center justify-between p-4 sm:p-6 text-left"
              >
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Settings2 className="w-5 h-5 text-gray-500" />
                  Visningsinställningar
                </h2>
                {showDisplaySettings ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>
              {showDisplaySettings && (
                <div className="px-4 sm:px-6 pb-4 sm:pb-6 border-t border-gray-100 pt-4 space-y-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Detaljnivå</label>
                    <select
                      value={detailLevel}
                      onChange={(e) => setDetailLevel(e.target.value as DetailLevel)}
                      className="w-full sm:w-64 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="detailed">Detaljerad (alla rader)</option>
                      <option value="subtotals_only">Endast delsummor</option>
                      <option value="total_only">Endast totalsumma</option>
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showUnitPrices}
                        onChange={(e) => setShowUnitPrices(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        {showUnitPrices ? (
                          <Eye className="w-4 h-4 text-gray-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        )}
                        Visa à-priser
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showQuantities}
                        onChange={(e) => setShowQuantities(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 flex items-center gap-1">
                        {showQuantities ? (
                          <Eye className="w-4 h-4 text-gray-400" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-400" />
                        )}
                        Visa antal
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* Sidebar (col-span-1) */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6 lg:sticky lg:top-4">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-blue-600" />
                Summering
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Arbete</span>
                  <span className="text-gray-900">{formatCurrency(totals.laborTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Material</span>
                  <span className="text-gray-900">{formatCurrency(totals.materialTotal)}</span>
                </div>
                {totals.serviceTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tjänster</span>
                    <span className="text-gray-900">{formatCurrency(totals.serviceTotal)}</span>
                  </div>
                )}

                <div className="border-t border-gray-200 pt-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Summa</span>
                    <span className="text-gray-900">{formatCurrency(totals.subtotal)}</span>
                  </div>
                </div>

                {/* Discount */}
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Rabatt</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-right"
                      min={0}
                      max={100}
                    />
                    <span className="text-gray-400">%</span>
                  </div>
                </div>
                {totals.discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Rabatt</span>
                    <span>-{formatCurrency(totals.discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-500">Moms ({vatRate}%)</span>
                  <span className="text-gray-900">{formatCurrency(totals.vat)}</span>
                </div>

                <div className="border-t border-gray-200 pt-3">
                  <div className="flex justify-between text-lg font-semibold">
                    <span className="text-gray-900">Totalt</span>
                    <span className="text-gray-900">{formatCurrency(totals.total)}</span>
                  </div>
                </div>

                {/* ── ROT/RUT breakdown ──────────────────────────────── */}
                {(hasRotItems || hasRutItems) && (
                  <div className="border-t border-gray-200 pt-3 space-y-3">
                    {hasRotItems && totals.rotWorkCost > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-emerald-700">ROT-berättigat arbete</span>
                          <span className="text-gray-900">
                            {formatCurrency(totals.rotWorkCost)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-emerald-700">ROT-avdrag (30%)</span>
                          <span className="text-emerald-600">
                            -{formatCurrency(totals.rotDeduction)}
                          </span>
                        </div>
                        <div className="border-t border-emerald-200 pt-2">
                          <div className="flex justify-between font-semibold text-sm">
                            <span className="text-gray-900">Kund betalar</span>
                            <span className="text-emerald-600">
                              {formatCurrency(totals.rotCustomerPays)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {hasRutItems && totals.rutWorkCost > 0 && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <div className="flex justify-between text-sm mb-1">
                          <span className="text-emerald-700">RUT-berättigat arbete</span>
                          <span className="text-gray-900">
                            {formatCurrency(totals.rutWorkCost)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-emerald-700">RUT-avdrag (50%)</span>
                          <span className="text-emerald-600">
                            -{formatCurrency(totals.rutDeduction)}
                          </span>
                        </div>
                        <div className="border-t border-emerald-200 pt-2">
                          <div className="flex justify-between font-semibold text-sm">
                            <span className="text-gray-900">Kund betalar</span>
                            <span className="text-emerald-600">
                              {formatCurrency(totals.rutCustomerPays)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Personnummer / fastighetsbeteckning */}
                    <div className="space-y-3 mt-2">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">
                          Personnummer *
                        </label>
                        <input
                          type="text"
                          value={personnummer}
                          onChange={(e) => setPersonnummer(e.target.value)}
                          placeholder="YYYYMMDD-XXXX"
                          className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      {hasRotItems && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">
                            Fastighetsbeteckning *
                          </label>
                          <input
                            type="text"
                            value={fastighetsbeteckning}
                            onChange={(e) => setFastighetsbeteckning(e.target.value)}
                            placeholder="T.ex. Stockholm Söder 1:23"
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                      )}
                      {!personnummer && (
                        <p className="text-xs text-amber-600">
                          Personnummer krävs för{' '}
                          {hasRotItems && hasRutItems
                            ? 'ROT/RUT'
                            : hasRotItems
                              ? 'ROT'
                              : 'RUT'}
                          -avdrag
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

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
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowSaveTemplateModal(false)}
        >
          <div
            className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Spara som mall</h3>
            <div className="mb-4">
              <label className="block text-sm text-gray-500 mb-1">Mallnamn</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="T.ex. Byte elcentral"
                autoFocus
                className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowSaveTemplateModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
              >
                Avbryt
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
              >
                {savingTemplate ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Spara'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// ItemRow - extracted for readability
// ═══════════════════════════════════════════════════════════════════════════════

function ItemRow({
  item,
  index,
  total: itemCount,
  recalculatedTotal,
  onUpdate,
  onRemove,
  onMove,
}: {
  item: QuoteItem
  index: number
  total: number
  recalculatedTotal: number
  onUpdate: (id: string, field: keyof QuoteItem, value: any) => void
  onRemove: (id: string) => void
  onMove: (index: number, direction: 'up' | 'down') => void
}) {
  const badge = ITEM_TYPE_BADGE[item.item_type]
  const rowStyle = ITEM_TYPE_STYLES[item.item_type]
  const isEditable = item.item_type === 'item' || item.item_type === 'discount'
  const showTotal = item.item_type === 'item' || item.item_type === 'discount' || item.item_type === 'subtotal'
  const displayTotal =
    item.item_type === 'subtotal' ? recalculatedTotal : item.item_type === 'discount' ? item.total : item.total

  return (
    <div className={`rounded-xl p-3 ${rowStyle} border border-gray-200`}>
      {/* ── Mobile layout ──────────────────────────────────────── */}
      <div className="md:hidden space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-0.5">
            <button
              onClick={() => onMove(index, 'up')}
              disabled={index === 0}
              className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              <ArrowUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => onMove(index, 'down')}
              disabled={index === itemCount - 1}
              className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
            >
              <ArrowDown className="w-3 h-3" />
            </button>
          </div>
          <span className={`px-2 py-0.5 text-[10px] rounded font-medium ${badge.cls}`}>
            {badge.label}
          </span>
          <input
            type="text"
            value={item.description}
            onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
            placeholder={
              item.item_type === 'heading'
                ? 'Rubriktext'
                : item.item_type === 'text'
                  ? 'Fritext...'
                  : 'Beskrivning'
            }
            className={`flex-1 px-3 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 min-w-0 ${
              item.item_type === 'heading' ? 'font-bold' : ''
            } ${item.item_type === 'text' ? 'italic' : ''}`}
          />
          <button
            onClick={() => onRemove(item.id)}
            className="p-1.5 text-gray-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        {isEditable && (
          <div className="flex items-center gap-2 pl-8">
            <input
              type="number"
              value={item.quantity}
              onChange={(e) => onUpdate(item.id, 'quantity', parseFloat(e.target.value) || 0)}
              className="w-16 px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              min={0}
              step="any"
            />
            <select
              value={item.unit}
              onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
              className="w-20 px-1 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {UNIT_OPTIONS.map((u) => (
                <option key={u.value} value={u.value}>
                  {u.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={item.unit_price}
              onChange={(e) =>
                onUpdate(item.id, 'unit_price', parseFloat(e.target.value) || 0)
              }
              className="w-24 px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              min={0}
              step="any"
            />
            <span className="text-gray-900 font-medium text-sm flex-1 text-right whitespace-nowrap">
              {formatCurrency(displayTotal)}
            </span>
          </div>
        )}
        {isEditable && (
          <div className="flex items-center gap-3 pl-8 text-xs">
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={item.is_rot_eligible}
                onChange={(e) => onUpdate(item.id, 'is_rot_eligible', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-gray-600">ROT</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={item.is_rut_eligible}
                onChange={(e) => onUpdate(item.id, 'is_rut_eligible', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="text-gray-600">RUT</span>
            </label>
          </div>
        )}
        {showTotal && !isEditable && (
          <div className="flex justify-end pr-8">
            <span className="text-gray-900 font-medium text-sm">
              {formatCurrency(displayTotal)}
            </span>
          </div>
        )}
      </div>

      {/* ── Desktop layout ─────────────────────────────────────── */}
      <div className="hidden md:grid md:grid-cols-[40px_70px_1fr_70px_80px_90px_90px_60px_40px] gap-2 items-center">
        {/* Move arrows */}
        <div className="flex flex-col gap-0.5 items-center">
          <button
            onClick={() => onMove(index, 'up')}
            disabled={index === 0}
            className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <ArrowUp className="w-3 h-3" />
          </button>
          <button
            onClick={() => onMove(index, 'down')}
            disabled={index === itemCount - 1}
            className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"
          >
            <ArrowDown className="w-3 h-3" />
          </button>
        </div>

        {/* Type badge */}
        <span className={`px-2 py-0.5 text-[10px] rounded font-medium text-center ${badge.cls}`}>
          {badge.label}
        </span>

        {/* Description */}
        <input
          type="text"
          value={item.description}
          onChange={(e) => onUpdate(item.id, 'description', e.target.value)}
          placeholder={
            item.item_type === 'heading'
              ? 'Rubriktext'
              : item.item_type === 'text'
                ? 'Fritext...'
                : item.item_type === 'subtotal'
                  ? 'Delsumma'
                  : 'Beskrivning'
          }
          className={`w-full px-3 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${
            item.item_type === 'heading' ? 'font-bold' : ''
          } ${item.item_type === 'text' ? 'italic' : ''}`}
        />

        {/* Quantity */}
        {isEditable ? (
          <input
            type="number"
            value={item.quantity}
            onChange={(e) => onUpdate(item.id, 'quantity', parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            min={0}
            step="any"
          />
        ) : (
          <span />
        )}

        {/* Unit */}
        {isEditable ? (
          <select
            value={item.unit}
            onChange={(e) => onUpdate(item.id, 'unit', e.target.value)}
            className="w-full px-1 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            {UNIT_OPTIONS.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </select>
        ) : (
          <span />
        )}

        {/* Unit price */}
        {isEditable ? (
          <input
            type="number"
            value={item.unit_price}
            onChange={(e) =>
              onUpdate(item.id, 'unit_price', parseFloat(e.target.value) || 0)
            }
            className="w-full px-2 py-1.5 bg-white/70 border border-gray-300 rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            min={0}
            step="any"
          />
        ) : (
          <span />
        )}

        {/* Total */}
        <span className="text-gray-900 font-medium text-sm text-right whitespace-nowrap">
          {showTotal ? formatCurrency(displayTotal) : ''}
        </span>

        {/* ROT/RUT checkboxes */}
        {isEditable ? (
          <div className="flex items-center gap-1 justify-center">
            <label
              className="cursor-pointer"
              title="ROT-berättigat"
            >
              <input
                type="checkbox"
                checked={item.is_rot_eligible}
                onChange={(e) => onUpdate(item.id, 'is_rot_eligible', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="sr-only">ROT</span>
            </label>
            <label
              className="cursor-pointer"
              title="RUT-berättigat"
            >
              <input
                type="checkbox"
                checked={item.is_rut_eligible}
                onChange={(e) => onUpdate(item.id, 'is_rut_eligible', e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span className="sr-only">RUT</span>
            </label>
          </div>
        ) : (
          <span />
        )}

        {/* Delete */}
        <button
          onClick={() => onRemove(item.id)}
          className="p-1.5 text-gray-400 hover:text-red-600 justify-self-center"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
