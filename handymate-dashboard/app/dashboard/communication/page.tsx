'use client'

import { useState, useEffect, useCallback } from 'react'
import { useBusiness } from '@/lib/BusinessContext'
import {
  MessageSquare, Settings, ChevronDown, ChevronUp, Loader2, Send,
  Check, AlertTriangle, Clock, ToggleLeft, ToggleRight, Pencil,
  X, Plus, Trash2, Phone, Mail, Zap, RefreshCw, Eye
} from 'lucide-react'

interface CommunicationSettings {
  auto_enabled: boolean
  tone: 'formal' | 'friendly' | 'personal'
  max_sms_per_customer_per_week: number
  send_booking_confirmation: boolean
  send_day_before_reminder: boolean
  send_on_the_way: boolean
  send_quote_followup: boolean
  send_job_completed: boolean
  send_invoice_reminder: boolean
  send_review_request: boolean
  quiet_hours_start: string
  quiet_hours_end: string
}

interface CommunicationRule {
  id: string
  business_id: string | null
  name: string
  description: string | null
  trigger_type: string
  trigger_config: any
  message_template: string
  channel: string
  is_enabled: boolean
  is_system: boolean
  sort_order: number
}

interface LogEntry {
  id: string
  customer_id: string
  customer_name: string
  channel: string
  recipient: string
  message: string
  ai_reason: string | null
  status: string
  error_message: string | null
  created_at: string
  communication_rule: { name: string; trigger_type: string } | null
}

interface Stats {
  today: number
  week: { total: number; sent: number; failed: number; deliveryRate: number }
  month: { total: number }
  channels: { sms: number; email: number }
}

const defaultSettings: CommunicationSettings = {
  auto_enabled: true,
  tone: 'friendly',
  max_sms_per_customer_per_week: 3,
  send_booking_confirmation: true,
  send_day_before_reminder: true,
  send_on_the_way: true,
  send_quote_followup: true,
  send_job_completed: true,
  send_invoice_reminder: true,
  send_review_request: true,
  quiet_hours_start: '21:00',
  quiet_hours_end: '07:00',
}

const triggerLabels: Record<string, string> = {
  event: 'Händelse',
  condition: 'Villkor',
  manual: 'Manuell',
}

const channelIcons: Record<string, typeof Phone> = {
  sms: Phone,
  email: Mail,
}

const toneLabels: Record<string, string> = {
  formal: 'Formell',
  friendly: 'Vänlig',
  personal: 'Personlig',
}

const settingsCheckboxes: Array<{ key: keyof CommunicationSettings; label: string }> = [
  { key: 'send_booking_confirmation', label: 'Bekräftelse vid bokning' },
  { key: 'send_day_before_reminder', label: 'Påminnelse dagen innan besök' },
  { key: 'send_on_the_way', label: '"Vi är på väg" (manuell trigger)' },
  { key: 'send_quote_followup', label: 'Uppföljning efter offert (om ej svar på 3 dagar)' },
  { key: 'send_job_completed', label: 'Tack efter avslutat jobb' },
  { key: 'send_invoice_reminder', label: 'Påminnelse vid förfallen faktura' },
  { key: 'send_review_request', label: 'Be om recension efter betalning' },
]

// Available template variables
const templateVariables = [
  '{customer_name}', '{business_name}', '{business_phone}',
  '{quote_link}', '{booking_date}', '{booking_time}',
  '{work_address}', '{invoice_number}', '{invoice_amount}',
  '{invoice_due_date}', '{eta_minutes}', '{review_link}',
]

