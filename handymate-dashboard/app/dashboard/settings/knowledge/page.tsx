'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Plus, X, Save, Loader2, Zap, HelpCircle, FileText, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Service {
  name: string
  description: string
  price_indication: string
  typical_duration: string
}

interface FAQ {
  question: string
  answer: string
}

interface KnowledgeBase {
  industry: string
  services: Service[]
  faqs: FAQ[]
  emergency_situations: string[]
  policies: {
    quote: string
    payment: string
    warranty: string
    cancellation: string
  }
}

const INDUSTRIES = [
  { value: 'elektriker', label: 'Elektriker' },
  { value: 'vvs', label: 'VVS' },
  { value: 'snickare', label: 'Snickare' },
  { value: 'malare', label: 'Målare' },
  { value: 'lassmed', label: 'Låssmed' },
  { value: 'stadning', label: 'Städning' },
  { value: 'annat', label: 'Annat' },
]

const DEFAULT_EMERGENCIES: Record<string, string[]> = {
  elektriker: ['Strömavbrott i hela fastigheten', 'Gnistor eller brandlukt från uttag', 'Vatten nära elektriska installationer'],
  vvs: ['Vattenläcka som inte går att stoppa', 'Avloppstopp med översvämning', 'Ingen varmvatten eller värme vintertid'],
  snickare: ['Inbrott med skadad dörr/fönster', 'Akut vattenskada på golv/väggar'],
  malare: [],
  lassmed: ['Utelåst från bostad', 'Inbrott'],
  stadning: [],
  annat: [],
}

