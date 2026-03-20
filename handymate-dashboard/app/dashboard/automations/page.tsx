'use client'

import { useEffect, useState, useCallback } from 'react'
import AutomationSettings from '@/components/AutomationSettings'
import AutomationLog from '@/components/AutomationLog'
import AutomationRuleBuilder from '@/components/AutomationRuleBuilder'

interface AutomationRule {
  id: string
  name: string
  description: string | null
  is_active: boolean
  is_system: boolean
  trigger_type: string
  trigger_config: Record<string, unknown>
  action_type: string
  action_config: Record<string, unknown>
  requires_approval: boolean
  respects_work_hours: boolean
  respects_night_mode: boolean
  run_count: number
  last_run_at: string | null
  last_run_status: string | null
}

type TabType = 'library' | 'custom' | 'log'

// ── Automationsbibliotek med kategorier ───────────────────────────

interface AutomationTemplate {
  key: string
  icon: string
  title: string
  description: string
  category: string
  matchRuleNames: string[] // Matchar mot rule.name i DB
  defaultTiming?: string
  previewText?: string
}

const CATEGORIES = [
  { id: 'leads', icon: '📥', label: 'Leads & Nya kunder' },
  { id: 'quotes', icon: '📋', label: 'Offerter' },
  { id: 'invoices', icon: '💰', label: 'Fakturor & Betalning' },
  { id: 'relations', icon: '⭐', label: 'Kundrelationer' },
  { id: 'bookings', icon: '📅', label: 'Bokningar & Projekt' },
]

