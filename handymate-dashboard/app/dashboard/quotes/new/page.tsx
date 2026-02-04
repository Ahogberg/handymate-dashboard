'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
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
  Loader2
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
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

export default function NewQuotePage() {
  const router = useRouter()
  const business = useBusiness()

  const [customers, setCustomers] = useState<Customer[]>([])
  const [priceList, setPriceList] = useState<PriceItem[]>([])
  const [pricingSettings, setPricingSettings] = useState<PricingSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Form state
  const [selectedCustomer, setSelectedCustomer] = useState<string>('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [items, setItems] = useState<QuoteItem[]>([])
  const [rotRutType, setRotRutType] = useState<'rot' | 'rut' | ''>('')
  const [discountPercent, setDiscountPercent] = useState(0)
  const [validDays, setValidDays] = useState(30)

  // AI prompt
  const [aiPrompt, setAiPrompt] = useState('')

  useEffect(() => {
    fetchData()
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

  const generateWithAI = async () => {
    if (!aiPrompt.trim()) return

    setGenerating(true)
    try {
      const response = await fetch('/api/quotes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: aiPrompt,
          priceList,
          pricingSettings,
          businessId: business.business_id
        })
      })

      const data = await response.json()
      if (data.items) {
        setItems(data.items)
        if (data.title) setTitle(data.title)
        if (data.description) setDescription(data.description)
      }
    } catch (error) {
      console.error('AI generation failed:', error)
    }
    setGenerating(false)
  }

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
  const rotRutEligible = laborTotal // Only labor is eligible
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
      valid_until: validUntil.toISOString().split('T')[0],
      sent_at: send ? new Date().toISOString() : null
    })

    if (error) {
      console.error('Save failed:', error)
      alert('Kunde inte spara offerten')
    } else {
      if (send) {
        // TODO: Send SMS/Email
      }
      router.push('/dashboard/quotes')
    }
    setSaving(false)
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', maximumFractionDigits: 0 }).format(amount)
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/quotes" className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Ny offert</h1>
          </div>
          <button
            onClick={() => saveQuote(false)}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">Spara utkast</span>
          </button>
          <button
            onClick={() => saveQuote(true)}
            disabled={saving || !selectedCustomer}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span className="hidden sm:inline">Skicka</span>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Generator */}
            <div className="bg-gradient-to-br from-violet-500/10 to-fuchsia-500/10 backdrop-blur-xl rounded-xl border border-violet-500/30 p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-violet-400" />
                <h2 className="font-semibold text-white">AI-generera offert</h2>
              </div>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Beskriv jobbet... t.ex. 'Byta 3 eluttag i kök, dra ny kabel från elcentral, installera dimmer i vardagsrum'"
                rows={3}
                className="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none mb-3"
              />
              <button
                onClick={generateWithAI}
                disabled={generating || !aiPrompt.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-violet-500 rounded-lg text-white font-medium hover:bg-violet-600 disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? 'Genererar...' : 'Generera förslag'}
              </button>
            </div>

            {/* Customer & Basic Info */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-cyan-400" />
                Kundinformation
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Kund *</label>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    <option value="">Välj kund...</option>
                    {customers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>{c.name} - {c.phone_number}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Giltighetstid</label>
                  <select
                    value={validDays}
                    onChange={(e) => setValidDays(parseInt(e.target.value))}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    <option value={14}>14 dagar</option>
                    <option value={30}>30 dagar</option>
                    <option value={60}>60 dagar</option>
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-zinc-400 mb-1">Titel</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="T.ex. Elinstallation kök"
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm text-zinc-400 mb-1">Beskrivning</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Beskriv arbetet som ska utföras..."
                    rows={2}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Quote Items */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-white flex items-center gap-2">
                  <FileText className="w-5 h-5 text-amber-400" />
                  Rader
                </h2>
                <div className="flex gap-2">
                  <button onClick={() => addItem('labor')} className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-400 text-sm hover:bg-blue-500/30">
                    + Arbete
                  </button>
                  <button onClick={() => addItem('material')} className="px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm hover:bg-emerald-500/30">
                    + Material
                  </button>
                </div>
              </div>

              {items.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <p>Inga rader ännu. Använd AI-generatorn eller lägg till manuellt.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl">
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        item.type === 'labor' ? 'bg-blue-500/20 text-blue-400' :
                        item.type === 'material' ? 'bg-emerald-500/20 text-emerald-400' :
                        'bg-amber-500/20 text-amber-400'
                      }`}>
                        {item.type === 'labor' ? 'Arbete' : item.type === 'material' ? 'Material' : 'Tjänst'}
                      </span>
                      <input
                        type="text"
                        value={item.name}
                        onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                        placeholder="Beskrivning"
                        className="flex-1 px-3 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        className="w-16 px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                      <span className="text-zinc-500 text-sm w-8">{item.unit === 'hour' ? 'h' : 'st'}</span>
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(item.id, 'unit_price', parseFloat(e.target.value) || 0)}
                        className="w-24 px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                      <span className="text-white font-medium w-24 text-right">{formatCurrency(item.total)}</span>
                      <button onClick={() => removeItem(item.id)} className="p-1.5 text-zinc-500 hover:text-red-400">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick add from price list */}
              {priceList.length > 0 && (
                <div className="mt-4 pt-4 border-t border-zinc-700">
                  <p className="text-sm text-zinc-500 mb-2">Snabbval från prislista:</p>
                  <div className="flex flex-wrap gap-2">
                    {priceList.slice(0, 8).map(item => (
                      <button
                        key={item.id}
                        onClick={() => addFromPriceList(item)}
                        className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-300 text-sm hover:bg-zinc-700 hover:text-white"
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
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6 sticky top-4">
              <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
                <Calculator className="w-5 h-5 text-violet-400" />
                Summering
              </h2>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Arbete</span>
                  <span className="text-white">{formatCurrency(laborTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Material</span>
                  <span className="text-white">{formatCurrency(materialTotal)}</span>
                </div>
                {serviceTotal > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Tjänster</span>
                    <span className="text-white">{formatCurrency(serviceTotal)}</span>
                  </div>
                )}

                <div className="border-t border-zinc-700 pt-3">
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Summa</span>
                    <span className="text-white">{formatCurrency(subtotal)}</span>
                  </div>
                </div>

                {/* Discount */}
                <div className="flex items-center justify-between">
                  <span className="text-zinc-400">Rabatt</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                      className="w-16 px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-white text-sm text-right"
                    />
                    <span className="text-zinc-500">%</span>
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Rabatt</span>
                    <span>-{formatCurrency(discountAmount)}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-zinc-400">Moms ({pricingSettings?.vat_rate || 25}%)</span>
                  <span className="text-white">{formatCurrency(vatAmount)}</span>
                </div>

                <div className="border-t border-zinc-700 pt-3">
                  <div className="flex justify-between text-lg font-semibold">
                    <span className="text-white">Totalt</span>
                    <span className="text-white">{formatCurrency(total)}</span>
                  </div>
                </div>

                {/* ROT/RUT */}
                <div className="border-t border-zinc-700 pt-3">
                  <label className="block text-sm text-zinc-400 mb-2">Skattereduktion</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRotRutType(rotRutType === 'rot' ? '' : 'rot')}
                      disabled={!pricingSettings?.rot_enabled}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        rotRutType === 'rot'
                          ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400'
                          : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white'
                      } disabled:opacity-50`}
                    >
                      ROT 30%
                    </button>
                    <button
                      onClick={() => setRotRutType(rotRutType === 'rut' ? '' : 'rut')}
                      disabled={!pricingSettings?.rut_enabled}
                      className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        rotRutType === 'rut'
                          ? 'bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400'
                          : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-white'
                      } disabled:opacity-50`}
                    >
                      RUT 50%
                    </button>
                  </div>
                </div>

                {rotRutType && (
                  <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-4 mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-emerald-400">Arbetskostnad</span>
                      <span className="text-white">{formatCurrency(rotRutEligible)}</span>
                    </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-emerald-400">{rotRutType.toUpperCase()}-avdrag ({rotRutPercent}%)</span>
                      <span className="text-emerald-400">-{formatCurrency(rotRutDeduction)}</span>
                    </div>
                    <div className="border-t border-emerald-500/30 pt-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-white">Kund betalar</span>
                        <span className="text-emerald-400">{formatCurrency(customerPays)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
