'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Sparkles,
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
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import Link from 'next/link'
import ProductSearchModal from '@/components/ProductSearchModal'
import { SelectedProduct } from '@/lib/suppliers/types'
import InputSelector, { InputMethod } from '@/components/quotes/InputSelector'
import PhotoCapture from '@/components/quotes/PhotoCapture'
import VoiceRecorder from '@/components/quotes/VoiceRecorder'
import AIQuotePreview from '@/components/quotes/AIQuotePreview'
import TemplateSelector from '@/components/quotes/TemplateSelector'
import {
  QuoteItem,
  PaymentPlanEntry,
  QuoteStandardText,
  QuoteTemplate,
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

type WizardStep = 'select' | 'photo' | 'voice' | 'text' | 'template' | 'ai-preview' | 'form'

const UNIT_OPTIONS = [
  { value: 'st', label: 'st' },
  { value: 'tim', label: 'tim' },
  { value: 'm', label: 'm' },
  { value: 'm2', label: 'm\u00B2' },
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
        V\u00E4lj standardtext
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

export default function NewQuotePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()
  const toast = useToast()

  // ─── Loading / global state ─────────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  // ─── Standard texts (loaded from API) ──────────────────────────────────────
  const [allStandardTexts, setAllStandardTexts] = useState<QuoteStandardText[]>([])

  // ─── Wizard state ──────────────────────────────────────────────────────────
  const [wizardStep, setWizardStep] = useState<WizardStep>('select')
  const [aiResult, setAiResult] = useState<any>(null)
  const [priceComparison, setPriceComparison] = useState<any>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null)
  const [sourceTranscript, setSourceTranscript] = useState<string | null>(null)
  const [aiGenerated, setAiGenerated] = useState(false)
  const [aiTextInput, setAiTextInput] = useState('')

  // ─── Form state ────────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)

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
  const [templateId, setTemplateId] = useState<string | undefined>(undefined)

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
    if (!business.business_id) return
    fetchData()
    fetchStandardTexts()

    // Check query params
    const transcript = searchParams.get('transcript')
    const customerId = searchParams.get('customerId')
    if (transcript) {
      setSourceTranscript(transcript)
      setAiTextInput(transcript)
      setWizardStep('text')
    }
    if (customerId) {
      setSelectedCustomer(customerId)
    }
    if (searchParams.get('mode') === 'manual') {
      setWizardStep('form')
    }
  }, [business.business_id])

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
    setLoading(false)
  }

  async function fetchStandardTexts() {
    try {
      const res = await fetch('/api/quote-standard-texts')
      if (!res.ok) return
      const data = await res.json()
      const texts: QuoteStandardText[] = data.texts || []
      setAllStandardTexts(texts)

      // Pre-populate default texts
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
      // silent – standard texts are optional
    }
  }

  // Auto-fill personnummer / fastighetsbeteckning when customer selected
  useEffect(() => {
    if (!selectedCustomer) return
    const customer = customers.find((c) => c.customer_id === selectedCustomer)
    if (!customer) return
    if (customer.personal_number && !personnummer) setPersonnummer(customer.personal_number)
    if (customer.property_designation && !fastighetsbeteckning)
      setFastighetsbeteckning(customer.property_designation)
    // Also pre-fill project address from customer address if empty
    if (customer.address_line && !projectAddress) setProjectAddress(customer.address_line)
  }, [selectedCustomer])

  // ═══════════════════════════════════════════════════════════════════════════
  // Wizard handlers
  // ═══════════════════════════════════════════════════════════════════════════

  function handleInputSelect(method: InputMethod) {
    if (method === 'text' || method === 'call') setWizardStep('text')
    else if (method === 'photo') setWizardStep('photo')
    else if (method === 'voice') setWizardStep('voice')
    else if (method === 'template') setWizardStep('template')
  }

  async function handlePhotoCapture(base64: string) {
    setSourceImageBase64(base64)
    setGenerating(true)
    try {
      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      })
      const data = await response.json()
      if (data.success) {
        setAiResult(data.quote)
        setPriceComparison(data.priceComparison)
        setAiGenerated(true)
        setWizardStep('ai-preview')
      } else {
        toast.error(data.error || 'AI-generering misslyckades')
        setWizardStep('select')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      toast.error('N\u00E4tverksfel vid AI-generering')
      setWizardStep('select')
    }
    setGenerating(false)
  }

  function handleVoiceTranscript(transcript: string) {
    setVoiceTranscript(transcript)
    setSourceTranscript(transcript)
    setAiTextInput(transcript)
    setTranscribing(false)
    generateFromText(transcript)
  }

  async function generateFromText(text?: string) {
    const inputText = text || aiTextInput
    if (!inputText.trim()) return

    setGenerating(true)
    setWizardStep('ai-preview')
    try {
      const body: any = { textDescription: inputText }
      if (voiceTranscript) body.voiceTranscript = voiceTranscript
      if (sourceImageBase64) body.imageBase64 = sourceImageBase64

      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (data.success) {
        setAiResult(data.quote)
        setPriceComparison(data.priceComparison)
        setAiGenerated(true)
      } else {
        toast.error(data.error || 'AI-generering misslyckades')
        setWizardStep('text')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      toast.error('N\u00E4tverksfel vid AI-generering')
      setWizardStep('text')
    }
    setGenerating(false)
  }

  /** Handle new-format template from /api/quote-templates */
  function handleNewTemplateSelect(template: QuoteTemplate) {
    setTitle(template.name)
    setDescription(template.description || '')
    setTemplateId(template.id)

    // Items
    if (template.default_items && template.default_items.length > 0) {
      const cloned: QuoteItem[] = template.default_items.map((item, idx) => ({
        ...item,
        id: generateItemId(),
        sort_order: idx,
        total: item.item_type === 'item' ? item.quantity * item.unit_price : item.total,
      }))
      setItems(cloned)
    }

    // Payment plan
    if (template.default_payment_plan && template.default_payment_plan.length > 0) {
      setPaymentPlan(template.default_payment_plan)
      setShowPaymentPlan(true)
    }

    // Standard texts
    if (template.introduction_text) setIntroductionText(template.introduction_text)
    if (template.conclusion_text) setConclusionText(template.conclusion_text)
    if (template.not_included) setNotIncluded(template.not_included)
    if (template.ata_terms) setAtaTerms(template.ata_terms)
    if (template.payment_terms_text) setPaymentTermsText(template.payment_terms_text)

    // Display settings
    setDetailLevel(template.detail_level || 'detailed')
    setShowUnitPrices(template.show_unit_prices ?? true)
    setShowQuantities(template.show_quantities ?? true)

    // ROT/RUT: mark eligible items
    if (template.rot_enabled) {
      // already handled per-item from default_items
    }

    setWizardStep('form')
  }

  /** Handle legacy template (from existing TemplateSelector) */
  function handleTemplateSelect(template: any) {
    // Check if this is a new-format template (has default_items array)
    if (template.default_items && Array.isArray(template.default_items) && template.default_items.length > 0) {
      handleNewTemplateSelect(template as QuoteTemplate)
      return
    }

    setTitle(template.name)
    setDescription(template.description || '')

    // Use rich items JSONB if available (existing legacy format)
    if (template.items && Array.isArray(template.items) && template.items.length > 0) {
      setItems(convertLegacyItems(template.items))
    } else {
      // Fallback: old format with estimated_hours + materials array
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
      // Mark labor items as eligible
      setItems((prev) =>
        prev.map((item) => ({
          ...item,
          is_rot_eligible: template.rot_rut_type === 'rot' && item.unit === 'tim',
          is_rut_eligible: template.rot_rut_type === 'rut' && item.unit === 'tim',
        }))
      )
    }

    // Increment usage count (fire-and-forget)
    fetch('/api/quotes/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...template, incrementUsage: true }),
    }).catch(() => {})

    setWizardStep('form')
  }

  /** AI wizard accept → convert to new QuoteItem format */
  function handleAIAccept(data: {
    title: string
    description: string
    items: Array<{
      id: string
      type: 'labor' | 'material' | 'service'
      name: string
      quantity: number
      unit: string
      unit_price: number
      total: number
    }>
    rotRutType: '' | 'rot' | 'rut'
  }) {
    setTitle(data.title)
    setDescription(data.description)

    const converted = convertLegacyItems(data.items)
    // Apply ROT/RUT from AI suggestion
    if (data.rotRutType === 'rot') {
      converted.forEach((item) => {
        if (item.unit === 'tim') item.is_rot_eligible = true
      })
    } else if (data.rotRutType === 'rut') {
      converted.forEach((item) => {
        if (item.unit === 'tim') item.is_rut_eligible = true
      })
    }
    setItems(converted)
    setWizardStep('form')
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
      toast.warning('V\u00E4lj en kund f\u00F6rst f\u00F6r att skicka offerten')
      return
    }

    if (paymentPlan.length > 0 && !paymentPlanValid) {
      toast.warning('Betalningsplanens procentsatser m\u00E5ste summera till 100%')
      return
    }

    setSaving(true)
    try {
      const finalItems = recalculateItems(items).map((item, idx) => ({
        ...item,
        sort_order: idx,
      }))

      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: selectedCustomer || null,
          status: send ? 'sent' : 'draft',
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
          personnummer: (hasRotItems || hasRutItems) ? personnummer || null : null,
          fastighetsbeteckning: hasRotItems ? fastighetsbeteckning || null : null,
          valid_days: validDays,
          ai_generated: aiGenerated || false,
          ai_confidence: aiResult?.confidence || null,
          source_transcript: sourceTranscript || null,
          template_id: templateId || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte spara offerten')
      } else {
        toast.success(send ? 'Offert skickad!' : 'Offert sparad som utkast')
        router.push(`/dashboard/quotes/${data.quote.quote_id}`)
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
  // Wizard steps (before form)
  // ═══════════════════════════════════════════════════════════════════════════

  if (wizardStep !== 'form') {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
        <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]" />
          <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]" />
        </div>

        <div className="relative max-w-2xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <button
              onClick={() => {
                if (wizardStep === 'select') {
                  router.push('/dashboard/quotes')
                } else if (wizardStep === 'ai-preview') {
                  setAiResult(null)
                  setWizardStep('select')
                } else {
                  setWizardStep('select')
                }
              }}
              className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Ny offert</h1>
            </div>
            <button
              onClick={() => setWizardStep('form')}
              className="text-sm text-gray-400 hover:text-gray-900 transition-all"
            >
              Hoppa till formul\u00E4r
            </button>
          </div>

          {/* Wizard content */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
            {wizardStep === 'select' && <InputSelector onSelect={handleInputSelect} />}

            {wizardStep === 'photo' && (
              <PhotoCapture
                onCapture={handlePhotoCapture}
                onBack={() => setWizardStep('select')}
                analyzing={generating}
              />
            )}

            {wizardStep === 'voice' && (
              <VoiceRecorder
                onTranscript={handleVoiceTranscript}
                onBack={() => setWizardStep('select')}
                transcribing={transcribing}
              />
            )}

            {wizardStep === 'text' && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-semibold text-gray-900">Beskriv jobbet</h2>
                  </div>
                </div>
                <textarea
                  value={aiTextInput}
                  onChange={(e) => setAiTextInput(e.target.value)}
                  placeholder="Beskriv jobbet... t.ex. 'Byta 3 eluttag i k\u00F6k, dra ny kabel fr\u00E5n elcentral, installera dimmer i vardagsrum'"
                  rows={5}
                  autoFocus
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none mb-4"
                />
                <div className="flex gap-3">
                  <button
                    onClick={() => setWizardStep('select')}
                    className="px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200 min-h-[48px]"
                  >
                    Tillbaka
                  </button>
                  <button
                    onClick={() => generateFromText()}
                    disabled={generating || !aiTextInput.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50 min-h-[48px]"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generating ? 'Genererar...' : 'Generera offertf\u00F6rslag'}
                  </button>
                </div>
              </div>
            )}

            {wizardStep === 'template' && (
              <TemplateSelector
                onSelect={handleTemplateSelect}
                onBack={() => setWizardStep('select')}
              />
            )}

            {wizardStep === 'ai-preview' && generating && (
              <div className="text-center py-12">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
                <p className="text-gray-900 font-medium">Genererar offertf\u00F6rslag...</p>
                <div className="space-y-1 mt-3 text-sm text-gray-400">
                  <p>Analyserar beskrivning...</p>
                  <p>H\u00E4mtar din prishistorik...</p>
                  <p>Ber\u00E4knar material och arbete...</p>
                </div>
              </div>
            )}

            {wizardStep === 'ai-preview' && !generating && aiResult && (
              <AIQuotePreview
                jobTitle={aiResult.jobTitle}
                jobDescription={aiResult.jobDescription}
                items={aiResult.items}
                confidence={aiResult.confidence}
                reasoning={aiResult.reasoning}
                suggestedDeductionType={aiResult.suggestedDeductionType}
                priceComparison={priceComparison || { average: 0, min: 0, max: 0, count: 0 }}
                similarQuotes={aiResult.similarHistoricalQuotes || []}
                onAccept={handleAIAccept}
                onRegenerate={() => generateFromText()}
              />
            )}
          </div>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Full Form (step: 'form')
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
            href="/dashboard/quotes"
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">
              Ny offert
              {aiGenerated && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">
                  AI-genererad
                </span>
              )}
            </h1>
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
            <span className="hidden sm:inline">Spara utkast</span>
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
                    <option value="">V\u00E4lj kund...</option>
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
                    placeholder="T.ex. Elinstallation k\u00F6k"
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-gray-500 mb-1">Beskrivning</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Beskriv arbetet som ska utf\u00F6ras..."
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
                      placeholder="H\u00E4lsningsfras och inledning..."
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
                      placeholder="Vad ing\u00E5r inte..."
                      rows={3}
                      className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                    />
                  </div>
                  {/* \u00C4TA terms */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-sm text-gray-500">\u00C4TA-villkor</label>
                      <StandardTextPicker
                        texts={textsByType.ata_terms}
                        onSelect={setAtaTerms}
                      />
                    </div>
                    <textarea
                      value={ataTerms}
                      onChange={(e) => setAtaTerms(e.target.value)}
                      placeholder="\u00C4ndrings- och till\u00E4ggsarbeten..."
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
                  <Search className="w-3.5 h-3.5" /> S\u00F6k grossist
                </button>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <FileText className="w-10 h-10 mx-auto mb-2 opacity-50" />
                  <p>Inga rader \u00E4nnu. L\u00E4gg till poster ovan.</p>
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
                  <p className="text-sm text-gray-400 mb-2">Snabbval fr\u00E5n prislista:</p>
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
                      Ingen betalningsplan. L\u00E4gg till delbetalningar nedan.
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
                            placeholder="F\u00F6rfallodatum/villkor"
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
                    <Plus className="w-4 h-4" /> L\u00E4gg till delbetalning
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
                  Visningsinst\u00E4llningar
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
                    <label className="block text-sm text-gray-500 mb-1">Detaljniv\u00E5</label>
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
                        Visa \u00E0-priser
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
                    <span className="text-gray-500">Tj\u00E4nster</span>
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
                          <span className="text-emerald-700">ROT-ber\u00E4ttigat arbete</span>
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
                          <span className="text-emerald-700">RUT-ber\u00E4ttigat arbete</span>
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
                            placeholder="T.ex. Stockholm S\u00F6der 1:23"
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                          />
                        </div>
                      )}
                      {!personnummer && (
                        <p className="text-xs text-amber-600">
                          Personnummer kr\u00E4vs f\u00F6r{' '}
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
// ItemRow – extracted for readability
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
              title="ROT-ber\u00E4ttigat"
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
              title="RUT-ber\u00E4ttigat"
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
