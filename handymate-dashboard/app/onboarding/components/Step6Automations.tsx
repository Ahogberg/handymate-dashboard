'use client'

import { useState, useEffect } from 'react'
import {
  Zap,
  Phone,
  TrendingUp,
  MessageSquare,
  Calendar,
  FileText,
  ShieldCheck,
  Shield,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from 'lucide-react'
import type { StepProps } from '../types'

// ── Types ──────────────────────────────────────────────────────

type RiskLevel = 'low' | 'medium' | 'high'

interface AutomationItem {
  key: string
  label: string
  description: string
  risk: RiskLevel
}

interface AutomationCategory {
  id: string
  title: string
  icon: typeof Zap
  color: string
  borderColor: string
  items: AutomationItem[]
}

// ── Risk Config ────────────────────────────────────────────────

const RISK_CONFIG: Record<RiskLevel, { label: string; icon: typeof Shield; color: string; bgColor: string; borderColor: string }> = {
  low: { label: 'Låg risk', icon: ShieldCheck, color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  medium: { label: 'Medel risk', icon: Shield, color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  high: { label: 'Hög risk', icon: ShieldAlert, color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
}

// ── Categories ─────────────────────────────────────────────────

const AUTOMATION_CATEGORIES: AutomationCategory[] = [
  {
    id: 'ai',
    title: 'AI & Samtal',
    icon: Phone,
    color: 'text-teal-400',
    borderColor: 'border-teal-500/20',
    items: [
      { key: 'ai_analyze_calls', label: 'AI-analys av samtal', description: 'Analyserar transkriberade samtal för att identifiera leads och kundintention', risk: 'low' },
      { key: 'ai_create_leads', label: 'Skapa leads automatiskt', description: 'Skapar nya leads i pipeline automatiskt från analyserade samtal', risk: 'low' },
      { key: 'ai_auto_move_deals', label: 'Flytta deals med AI', description: 'AI flyttar deals i pipeline baserat på samtalsinnehåll', risk: 'medium' },
    ],
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    icon: TrendingUp,
    color: 'text-teal-500',
    borderColor: 'border-teal-500/20',
    items: [
      { key: 'pipeline_move_on_quote_sent', label: 'Flytta vid offert skickad', description: 'Flyttar deal till "Offert skickad" automatiskt', risk: 'low' },
      { key: 'pipeline_move_on_quote_accepted', label: 'Flytta vid offert accepterad', description: 'Flyttar deal till "Accepterad" när kund signerar', risk: 'low' },
      { key: 'pipeline_move_on_invoice_sent', label: 'Flytta vid faktura skickad', description: 'Flyttar deal till "Fakturerad" automatiskt', risk: 'low' },
      { key: 'pipeline_move_on_payment', label: 'Flytta vid betalning', description: 'Flyttar deal till "Betalt" när faktura betalas', risk: 'low' },
    ],
  },
  {
    id: 'sms',
    title: 'SMS-kommunikation',
    icon: MessageSquare,
    color: 'text-emerald-400',
    borderColor: 'border-emerald-500/20',
    items: [
      { key: 'sms_booking_confirmation', label: 'Bokningsbekräftelse', description: 'Skicka SMS automatiskt när en bokning skapas', risk: 'medium' },
      { key: 'sms_day_before_reminder', label: 'Påminnelse dagen innan', description: 'SMS-påminnelse kvällen innan ett bokat besök', risk: 'low' },
      { key: 'sms_on_the_way', label: '"Vi är på väg"', description: 'Skicka "vi är på väg"-SMS till kund innan besök', risk: 'medium' },
      { key: 'sms_quote_followup', label: 'Offert-uppföljning', description: 'Påminnelse om offert som ej besvarats efter 3 dagar', risk: 'medium' },
      { key: 'sms_job_completed', label: 'Jobb avslutat', description: 'Skicka SMS när ett projekt markeras som klart', risk: 'medium' },
      { key: 'sms_invoice_reminder', label: 'Faktura-påminnelse', description: 'Påminnelse om förfallen faktura', risk: 'medium' },
      { key: 'sms_review_request', label: 'Be om recension', description: 'Be om Google-recension efter betald faktura', risk: 'medium' },
    ],
  },
  {
    id: 'calendar',
    title: 'Kalender',
    icon: Calendar,
    color: 'text-orange-400',
    borderColor: 'border-orange-500/20',
    items: [
      { key: 'calendar_sync_bookings', label: 'Synka bokningar', description: 'Synkronisera bokningar till Google Calendar', risk: 'low' },
      { key: 'calendar_create_from_booking', label: 'Skapa kalenderhändelse', description: 'Skapa Google Calendar-händelse vid ny bokning', risk: 'low' },
    ],
  },
  {
    id: 'accounting',
    title: 'Bokföring',
    icon: FileText,
    color: 'text-teal-400',
    borderColor: 'border-teal-500/20',
    items: [
      { key: 'fortnox_sync_invoices', label: 'Synka fakturor till Fortnox', description: 'Synkronisera fakturor automatiskt till Fortnox', risk: 'high' },
      { key: 'fortnox_sync_customers', label: 'Synka kunder till Fortnox', description: 'Synkronisera kundregister automatiskt till Fortnox', risk: 'high' },
    ],
  },
]

// Build default state: low risk ON, medium/high OFF
function getDefaultState(): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const cat of AUTOMATION_CATEGORIES) {
    for (const item of cat.items) {
      state[item.key] = item.risk === 'low'
    }
  }
  return state
}

// Recommended preset: low ON, some medium ON, high OFF
function getRecommendedState(): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const cat of AUTOMATION_CATEGORIES) {
    for (const item of cat.items) {
      if (item.risk === 'low') {
        state[item.key] = true
      } else if (item.risk === 'medium') {
        // Enable safe medium-risk items
        state[item.key] = ['sms_booking_confirmation', 'sms_day_before_reminder', 'sms_quote_followup', 'ai_auto_move_deals'].includes(item.key)
      } else {
        state[item.key] = false
      }
    }
  }
  return state
}

