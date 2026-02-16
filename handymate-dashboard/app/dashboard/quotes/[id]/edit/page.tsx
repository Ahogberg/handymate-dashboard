'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
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
  Check
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import ProductSearchModal from '@/components/ProductSearchModal'
import { SelectedProduct } from '@/lib/suppliers/types'

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

export default function EditQuotePage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const quoteId = params.id as string

  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const dirtyRef = useRef(false)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const lastSavedRef = useRef<string>('')

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
  const [quoteStatus, setQuoteStatus] = useState('draft')
  const [quoteNumber, setQuoteNumber] = useState('')

  useEffect(() => {
    fetchData()
  }, [business.business_id, quoteId])

  async function fetchData() {
    const [customersRes, priceListRes, settingsRes] = await Promise.all([
      supabase.from('customer').select('*').eq('business_id', business.business_id),
      supabase.from('price_list').select('*').eq('business_id', business.business_id).eq('is_active', true),
      supabase.from('business_config').select('pricing_settings').eq('business_id', business.business_id).single()
    ])

    setCustomers(customersRes.data || [])
    setPriceList(priceListRes.data || [])
    setPricingSettings(settingsRes.data?.pricing_settings || {
      hourly_rate: 650, callout_fee: 495, minimum_hours: 1, vat_rate: 25,
      rot_enabled: true, rot_percent: 30, rut_enabled: false, rut_percent: 50,
      payment_terms: 30, warranty_years: 2
    })

    // Fetch existing quote
    try {
      const res = await fetch(`/api/quotes?quoteId=${quoteId}`)
      if (res.ok) {
        const data = await res.json()
        const q = data.quote
        if (q) {
          setSelectedCustomer(q.customer_id || '')
          setTitle(q.title || '')
          setDescription(q.description || '')
          setItems(q.items || [])
          setRotRutType(q.rot_rut_type || '')
          setDiscountPercent(q.discount_percent || 0)
          setPersonnummer(q.personnummer || '')
          setFastighetsbeteckning(q.fastighetsbeteckning || '')
          setQuoteStatus(q.status || 'draft')
          setQuoteNumber(q.quote_number || '')
          if (q.valid_until) {
            const diffMs = new Date(q.valid_until).getTime() - new Date(q.created_at).getTime()
            const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
            setValidDays(diffDays > 0 ? diffDays : 30)
          }
          lastSavedRef.current = JSON.stringify({ title: q.title, description: q.description, items: q.items, customer_id: q.customer_id })
        }
      }
    } catch (err) {
      console.error('Failed to fetch quote:', err)
    }
    setLoading(false)
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
  const rotRutPercent = rotRutType === 'rot' ? (pricingSettings?.rot_percent || 30) : rotRutType === 'rut' ? (pricingSettings?.rut_percent || 50) : 0
  const rotRutEligible = laborTotal
  const rotRutDeduction = rotRutEligible * (rotRutPercent / 100)
  const customerPays = total - rotRutDeduction

  // Auto-save logic
  const doAutoSave = useCallback(async () => {
    if (!dirtyRef.current || !quoteId) return
    const currentState = JSON.stringify({ title, description, items, customer_id: selectedCustomer })
    if (currentState === lastSavedRef.current) return

    setAutoSaveStatus('saving')
    try {
      const res = await fetch('/api/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quoteId,
          customer_id: selectedCustomer || null,
          title, description, items,
          vat_rate: pricingSettings?.vat_rate || 25,
          discount_percent: discountPercent,
          rot_rut_type: rotRutType || null,
          personnummer: rotRutType ? personnummer || null : null,
          fastighetsbeteckning: rotRutType ? fastighetsbeteckning || null : null,
          valid_days: validDays,
          terms: {
            payment_terms: pricingSettings?.payment_terms || 30,
            warranty_years: pricingSettings?.warranty_years || 2,
          },
        })
      })
      if (res.ok) {
        lastSavedRef.current = currentState
        dirtyRef.current = false
        setAutoSaveStatus('saved')
        setTimeout(() => setAutoSaveStatus('idle'), 2000)
      }
    } catch {
      setAutoSaveStatus('idle')
    }
  }, [quoteId, title, description, items, selectedCustomer, discountPercent, rotRutType, personnummer, fastighetsbeteckning, validDays, pricingSettings])

  // Mark dirty + schedule auto-save on form changes
  useEffect(() => {
    if (loading) return
    dirtyRef.current = true

    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => {
      doAutoSave()
    }, 5000)

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    }
  }, [title, description, items, selectedCustomer, discountPercent, rotRutType, personnummer, fastighetsbeteckning, validDays, doAutoSave, loading])

  // Save on unmount
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (dirtyRef.current) doAutoSave()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
      if (dirtyRef.current) doAutoSave()
    }
  }, [doAutoSave])

  // Item management
  const addItem = (type: 'labor' | 'material' | 'service') => {
    setItems([...items, {
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      type, name: '', quantity: 1,
      unit: type === 'labor' ? 'hour' : 'piece',
      unit_price: type === 'labor' ? (pricingSettings?.hourly_rate || 650) : 0,
      total: 0
    }])
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

  const removeItem = (id: string) => setItems(items.filter(item => item.id !== id))

  const addFromGrossist = (product: SelectedProduct) => {
    setItems([...items, {
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      type: 'material', name: product.name, quantity: 1,
      unit: product.unit || 'piece',
      unit_price: product.sell_price,
      total: product.sell_price
    }])
    setShowGrossistSearch(false)
  }

  const addFromPriceList = (priceItem: PriceItem) => {
    setItems([...items, {
      id: 'item_' + Math.random().toString(36).substr(2, 9),
      type: priceItem.category === 'labor' ? 'labor' : priceItem.category === 'material' ? 'material' : 'service',
      name: priceItem.name, quantity: 1, unit: priceItem.unit || 'piece',
      unit_price: priceItem.unit_price, total: priceItem.unit_price
    }])
  }

  const saveQuote = async (send: boolean = false) => {
    if (send && !selectedCustomer) {
      alert('Välj en kund först för att skicka offerten')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quote_id: quoteId,
          customer_id: selectedCustomer || null,
          status: send ? 'sent' : undefined,
          title, description, items,
          vat_rate: pricingSettings?.vat_rate || 25,
          discount_percent: discountPercent,
          rot_rut_type: rotRutType || null,
          personnummer: rotRutType ? personnummer || null : null,
          fastighetsbeteckning: rotRutType ? fastighetsbeteckning || null : null,
          valid_days: validDays,
          terms: {
            payment_terms: pricingSettings?.payment_terms || 30,
            warranty_years: pricingSettings?.warranty_years || 2,
          },
        })
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.error || 'Kunde inte spara offerten')
      } else {
        dirtyRef.current = false
        router.push(`/dashboard/quotes/${quoteId}`)
      }
    } catch (err) {
      console.error('Save failed:', err)
      alert('Kunde inte spara offerten')
    }
    setSaving(false)
  }

  async function saveAsTemplate() {
    if (!templateName.trim()) return
    setSavingTemplate(true)
    try {
      const laborItems = items.filter(i => i.type === 'labor')
      const totalHours = laborItems.reduce((sum, i) => sum + i.quantity, 0)
      const materialItems = items.filter(i => i.type === 'material').map(i => ({
        name: i.name, quantity: i.quantity, unit: i.unit, unitPrice: i.unit_price
      }))
      await fetch('/api/quotes/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: templateName, description, estimatedHours: totalHours,
          laborCost: laborTotal, materials: materialItems, totalEstimate: subtotal,
          items, rot_rut_type: rotRutType || null,
          terms: { payment_terms: pricingSettings?.payment_terms || 30, warranty_years: pricingSettings?.warranty_years || 2 },
        })
      })
      setShowSaveTemplateModal(false)
      setTemplateName('')
    } catch (err) {
      console.error('Failed to save template:', err)
    }
    setSavingTemplate(false)
  }

  // Auto-fill personnummer from customer
  useEffect(() => {
    if (selectedCustomer && rotRutType) {
      const customer = customers.find(c => c.customer_id === selectedCustomer)
      if (customer) {
        if (customer.personal_number && !personnummer) setPersonnummer(customer.personal_number)
        if (customer.property_designation && !fastighetsbeteckning) setFastighetsbeteckning(customer.property_designation)
      }
    }
  }, [selectedCustomer, rotRutType])

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

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href={`/dashboard/quotes/${quoteId}`} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Redigera offert
              {quoteNumber && <span className="ml-2 text-sm font-normal text-gray-400">{quoteNumber}</span>}
            </h1>
            {/* Auto-save indicator */}
            <div className="flex items-center gap-1 mt-0.5">
              {autoSaveStatus === 'saving' && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" /> Sparar...
                </span>
              )}
              {autoSaveStatus === 'saved' && (
                <span className="text-xs text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Sparad
                </span>
              )}
            </div>
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
            <span className="hidden sm:inline">Spara</span>
          </button>
          {quoteStatus === 'draft' && (
            <button
              onClick={() => saveQuote(true)}
              disabled={saving || !selectedCustomer}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">Skicka</span>
            </button>
          )}
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
                  <label className="block text-sm text-gray-500 mb-1">Kund</label>
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
                      <select
                        value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                        className="w-20 px-1 py-1.5 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      >
                        <option value="hour">tim</option>
                        <option value="piece">st</option>
                        <option value="m2">m²</option>
                        <option value="m">m</option>
                        <option value="lm">lm</option>
                        <option value="pauschal">pauschal</option>
                      </select>
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
                    <input type="number" value={discountPercent}
                      onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 bg-gray-100 border border-gray-300 rounded text-gray-900 text-sm text-right" />
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
                        rotRutType === 'rot' ? 'bg-emerald-100 border-2 border-emerald-500 text-emerald-600'
                          : 'bg-gray-100 border border-gray-300 text-gray-500 hover:text-gray-900'
                      } disabled:opacity-50`}
                    >ROT 30%</button>
                    <button
                      onClick={() => setRotRutType(rotRutType === 'rut' ? '' : 'rut')}
                      disabled={!pricingSettings?.rut_enabled}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        rotRutType === 'rut' ? 'bg-emerald-100 border-2 border-emerald-500 text-emerald-600'
                          : 'bg-gray-100 border border-gray-300 text-gray-500 hover:text-gray-900'
                      } disabled:opacity-50`}
                    >RUT 50%</button>
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
                        <input type="text" value={personnummer}
                          onChange={(e) => setPersonnummer(e.target.value)}
                          placeholder="YYYYMMDD-XXXX"
                          className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
                      </div>
                      {rotRutType === 'rot' && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Fastighetsbeteckning *</label>
                          <input type="text" value={fastighetsbeteckning}
                            onChange={(e) => setFastighetsbeteckning(e.target.value)}
                            placeholder="T.ex. Stockholm Söder 1:23"
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
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

      {/* Grossist search modal */}
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
              <input type="text" value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="T.ex. Byte elcentral" autoFocus
                className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowSaveTemplateModal(false)}
                className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200">
                Avbryt
              </button>
              <button onClick={saveAsTemplate}
                disabled={!templateName.trim() || savingTemplate}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50">
                {savingTemplate ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Spara'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
