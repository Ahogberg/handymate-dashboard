'use client'

import { useEffect, useState } from 'react'
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
  Bookmark
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import ProductSearchModal from '@/components/ProductSearchModal'
import { SelectedProduct } from '@/lib/suppliers/types'
import InputSelector, { InputMethod } from '@/components/quotes/InputSelector'
import PhotoCapture from '@/components/quotes/PhotoCapture'
import VoiceRecorder from '@/components/quotes/VoiceRecorder'
import AIQuotePreview from '@/components/quotes/AIQuotePreview'
import TemplateSelector from '@/components/quotes/TemplateSelector'

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

interface QuoteItem {
  id: string
  type: 'labor' | 'material' | 'service'
  name: string
  description?: string
  quantity: number
  unit: string
  unit_price: number
  total: number
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

export default function NewQuotePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const business = useBusiness()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('select')
  const [aiResult, setAiResult] = useState<any>(null)
  const [priceComparison, setPriceComparison] = useState<any>(null)
  const [transcribing, setTranscribing] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const [sourceImageBase64, setSourceImageBase64] = useState<string | null>(null)
  const [sourceTranscript, setSourceTranscript] = useState<string | null>(null)
  const [aiGenerated, setAiGenerated] = useState(false)

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [rotRutType, setRotRutType] = useState<'rot' | 'rut' | ''>('')
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)
  const [showGrossistSearch, setShowGrossistSearch] = useState(false)
  const [personnummer, setPersonnummer] = useState('')
  const [fastighetsbeteckning, setFastighetsbeteckning] = useState('')
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [templateName, setTemplateName] = useState('')
  const [savingTemplate, setSavingTemplate] = useState(false)

  // AI text prompt (for text input method)
  const [aiTextInput, setAiTextInput] = useState('')

  useEffect(() => {
    fetchData()
    // Check if coming from a call transcript
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
    // Check if skip wizard (direct to form)
    if (searchParams.get('mode') === 'manual') {
      setWizardStep('form')
    }
  }, [business.business_id])

  async function fetchData() {
    const [customersRes, priceListRes, settingsRes] = await Promise.all([
      supabase.from('customer').select('*').eq('business_id', business.business_id),
      supabase.from('price_list').select('*').eq('business_id', business.business_id).eq('is_active', true),
      supabase.from('business_config').select('pricing_settings').eq('business_id', business.business_id).single()
    ])

    setCustomers(customersRes.data || [])
    setPriceList(priceListRes.data || [])
    setPricingSettings(settingsRes.data?.pricing_settings || {
      hourly_rate: 650,
      callout_fee: 495,
      minimum_hours: 1,
      vat_rate: 25,
      rot_enabled: true,
      rot_percent: 30,
      rut_enabled: false,
      rut_percent: 50,
      payment_terms: 30,
      warranty_years: 2
    })
    setLoading(false)
  }

  // Auto-fill personnummer/fastighetsbeteckning from customer
  useEffect(() => {
    if (selectedCustomer && rotRutType) {
      const customer = customers.find(c => c.customer_id === selectedCustomer)
      if (customer) {
        if (customer.personal_number && !personnummer) setPersonnummer(customer.personal_number)
        if (customer.property_designation && !fastighetsbeteckning) setFastighetsbeteckning(customer.property_designation)
      }
    }
  }, [selectedCustomer, rotRutType])

  // --- Wizard handlers ---

  function handleInputSelect(method: InputMethod) {
    if (method === 'text') {
      setWizardStep('text')
    } else if (method === 'photo') {
      setWizardStep('photo')
    } else if (method === 'voice') {
      setWizardStep('voice')
    } else if (method === 'template') {
      setWizardStep('template')
    } else if (method === 'call') {
      setWizardStep('text')
    }
  }

  async function handlePhotoCapture(base64: string) {
    setSourceImageBase64(base64)
    setGenerating(true)
    try {
      const response = await fetch('/api/quotes/ai-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 })
      })
      const data = await response.json()
      if (data.success) {
        setAiResult(data.quote)
        setPriceComparison(data.priceComparison)
        setAiGenerated(true)
        setWizardStep('ai-preview')
      } else {
        alert(data.error || 'AI-generering misslyckades')
        setWizardStep('select')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      alert('Nätverksfel vid AI-generering')
      setWizardStep('select')
    }
    setGenerating(false)
  }

  function handleVoiceTranscript(transcript: string) {
    setVoiceTranscript(transcript)
    setSourceTranscript(transcript)
    setAiTextInput(transcript)
    setTranscribing(false)
    // Auto-generate from transcript
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
        body: JSON.stringify(body)
      })
      const data = await response.json()
      if (data.success) {
        setAiResult(data.quote)
        setPriceComparison(data.priceComparison)
        setAiGenerated(true)
      } else {
        alert(data.error || 'AI-generering misslyckades')
        setWizardStep('text')
      }
    } catch (err) {
      console.error('AI generation failed:', err)
      alert('Nätverksfel vid AI-generering')
      setWizardStep('text')
    }
    setGenerating(false)
  }

  function handleTemplateSelect(template: any) {
    // Pre-fill form from template
    setTitle(template.name)
    setDescription(template.description || '')
    const templateItems: QuoteItem[] = []

    // Add labor item from template
    if (template.estimated_hours && template.labor_cost) {
      const hourlyRate = pricingSettings?.hourly_rate || 650
      templateItems.push({
        id: 'item_' + Math.random().toString(36).substr(2, 9),
        type: 'labor',
        name: template.name,
        quantity: template.estimated_hours,
        unit: 'hour',
        unit_price: hourlyRate,
        total: template.estimated_hours * hourlyRate
      })
    }

    // Add material items from template
    if (template.materials && Array.isArray(template.materials)) {
      template.materials.forEach((mat: any) => {
        templateItems.push({
          id: 'item_' + Math.random().toString(36).substr(2, 9),
          type: 'material',
          name: mat.name || mat.description || 'Material',
          quantity: mat.quantity || 1,
          unit: mat.unit || 'piece',
          unit_price: mat.unitPrice || mat.unit_price || 0,
          total: (mat.quantity || 1) * (mat.unitPrice || mat.unit_price || 0)
        })
      })
    }

    setItems(templateItems)

    // Increment usage count
    fetch('/api/quotes/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...template, incrementUsage: true })
    }).catch(() => {})

    setWizardStep('form')
  }

  function handleAIAccept(data: {
    title: string
    description: string
    items: Array<{ id: string; type: 'labor' | 'material' | 'service'; name: string; quantity: number; unit: string; unit_price: number; total: number }>
    rotRutType: '' | 'rot' | 'rut'
  }) {
    setTitle(data.title)
    setDescription(data.description)
    setItems(data.items)
    setRotRutType(data.rotRutType)
    setWizardStep('form')
  }

  // --- Form handlers ---

  const addItem = (type: 'labor' | 'material' | 'service') => {
    const newItem: QuoteItem = {
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      type,
      name: '',
      quantity: 1,
      unit: type === 'labor' ? 'hour' : 'piece',
      unit_price: type === 'labor' ? (pricingSettings?.hourly_rate || 650) : 0,
      total: 0
    }
    setItems([...items, newItem])
  }

  const updateItem = (id: string, field: keyof QuoteItem, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value }
        updated.total = updated.quantity * updated.unit_price
        return updated
      }
      return item
    }))
  }

  const removeItem = (id: string) => {
    setItems(items.filter(item => item.id !== id))
  }

  const addFromGrossist = (product: SelectedProduct) => {
    const newItem: QuoteItem = {
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      type: 'material',
      name: product.name,
      description: product.sku ? `Art.nr: ${product.sku}` : undefined,
      quantity: 1,
      unit: product.unit,
      unit_price: product.sell_price,
      total: product.sell_price
    }
    setItems([...items, newItem])
    setShowGrossistSearch(false)
  }

  const addFromPriceList = (priceItem: PriceItem) => {
    const newItem: QuoteItem = {
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      type: priceItem.category as 'labor' | 'material' | 'service',
      name: priceItem.name,
      quantity: 1,
      unit: priceItem.unit,
      unit_price: priceItem.unit_price,
      total: priceItem.unit_price
    }
    setItems([...items, newItem])
  }

  // Calculations
  const laborTotal = items.filter(i => i.type === 'labor').reduce((sum, i) => sum + i.total, 0)
  const materialTotal = items.filter(i => i.type === 'material').reduce((sum, i) => sum + i.total, 0)
  const serviceTotal = items.filter(i => i.type === 'service').reduce((sum, i) => sum + i.total, 0)
  const subtotal = laborTotal + materialTotal + serviceTotal
  const discountAmount = subtotal * (discountPercent / 100)
  const afterDiscount = subtotal - discountAmount
  const vatAmount = afterDiscount * ((pricingSettings?.vat_rate || 25) / 100)
  const total = afterDiscount + vatAmount

  // ROT/RUT
  const rotRutPercent = rotRutType === 'rot' ? (pricingSettings?.rot_percent || 30) : rotRutType === 'rut' ? (pricingSettings?.rut_percent || 50) : 0
  const rotRutEligible = laborTotal
  const rotRutDeduction = rotRutEligible * (rotRutPercent / 100)
  const customerPays = total - rotRutDeduction

  const saveQuote = async (send: boolean = false) => {
    if (!selectedCustomer) {
      alert('Välj en kund först')
      return
    }

    setSaving(true)
    const quoteId = 'quote_' + Math.random().toString(36).substr(2, 9)
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + validDays)

    const { error } = await supabase.from('quotes').insert({
      quote_id: quoteId,
      business_id: business.business_id,
      customer_id: selectedCustomer,
      status: send ? 'sent' : 'draft',
      title,
      description,
      items,
      labor_total: laborTotal,
      material_total: materialTotal,
      subtotal,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
      vat_rate: pricingSettings?.vat_rate || 25,
      vat_amount: vatAmount,
      total,
      rot_rut_type: rotRutType || null,
      rot_rut_eligible: rotRutEligible,
      rot_rut_deduction: rotRutDeduction,
      customer_pays: customerPays,
      personnummer: rotRutType ? personnummer || null : null,
      fastighetsbeteckning: rotRutType ? fastighetsbeteckning || null : null,
      valid_until: validUntil.toISOString().split('T')[0],
      sent_at: send ? new Date().toISOString() : null,
      ai_generated: aiGenerated || null,
      ai_confidence: aiResult?.confidence || null,
      source_image_url: null,
      source_transcript: sourceTranscript || null
    })

    if (error) {
      console.error('Save failed:', error)
      alert('Kunde inte spara offerten')
    } else {
      router.push('/dashboard/quotes')
    }
    setSaving(false)
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return
    setSavingTemplate(true)

    const materialItems = items.filter(i => i.type === 'material').map(i => ({
      name: i.name,
      quantity: i.quantity,
      unit: i.unit,
      unitPrice: i.unit_price
    }))

    const laborItems = items.filter(i => i.type === 'labor')
    const totalHours = laborItems.reduce((sum, i) => sum + i.quantity, 0)

    try {
      await fetch('/api/quotes/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName,
          description,
          estimatedHours: totalHours,
          laborCost: laborTotal,
          materials: materialItems,
          totalEstimate: subtotal
        })
      })
      setShowSaveTemplateModal(false)
      setTemplateName('')
    } catch (err) {
      console.error('Failed to save template:', err)
    }
    setSavingTemplate(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  // --- Wizard Steps ---
  if (wizardStep !== 'form') {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
        <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
          <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
          <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
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
            {wizardStep === 'select' && (
              <InputSelector onSelect={handleInputSelect} />
            )}

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
                  placeholder="Beskriv jobbet... t.ex. 'Byta 3 eluttag i kök, dra ny kabel från elcentral, installera dimmer i vardagsrum'"
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
                    {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
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
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto mb-4" />
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

  // --- Full Form (step: 'form') ---
  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/quotes" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Ny offert
              {aiGenerated && (
                <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-blue-100 text-blue-600 rounded-full">AI-genererad</span>
              )}
            </h1>
          </div>
          {items.length > 0 && (
            <button
              onClick={() => { setTemplateName(title); setShowSaveTemplateModal(true) }}
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
            <Save className="w-4 h-4" />
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
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer & Basic Info */}
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
                    {customers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>{c.name} - {c.phone_number}</option>
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

            {/* Quote Items */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-600" />
                  Rader
                </h2>
                <div className="flex gap-2">
                  <button onClick={() => addItem('labor')} className="px-3 py-1.5 bg-blue-100 border border-blue-500/30 rounded-lg text-blue-400 text-sm hover:bg-blue-500/30">
                    + Arbete
                  </button>
                  <button onClick={() => addItem('material')} className="px-3 py-1.5 bg-emerald-100 border border-emerald-200 rounded-lg text-emerald-600 text-sm hover:bg-emerald-500/30">
                    + Material
                  </button>
                  <button onClick={() => setShowGrossistSearch(true)} className="px-3 py-1.5 bg-blue-100 border border-blue-300 rounded-lg text-blue-600 text-sm hover:bg-blue-500/30 flex items-center gap-1">
                    <Search className="w-3.5 h-3.5" /> Sök grossist
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-gray-400">
                  <p>Inga rader ännu. Lägg till arbete eller material ovan.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        item.type === 'labor' ? 'bg-blue-100 text-blue-400' :
                        item.type === 'material' ? 'bg-emerald-100 text-emerald-600' :
                        'bg-amber-100 text-amber-600'
                      }`}>
                        {item.type === 'labor' ? 'Arbete' : item.type === 'material' ? 'Material' : 'Tjänst'}
                      </span>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                        placeholder="Beskrivning"
                        className="flex-1 px-3 py-1.5 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1.5 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <span className="text-gray-400 text-sm w-8">{item.unit === 'hour' ? 'h' : 'st'}</span>
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <span className="text-gray-900 font-medium w-24 text-right">{formatCurrency(item.total)}</span>
                      <button onClick={() => removeItem(item.id)} className="p-1.5 text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick add from price list */}
              {priceList.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-300">
                  <p className="text-sm text-gray-400 mb-2">Snabbval från prislista:</p>
                  <div className="flex flex-wrap gap-2">
                    {priceList.slice(0, 8).map(item => (
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
          </div>

          {/* Sidebar - Summary */}
          <div className="space-y-6">
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6 sticky top-4">
              <h2 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-blue-600" />
                Summering
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Arbete</span>
                  <span className="text-gray-900">{formatCurrency(laborTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Material</span>
                  <span className="text-gray-900">{formatCurrency(materialTotal)}</span>
                </div>
                {serviceTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Tjänster</span>
                    <span className="text-gray-900">{formatCurrency(serviceTotal)}</span>
                  </div>
                )}

                <div className="border-t border-gray-300 pt-3">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Summa</span>
                    <span className="text-gray-900">{formatCurrency(subtotal)}</span>
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
                    />
                    <span className="text-gray-400">%</span>
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Rabatt</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-gray-500">Moms ({pricingSettings?.vat_rate || 25}%)</span>
                  <span className="text-gray-900">{formatCurrency(vatAmount)}</span>
                </div>

                <div className="border-t border-gray-300 pt-3">
                  <div className="flex justify-between text-lg font-semibold">
                    <span className="text-gray-900">Totalt</span>
                    <span className="text-gray-900">{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* ROT/RUT */}
                <div className="border-t border-gray-300 pt-3">
                  <label className="block text-sm text-gray-500 mb-2">Skattereduktion</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRotRutType(rotRutType === 'rot' ? '' : 'rot')}
                      disabled={!pricingSettings?.rot_enabled}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        rotRutType === 'rot'
                          ? 'bg-emerald-100 border-2 border-emerald-500 text-emerald-600'
                          : 'bg-gray-100 border border-gray-300 text-gray-500 hover:text-gray-900'
                      } disabled:opacity-50`}
                    >
                      ROT 30%
                    </button>
                    <button
                      onClick={() => setRotRutType(rotRutType === 'rut' ? '' : 'rut')}
                      disabled={!pricingSettings?.rut_enabled}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        rotRutType === 'rut'
                          ? 'bg-emerald-100 border-2 border-emerald-500 text-emerald-600'
                          : 'bg-gray-100 border border-gray-300 text-gray-500 hover:text-gray-900'
                      } disabled:opacity-50`}
                    >
                      RUT 50%
                    </button>
                  </div>
                </div>

                {rotRutType && (
                  <>
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mt-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-emerald-600">Arbetskostnad</span>
                        <span className="text-gray-900">{formatCurrency(rotRutEligible)}</span>
                      </div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-emerald-600">{rotRutType.toUpperCase()}-avdrag ({rotRutPercent}%)</span>
                        <span className="text-emerald-600">-{formatCurrency(rotRutDeduction)}</span>
                      </div>
                      <div className="border-t border-emerald-200 pt-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-gray-900">Kund betalar</span>
                          <span className="text-emerald-600">{formatCurrency(customerPays)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Personnummer *</label>
                        <input
                          type="text"
                          value={personnummer}
                          onChange={(e) => setPersonnummer(e.target.value)}
                          placeholder="YYYYMMDD-XXXX"
                          className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                      </div>
                      {rotRutType === 'rot' && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Fastighetsbeteckning *</label>
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
                        <p className="text-xs text-amber-600">Personnummer krävs för {rotRutType.toUpperCase()}-avdrag</p>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Grossist produktsök */}
      <ProductSearchModal
        isOpen={showGrossistSearch}
        onClose={() => setShowGrossistSearch(false)}
        onSelect={addFromGrossist}
        businessId={business.business_id}
      />

      {/* Save as Template Modal */}
      {showSaveTemplateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowSaveTemplateModal(false)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
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
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