// ── Component ──────────────────────────────────────────────────

export default function Step6Automations({ data, onNext, onBack, saving }: StepProps) {
  const [toggles, setToggles] = useState<Record<string, boolean>>(getDefaultState)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('ai')
  const [savingLocal, setSavingLocal] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // Load existing settings if any
  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await fetch('/api/automations')
        if (res.ok) {
          const { settings } = await res.json()
          if (settings) {
            const loaded: Record<string, boolean> = {}
            for (const cat of AUTOMATION_CATEGORIES) {
              for (const item of cat.items) {
                const val = settings[item.key]
                loaded[item.key] = typeof val === 'boolean' ? val : (item.risk === 'low')
              }
            }
            setToggles(loaded)
          }
        }
      } catch {
        // Use defaults
      }
      setLoaded(true)
    }
    loadSettings()
  }, [])

  const handleToggle = (key: string) => {
    setToggles(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const applyRecommended = () => {
    setToggles(getRecommendedState())
  }

  const handleSave = async () => {
    setSavingLocal(true)
    try {
      await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toggles),
      })
      onNext()
    } catch {
      // Try to continue anyway
      onNext()
    }
    setSavingLocal(false)
  }

  const enabledCount = Object.values(toggles).filter(Boolean).length
  const totalCount = Object.keys(toggles).length

  // Count by risk
  const riskCounts = { low: { on: 0, total: 0 }, medium: { on: 0, total: 0 }, high: { on: 0, total: 0 } }
  for (const cat of AUTOMATION_CATEGORIES) {
    for (const item of cat.items) {
      riskCounts[item.risk].total++
      if (toggles[item.key]) riskCounts[item.risk].on++
    }
  }

  const isSaving = saving || savingLocal

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold text-white">Automationer</h1>
        <p className="text-zinc-400 mt-2">Steg 6 av 7 — Konfigurera vad som ska ske automatiskt</p>
      </div>

      {/* Risk summary */}
      <div className="grid grid-cols-3 gap-3">
        {(['low', 'medium', 'high'] as RiskLevel[]).map((risk) => {
          const config = RISK_CONFIG[risk]
          const Icon = config.icon
          return (
            <div key={risk} className={`${config.bgColor} border ${config.borderColor} rounded-xl p-3 text-center`}>
              <Icon className={`w-5 h-5 ${config.color} mx-auto mb-1`} />
              <p className={`text-xs font-medium ${config.color}`}>{config.label}</p>
              <p className="text-white font-bold text-lg">{riskCounts[risk].on}/{riskCounts[risk].total}</p>
            </div>
          )
        })}
      </div>

      {/* Recommended setup button */}
      <button
        onClick={applyRecommended}
        className="w-full flex items-center justify-center gap-2 py-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-teal-400 hover:bg-teal-500/20 transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        <span className="font-medium text-sm">Rekommenderad setup</span>
        <span className="text-xs text-teal-500">({enabledCount}/{totalCount} aktiva)</span>
      </button>

      {/* Categories */}
      <div className="space-y-3">
        {AUTOMATION_CATEGORIES.map((category) => {
          const Icon = category.icon
          const isExpanded = expandedCategory === category.id
          const categoryEnabled = category.items.filter(i => toggles[i.key]).length
          const categoryTotal = category.items.length

          return (
            <div key={category.id} className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
              {/* Category header */}
              <button
                onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-zinc-800/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-zinc-800 ${category.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-medium text-sm">{category.title}</p>
                    <p className="text-zinc-500 text-xs">{categoryEnabled}/{categoryTotal} aktiva</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-zinc-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-zinc-500" />
                )}
              </button>

              {/* Category items */}
              {isExpanded && (
                <div className="border-t border-zinc-800 px-4 pb-3">
                  {category.items.map((item) => {
                    const riskConfig = RISK_CONFIG[item.risk]
                    const RiskIcon = riskConfig.icon
                    const isOn = toggles[item.key]

                    return (
                      <div key={item.key} className="flex items-start gap-3 py-3 border-b border-zinc-800/50 last:border-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <p className="text-sm font-medium text-white">{item.label}</p>
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${riskConfig.bgColor} ${riskConfig.color} ${riskConfig.borderColor} border`}>
                              <RiskIcon className="w-2.5 h-2.5" />
                              {riskConfig.label}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-500">{item.description}</p>
                        </div>
                        <button
                          onClick={() => handleToggle(item.key)}
                          className={`relative mt-1 w-10 h-5 rounded-full transition-colors flex-shrink-0 ${
                            isOn ? 'bg-teal-600' : 'bg-zinc-700'
                          }`}
                        >
                          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                            isOn ? 'translate-x-5' : 'translate-x-0.5'
                          }`} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Info box */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500">
          Du kan alltid ändra dessa inställningar i Dashboard → Automationer.
          Lågrisk-automationer kör utan åtgärd. Medel- och högrisk kan kräva manuellt godkännande.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="px-6 py-3 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Tillbaka
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={isSaving || !loaded}
          className="flex-1 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isSaving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Sparar...</>
          ) : (
            <>Fortsätt <ArrowRight className="w-4 h-4" /></>
          )}
        </button>
      </div>
    </div>
  )
}