const TEMPLATES: AutomationTemplate[] = [
  // ── Leads & Nya kunder ──
  {
    key: 'lead_response',
    icon: '⚡',
    title: 'Svara på nya leads',
    description: 'Skickar bekräftelse-SMS till nya leads inom 5 minuter',
    category: 'leads',
    matchRuleNames: ['Ny lead', 'lead_response', 'bekräftelse'],
    defaultTiming: '5 minuter',
    previewText: 'Hej! Tack för din förfrågan. Vi återkommer inom kort med mer information.',
  },
  {
    key: 'missed_call',
    icon: '📞',
    title: 'Missat samtal — SMS',
    description: 'Skickar SMS vid missat inkommande samtal',
    category: 'leads',
    matchRuleNames: ['Missat samtal', 'missed_call'],
    previewText: 'Hej! Vi missade ditt samtal och ringer upp så snart vi kan.',
  },
  {
    key: 'sms_received',
    icon: '💬',
    title: 'Inkommande SMS — notifiera',
    description: 'Loggar och notifierar dig när ett SMS tas emot',
    category: 'leads',
    matchRuleNames: ['Inkommande SMS', 'sms_received', 'notifiera'],
  },

  // ── Offerter ──
  {
    key: 'quote_followup_5',
    icon: '📨',
    title: 'Offertuppföljning dag 5',
    description: 'Följer upp obesvarade offerter efter 5 dagar',
    category: 'quotes',
    matchRuleNames: ['Offertuppföljning dag 5', 'quote_followup_day1', 'quote_follow_up'],
    defaultTiming: 'dag 5',
    previewText: 'Hej! Vi skickade en offert för 5 dagar sedan. Har du hunnit titta på den?',
  },
  {
    key: 'quote_followup_10',
    icon: '📞',
    title: 'Offertuppföljning dag 10',
    description: 'Andra uppföljningen — kräver godkännande för att ringa',
    category: 'quotes',
    matchRuleNames: ['Offertuppföljning dag 10', 'quote_followup_day2'],
    defaultTiming: 'dag 10',
  },
  {
    key: 'quote_signed_confirm',
    icon: '✅',
    title: 'Bekräftelsemail vid godkänd offert',
    description: 'Kunden får ett mail med faktura- och ROT-uppgifter att granska direkt vid signering',
    category: 'quotes',
    matchRuleNames: ['quote_signed', 'quote_accepted', 'quote_signed_confirmation'],
  },

  // ── Fakturor & Betalning ──
  {
    key: 'invoice_reminder_1',
    icon: '🔔',
    title: 'Fakturapåminnelse dag 1',
    description: 'Vänlig påminnelse första dagen efter förfallodatum',
    category: 'invoices',
    matchRuleNames: ['Fakturapåminnelse dag 1', 'invoice_reminder_day1', 'Fakturapåminnelse'],
    defaultTiming: 'dag 1',
    previewText: 'Hej! Din faktura förföll igår. Vänligen betala så snart du kan.',
  },
  {
    key: 'invoice_escalation',
    icon: '🚨',
    title: 'Faktura eskalering dag 7',
    description: 'Striktare påminnelse efter 7 dagar — kräver godkännande',
    category: 'invoices',
    matchRuleNames: ['Faktura eskalering dag 7', 'invoice_reminder_day2', 'eskalering'],
    defaultTiming: 'dag 7',
  },

  // ── Kundrelationer ──
  {
    key: 'review_request',
    icon: '⭐',
    title: 'Be om Google-recension efter betalning',
    description: 'Kunden får ett vänligt SMS med länk till Google Reviews',
    category: 'relations',
    matchRuleNames: ['review_request', 'google_review', 'recension'],
    previewText: 'Tack för förtroendet! Vi uppskattar om du kunde lämna en recension.',
  },
  {
    key: 'reactivation',
    icon: '👋',
    title: 'Reaktivering efter 6 månaders inaktivitet',
    description: 'Kunder som inte anlitat dig på 6 månader får en hälsning',
    category: 'relations',
    matchRuleNames: ['Reaktivering 6 månader', 'reaktivering', 'reactivation', 'inactive_customer'],
    defaultTiming: '6 månader',
  },
  {
    key: 'warranty_followup',
    icon: '🔧',
    title: 'Garantiuppföljning efter 12 månader',
    description: 'Uppföljning ett år efter avslutat jobb för att säkerställa att allt fungerar',
    category: 'relations',
    matchRuleNames: ['warranty_followup', 'garantiuppföljning', 'annual_followup'],
    defaultTiming: '12 månader',
    previewText: 'Hej! Det är ett år sedan vi avslutade jobbet hos dig. Allt fungerar som det ska?',
  },

  // ── Bokningar & Projekt ──
  {
    key: 'morning_report',
    icon: '☀️',
    title: 'Morgonrapport',
    description: 'Daglig sammanfattning med bokningar, offerter och insikter varje vardag kl 07:00',
    category: 'bookings',
    matchRuleNames: ['Morgonrapport', 'morning_report'],
    defaultTiming: 'vardagar 07:00',
  },
  {
    key: 'booking_reminder',
    icon: '📅',
    title: 'Bokningspåminnelse 24h innan',
    description: 'Kunden får en påminnelse dagen innan bokad tid',
    category: 'bookings',
    matchRuleNames: ['Bokningspåminnelse', 'booking_reminder', 'appointment_reminder'],
    defaultTiming: '24 timmar innan',
    previewText: 'Hej! Påminnelse om din bokade tid imorgon. Välkommen!',
  },
]

// ── Helpers ──

function matchRuleToTemplate(rule: AutomationRule): string | null {
  const nameLower = rule.name.toLowerCase()
  // Also check trigger_config.event_name if available
  const eventName = (rule.trigger_config as any)?.event_name?.toLowerCase() || ''

  for (const tmpl of TEMPLATES) {
    for (const matchName of tmpl.matchRuleNames) {
      const matchLower = matchName.toLowerCase()
      if (nameLower.includes(matchLower) || matchLower.includes(nameLower) || eventName === matchLower) {
        return tmpl.key
      }
    }
  }
  return null
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Aldrig'
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Idag'
  if (diffDays === 1) return 'Igår'
  if (diffDays < 7) return `${diffDays} dagar sedan`
  return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })
}