export default function CommunicationPage() {
  const { business_id: businessId } = useBusiness()

  // State
  const [settings, setSettings] = useState<CommunicationSettings>(defaultSettings)
  const [rules, setRules] = useState<CommunicationRule[]>([])
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  // UI state
  const [showSettings, setShowSettings] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showAllLogs, setShowAllLogs] = useState(false)
  const [editingRule, setEditingRule] = useState<CommunicationRule | null>(null)
  const [editTemplate, setEditTemplate] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [savingRule, setSavingRule] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Fetch all data
  const fetchData = useCallback(async () => {
    if (!businessId) return
    setLoading(true)

    try {
      const [settingsRes, rulesRes, logsRes, statsRes] = await Promise.all([
        fetch(`/api/communication/settings?businessId=${businessId}`),
        fetch(`/api/communication/rules?businessId=${businessId}`),
        fetch(`/api/communication/log?businessId=${businessId}&limit=20`),
        fetch(`/api/communication/stats?businessId=${businessId}`),
      ])

      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings({ ...defaultSettings, ...data })
      }
      if (rulesRes.ok) {
        setRules(await rulesRes.json())
      }
      if (logsRes.ok) {
        const data = await logsRes.json()
        setLogs(data.data || [])
      }
      if (statsRes.ok) {
        setStats(await statsRes.json())
      }
    } catch (err) {
      console.error('Failed to load communication data:', err)
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Show toast
  function showToast(message: string, type: 'success' | 'error' = 'success') {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  // Save settings
  async function saveSettings() {
    setSavingSettings(true)
    try {
      const res = await fetch(`/api/communication/settings?businessId=${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        showToast('Inställningar sparade')
        setShowSettings(false)
      } else {
        showToast('Kunde inte spara', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSavingSettings(false)
    }
  }

  // Toggle auto_enabled
  async function toggleAutoEnabled() {
    const newValue = !settings.auto_enabled
    setSettings({ ...settings, auto_enabled: newValue })

    try {
      await fetch(`/api/communication/settings?businessId=${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_enabled: newValue }),
      })
      showToast(newValue ? 'Automatiska meddelanden aktiverade' : 'Automatiska meddelanden pausade')
    } catch {
      setSettings({ ...settings, auto_enabled: !newValue })
      showToast('Kunde inte ändra', 'error')
    }
  }

  // Toggle rule enabled
  async function toggleRule(rule: CommunicationRule) {
    const newEnabled = !rule.is_enabled

    // Optimistic update
    setRules(rules.map(r => r.id === rule.id ? { ...r, is_enabled: newEnabled } : r))

    try {
      await fetch(`/api/communication/rules/${rule.id}?businessId=${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: newEnabled }),
      })
    } catch {
      setRules(rules.map(r => r.id === rule.id ? { ...r, is_enabled: !newEnabled } : r))
      showToast('Kunde inte ändra regel', 'error')
    }
  }

  // Save rule template
  async function saveRuleTemplate() {
    if (!editingRule) return
    setSavingRule(true)

    try {
      const res = await fetch(`/api/communication/rules/${editingRule.id}?businessId=${businessId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_template: editTemplate }),
      })

      if (res.ok) {
        const updated = await res.json()
        setRules(rules.map(r => r.id === editingRule.id ? { ...r, message_template: editTemplate } : r))
        // If a new override was created, add it
        if (updated.id !== editingRule.id) {
          setRules(prev => [...prev.filter(r => r.id !== editingRule.id || !r.is_system || r.business_id), updated])
        }
        setEditingRule(null)
        showToast('Mall sparad')
      } else {
        showToast('Kunde inte spara', 'error')
      }
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setSavingRule(false)
    }
  }

  // Delete custom rule
  async function deleteRule(ruleId: string) {
    try {
      const res = await fetch(`/api/communication/rules/${ruleId}?businessId=${businessId}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setRules(rules.filter(r => r.id !== ruleId))
        showToast('Regel borttagen')
      }
    } catch {
      showToast('Kunde inte ta bort', 'error')
    }
  }

  // Format time ago
  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'Just nu'
    if (minutes < 60) return `${minutes} min sedan`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h sedan`
    const days = Math.floor(hours / 24)
    if (days === 1) return 'Igår'
    return `${days} dagar sedan`
  }

  function formatDateTime(dateStr: string): string {
    const d = new Date(dateStr)
    const today = new Date()
    const isToday = d.toDateString() === today.toDateString()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const isYesterday = d.toDateString() === yesterday.toDateString()

    const time = d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

    if (isToday) return `Idag ${time}`
    if (isYesterday) return `Igår ${time}`
    return `${d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${time}`
  }

  // SMS character count
  function smsInfo(text: string): string {
    const len = text.length
    const smsCount = Math.ceil(len / 160) || 1
    return `${len}/160 (${smsCount} SMS)`
  }

  // Get preview with sample data
  function getPreview(template: string): string {
    const sampleVars: Record<string, string> = {
      customer_name: 'Anna Andersson',
      business_name: 'Anderssons El',
      business_phone: '070-123 45 67',
      quote_link: 'https://handymate.se/quote/abc123',
      booking_date: 'tis 15 feb',
      booking_time: '08:00',
      work_address: 'Storgatan 1, Stockholm',
      invoice_number: '2025-001',
      invoice_amount: '12 500',
      invoice_due_date: '2025-03-01',
      swish_number: '123-456 78 90',
      eta_minutes: '15',
      review_link: 'https://g.page/r/abc123',
    }
    return template.replace(/\{(\w+)\}/g, (match, key) => sampleVars[key] || match)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500">
              <Zap className="w-6 h-6 text-white" />
            </div>
            Smart Kundkommunikation
          </h1>
          <p className="text-gray-500 mt-1">
            Handymate skickar automatiskt meddelanden till dina kunder vid rätt tillfälle
          </p>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          <Settings className="w-4 h-4" />
          Inställningar
        </button>
      </div>

      {/* Status card */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={toggleAutoEnabled}
              className="focus:outline-none"
            >
              {settings.auto_enabled ? (
                <ToggleRight className="w-10 h-10 text-blue-600" />
              ) : (
                <ToggleLeft className="w-10 h-10 text-gray-400" />
              )}
            </button>
            <div>
              <p className="text-lg font-semibold text-gray-900">
                Automatiska meddelanden: {settings.auto_enabled ? (
                  <span className="text-emerald-600">PÅ</span>
                ) : (
                  <span className="text-gray-400">AV</span>
                )}
              </p>
              {stats && (
                <p className="text-sm text-gray-500">
                  Denna vecka: {stats.week.total} meddelanden skickade
                  {stats.week.total > 0 && ` | ${stats.week.deliveryRate}% levererade`}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stats && (
              <div className="text-right">
                <p className="text-2xl font-bold text-gray-900">{stats.today}</p>
                <p className="text-xs text-gray-500">Idag</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recent messages */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-blue-600" />
            Senaste meddelanden
          </h2>
          {logs.length > 5 && (
            <button
              onClick={() => setShowAllLogs(!showAllLogs)}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              {showAllLogs ? 'Visa färre' : `Visa alla (${logs.length})`}
            </button>
          )}
        </div>

        {logs.length === 0 ? (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-8 text-center">
            <MessageSquare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">Inga meddelanden ännu</p>
            <p className="text-sm text-gray-400 mt-1">
              Meddelanden skickas automatiskt baserat på kundaktivitet
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {(showAllLogs ? logs : logs.slice(0, 5)).map(log => {
              const ChannelIcon = channelIcons[log.channel] || MessageSquare
              return (
                <div key={log.id} className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${log.channel === 'sms' ? 'bg-blue-50' : 'bg-purple-50'}`}>
                        <ChannelIcon className={`w-3.5 h-3.5 ${log.channel === 'sms' ? 'text-blue-600' : 'text-purple-600'}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-900">
                        Till: {log.customer_name}
                      </span>
                    </div>
                    <span className="text-xs text-gray-400">{formatDateTime(log.created_at)}</span>
                  </div>

                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                    &ldquo;{log.message}&rdquo;
                  </p>

                  <div className="flex items-center justify-between">
                    {log.ai_reason && (
                      <p className="text-xs text-gray-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        {log.ai_reason}
                      </p>
                    )}
                    <div className="flex items-center gap-1 ml-auto">
                      {log.status === 'sent' || log.status === 'delivered' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-xs text-emerald-600">
                            {log.status === 'delivered' ? 'Levererat' : 'Skickat'}
                          </span>
                        </>
                      ) : log.status === 'failed' ? (
                        <>
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                          <span className="text-xs text-red-600">Misslyckades</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          <span className="text-xs text-amber-600">Väntar</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Advanced: Rules */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="w-full flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500" />
            <span className="font-semibold text-gray-900">Avancerat – Meddelanderegler</span>
            <span className="text-xs text-gray-400">({rules.length} regler)</span>
          </div>
          {showAdvanced ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </button>

        {showAdvanced && (
          <div className="border-t border-gray-200 divide-y divide-gray-100">
            <div className="p-4">
              <p className="text-sm text-gray-500 mb-4">
                Här kan du se och justera meddelandemallarna som AI:n använder:
              </p>
            </div>

            {rules.map(rule => (
              <div key={rule.id} className="p-4 hover:bg-gray-50/50">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{rule.sort_order}. {rule.name}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                        rule.is_enabled
                          ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                          : 'bg-gray-100 text-gray-500 border border-gray-200'
                      }`}>
                        {rule.is_enabled ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mb-2 truncate">
                      &ldquo;{rule.message_template}&rdquo;
                    </p>
                    <p className="text-xs text-gray-400">
                      Trigger: {triggerLabels[rule.trigger_type] || rule.trigger_type}
                      {rule.trigger_config?.delay_minutes ? ` | Fördröjning: ${rule.trigger_config.delay_minutes} min` : ''}
                      {rule.trigger_config?.days_since ? ` | Efter ${rule.trigger_config.days_since} dagar` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => {
                        setEditingRule(rule)
                        setEditTemplate(rule.message_template)
                      }}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                      title="Redigera mall"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleRule(rule)}
                      className="focus:outline-none"
                      title={rule.is_enabled ? 'Inaktivera' : 'Aktivera'}
                    >
                      {rule.is_enabled ? (
                        <ToggleRight className="w-8 h-8 text-blue-600" />
                      ) : (
                        <ToggleLeft className="w-8 h-8 text-gray-400" />
                      )}
                    </button>
                    {!rule.is_system && rule.business_id && (
                      <button
                        onClick={() => deleteRule(rule.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Ta bort"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Kommunikationsinställningar
              </h3>
              <button onClick={() => setShowSettings(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-6">
              {/* Tone */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Ton i meddelanden</label>
                <div className="flex gap-2">
                  {(['formal', 'friendly', 'personal'] as const).map(tone => (
                    <button
                      key={tone}
                      onClick={() => setSettings({ ...settings, tone })}
                      className={`flex-1 py-2.5 px-3 rounded-xl text-sm font-medium border transition-all ${
                        settings.tone === tone
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {toneLabels[tone]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max SMS */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Max antal SMS per kund och vecka
                </label>
                <select
                  value={settings.max_sms_per_customer_per_week}
                  onChange={e => setSettings({ ...settings, max_sms_per_customer_per_week: parseInt(e.target.value) })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  {[1, 2, 3, 4, 5, 7, 10].map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Quiet hours */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Tysta timmar (inga SMS)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="time"
                    value={settings.quiet_hours_start}
                    onChange={e => setSettings({ ...settings, quiet_hours_start: e.target.value })}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                  <span className="text-gray-400">–</span>
                  <input
                    type="time"
                    value={settings.quiet_hours_end}
                    onChange={e => setSettings({ ...settings, quiet_hours_end: e.target.value })}
                    className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-3">
                  Automatiska meddelanden
                </label>
                <div className="space-y-3">
                  {settingsCheckboxes.map(({ key, label }) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer group">
                      <div
                        className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                          settings[key]
                            ? 'bg-blue-600 border-blue-600'
                            : 'bg-white border-gray-300 group-hover:border-gray-400'
                        }`}
                        onClick={() => setSettings({ ...settings, [key]: !settings[key] })}
                      >
                        {settings[key] && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="text-sm text-gray-700">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Avbryt
              </button>
              <button
                onClick={saveSettings}
                disabled={savingSettings}
                className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Spara inställningar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Rule Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl">
            <div className="flex items-center justify-between p-5 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Pencil className="w-5 h-5" />
                Redigera: {editingRule.name}
              </h3>
              <button onClick={() => setEditingRule(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">Meddelande</label>
                <textarea
                  value={editTemplate}
                  onChange={e => setEditTemplate(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">
                  {smsInfo(editTemplate)}
                </p>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-2">Tillgängliga variabler:</label>
                <div className="flex flex-wrap gap-1.5">
                  {templateVariables.map(v => (
                    <button
                      key={v}
                      onClick={() => setEditTemplate(editTemplate + v)}
                      className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded-md hover:bg-blue-100"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 block mb-2">Förhandsgranskning:</label>
                <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700">
                  {getPreview(editTemplate)}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-5 border-t border-gray-200">
              <button
                onClick={() => setEditTemplate(editingRule.message_template)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Återställ till standard
              </button>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setEditingRule(null)}
                  className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900"
                >
                  Avbryt
                </button>
                <button
                  onClick={saveRuleTemplate}
                  disabled={savingRule}
                  className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-cyan-600 text-white rounded-xl text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                >
                  {savingRule ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Spara
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast.show && (
        <div className={`fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium z-50 flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-emerald-600 text-white'
            : 'bg-red-600 text-white'
        }`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.message}
        </div>
      )}
    </div>
  )
}
