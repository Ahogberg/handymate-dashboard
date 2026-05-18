'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Save, Loader2, Zap, HelpCircle, FileText, AlertTriangle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

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

export interface KnowledgeBase {
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

const EMPTY_KB: KnowledgeBase = {
  industry: '',
  services: [],
  faqs: [],
  emergency_situations: [],
  policies: { quote: '', payment: '', warranty: '', cancellation: '' },
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

interface KnowledgeEditorProps {
  businessId: string
  /** Triggas efter varje fetch/save så parent kan re-evaluera gating */
  onKnowledgeChange?: (kb: KnowledgeBase) => void
}

/**
 * Återanvändbar editor för business_config.knowledge_base. Hanterar fetch +
 * inline save själv. Används både i /dashboard/settings/knowledge och som
 * "Kunskap"-tab i /dashboard/settings/website-widget.
 *
 * Jobbstil-preferenser (margin, min_job, geography m.fl.) ligger inte här —
 * de hör till AI-agent-flödet, inte chatten på hemsidan.
 */
export default function KnowledgeEditor({ businessId, onKnowledgeChange }: KnowledgeEditorProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  const [kb, setKb] = useState<KnowledgeBase>(EMPTY_KB)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('business_config')
        .select('knowledge_base')
        .eq('business_id', businessId)
        .single()
      if (cancelled) return

      if (data?.knowledge_base) {
        const loaded: KnowledgeBase = {
          industry: data.knowledge_base.industry || '',
          services: data.knowledge_base.services || [],
          faqs: data.knowledge_base.faqs || [],
          emergency_situations: data.knowledge_base.emergency_situations || [],
          policies: data.knowledge_base.policies || { quote: '', payment: '', warranty: '', cancellation: '' },
        }
        setKb(loaded)
        onKnowledgeChange?.(loaded)
      } else {
        onKnowledgeChange?.(EMPTY_KB)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [businessId, onKnowledgeChange])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('business_config')
      .update({ knowledge_base: kb })
      .eq('business_id', businessId)
    if (error) {
      showToast('Kunde inte spara', 'error')
    } else {
      showToast('Kunskapsbas sparad', 'success')
      onKnowledgeChange?.(kb)
    }
    setSaving(false)
  }

  function handleIndustryChange(industry: string) {
    setKb({ ...kb, industry, emergency_situations: DEFAULT_EMERGENCIES[industry] || [] })
  }

  function addService() {
    setKb({ ...kb, services: [...kb.services, { name: '', description: '', price_indication: '', typical_duration: '' }] })
  }
  function updateService(index: number, field: keyof Service, value: string) {
    const updated = [...kb.services]
    updated[index] = { ...updated[index], [field]: value }
    setKb({ ...kb, services: updated })
  }
  function removeService(index: number) {
    setKb({ ...kb, services: kb.services.filter((_, i) => i !== index) })
  }

  function addFAQ() {
    setKb({ ...kb, faqs: [...kb.faqs, { question: '', answer: '' }] })
  }
  function updateFAQ(index: number, field: 'question' | 'answer', value: string) {
    const updated = [...kb.faqs]
    updated[index] = { ...updated[index], [field]: value }
    setKb({ ...kb, faqs: updated })
  }
  function removeFAQ(index: number) {
    setKb({ ...kb, faqs: kb.faqs.filter((_, i) => i !== index) })
  }

  function addEmergency() {
    setKb({ ...kb, emergency_situations: [...kb.emergency_situations, ''] })
  }
  function updateEmergency(index: number, value: string) {
    const updated = [...kb.emergency_situations]
    updated[index] = value
    setKb({ ...kb, emergency_situations: updated })
  }
  function removeEmergency(index: number) {
    setKb({ ...kb, emergency_situations: kb.emergency_situations.filter((_, i) => i !== index) })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-700' : 'bg-red-100 border-red-200 text-red-700'}`}>
          {toast.message}
        </div>
      )}