function timeSince(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'idag'
  if (diffDays === 1) return 'igår'
  return `${diffDays}d sedan`
}

// ── Component ──

export default function AutomationsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('library')
  const [rules, setRules] = useState<AutomationRule[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editRule, setEditRule] = useState<AutomationRule | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch('/api/automation/rules')
      const data = await res.json()
      setRules(Array.isArray(data) ? data : [])
    } catch {
      // ignore
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRules()
  }, [fetchRules])

  const toggleRule = async (id: string) => {
    setToggling(id)
    try {
      const res = await fetch(`/api/automation/rules/${id}/toggle`, { method: 'POST' })
      if (res.ok) {
        const updated = await res.json()
        setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: updated.is_active } : r))
      }
    } catch { /* ignore */ }
    setToggling(null)
  }

  // Build a map: template key → matched rule
  const templateRuleMap: Record<string, AutomationRule | null> = {}
  const matchedRuleIds = new Set<string>()
  for (const tmpl of TEMPLATES) {
    const matched = rules.find(r => {
      const key = matchRuleToTemplate(r)
      return key === tmpl.key
    })
    templateRuleMap[tmpl.key] = matched || null
    if (matched) matchedRuleIds.add(matched.id)
  }

  // Custom rules = rules not matched to any template
  const customRules = rules.filter(r => !matchedRuleIds.has(r.id))

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Automationer</h1>
        <p className="text-sm text-gray-500 mt-1">
          Styr vad ditt team gör automatiskt — du godkänner alltid innan något skickas
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
        {([
          { key: 'library' as TabType, label: 'Bibliotek' },
          { key: 'custom' as TabType, label: `Egna regler${customRules.length > 0 ? ` (${customRules.length})` : ''}` },
          { key: 'log' as TabType, label: 'Historik' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2.5 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab: Bibliotek */}
      {activeTab === 'library' && (
        <div className="space-y-8">
          {loading ? (
            <div className="p-8 text-center text-gray-400">Laddar automationer...</div>
          ) : (
            CATEGORIES.map(cat => {
              const catTemplates = TEMPLATES.filter(t => t.category === cat.id)
              if (catTemplates.length === 0) return null

              return (
                <div key={cat.id}>
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                    <span>{cat.icon}</span>
                    {cat.label}
                  </h2>

                  <div className="space-y-2">
                    {catTemplates.map(tmpl => {
                      const rule = templateRuleMap[tmpl.key]
                      const isActive = rule?.is_active ?? false
                      const isExpanded = expandedTemplate === tmpl.key

                      return (
                        <div
                          key={tmpl.key}
                          className={`bg-white rounded-xl border transition-all ${
                            isActive ? 'border-gray-200' : 'border-gray-100'
                          }`}
                        >
                          {/* Main row */}
                          <div className="flex items-start gap-3 p-4">
                            {/* Status dot */}
                            <div className="mt-1 flex-shrink-0">
                              <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                            </div>

                            {/* Content */}
                            <div
                              className="flex-1 min-w-0 cursor-pointer"
                              onClick={() => setExpandedTemplate(isExpanded ? null : tmpl.key)}
                            >
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-base">{tmpl.icon}</span>
                                <span className={`text-sm font-semibold ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>
                                  {tmpl.title}
                                </span>
                              </div>
                              <p className={`text-xs leading-relaxed ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                                {tmpl.description}
                              </p>
                              {rule?.last_run_at && (
                                <p className="text-[11px] text-gray-400 mt-1">
                                  Senast körd: {timeSince(rule.last_run_at)}
                                  {rule.run_count > 0 && ` · ${rule.run_count} gånger totalt`}
                                </p>
                              )}
                            </div>

                            {/* Toggle */}
                            {rule ? (
                              <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  onChange={() => toggleRule(rule.id)}
                                  disabled={toggling === rule.id}
                                  className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600" />
                              </label>
                            ) : (
                              <span className="text-xs text-gray-400 bg-gray-50 px-2.5 py-1 rounded-lg shrink-0 mt-1">
                                Ej aktiverad
                              </span>
                            )}
                          </div>

                          {/* Expanded details */}
                          {isExpanded && (
                            <div className="px-4 pb-4 pt-0 border-t border-gray-50">
                              <div className="pt-3 space-y-3">
                                {tmpl.defaultTiming && (
                                  <div className="flex items-center gap-2 text-xs">
                                    <span className="text-gray-400">Timing:</span>
                                    <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-medium">
                                      {tmpl.defaultTiming}
                                    </span>
                                  </div>
                                )}

                                {tmpl.previewText && (
                                  <div>
                                    <p className="text-xs text-gray-400 mb-1">Förhandsvisning:</p>
                                    <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-600 italic leading-relaxed">
                                      &ldquo;{tmpl.previewText}&rdquo;
                                    </div>
                                  </div>
                                )}

                                {rule && (
                                  <div className="flex items-center gap-3 pt-1">
                                    <button
                                      onClick={() => { setEditRule(rule); setShowBuilder(true) }}
                                      className="text-xs text-teal-700 hover:text-teal-800 font-medium"
                                    >
                                      Redigera inställningar
                                    </button>
                                    <span className="text-gray-200">|</span>
                                    <span className="text-xs text-gray-400">
                                      {rule.requires_approval ? '🛡 Kräver godkännande' : '⚡ Körs automatiskt'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Tab: Egna regler */}
      {activeTab === 'custom' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Regler du skapat själv utöver biblioteket
            </p>
            <button
              onClick={() => { setEditRule(null); setShowBuilder(true) }}
              className="px-4 py-2 bg-teal-700 text-white rounded-lg text-sm font-medium hover:bg-teal-800 transition-colors"
            >
              + Ny regel
            </button>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Laddar...</div>
          ) : customRules.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
              <p className="text-gray-400 mb-3">Inga egna regler ännu</p>
              <button
                onClick={() => { setEditRule(null); setShowBuilder(true) }}
                className="text-sm text-teal-700 font-medium hover:text-teal-800"
              >
                Skapa din första regel →
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {customRules.map(rule => (
                <div
                  key={rule.id}
                  className={`bg-white rounded-xl border p-4 transition-colors ${
                    rule.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2.5 h-2.5 rounded-full ${rule.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`} />
                        <span className="text-sm font-semibold text-gray-900">{rule.name}</span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-gray-500 mb-1 ml-[18px]">{rule.description}</p>
                      )}
                      <p className="text-[11px] text-gray-400 ml-[18px]">
                        Senast: {formatDate(rule.last_run_at)} · {rule.run_count} körningar
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setEditRule(rule); setShowBuilder(true) }}
                        className="p-1.5 text-gray-400 hover:text-teal-600 transition-colors"
                        title="Redigera"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                        </svg>
                      </button>

                      {!rule.is_system && (
                        <button
                          onClick={async () => {
                            if (!confirm('Vill du radera denna regel?')) return
                            const res = await fetch(`/api/automation/rules/${rule.id}`, { method: 'DELETE' })
                            if (res.ok) setRules(prev => prev.filter(r => r.id !== rule.id))
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          title="Radera"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      )}

                      <label className="relative inline-flex items-center cursor-pointer ml-1">
                        <input
                          type="checkbox"
                          checked={rule.is_active}
                          onChange={() => toggleRule(rule.id)}
                          disabled={toggling === rule.id}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-teal-600" />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Historik */}
      {activeTab === 'log' && <AutomationLog />}

      {/* Rule builder modal */}
      {showBuilder && (
        <AutomationRuleBuilder
          onClose={() => { setShowBuilder(false); setEditRule(null) }}
          onSaved={() => { setShowBuilder(false); setEditRule(null); fetchRules() }}
          editRule={editRule || undefined}
        />
      )}
    </div>
  )
}
