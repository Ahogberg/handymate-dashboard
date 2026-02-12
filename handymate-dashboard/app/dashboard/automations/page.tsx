'use client'

import { useEffect, useState } from 'react'
import {
  Zap,
  Phone,
  TrendingUp,
  MessageSquare,
  Calendar,
  FileText,
  ChevronDown,
  ChevronUp,
  Play,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Activity,
  Settings,
  ExternalLink,
  Loader2,
  Save,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────

interface AutomationSettings {
  ai_analyze_calls: boolean
  ai_create_leads: boolean
  ai_auto_move_deals: boolean
  ai_confidence_threshold: number
  pipeline_move_on_quote_sent: boolean
  pipeline_move_on_quote_accepted: boolean
  pipeline_move_on_invoice_sent: boolean
  pipeline_move_on_payment: boolean
  sms_booking_confirmation: boolean
  sms_day_before_reminder: boolean
  sms_on_the_way: boolean
  sms_quote_followup: boolean
  sms_job_completed: boolean
  sms_invoice_reminder: boolean
  sms_review_request: boolean
  sms_auto_enabled: boolean
  sms_quiet_hours_start: string
  sms_quiet_hours_end: string
  sms_max_per_customer_week: number
  calendar_sync_bookings: boolean
  calendar_create_from_booking: boolean
  fortnox_sync_invoices: boolean
  fortnox_sync_customers: boolean
}

interface Integrations {
  phone_connected: boolean
  fortnox_connected: boolean
  google_calendar_connected: boolean
}

interface Stats {
  sms_sent_week: number
  leads_created_week: number
  deals_moved_week: number
}

interface ActivityItem {
  id: string
  type: string
  action: string
  description: string
  status: 'success' | 'failed' | 'skipped'
  created_at: string
  source: string
}

interface AutomationCard {
  key: keyof AutomationSettings
  label: string
  description: string
}

interface AutomationCategory {
  id: string
  title: string
  icon: typeof Zap
  color: string
  bgColor: string
  cards: AutomationCard[]
  integrationKey?: keyof Integrations
  integrationLabel?: string
  settingsLink?: string
}

// ── Categories Definition ──────────────────────────────────────

const categories: AutomationCategory[] = [
  {
    id: 'ai',
    title: 'AI & Samtal',
    icon: Phone,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    cards: [
      { key: 'ai_analyze_calls', label: 'AI-analys av samtal', description: 'Analyserar transkriberade samtal med AI för att identifiera leads och kundintention' },
      { key: 'ai_create_leads', label: 'Skapa leads automatiskt', description: 'Skapar nya leads i pipeline automatiskt från analyserade samtal' },
      { key: 'ai_auto_move_deals', label: 'Flytta deals med AI', description: 'AI flyttar deals i pipeline baserat på samtalsinnehåll' },
    ],
    integrationKey: 'phone_connected',
    integrationLabel: '46elks Telefoni',
  },
  {
    id: 'pipeline',
    title: 'Pipeline',
    icon: TrendingUp,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    cards: [
      { key: 'pipeline_move_on_quote_sent', label: 'Flytta vid offert skickad', description: 'Flyttar deal till "Offert skickad" när offert skickas' },
      { key: 'pipeline_move_on_quote_accepted', label: 'Flytta vid offert accepterad', description: 'Flyttar deal till "Accepterad" när kund signerar offert' },
      { key: 'pipeline_move_on_invoice_sent', label: 'Flytta vid faktura skickad', description: 'Flyttar deal till "Fakturerad" när faktura skickas' },
      { key: 'pipeline_move_on_payment', label: 'Flytta vid betalning', description: 'Flyttar deal till "Betalt" när faktura markeras betald' },
    ],
    settingsLink: '/dashboard/pipeline',
  },
  {
    id: 'sms',
    title: 'SMS-kommunikation',
    icon: MessageSquare,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    cards: [
      { key: 'sms_booking_confirmation', label: 'Bokningsbekräftelse', description: 'Skicka SMS automatiskt när en bokning skapas' },
      { key: 'sms_day_before_reminder', label: 'Påminnelse dagen innan', description: 'SMS-påminnelse kvällen innan ett bokat besök' },
      { key: 'sms_on_the_way', label: '"Vi är på väg"', description: 'Manuellt skicka "vi är på väg" till kund' },
      { key: 'sms_quote_followup', label: 'Offert-uppföljning', description: 'Påminnelse om offert som ej besvarats efter 3 dagar' },
      { key: 'sms_job_completed', label: 'Jobb avslutat', description: 'SMS när ett projekt markeras som klart' },
      { key: 'sms_invoice_reminder', label: 'Faktura-påminnelse', description: 'Påminnelse om förfallen faktura' },
      { key: 'sms_review_request', label: 'Be om recension', description: 'Be om recension efter betald faktura' },
    ],
    integrationKey: 'phone_connected',
    integrationLabel: '46elks SMS',
    settingsLink: '/dashboard/communication',
  },
  {
    id: 'calendar',
    title: 'Kalender',
    icon: Calendar,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    cards: [
      { key: 'calendar_sync_bookings', label: 'Synka bokningar', description: 'Synkronisera bokningar till Google Calendar automatiskt' },
      { key: 'calendar_create_from_booking', label: 'Skapa kalenderhändelse', description: 'Skapa Google Calendar-händelse vid ny bokning' },
    ],
    integrationKey: 'google_calendar_connected',
    integrationLabel: 'Google Calendar',
    settingsLink: '/dashboard/settings',
  },
  {
    id: 'accounting',
    title: 'Bokföring',
    icon: FileText,
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50',
    cards: [
      { key: 'fortnox_sync_invoices', label: 'Synka fakturor', description: 'Synkronisera fakturor automatiskt till Fortnox' },
      { key: 'fortnox_sync_customers', label: 'Synka kunder', description: 'Synkronisera kundregister automatiskt till Fortnox' },
    ],
    integrationKey: 'fortnox_connected',
    integrationLabel: 'Fortnox',
    settingsLink: '/dashboard/settings',
  },
]

// ── Main Component ────────────────────────────────────────────

export default function AutomationsPage() {
  const { business_id: businessId } = useBusiness()

  const [settings, setSettings] = useState<AutomationSettings | null>(null)
  const [integrations, setIntegrations] = useState<Integrations | null>(null)
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [expandedCategory, setExpandedCategory] = useState<string | null>('ai')
  const [showActivity, setShowActivity] = useState(false)
  const [testingType, setTestingType] = useState<string | null>(null)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })
  const [pendingChanges, setPendingChanges] = useState(false)
  const [smsSettingsOpen, setSmsSettingsOpen] = useState(false)

  useEffect(() => {
    if (businessId) fetchData()
  }, [businessId])

  async function fetchData() {
    try {
      const [settingsRes, activityRes] = await Promise.all([
        fetch('/api/automations'),
        fetch('/api/automations/activity?limit=20'),
      ])

      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(data.settings)
        setIntegrations(data.integrations)
        setStats(data.stats)
      }

      if (activityRes.ok) {
        const data = await activityRes.json()
        setActivity(data.data || [])
      }
    } catch (err) {
      console.error('Failed to fetch automation data:', err)
    } finally {
      setLoading(false)
    }
  }

  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ show: true, message, type })
    setTimeout(() => setToast(t => ({ ...t, show: false })), 3000)
  }

  function toggleSetting(key: keyof AutomationSettings) {
    if (!settings) return
    const current = settings[key]
    if (typeof current !== 'boolean') return
    setSettings({ ...settings, [key]: !current })
    setPendingChanges(true)
  }

  function updateNumericSetting(key: keyof AutomationSettings, value: number) {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setPendingChanges(true)
  }

  function updateStringSetting(key: keyof AutomationSettings, value: string) {
    if (!settings) return
    setSettings({ ...settings, [key]: value })
    setPendingChanges(true)
  }

  async function saveSettings() {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/automations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setPendingChanges(false)
        showToast('Inställningar sparade')
      } else {
        showToast('Kunde inte spara', 'error')
      }
    } catch {
      showToast('Nätverksfel', 'error')
    } finally {
      setSaving(false)
    }
  }

  async function testAutomation(type: string) {
    setTestingType(type)
    try {
      const res = await fetch('/api/automations/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      })
      const data = await res.json()
      showToast(data.message, data.success ? 'success' : 'error')
    } catch {
      showToast('Test misslyckades', 'error')
    } finally {
      setTestingType(null)
    }
  }

  function getCategoryActiveCount(category: AutomationCategory): number {
    if (!settings) return 0
    return category.cards.filter(c => settings[c.key] === true).length
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
              Automationer
            </h1>
            <p className="text-gray-500 mt-1">Hantera alla automatiseringar från en plats</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowActivity(!showActivity)}
              className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-2"
            >
              <Activity className="w-4 h-4" />
              Aktivitet
            </button>
            {pendingChanges && (
              <button
                onClick={saveSettings}
                disabled={saving}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Spara
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <MessageSquare className="w-4 h-4" />
                SMS denna vecka
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.sms_sent_week}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <TrendingUp className="w-4 h-4" />
                Leads skapade
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.leads_created_week}</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                <Zap className="w-4 h-4" />
                Deals flyttade
              </div>
              <div className="text-2xl font-bold text-gray-900">{stats.deals_moved_week}</div>
            </div>
          </div>
        )}

        {/* Activity Panel */}
        {showActivity && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-8 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-blue-500" />
                Senaste aktivitet
              </h3>
              <button onClick={() => setShowActivity(false)} className="text-gray-400 hover:text-gray-600">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
              {activity.length === 0 ? (
                <div className="px-5 py-8 text-center text-gray-400">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Ingen aktivitet ännu</p>
                </div>
              ) : (
                activity.map((item) => (
                  <div key={item.id} className="px-5 py-3 flex items-start gap-3 hover:bg-gray-50 transition-all">
                    <div className={`mt-0.5 ${
                      item.status === 'success' ? 'text-emerald-500' :
                      item.status === 'failed' ? 'text-red-500' :
                      'text-gray-400'
                    }`}>
                      {item.status === 'success' ? <CheckCircle className="w-4 h-4" /> :
                       item.status === 'failed' ? <XCircle className="w-4 h-4" /> :
                       <AlertCircle className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          item.type === 'pipeline' ? 'bg-blue-50 text-blue-700' :
                          item.type === 'sms' ? 'bg-emerald-50 text-emerald-700' :
                          item.type === 'ai' ? 'bg-violet-50 text-violet-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {item.type === 'pipeline' ? 'Pipeline' :
                           item.type === 'sms' ? 'SMS' :
                           item.type === 'ai' ? 'AI' :
                           item.type}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(item.created_at).toLocaleString('sv-SE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mt-0.5 truncate">{item.description || item.action}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Master SMS toggle */}
        {settings && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Automatiska SMS</h3>
                  <p className="text-sm text-gray-500">Huvudbrytare för alla automatiska meddelanden</p>
                </div>
              </div>
              <button
                onClick={() => toggleSetting('sms_auto_enabled')}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  settings.sms_auto_enabled ? 'bg-emerald-500' : 'bg-gray-300'
                }`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform shadow-sm ${
                  settings.sms_auto_enabled ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>

            {/* SMS Settings expander */}
            <button
              onClick={() => setSmsSettingsOpen(!smsSettingsOpen)}
              className="mt-3 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <Settings className="w-3.5 h-3.5" />
              SMS-inställningar
              {smsSettingsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {smsSettingsOpen && (
              <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Tysta timmar (start)</label>
                  <input
                    type="time"
                    value={settings.sms_quiet_hours_start}
                    onChange={(e) => updateStringSetting('sms_quiet_hours_start', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Tysta timmar (slut)</label>
                  <input
                    type="time"
                    value={settings.sms_quiet_hours_end}
                    onChange={(e) => updateStringSetting('sms_quiet_hours_end', e.target.value)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-1">Max SMS per kund/vecka</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={settings.sms_max_per_customer_week}
                    onChange={(e) => updateNumericSetting('sms_max_per_customer_week', parseInt(e.target.value) || 3)}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* AI Confidence threshold */}
        {settings && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-violet-500 to-purple-500 rounded-xl flex items-center justify-center">
                  <Phone className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">AI-konfidenströskel</h3>
                  <p className="text-sm text-gray-500">Minsta konfidens för att AI ska agera automatiskt</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={50}
                  max={100}
                  step={5}
                  value={settings.ai_confidence_threshold}
                  onChange={(e) => updateNumericSetting('ai_confidence_threshold', parseInt(e.target.value))}
                  className="w-32 accent-violet-500"
                />
                <span className="text-sm font-bold text-violet-600 w-10 text-right">{settings.ai_confidence_threshold}%</span>
              </div>
            </div>
          </div>
        )}

        {/* Automation Categories */}
        <div className="space-y-4">
          {categories.map((category) => {
            const Icon = category.icon
            const isExpanded = expandedCategory === category.id
            const activeCount = getCategoryActiveCount(category)
            const totalCount = category.cards.length
            const isConnected = category.integrationKey ? integrations?.[category.integrationKey] : true

            return (
              <div key={category.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Category Header */}
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : category.id)}
                  className="w-full px-5 py-4 flex items-center justify-between hover:bg-gray-50 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 ${category.bgColor} rounded-xl flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${category.color}`} />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold text-gray-900">{category.title}</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{activeCount}/{totalCount} aktiva</span>
                        {category.integrationKey && (
                          <span className={`text-xs flex items-center gap-1 ${
                            isConnected ? 'text-emerald-600' : 'text-amber-600'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isConnected ? 'bg-emerald-500' : 'bg-amber-500'
                            }`} />
                            {category.integrationLabel} {isConnected ? 'ansluten' : 'ej ansluten'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Progress bar */}
                    <div className="hidden sm:flex items-center gap-2">
                      <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${
                            activeCount === totalCount ? 'bg-emerald-500' :
                            activeCount > 0 ? 'bg-blue-500' : 'bg-gray-300'
                          }`}
                          style={{ width: `${(activeCount / totalCount) * 100}%` }}
                        />
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && settings && (
                  <div className="border-t border-gray-100">
                    {/* Integration warning */}
                    {category.integrationKey && !isConnected && (
                      <div className="mx-5 mt-4 mb-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3">
                        <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-amber-800">
                            {category.integrationLabel} är inte ansluten. Automationerna kommer att sparas men inte köras förrän integrationen är aktiv.
                          </p>
                        </div>
                        <Link
                          href="/dashboard/settings"
                          className="text-sm font-medium text-amber-700 hover:text-amber-900 flex items-center gap-1"
                        >
                          Anslut <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    )}

                    {/* Automation cards */}
                    <div className="p-4 space-y-2">
                      {category.cards.map((card) => {
                        const isActive = settings[card.key] === true

                        return (
                          <div
                            key={card.key}
                            className={`flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all ${
                              isActive
                                ? 'bg-gray-50 border-gray-200'
                                : 'bg-white border-gray-100'
                            }`}
                          >
                            <div className="flex-1 min-w-0 mr-4">
                              <div className="flex items-center gap-2">
                                <h4 className="text-sm font-medium text-gray-900">{card.label}</h4>
                                {isActive && (
                                  <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                    Aktiv
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-gray-500 mt-0.5">{card.description}</p>
                            </div>
                            <button
                              onClick={() => toggleSetting(card.key)}
                              className={`relative inline-flex h-6 w-10 items-center rounded-full transition-colors flex-shrink-0 ${
                                isActive ? 'bg-blue-500' : 'bg-gray-300'
                              }`}
                            >
                              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
                                isActive ? 'translate-x-5' : 'translate-x-1'
                              }`} />
                            </button>
                          </div>
                        )
                      })}
                    </div>

                    {/* Category footer with test button and settings link */}
                    <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                      <button
                        onClick={() => testAutomation(
                          category.id === 'ai' ? 'ai_analyze' :
                          category.id === 'sms' ? 'sms_send' :
                          category.id === 'calendar' ? 'calendar' :
                          category.id === 'accounting' ? 'fortnox' :
                          'pipeline'
                        )}
                        disabled={testingType !== null}
                        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        {testingType === category.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        Testa
                      </button>
                      {category.settingsLink && (
                        <Link
                          href={category.settingsLink}
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          Detaljerade inställningar <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Floating save button on mobile when there are pending changes */}
        {pendingChanges && (
          <div className="fixed bottom-6 right-6 sm:hidden">
            <button
              onClick={saveSettings}
              disabled={saving}
              className="px-5 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-full text-sm font-semibold shadow-lg hover:shadow-xl transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Spara
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 transition-all ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
