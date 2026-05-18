'use client'

import { useEffect, useState } from 'react'
import { Plus, X, Save, Loader2, Shield, MessageSquareOff, Check } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export interface WidgetGuardrails {
  custom_instructions: string
  allowed_topics: string[]
  blocked_topics: string[]
  fallback_response: string
}

const EMPTY_GUARDRAILS: WidgetGuardrails = {
  custom_instructions: '',
  allowed_topics: [],
  blocked_topics: [],
  fallback_response: '',
}

const SUGGESTED_BLOCKED: string[] = [
  'Juridiska frågor',
  'Konkurrenters tjänster',
  'Medicinska råd',
  'Politiska åsikter',
  'Andra branscher än våra',
]

interface GuardrailsEditorProps {
  businessId: string
  /** Triggas efter fetch/save så parent kan re-evaluera gating */
  onGuardrailsChange?: (g: WidgetGuardrails) => void
}

/**
 * Boundaries-editor för business_config.widget_guardrails. Definierar vad
 * chattboten får svara om och vad den ska refusera. Injiceras i widget-chat
 * systemprompten via formatGuardrailsForPrompt() i lib/widget-activation.ts.
 *
 * Krävs (tillsammans med knowledge_base) för att widget kan aktiveras.
 */
export default function GuardrailsEditor({ businessId, onGuardrailsChange }: GuardrailsEditorProps) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  const [g, setG] = useState<WidgetGuardrails>(EMPTY_GUARDRAILS)
  const [newAllowed, setNewAllowed] = useState('')
  const [newBlocked, setNewBlocked] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data } = await supabase
        .from('business_config')
        .select('widget_guardrails')
        .eq('business_id', businessId)
        .single()
      if (cancelled) return

      if (data?.widget_guardrails) {
        const loaded: WidgetGuardrails = {
          custom_instructions: data.widget_guardrails.custom_instructions || '',
          allowed_topics: data.widget_guardrails.allowed_topics || [],
          blocked_topics: data.widget_guardrails.blocked_topics || [],
          fallback_response: data.widget_guardrails.fallback_response || '',
        }
        setG(loaded)
        onGuardrailsChange?.(loaded)
      } else {
        onGuardrailsChange?.(EMPTY_GUARDRAILS)
      }
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [businessId, onGuardrailsChange])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase
      .from('business_config')
      .update({ widget_guardrails: g })
      .eq('business_id', businessId)
    if (error) {
      // Sannolikt v15-migrationen inte körd än
      showToast(error.message.includes('column') ? 'Kör SQL-migration v15 först' : 'Kunde inte spara', 'error')
    } else {
      showToast('Boundaries sparade', 'success')
      onGuardrailsChange?.(g)
    }
    setSaving(false)
  }

  function addAllowed() {
    const t = newAllowed.trim()
    if (!t || g.allowed_topics.includes(t)) return
    setG({ ...g, allowed_topics: [...g.allowed_topics, t] })
    setNewAllowed('')
  }
  function removeAllowed(t: string) {
    setG({ ...g, allowed_topics: g.allowed_topics.filter(x => x !== t) })
  }

  function addBlocked(value?: string) {
    const t = (value ?? newBlocked).trim()
    if (!t || g.blocked_topics.includes(t)) return
    setG({ ...g, blocked_topics: [...g.blocked_topics, t] })
    if (!value) setNewBlocked('')
  }
  function removeBlocked(t: string) {
    setG({ ...g, blocked_topics: g.blocked_topics.filter(x => x !== t) })
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

      {/* Intro */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-start gap-3">
        <Shield className="w-5 h-5 text-sky-700 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-sky-900 leading-relaxed">
          <strong className="font-semibold">Sätt gränser för vad chattboten får svara på.</strong>{' '}
          Utan boundaries kan besökare fråga om vad som helst — juridik, konkurrenter,
          medicinska råd — och boten kan ge svar du inte vill stå för. Definiera tydligt
          scope så minskar du både ansvarsrisk och pinsamma svar.
        </div>
      </div>

      {/* Custom instructions — KRÄVS */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <MessageSquareOff className="w-5 h-5 text-primary-700" />
          Vad får boten svara om? <span className="text-red-600 text-sm">*</span>
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Skriv tydligt vad scopet är. Ex: &quot;Bara frågor om våra renoveringstjänster, prisuppskattningar och bokningar. Hänvisa allt annat till mejl.&quot;
        </p>
        <textarea
          value={g.custom_instructions}
          onChange={(e) => setG({ ...g, custom_instructions: e.target.value })}
          rows={4}
          placeholder="Beskriv botens scope. Detta blir grunden för hur den avgör vad den får och inte får svara på."
          className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm resize-none focus:outline-none focus:border-[#0F766E]"
        />
      </div>

      {/* Allowed topics */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <Check className="w-5 h-5 text-emerald-600" />
          Tillåtna ämnen <span className="text-gray-400 text-sm font-normal">(valfritt)</span>
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Konkreta ämnen boten gärna får svara om. Lämna tomt om scopet ovan räcker.
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {g.allowed_topics.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-sm text-emerald-700">
              {t}
              <button onClick={() => removeAllowed(t)} className="hover:text-emerald-900">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newAllowed}
            onChange={(e) => setNewAllowed(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllowed() } }}
            placeholder="T.ex. 'köksrenovering'"
            className="flex-1 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]"
          />
          <button onClick={addAllowed} className="flex items-center gap-1 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 hover:bg-gray-50">
            <Plus className="w-4 h-4" /> Lägg till
          </button>
        </div>
      </div>

      {/* Blocked topics — KRÄVS (eller allowed_topics) */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <X className="w-5 h-5 text-red-600" />
          Blockerade ämnen <span className="text-red-600 text-sm">*</span>
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Ämnen boten ska refusera att svara på. Minst 1 krävs (eller fyll allmänna ämnen ovan).
        </p>
        <div className="flex flex-wrap gap-2 mb-3">
          {g.blocked_topics.map(t => (
            <span key={t} className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 border border-red-200 rounded-full text-sm text-red-700">
              {t}
              <button onClick={() => removeBlocked(t)} className="hover:text-red-900">
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={newBlocked}
            onChange={(e) => setNewBlocked(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBlocked() } }}
            placeholder="T.ex. 'juridiska frågor'"
            className="flex-1 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]"
          />
          <button onClick={() => addBlocked()} className="flex items-center gap-1 px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 hover:bg-gray-50">
            <Plus className="w-4 h-4" /> Lägg till
          </button>
        </div>
        <div className="text-xs text-gray-500 mb-2">Förslag:</div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_BLOCKED.filter(s => !g.blocked_topics.includes(s)).map(s => (
            <button
              key={s}
              onClick={() => addBlocked(s)}
              className="text-xs px-2 py-1 bg-gray-50 border border-gray-200 rounded-full text-gray-600 hover:bg-gray-100"
            >
              + {s}
            </button>
          ))}
        </div>
      </div>

      {/* Fallback response */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 sm:p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
          <MessageSquareOff className="w-5 h-5 text-gray-600" />
          Standardsvar utanför scope <span className="text-gray-400 text-sm font-normal">(valfritt)</span>
        </h2>
        <p className="text-sm text-gray-500 mb-3">
          Hur ska boten svara när någon frågar om något utanför scope? Lämna tomt så genererar boten egen formulering.
        </p>
        <textarea
          value={g.fallback_response}
          onChange={(e) => setG({ ...g, fallback_response: e.target.value })}
          rows={2}
          placeholder="T.ex. 'Det är utanför vad jag kan hjälpa med — mejla oss på info@example.se så svarar vi personligen.'"
          className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm resize-none focus:outline-none focus:border-[#0F766E]"
        />
      </div>

      {/* Save */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Spara boundaries
        </button>
      </div>
    </div>
  )
}