export default function KnowledgeBasePage() {
  const business = useBusiness()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  
  const [kb, setKb] = useState<KnowledgeBase>({
    industry: '',
    services: [],
    faqs: [],
    emergency_situations: [],
    policies: { quote: '', payment: '', warranty: '', cancellation: '' }
  })

  useEffect(() => {
    fetchKnowledgeBase()
  }, [business.business_id])

  async function fetchKnowledgeBase() {
    const { data } = await supabase
      .from('business_config')
      .select('knowledge_base')
      .eq('business_id', business.business_id)
      .single()

    if (data?.knowledge_base) {
      setKb({
        industry: data.knowledge_base.industry || '',
        services: data.knowledge_base.services || [],
        faqs: data.knowledge_base.faqs || [],
        emergency_situations: data.knowledge_base.emergency_situations || [],
        policies: data.knowledge_base.policies || { quote: '', payment: '', warranty: '', cancellation: '' }
      })
    }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase
      .from('business_config')
      .update({ knowledge_base: kb })
      .eq('business_id', business.business_id)

    if (error) {
      showToast('Kunde inte spara', 'error')
    } else {
      showToast('Knowledge base sparad!', 'success')
    }
    setSaving(false)
  }

  const handleIndustryChange = (industry: string) => {
    setKb({
      ...kb,
      industry,
      emergency_situations: DEFAULT_EMERGENCIES[industry] || []
    })
  }

  const addService = () => {
    setKb({
      ...kb,
      services: [...kb.services, { name: '', description: '', price_indication: '', typical_duration: '' }]
    })
  }

  const updateService = (index: number, field: keyof Service, value: string) => {
    const updated = [...kb.services]
    updated[index] = { ...updated[index], [field]: value }
    setKb({ ...kb, services: updated })
  }

  const removeService = (index: number) => {
    setKb({ ...kb, services: kb.services.filter((_, i) => i !== index) })
  }

  const addFAQ = () => {
    setKb({
      ...kb,
      faqs: [...kb.faqs, { question: '', answer: '' }]
    })
  }

  const updateFAQ = (index: number, field: 'question' | 'answer', value: string) => {
    const updated = [...kb.faqs]
    updated[index] = { ...updated[index], [field]: value }
    setKb({ ...kb, faqs: updated })
  }

  const removeFAQ = (index: number) => {
    setKb({ ...kb, faqs: kb.faqs.filter((_, i) => i !== index) })
  }

  const addEmergency = () => {
    setKb({ ...kb, emergency_situations: [...kb.emergency_situations, ''] })
  }

  const updateEmergency = (index: number, value: string) => {
    const updated = [...kb.emergency_situations]
    updated[index] = value
    setKb({ ...kb, emergency_situations: updated })
  }

  const removeEmergency = (index: number) => {
    setKb({ ...kb, emergency_situations: kb.emergency_situations.filter((_, i) => i !== index) })
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

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'}`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/dashboard/settings" className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">AI Knowledge Base</h1>
              <p className="text-sm text-gray-500">Lär AI-assistenten om ditt företag</p>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Spara
          </button>
        </div>

        <div className="space-y-6">
          {/* Bransch */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-600" />
              Bransch
            </h2>
            <select
              value={kb.industry}
              onChange={(e) => handleIndustryChange(e.target.value)}
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">Välj bransch...</option>
              {INDUSTRIES.map(ind => (
                <option key={ind.value} value={ind.value}>{ind.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-2">Hjälper AI:n förstå vilken typ av frågor den kan förvänta sig</p>
          </div>

          {/* Tjänster & Priser */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <FileText className="w-5 h-5 text-cyan-600" />
                Tjänster & Priser
              </h2>
              <button
                onClick={addService}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 hover:bg-gray-200"
              >
                <Plus className="w-4 h-4" /> Lägg till
              </button>
            </div>

            {kb.services.length === 0 ? (
              <p className="text-gray-400 text-sm">Inga tjänster tillagda. Klicka &quot;Lägg till&quot; för att börja.</p>
            ) : (
              <div className="space-y-4">
                {kb.services.map((service, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-300">
                    <div className="flex justify-between mb-3">
                      <span className="text-sm text-gray-500">Tjänst {index + 1}</span>
                      <button onClick={() => removeService(index)} className="text-gray-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input
                        type="text"
                        value={service.name}
                        onChange={(e) => updateService(index, 'name', e.target.value)}
                        placeholder="Tjänstens namn"
                        className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <input
                        type="text"
                        value={service.price_indication}
                        onChange={(e) => updateService(index, 'price_indication', e.target.value)}
                        placeholder="Prisindikation (t.ex. 'Från 995 kr')"
                        className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <input
                        type="text"
                        value={service.typical_duration}
                        onChange={(e) => updateService(index, 'typical_duration', e.target.value)}
                        placeholder="Tidsåtgång (t.ex. '1-2 timmar')"
                        className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <input
                        type="text"
                        value={service.description}
                        onChange={(e) => updateService(index, 'description', e.target.value)}
                        placeholder="Kort beskrivning"
                        className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vanliga frågor */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-amber-600" />
                Vanliga frågor (FAQ)
              </h2>
              <button
                onClick={addFAQ}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 hover:bg-gray-200"
              >
                <Plus className="w-4 h-4" /> Lägg till
              </button>
            </div>

            {kb.faqs.length === 0 ? (
              <p className="text-gray-400 text-sm">Inga FAQ tillagda. Lägg till vanliga frågor kunder ställer.</p>
            ) : (
              <div className="space-y-4">
                {kb.faqs.map((faq, index) => (
                  <div key={index} className="p-4 bg-gray-50 rounded-xl border border-gray-300">
                    <div className="flex justify-between mb-3">
                      <span className="text-sm text-gray-500">Fråga {index + 1}</span>
                      <button onClick={() => removeFAQ(index)} className="text-gray-400 hover:text-red-600">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                    <input
                      type="text"
                      value={faq.question}
                      onChange={(e) => updateFAQ(index, 'question', e.target.value)}
                      placeholder="Frågan kunden ställer"
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <textarea
                      value={faq.answer}
                      onChange={(e) => updateFAQ(index, 'answer', e.target.value)}
                      placeholder="Svaret AI:n ska ge"
                      rows={2}
                      className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Akuta situationer */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600" />
                Akuta situationer
              </h2>
              <button
                onClick={addEmergency}
                className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 border border-gray-300 rounded-lg text-sm text-gray-900 hover:bg-gray-200"
              >
                <Plus className="w-4 h-4" /> Lägg till
              </button>
            </div>
            <p className="text-xs text-gray-400 mb-4">Situationer som AI:n ska behandla som akuta och prioritera</p>

            {kb.emergency_situations.length === 0 ? (
              <p className="text-gray-400 text-sm">Välj en bransch ovan för att få förslag på akuta situationer.</p>
            ) : (
              <div className="space-y-2">
                {kb.emergency_situations.map((emergency, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={emergency}
                      onChange={(e) => updateEmergency(index, e.target.value)}
                      placeholder="Beskrivning av akut situation"
                      className="flex-1 px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <button onClick={() => removeEmergency(index)} className="p-2 text-gray-400 hover:text-red-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Policyer */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Policyer
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Offert</label>
                <input
                  type="text"
                  value={kb.policies.quote}
                  onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, quote: e.target.value } })}
                  placeholder="T.ex. 'Vi ger alltid prisuppskattning innan'"
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Betalning</label>
                <input
                  type="text"
                  value={kb.policies.payment}
                  onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, payment: e.target.value } })}
                  placeholder="T.ex. 'Faktura 30 dagar eller Swish'"
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Garanti</label>
                <input
                  type="text"
                  value={kb.policies.warranty}
                  onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, warranty: e.target.value } })}
                  placeholder="T.ex. '2 års garanti på arbete'"
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Avbokning</label>
                <input
                  type="text"
                  value={kb.policies.cancellation}
                  onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, cancellation: e.target.value } })}
                  placeholder="T.ex. 'Avboka senast 24h innan'"
                  className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
