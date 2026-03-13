'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Sparkles,
  Loader2,
  ChevronDown,
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
        className="text-xs text-sky-700 hover:text-teal-800 transition-colors"
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
                  <span className="ml-1 text-[10px] text-sky-700 bg-teal-50 px-1 rounded">
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
      toast.error('Nätverksfel vid AI-generering')
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
      toast.error('Nätverksfel vid AI-generering')
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
      toast.warning('Välj en kund först för att skicka offerten')
      return
    }

    if (paymentPlan.length > 0 && !paymentPlanValid) {
      toast.warning('Betalningsplanens procentsatser måste summera till 100%')
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
        <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
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
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-teal-50 rounded-full blur-[128px]" />
          <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-teal-50 rounded-full blur-[128px]" />
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
              Hoppa till formulär
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
                    <Sparkles className="w-5 h-5 text-sky-700" />
                    <h2 className="text-lg font-semibold text-gray-900">Beskriv jobbet</h2>
                  </div>
                </div>
                <textarea
                  value={aiTextInput}
                  onChange={(e) => setAiTextInput(e.target.value)}
                  placeholder="Beskriv jobbet... t.ex. 'Byta 3 eluttag i kök, dra ny kabel från elcentral, installera dimmer i vardagsrum'"
                  rows={5}
                  autoFocus
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500/50 resize-none mb-4"
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
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-teal-600 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50 min-h-[48px]"
                  >
                    {generating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {generating ? 'Genererar...' : 'Generera offertförslag'}
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
                <Loader2 className="w-10 h-10 text-sky-700 animate-spin mx-auto mb-4" />
                <p className="text-gray-900 font-medium">Genererar offertförslag...</p>
                <div className="space-y-1 mt-3 text-sm text-gray-400">
                  <p>Analyserar beskrivning...</p>
                  <p>Hämtar din prishistorik...</p>
                  <p>Beräknar material och arbete...</p>
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

  // State for advanced row type dropdown
  const [showAdvancedTypes, setShowAdvancedTypes] = useState(false)

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
            <span className="text-[18px] font-medium text-[#1E293B] ml-3">Ny offert</span>
            {aiGenerated && (
              <span className="ml-2.5 text-[11px] bg-[#CCFBF1] text-[#0F766E] px-2.5 py-0.5 rounded-full">
                AI-genererad
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          {/* ══════════════════════════════════════════════════════════ */}
          {/* Main Content */}
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
                  className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-none"
                />
              </div>
            </div>

            {/* ── Offertrader ────────────────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Offertrader</div>

              {/* Table header (desktop) */}
              {items.length > 0 && (
                <div className="hidden md:grid md:grid-cols-[1fr_72px_88px_96px_32px] gap-2 pb-2 border-b border-thin border-[#E2E8F0] mb-1">
                  <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1]">Beskrivning</span>
                  <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1] text-right">Antal</span>
                  <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1] text-right">Enhet</span>
                  <span className="text-[10px] tracking-[0.08em] uppercase text-[#CBD5E1] text-right">Pris/enhet</span>
                  <span />
                </div>
              )}

              {items.length === 0 ? (
                <div className="text-center py-8 text-[#CBD5E1] text-[13px]">
                  <p>Inga rader ännu. Lägg till poster nedan.</p>
                </div>
              ) : (
                <div>
                  {items.map((item, index) => {
                    const isEditable = item.item_type === 'item' || item.item_type === 'discount'
                    const showTotal = item.item_type === 'item' || item.item_type === 'discount' || item.item_type === 'subtotal'
                    const displayTotal = item.item_type === 'subtotal' ? (recalculated[index]?.total ?? item.total) : item.total

                    return (
                      <div key={item.id}>
                        {/* Desktop row */}
                        <div className="hidden md:grid md:grid-cols-[1fr_72px_88px_96px_32px] gap-2 items-center py-2 border-b border-thin border-[#F1F5F9]">
                          <input
                            type="text"
                            value={item.description}
                            onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                            placeholder={item.item_type === 'heading' ? 'Rubriktext' : item.item_type === 'text' ? 'Fritext...' : 'Beskrivning'}
                            className="w-full px-2.5 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                          />
                          {isEditable ? (
                            <input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-right focus:outline-none focus:border-[#0F766E]"
                              min={0}
                              step="any"
                            />
                          ) : (
                            <span />
                          )}
                          {isEditable ? (
                            <select
                              value={item.unit}
                              onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                              className="w-full px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                            >
                              {UNIT_OPTIONS.map((u) => (
                                <option key={u.value} value={u.value}>{u.label}</option>
                              ))}
                            </select>
                          ) : (
                            <span />
                          )}
                          {isEditable ? (
                            <input
                              type="number"
                              value={item.unit_price}
                              onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                              className="w-full px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-right focus:outline-none focus:border-[#0F766E]"
                              min={0}
                              step="any"
                            />
                          ) : showTotal ? (
                            <span className="text-[13px] text-[#1E293B] text-right">{formatCurrency(displayTotal)}</span>
                          ) : (
                            <span />
                          )}
                          <button
                            onClick={() => removeItem(item.id)}
                            className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#CBD5E1] hover:text-red-500 flex items-center justify-center text-[16px]"
                          >
                            ×
                          </button>
                        </div>

                        {/* Mobile row */}
                        <div className="md:hidden py-3 border-b border-thin border-[#F1F5F9] space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={item.description}
                              onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                              placeholder="Beskrivning"
                              className="flex-1 px-2.5 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                            />
                            <button
                              onClick={() => removeItem(item.id)}
                              className="w-7 h-7 border-thin border-[#E2E8F0] rounded-md bg-transparent text-[#CBD5E1] hover:text-red-500 flex items-center justify-center text-[16px] shrink-0"
                            >
                              ×
                            </button>
                          </div>
                          {isEditable && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                                className="w-16 px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-center focus:outline-none focus:border-[#0F766E]"
                                min={0}
                                step="any"
                              />
                              <select
                                value={item.unit}
                                onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                                className="w-20 px-1 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E]"
                              >
                                {UNIT_OPTIONS.map((u) => (
                                  <option key={u.value} value={u.value}>{u.label}</option>
                                ))}
                              </select>
                              <input
                                type="number"
                                value={item.unit_price}
                                onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                                className="w-24 px-2 py-[7px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] text-right focus:outline-none focus:border-[#0F766E]"
                                min={0}
                                step="any"
                              />
                              <span className="text-[13px] text-[#1E293B] font-medium flex-1 text-right whitespace-nowrap">
                                {formatCurrency(displayTotal)}
                              </span>
                            </div>
                          )}
                          {isEditable && (
                            <div className="flex items-center gap-3 text-[12px]">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.is_rot_eligible}
                                  onChange={(e) => updateItem(item.id, 'is_rot_eligible', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#0F766E] focus:ring-[#0F766E]"
                                />
                                <span className="text-[#64748B]">ROT</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={item.is_rut_eligible}
                                  onChange={(e) => updateItem(item.id, 'is_rut_eligible', e.target.checked)}
                                  className="w-3.5 h-3.5 rounded border-gray-300 text-[#0F766E] focus:ring-[#0F766E]"
                                />
                                <span className="text-[#64748B]">RUT</span>
                              </label>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add row button */}
              <div className="flex items-center gap-4 pt-2.5">
                <button
                  onClick={() => addItem('item')}
                  className="flex items-center gap-2 text-[13px] text-[#0F766E] bg-transparent border-none cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#0F766E" strokeWidth="1"/><path d="M8 5v6M5 8h6" stroke="#0F766E" strokeWidth="1.2" strokeLinecap="round"/></svg>
                  Lägg till rad
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
                        <button onClick={() => { setShowGrossistSearch(true); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Sök grossist</button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Quick add from price list */}
              {priceList.length > 0 && (
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
              )}
            </div>

            {/* ── ROT-avdrag ────────────────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => {
                  // Toggle ROT: if any items are ROT-eligible, turn all off; otherwise turn labor items on
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

            {/* ── Collapsible sections ─────────────────────────────── */}

            {/* References */}
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
                      <input
                        type="text"
                        value={projectAddress}
                        onChange={(e) => setProjectAddress(e.target.value)}
                        placeholder="Adress"
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
                      <textarea value={introductionText} onChange={(e) => setIntroductionText(e.target.value)} placeholder="Hälsningsfras och inledning..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-none" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">Avslutningstext</label>
                        <StandardTextPicker texts={textsByType.conclusion} onSelect={setConclusionText} />
                      </div>
                      <textarea value={conclusionText} onChange={(e) => setConclusionText(e.target.value)} placeholder="Avslutande text..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-none" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">Ej inkluderat</label>
                        <StandardTextPicker texts={textsByType.not_included} onSelect={setNotIncluded} />
                      </div>
                      <textarea value={notIncluded} onChange={(e) => setNotIncluded(e.target.value)} placeholder="Vad ingår inte..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-none" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">ÄTA-villkor</label>
                        <StandardTextPicker texts={textsByType.ata_terms} onSelect={setAtaTerms} />
                      </div>
                      <textarea value={ataTerms} onChange={(e) => setAtaTerms(e.target.value)} placeholder="Ändrings- och tilläggsarbeten..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-none" />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[12px] text-[#64748B]">Betalningsvillkor</label>
                        <StandardTextPicker texts={textsByType.payment_terms} onSelect={setPaymentTermsText} />
                      </div>
                      <textarea value={paymentTermsText} onChange={(e) => setPaymentTermsText(e.target.value)} placeholder="Betalningsvillkor..." rows={2} className="w-full px-3 py-[9px] text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] focus:outline-none focus:border-[#0F766E] resize-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Plan */}
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

            {/* Display Settings */}
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
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* Sidebar */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-3 lg:sticky lg:top-4">
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-6 py-5">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Summering</div>

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
                  <span>Totalt</span>
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

