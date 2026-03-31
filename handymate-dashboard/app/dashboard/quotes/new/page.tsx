'use client'

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Sparkles,
  Loader2,
  ChevronDown,
  Camera,
  Upload,
  X,
  Eye,
  Paperclip,
  Trash2,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useToast } from '@/components/Toast'
import Link from 'next/link'
import ProductSearchModal from '@/components/ProductSearchModal'
import AddressAutocomplete from '@/components/AddressAutocomplete'
import { SelectedProduct } from '@/lib/suppliers/types'
import TemplateSelector from '@/components/quotes/TemplateSelector'
import QuotePreview from '@/components/quotes/QuotePreview'
import type { QuotePreviewData } from '@/components/quotes/QuotePreview'
import ItemRow from '@/components/quotes/ItemRow'
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

  // ─── AI state ────────────────────────────────────────────────────────────────
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
  const photoInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const MAX_PHOTOS = 5

  // ─── Form state ────────────────────────────────────────────────────────────
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)

  // Customer price list info
  const [customerPriceListInfo, setCustomerPriceListInfo] = useState<{
    name: string; segment?: string; contractType?: string;
    hourlyRate?: number; materialMarkup?: number; calloutFee?: number;
    items?: { name: string; unit: string; price: number; category_slug?: string; is_rot_eligible?: boolean; is_rut_eligible?: boolean }[];
  } | null>(null)

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

  // Product search modal
  const [showProductSearch, setShowProductSearch] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [productSearchResults, setProductSearchResults] = useState<any[]>([])
  const [productSearchLoading, setProductSearchLoading] = useState(false)

  // Collapsible sections
  const [showStandardTexts, setShowStandardTexts] = useState(false)
  const [showPaymentPlan, setShowPaymentPlan] = useState(false)
  const [showDisplaySettings, setShowDisplaySettings] = useState(false)
  const [showCategorySubtotals, setShowCategorySubtotals] = useState(false)

  // Custom categories
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>([])
  const [showNewCategoryInput, setShowNewCategoryInput] = useState<string | null>(null) // item id for inline creation
  const [newCategoryLabel, setNewCategoryLabel] = useState('')

  // Attachments (documents linked to quote)
  const [attachments, setAttachments] = useState<{ name: string; url: string; size?: number }[]>([])
  const [priceWarnings, setPriceWarnings] = useState<Array<{ product_name: string; quote_price: number; normal_price: number; supplier_name: string; difference_pct: number }>>([])
  const [priceAlts, setPriceAlts] = useState<Array<{ product_name: string; cheaper_supplier: string; cheaper_price: number; savings_pct: number }>>([])
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Text section expand states
  const [expandedTexts, setExpandedTexts] = useState<Record<string, boolean>>({})

  // Advanced row type dropdown
  const [showAdvancedTypes, setShowAdvancedTypes] = useState(false)

  // Template panel in sidebar
  const [showTemplatePanel, setShowTemplatePanel] = useState(false)

  // Preview panel in sidebar + mobile modal
  const [showPreviewPanel, setShowPreviewPanel] = useState(false)
  const [showPreviewModal, setShowPreviewModal] = useState(false)

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

  // ─── Derived: all categories (system + custom) ───────────────────────────
  const allCategories = useMemo(() => getAllCategories(customCategories), [customCategories])

  // Create a custom category inline
  async function createCustomCategory(label: string, itemId: string) {
    const slug = 'custom_' + label.toLowerCase().replace(/[^a-zåäö0-9]/g, '_').replace(/_+/g, '_')
    const { data, error } = await supabase.from('custom_quote_categories').insert({
      business_id: business.business_id,
      slug,
      label,
      rot_eligible: false,
      rut_eligible: false,
    }).select('*').single()
    if (error) {
      toast.error('Kunde inte skapa kategori')
      return
    }
    const newCat: CustomCategory = data as CustomCategory
    setCustomCategories(prev => [...prev, newCat])
    updateItem(itemId, 'category_slug', newCat.slug)
    setShowNewCategoryInput(null)
    setNewCategoryLabel('')
  }

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

  // ─── Preview data (debounced) ──────────────────────────────────────────────
  const [debouncedPreviewData, setDebouncedPreviewData] = useState<QuotePreviewData | null>(null)
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const selectedCustomerObj = useMemo(
    () => customers.find(c => c.customer_id === selectedCustomer) || null,
    [customers, selectedCustomer]
  )

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
        customCategories,
      })
    }, 300)
    return () => { if (previewTimerRef.current) clearTimeout(previewTimerRef.current) }
  }, [title, selectedCustomerObj, validDays, items, discountPercent, vatRate,
      introductionText, conclusionText, notIncluded, ataTerms, paymentPlan,
      referencePerson, customerReference, projectAddress, detailLevel, showUnitPrices, showQuantities,
      showCategorySubtotals, customCategories])

  // ═══════════════════════════════════════════════════════════════════════════
  // Data fetching
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    if (!business.business_id) return
    fetchData()
    fetchStandardTexts()

    // Check query params
    const transcript = searchParams?.get('transcript')
    const customerId = searchParams?.get('customerId') || searchParams?.get('customer_id')
    const prefillTitle = searchParams?.get('title')
    const dealId = searchParams?.get('deal_id') || searchParams?.get('lead_id')
    if (transcript) {
      setSourceTranscript(transcript)
      setAiTextInput(transcript)
      setShowAiHelper(true)
    }
    if (customerId) {
      setSelectedCustomer(customerId)
    }
    if (prefillTitle) {
      setTitle(prefillTitle)
    }

    // Auto-set reference person from business config
    if (!referencePerson && business.contact_name) {
      setReferencePerson(business.contact_name)
    }

    // Auto-attach documents from deal/lead
    if (dealId && customerId) {
      fetchDealDocuments(customerId)
    }
  }, [business.business_id])

  async function fetchData() {
    const [customersApiRes, priceListRes, settingsRes, customCatRes] = await Promise.all([
      fetch('/api/customers').then(r => r.json()),
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
      supabase
        .from('custom_quote_categories')
        .select('*')
        .eq('business_id', business.business_id)
        .order('created_at'),
    ])

    if (!customersApiRes || customersApiRes.error) {
      console.error('[NewQuote] Kunde inte hämta kunder:', customersApiRes?.error)
    }
    setCustomers(customersApiRes?.customers || [])
    setPriceList(priceListRes.data || [])
    setCustomCategories((customCatRes.data as CustomCategory[]) || [])
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

  // Fetch documents attached to a deal/customer for auto-attach
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
      if (docs.length > 0) {
        setAttachments(docs)
      }
    } catch {
      // silent — documents are optional
    }
  }

  // Upload attachment file
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

      const { data: urlData } = supabase.storage
        .from('customer-documents')
        .getPublicUrl(filePath)

      setAttachments(prev => [...prev, {
        name: file.name,
        url: urlData.publicUrl,
        size: file.size,
      }])
    } catch (err) {
      console.error('Upload failed:', err)
      toast.error('Kunde inte ladda upp filen')
    }
    setUploadingFile(false)
  }

  // Supplier price comparison (debounced)
  useEffect(() => {
    const materialItems = items.filter(i => i.item_type === 'item' && i.unit_price > 0)
    if (materialItems.length === 0) { setPriceWarnings([]); setPriceAlts([]); return }
    const timer = setTimeout(() => {
      fetch('/api/suppliers/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: materialItems.map(i => ({ description: i.description, unit_price: i.unit_price, unit: i.unit })) }),
      }).then(r => r.json()).then(data => {
        setPriceWarnings(data.warnings || [])
        setPriceAlts(data.alternatives || [])
      }).catch(() => {})
    }, 2000)
    return () => clearTimeout(timer)
  }, [items])

  // Auto-fill personnummer / fastighetsbeteckning + price list when customer selected
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerPriceListInfo(null)
      return
    }
    const customer = customers.find((c) => c.customer_id === selectedCustomer)
    if (!customer) return
    if (customer.personal_number && !personnummer) setPersonnummer(customer.personal_number)
    if (customer.property_designation && !fastighetsbeteckning)
      setFastighetsbeteckning(customer.property_designation)
    // Also pre-fill project address from customer address if empty
    if (customer.address_line && !projectAddress) setProjectAddress(customer.address_line)
    // Pre-fill customer reference from customer name
    if (customer.name && !customerReference) setCustomerReference(customer.name)

    // Fetch customer's price list if assigned — auto-apply rates
    const cust = customer as any
    if (cust.price_list_id) {
      fetch(`/api/pricing/price-lists/${cust.price_list_id}`)
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

            // Override pricing settings with customer-specific rates
            if (pl.hourly_rate_normal || pl.callout_fee) {
              setPricingSettings(prev => ({
                ...(prev || { hourly_rate: 650, callout_fee: 495, minimum_hours: 1, vat_rate: 25, rot_enabled: true, rot_percent: 30, rut_enabled: false, rut_percent: 50, payment_terms: 30, warranty_years: 2 }),
                hourly_rate: pl.hourly_rate_normal || prev?.hourly_rate || 650,
                callout_fee: pl.callout_fee ?? prev?.callout_fee ?? 495,
              }))
            }
          }
        })
        .catch(() => { /* non-blocking */ })
    } else {
      setCustomerPriceListInfo(null)
    }
  }, [selectedCustomer])

  // ═══════════════════════════════════════════════════════════════════════════
  // AI helpers — photo & text
  // ═══════════════════════════════════════════════════════════════════════════

  function applyAiResult(quote: any) {
    setTitle(quote.jobTitle || '')
    setDescription(quote.jobDescription || '')
    const converted = convertLegacyItems(quote.items || [])
    if (quote.suggestedDeductionType === 'rot') {
      converted.forEach((item) => {
        if (item.unit === 'tim') item.is_rot_eligible = true
      })
    } else if (quote.suggestedDeductionType === 'rut') {
      converted.forEach((item) => {
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
    reader.onload = (e) => {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Template handlers
  // ═══════════════════════════════════════════════════════════════════════════

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

    setShowTemplatePanel(false)
    toast.success(`Mall "${template.name}" tillämpad`)
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

    setShowTemplatePanel(false)
    toast.success(`Mall "${template.name}" tillämpad`)
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
          updated.is_rot_eligible = value === 'rot'
          updated.is_rut_eligible = value === 'rut'
        } else if (field === 'is_rot_eligible' && value === true) {
          updated.is_rut_eligible = false
          updated.rot_rut_type = 'rot'
        } else if (field === 'is_rut_eligible' && value === true) {
          updated.is_rot_eligible = false
          updated.rot_rut_type = 'rut'
        } else if ((field === 'is_rot_eligible' || field === 'is_rut_eligible') && value === false) {
          if (!updated.is_rot_eligible && !updated.is_rut_eligible) {
            updated.rot_rut_type = null
          }
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

  // Drag-and-drop sensors
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
    const qty = (priceItem as any).default_quantity || 1
    const newItem: QuoteItem = {
      id: generateItemId(),
      item_type: 'item',
      description: priceItem.name,
      quantity: qty,
      unit: normalizeUnit(priceItem.unit),
      unit_price: priceItem.unit_price,
      total: priceItem.unit_price * qty,
      is_rot_eligible: priceItem.category === 'labor',
      is_rut_eligible: false,
      sort_order: 0,
    }
    setItems((prev) => {
      newItem.sort_order = prev.length
      return [...prev, newItem]
    })
  }, [])

  const addFromProduct = useCallback((product: any) => {
    const newItem: QuoteItem = {
      id: generateItemId(),
      item_type: 'item',
      description: product.name,
      article_number: product.sku || undefined,
      quantity: 1,
      unit: normalizeUnit(product.unit),
      unit_price: product.sales_price,
      cost_price: product.purchase_price || undefined,
      total: product.sales_price,
      is_rot_eligible: product.rot_eligible || false,
      is_rut_eligible: product.rut_eligible || false,
      sort_order: 0,
    }
    setItems((prev) => {
      newItem.sort_order = prev.length
      return [...prev, newItem]
    })
    setShowProductSearch(false)
    setProductSearchQuery('')
  }, [])

  const searchProducts = useCallback(async (query: string) => {
    setProductSearchQuery(query)
    if (!query.trim()) {
      // Show favorites by default
      setProductSearchLoading(true)
      try {
        const res = await fetch('/api/products?favorites=true')
        if (res.ok) {
          const data = await res.json()
          setProductSearchResults(data.products || [])
        }
      } catch { /* ignore */ }
      finally { setProductSearchLoading(false) }
      return
    }
    setProductSearchLoading(true)
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(query)}`)
      if (res.ok) {
        const data = await res.json()
        setProductSearchResults(data.products || [])
      }
    } catch { /* ignore */ }
    finally { setProductSearchLoading(false) }
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
          personnummer: (hasRotItems || hasRutItems) ? personnummer || null : null,
          fastighetsbeteckning: hasRotItems ? fastighetsbeteckning || null : null,
          valid_days: validDays,
          ai_generated: aiGenerated || false,
          ai_confidence: aiConfidence || null,
          source_transcript: sourceTranscript || null,
          template_id: templateId || null,
          attachments: attachments.length > 0 ? attachments : [],
          deal_id: searchParams?.get('deal_id') || searchParams?.get('lead_id') || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Kunde inte spara offerten')
      } else {
        toast.success(send ? 'Offert sparad — öppnar skicka-vy' : 'Offert sparad som utkast')
        router.push(send
          ? `/dashboard/quotes/${data.quote.quote_id}?send=true`
          : `/dashboard/quotes/${data.quote.quote_id}`
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
      </div>
    )
  }

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
                AI-genererad{aiConfidence ? ` · ${aiConfidence}% säkerhet` : ''}
              </span>
            )}
            {aiPriceWarning && (
              <a href={aiPriceWarning.link} className="ml-2 text-[11px] bg-amber-50 text-amber-700 px-2.5 py-0.5 rounded-full hover:bg-amber-100 transition-colors">
                {aiPriceWarning.message.length > 40 ? 'Priser saknas — uppdatera prislista →' : aiPriceWarning.message}
              </a>
            )}
            {aiPhotoCount > 1 && (
              <span className="ml-2 text-[11px] text-gray-400">
                Baserad på {aiPhotoCount} foton
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-5 items-start">
          {/* ══════════════════════════════════════════════════════════ */}
          {/* Left Column — Form                                       */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-4">
            {/* ── AI-hjälp ──────────────────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-5">
              <button
                type="button"
                onClick={() => setShowAiHelper(!showAiHelper)}
                className="w-full flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#0F766E]" />
                  <span className="text-[13px] font-medium text-[#1E293B]">AI-hjälp</span>
                  <span className="text-[11px] text-[#94A3B8]">Fota eller beskriv jobbet</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-[#CBD5E1] transition-transform ${showAiHelper ? 'rotate-180' : ''}`} />
              </button>

              {showAiHelper && (
                <div className="mt-4 space-y-4">
                  {/* Photo capture */}
                  <div>
                    <p className="text-[12px] text-[#64748B] mb-2">Fota jobbet — AI analyserar och fyller i rader</p>
                    <div className="flex items-center gap-2">
                      <input
                        ref={cameraInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handlePhotoFile(file)
                        }}
                      />
                      <input
                        ref={photoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) handlePhotoFile(file)
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] hover:border-[#0F766E] transition-colors disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" />
                        Kamera
                      </button>
                      <button
                        type="button"
                        onClick={() => photoInputRef.current?.click()}
                        disabled={generating}
                        className="flex items-center gap-2 px-4 py-2.5 bg-[#F8FAFC] border-thin border-[#E2E8F0] rounded-lg text-[13px] text-[#1E293B] hover:border-[#0F766E] transition-colors disabled:opacity-50"
                      >
                        <Upload className="w-4 h-4" />
                        Ladda upp
                      </button>
                    </div>

                    {/* Photo grid */}
                    {photos.length > 0 && (
                      <div className="mt-3 space-y-3">
                        <div className="grid grid-cols-5 gap-2">
                          {photos.map((photo, i) => (
                            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border-thin border-[#E2E8F0]">
                              <img src={photo} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removePhoto(i)}
                                className="absolute top-1 right-1 w-5 h-5 bg-black/50 rounded-full flex items-center justify-center hover:bg-black/70"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                            </div>
                          ))}
                          {photos.length < MAX_PHOTOS && (
                            <label className="aspect-square border-thin border-dashed border-[#CBD5E1] rounded-lg flex items-center justify-center cursor-pointer hover:border-[#0F766E] transition-colors text-[#CBD5E1] hover:text-[#0F766E] text-xl">
                              +
                              <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoFile(f); e.target.value = '' }} />
                            </label>
                          )}
                        </div>
                        <textarea
                          value={photoDescription}
                          onChange={e => setPhotoDescription(e.target.value)}
                          placeholder="Beskriv jobbet (valfritt) — t.ex. mått, materialönskemål, speciella förutsättningar"
                          rows={2}
                          className="w-full px-3 py-2 text-[13px] border-thin border-[#E2E8F0] rounded-lg bg-white text-[#1E293B] placeholder-[#94A3B8] focus:outline-none focus:border-[#0F766E] resize-y"
                        />
                        <button
                          type="button"
                          onClick={analyzePhoto}
                          disabled={generating}
                          className="flex items-center gap-2 px-4 py-2.5 bg-[#0F766E] text-white rounded-lg text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                        >
                          {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                          {generating ? 'Analyserar...' : `Analysera ${photos.length} foto${photos.length > 1 ? 'n' : ''}`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-px bg-[#E2E8F0]" />
                    <span className="text-[11px] text-[#CBD5E1]">eller</span>
                    <div className="flex-1 h-px bg-[#E2E8F0]" />
                  </div>

                  {/* Text description */}
                  <div>
                    <p className="text-[12px] text-[#64748B] mb-1">Beskriv jobbet — AI genererar offertrader</p>
                    <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 mb-2">
                      <p className="text-[11px] text-teal-700 font-medium mb-1">Tips för bästa resultat:</p>
                      <ul className="text-[11px] text-teal-600 space-y-0.5 list-disc list-inside">
                        <li>Ange rum/plats (kök, badrum, fasad)</li>
                        <li>Beskriv yta eller antal (15 m², 3 uttag)</li>
                        <li>Nämn material om du vet (klinker, gips, LED)</li>
                        <li>Beskriv vad som ska göras (byta, installera, renovera)</li>
                      </ul>
                    </div>
                    <textarea
                      value={aiTextInput}
                      onChange={(e) => setAiTextInput(e.target.value)}
                      placeholder="T.ex. 'Byta 3 eluttag i kök, dra ny kabel från elcentral, installera dimmer i vardagsrum'"
                      rows={3}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 resize-y"
                    />
                    <button
                      type="button"
                      onClick={() => generateFromText()}
                      disabled={generating || !aiTextInput.trim()}
                      className="mt-2 flex items-center gap-2 px-4 py-2.5 bg-[#0F766E] text-white rounded-lg text-[13px] font-medium hover:opacity-90 disabled:opacity-50"
                    >
                      {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {generating ? 'Genererar...' : 'Generera offertförslag'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* ── Kund ──────────────────────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-6">
              <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-4">Kund</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-[12px] text-[#64748B] mb-1">Kund *</label>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 appearance-auto"
                  >
                    <option value="">Välj kund...</option>
                    {customers.map((c) => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.name} — {c.phone_number}
                      </option>
                    ))}
                  </select>
                  {customerPriceListInfo && (
                    <div className="mt-2 bg-teal-50 border border-teal-200 rounded-lg p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-teal-600">📋</span>
                        <span className="text-teal-800">
                          Prislista: <strong>{customerPriceListInfo.name}</strong>
                          {customerPriceListInfo.segment && ` · ${customerPriceListInfo.segment}`}
                          {customerPriceListInfo.contractType && ` · ${customerPriceListInfo.contractType}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[11px] text-teal-700">
                        {customerPriceListInfo.hourlyRate ? <span>Timpris: {customerPriceListInfo.hourlyRate} kr</span> : null}
                        {customerPriceListInfo.materialMarkup ? <span>Materialpåslag: {customerPriceListInfo.materialMarkup}%</span> : null}
                        {customerPriceListInfo.calloutFee ? <span>Utryckningsavgift: {customerPriceListInfo.calloutFee} kr</span> : null}
                      </div>
                      {customerPriceListInfo.items && customerPriceListInfo.items.length > 0 && items.length === 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const newItems = customerPriceListInfo.items!.map((plItem, idx) => ({
                              ...createDefaultItem('item', idx),
                              description: plItem.name,
                              unit: plItem.unit || 'st',
                              unit_price: plItem.price,
                              quantity: 1,
                              total: plItem.price,
                              category_slug: plItem.category_slug || undefined,
                              is_rot_eligible: plItem.is_rot_eligible || false,
                              is_rut_eligible: plItem.is_rut_eligible || false,
                            }))
                            setItems(newItems as any)
                          }}
                          className="text-[11px] text-teal-600 hover:text-teal-800 font-medium underline underline-offset-2"
                        >
                          Lägg till {customerPriceListInfo.items.length} poster från prislistan
                        </button>
                      )}
                    </div>
                  )}
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
                  <p>Inga rader ännu. Lägg till poster nedan eller använd AI-hjälp.</p>
                </div>
              ) : (
                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-1">
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
                          allCategories={allCategories}
                          onCreateCategory={createCustomCategory}
                          showNewCategoryInput={showNewCategoryInput}
                          setShowNewCategoryInput={setShowNewCategoryInput}
                          newCategoryLabel={newCategoryLabel}
                          setNewCategoryLabel={setNewCategoryLabel}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
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

                <button
                  onClick={() => { setShowProductSearch(true); searchProducts('') }}
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
                        <button onClick={() => { setShowGrossistSearch(true); setShowAdvancedTypes(false) }} className="w-full text-left px-3 py-2 text-[13px] text-[#1E293B] hover:bg-[#F8FAFC]">Sök grossist</button>
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

            {/* ── Bifogade dokument ─────────────────────────────── */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl px-7 py-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1]">Bifogade dokument</div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingFile}
                  className="flex items-center gap-1.5 text-[12px] text-[#0F766E] hover:text-teal-800 disabled:opacity-50"
                >
                  {uploadingFile ? <Loader2 className="w-3 h-3 animate-spin" /> : <Paperclip className="w-3 h-3" />}
                  Bifoga fil
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) handleFileUpload(file)
                    e.target.value = ''
                  }}
                />
              </div>
              {attachments.length === 0 ? (
                <p className="text-[12px] text-gray-400">Inga bifogade filer</p>
              ) : (
                <div className="space-y-1.5">
                  {attachments.map((att, i) => (
                    <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                        <a href={att.url} target="_blank" rel="noopener noreferrer" className="text-[12px] text-teal-700 hover:underline truncate">
                          {att.name}
                        </a>
                        {att.size ? <span className="text-[10px] text-gray-400 shrink-0">{(att.size / 1024).toFixed(0)} KB</span> : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
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
            {/* Template panel */}
            <div className="bg-white border-thin border-[#E2E8F0] rounded-xl">
              <button
                type="button"
                onClick={() => setShowTemplatePanel(!showTemplatePanel)}
                className="w-full flex items-center justify-between px-6 py-4 text-left"
              >
                <span className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1]">Mallar</span>
                <ChevronDown className={`w-4 h-4 text-[#CBD5E1] transition-transform ${showTemplatePanel ? 'rotate-180' : ''}`} />
              </button>
              {showTemplatePanel && (
                <div className="px-2 pb-3">
                  <TemplateSelector
                    onSelect={handleTemplateSelect}
                    onBack={() => setShowTemplatePanel(false)}
                  />
                </div>
              )}
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
              {/* Prisvarningar */}
              {priceWarnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 space-y-1.5">
                  {priceWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-amber-800">
                      ⚠️ {w.product_name} är {w.difference_pct}% dyrare än normalpris ({w.quote_price} kr vs {w.normal_price} kr — {w.supplier_name})
                    </p>
                  ))}
                </div>
              )}
              {priceAlts.length > 0 && (
                <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 mb-4 space-y-1.5">
                  {priceAlts.map((a, i) => (
                    <p key={i} className="text-xs text-teal-800">
                      💡 {a.cheaper_supplier} har {a.product_name} {a.savings_pct}% billigare ({a.cheaper_price} kr)
                    </p>
                  ))}
                </div>
              )}

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

      {/* Product search */}
      {showProductSearch && (
        <div className="fixed inset-0 bg-black/25 z-50 flex items-center justify-center p-4" onClick={() => setShowProductSearch(false)}>
          <div className="bg-white rounded-2xl border border-[#E2E8F0] w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-5 py-4 border-b border-[#E2E8F0]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                type="text"
                value={productSearchQuery}
                onChange={e => searchProducts(e.target.value)}
                placeholder="Sök produkt eller material..."
                autoFocus
                className="flex-1 text-sm text-[#1E293B] placeholder-[#94A3B8] bg-transparent border-none outline-none"
              />
              <button onClick={() => setShowProductSearch(false)} className="p-1 text-[#94A3B8] hover:text-[#1E293B]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
              {productSearchLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-5 h-5 border-2 border-[#0F766E] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : productSearchResults.length > 0 ? (
                <div className="space-y-1">
                  {productSearchResults.map((p: any) => (
                    <button
                      key={p.id}
                      onClick={() => addFromProduct(p)}
                      className="w-full flex items-center justify-between px-4 py-3 rounded-xl hover:bg-[#F8FAFC] transition text-left"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          {p.is_favorite && <span className="text-amber-500 text-xs">★</span>}
                          <span className="text-sm font-medium text-[#1E293B] truncate">{p.name}</span>
                          {p.rot_eligible && <span className="px-1.5 py-0.5 text-[10px] bg-emerald-100 text-emerald-600 rounded">ROT</span>}
                          {p.rut_eligible && <span className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-600 rounded">RUT</span>}
                        </div>
                        {p.sku && <p className="text-[11px] text-[#94A3B8] truncate">{p.sku}</p>}
                      </div>
                      <div className="text-right ml-4 shrink-0">
                        <span className="text-sm font-medium text-[#1E293B]">{p.sales_price?.toLocaleString('sv-SE')} kr</span>
                        <span className="text-[11px] text-[#94A3B8] ml-1">/{p.unit}</span>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-sm text-[#94A3B8]">
                    {productSearchQuery ? 'Inga produkter hittades' : 'Inga favoriter ännu'}
                  </p>
                  <p className="text-xs text-[#CBD5E1] mt-1">
                    Lägg till produkter under Inställningar → Produkter
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

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