      {/* Säkerhets-varning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <div className="text-amber-600 text-xl leading-none mt-0.5">⚠️</div>
        <div className="flex-1 text-sm text-amber-900 leading-relaxed">
          <strong className="font-semibold">Allt du skriver här syns för besökare via AI-chatten.</strong>{' '}
          Lägg <strong>INTE</strong> in leverantörspriser, marginaler,
          anställdas privata uppgifter eller konkurrentinformation — bara info du är
          OK med att alla på internet kan läsa.
        </div>
      </div>

      {/* Bransch */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-sky-700" />
          Bransch
        </h2>
        <select
          value={kb.industry}
          onChange={(e) => handleIndustryChange(e.target.value)}
          className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
        >
          <option value="">Välj bransch...</option>
          {INDUSTRIES.map(ind => (
            <option key={ind.value} value={ind.value}>{ind.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-2">Hjälper AI:n förstå vilken typ av frågor den kan förvänta sig</p>
      </div>

      {/* Tjänster & Priser */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-700" />
            Tjänster & Priser
          </h2>
          <button onClick={addService} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 hover:bg-gray-200">
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
                  <input type="text" value={service.name} onChange={(e) => updateService(index, 'name', e.target.value)} placeholder="Tjänstens namn" className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
                  <input type="text" value={service.price_indication} onChange={(e) => updateService(index, 'price_indication', e.target.value)} placeholder="Prisindikation (t.ex. 'Från 995 kr')" className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
                  <input type="text" value={service.typical_duration} onChange={(e) => updateService(index, 'typical_duration', e.target.value)} placeholder="Tidsåtgång (t.ex. '1-2 timmar')" className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
                  <input type="text" value={service.description} onChange={(e) => updateService(index, 'description', e.target.value)} placeholder="Kort beskrivning" className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Vanliga frågor */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-amber-600" />
            Vanliga frågor (FAQ)
          </h2>
          <button onClick={addFAQ} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 hover:bg-gray-200">
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
                <input type="text" value={faq.question} onChange={(e) => updateFAQ(index, 'question', e.target.value)} placeholder="Frågan kunden ställer" className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm mb-2 focus:outline-none focus:border-[#0F766E]" />
                <textarea value={faq.answer} onChange={(e) => updateFAQ(index, 'answer', e.target.value)} placeholder="Svaret AI:n ska ge" rows={2} className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm resize-none focus:outline-none focus:border-[#0F766E]" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Akuta situationer */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Akuta situationer
          </h2>
          <button onClick={addEmergency} className="flex items-center gap-1 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 hover:bg-gray-200">
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
                <input type="text" value={emergency} onChange={(e) => updateEmergency(index, e.target.value)} placeholder="Beskrivning av akut situation" className="flex-1 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
                <button onClick={() => removeEmergency(index)} className="p-2 text-gray-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Policyer */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-600" />
          Policyer
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-500 mb-1">Offert</label>
            <input type="text" value={kb.policies.quote} onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, quote: e.target.value } })} placeholder="T.ex. 'Vi ger alltid prisuppskattning innan'" className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Betalning</label>
            <input type="text" value={kb.policies.payment} onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, payment: e.target.value } })} placeholder="T.ex. 'Faktura 30 dagar eller Swish'" className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Garanti</label>
            <input type="text" value={kb.policies.warranty} onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, warranty: e.target.value } })} placeholder="T.ex. '2 års garanti på arbete'" className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
          </div>
          <div>
            <label className="block text-sm text-gray-500 mb-1">Avbokning</label>
            <input type="text" value={kb.policies.cancellation} onChange={(e) => setKb({ ...kb, policies: { ...kb.policies, cancellation: e.target.value } })} placeholder="T.ex. 'Avboka senast 24h innan'" className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]" />
          </div>
        </div>
      </div>

      {/* Save-knapp */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Spara kunskapsbas
        </button>
      </div>
    </div>
  )
}
