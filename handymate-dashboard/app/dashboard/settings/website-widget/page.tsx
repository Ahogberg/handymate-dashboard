'use client'

import { useEffect, useState } from 'react'
import {
  Globe,
  Save,
  Loader2,
  Palette,
  MessageSquare,
  Code,
  Eye,
  Settings,
  Copy,
  Check,
  ToggleLeft,
  ToggleRight,
  Plus,
  X,
  ExternalLink,
  Sparkles,
  BarChart3,
  Users,
  TrendingUp,
  Target,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'

interface WidgetConfig {
  widget_enabled: boolean
  widget_color: string
  widget_welcome_message: string
  widget_position: 'right' | 'left'
  widget_bot_name: string
  widget_max_estimate: number
  widget_collect_contact: boolean
  widget_book_time: boolean
  widget_give_estimates: boolean
  widget_ask_budget: boolean
  widget_quick_questions: string[]
}

const COLOR_PRESETS = [
  { name: 'Cyan', value: '#0891b2' },
  { name: 'Blå', value: '#2563eb' },
  { name: 'Violet', value: '#7c3aed' },
  { name: 'Rosa', value: '#db2777' },
  { name: 'Grön', value: '#059669' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Svart', value: '#18181b' },
]

interface WidgetAnalytics {
  total_conversations: number
  total_messages: number
  leads_created: number
  conversion_rate: number
  avg_messages_per_conversation: number
  contact_collection_rate: number
  common_questions: { question: string; count: number }[]
  recent_conversations: {
    id: string
    visitor_name: string | null
    visitor_phone: string | null
    visitor_email: string | null
    message_count: number
    lead_created: boolean
    created_at: string
    first_message: string
  }[]
}

const DEFAULT_CONFIG: WidgetConfig = {
  widget_enabled: false,
  widget_color: '#0891b2',
  widget_welcome_message: 'Hej! 👋 Hur kan vi hjälpa dig?',
  widget_position: 'right',
  widget_bot_name: '',
  widget_max_estimate: 100000,
  widget_collect_contact: true,
  widget_book_time: false,
  widget_give_estimates: true,
  widget_ask_budget: true,
  widget_quick_questions: ['Vad kostar renovering?', 'Vilka tjänster har ni?', 'Boka en tid'],
}

export default function WebsiteWidgetPage() {
  const business = useBusiness()
  const { hasFeature } = useBusinessPlan()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_CONFIG)
  const [activeTab, setActiveTab] = useState<'analytics' | 'appearance' | 'behavior' | 'install' | 'preview'>('appearance')
  const [copied, setCopied] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [analytics, setAnalytics] = useState<WidgetAnalytics | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  useEffect(() => {
    if (business.business_id) fetchConfig()
  }, [business.business_id])

  async function fetchConfig() {
    setLoading(true)
    try {
      const { data } = await supabase
        .from('business_config')
        .select('widget_enabled, widget_color, widget_welcome_message, widget_position, widget_bot_name, widget_max_estimate, widget_collect_contact, widget_book_time, widget_give_estimates, widget_ask_budget, widget_quick_questions, display_name, business_name')
        .eq('business_id', business.business_id)
        .single()

      if (data) {
        setConfig({
          widget_enabled: data.widget_enabled || false,
          widget_color: data.widget_color || '#0891b2',
          widget_welcome_message: data.widget_welcome_message || 'Hej! 👋 Hur kan vi hjälpa dig?',
          widget_position: data.widget_position || 'right',
          widget_bot_name: data.widget_bot_name || '',
          widget_max_estimate: data.widget_max_estimate || 100000,
          widget_collect_contact: data.widget_collect_contact !== false,
          widget_book_time: data.widget_book_time || false,
          widget_give_estimates: data.widget_give_estimates !== false,
          widget_ask_budget: data.widget_ask_budget !== false,
          widget_quick_questions: data.widget_quick_questions || ['Vad kostar renovering?', 'Vilka tjänster har ni?', 'Boka en tid'],
        })
      }
    } catch (err) {
      console.error('Failed to load widget config:', err)
    }
    setLoading(false)
  }

  async function fetchAnalytics() {
    setAnalyticsLoading(true)
    try {
      const res = await fetch('/api/widget/analytics?period=30d', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      })
      if (res.ok) {
        setAnalytics(await res.json())
      }
    } catch (err) {
      console.error('Failed to load analytics:', err)
    }
    setAnalyticsLoading(false)
  }

  useEffect(() => {
    if (activeTab === 'analytics' && !analytics && !analyticsLoading) {
      fetchAnalytics()
    }
  }, [activeTab])

  async function handleSave() {
    setSaving(true)
    try {
      const { error } = await supabase
        .from('business_config')
        .update({
          widget_enabled: config.widget_enabled,
          widget_color: config.widget_color,
          widget_welcome_message: config.widget_welcome_message,
          widget_position: config.widget_position,
          widget_bot_name: config.widget_bot_name || null,
          widget_max_estimate: config.widget_max_estimate,
          widget_collect_contact: config.widget_collect_contact,
          widget_book_time: config.widget_book_time,
          widget_give_estimates: config.widget_give_estimates,
          widget_ask_budget: config.widget_ask_budget,
          widget_quick_questions: config.widget_quick_questions,
        })
        .eq('business_id', business.business_id)

      if (error) throw error
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('Failed to save:', err)
    }
    setSaving(false)
  }

  function addQuickQuestion() {
    if (!newQuestion.trim()) return
    if (config.widget_quick_questions.length >= 5) return
    setConfig(prev => ({
      ...prev,
      widget_quick_questions: [...prev.widget_quick_questions, newQuestion.trim()],
    }))
    setNewQuestion('')
  }

  function removeQuickQuestion(idx: number) {
    setConfig(prev => ({
      ...prev,
      widget_quick_questions: prev.widget_quick_questions.filter((_, i) => i !== idx),
    }))
  }

  const embedCode = `<!-- Handymate Widget -->
<script>
  (function() {
    var s = document.createElement('script');
    s.src = '${process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'}/widget/loader.js';
    s.setAttribute('data-business-id', '${business.business_id}');
    s.async = true;
    document.body.appendChild(s);
  })();
</script>`

  function copyEmbedCode() {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!hasFeature('website_widget')) {
    return (
      <div className="p-6">
        <UpgradePrompt featureKey="website_widget" />
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 text-sky-700 animate-spin" />
      </div>
    )
  }

  const botName = config.widget_bot_name || `${business.business_name}s assistent`

  const tabs = [
    { key: 'analytics' as const, label: 'Statistik', icon: BarChart3 },
    { key: 'appearance' as const, label: 'Utseende', icon: Palette },
    { key: 'behavior' as const, label: 'Beteende', icon: Settings },
    { key: 'install' as const, label: 'Installation', icon: Code },
    { key: 'preview' as const, label: 'Förhandsgranska', icon: Eye },
  ]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Globe className="w-6 h-6 text-sky-700" />
            Hemsida-widget
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            AI-chattbot som du kan bädda in på din hemsida
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Enable toggle */}
          <button
            onClick={() => setConfig(prev => ({ ...prev, widget_enabled: !prev.widget_enabled }))}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
              config.widget_enabled
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-gray-50 border-gray-200 text-gray-500'
            }`}
          >
            {config.widget_enabled ? (
              <ToggleRight className="w-5 h-5" />
            ) : (
              <ToggleLeft className="w-5 h-5" />
            )}
            {config.widget_enabled ? 'Aktiverad' : 'Inaktiverad'}
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50 transition-colors"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saved ? (
              <Check className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? 'Sparat!' : 'Spara'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {analyticsLoading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-sky-700 animate-spin" />
            </div>
          ) : analytics ? (
            <>
              {/* KPI Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: 'Konversationer', value: analytics.total_conversations, icon: MessageSquare, color: 'text-sky-700 bg-primary-50' },
                  { label: 'Leads skapade', value: analytics.leads_created, icon: Users, color: 'text-green-600 bg-green-50' },
                  { label: 'Konverteringsgrad', value: `${analytics.conversion_rate}%`, icon: Target, color: 'text-primary-700 bg-primary-50' },
                  { label: 'Snitt meddelanden', value: analytics.avg_messages_per_conversation, icon: TrendingUp, color: 'text-amber-600 bg-amber-50' },
                ].map((kpi, i) => (
                  <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.color}`}>
                        <kpi.icon className="w-4 h-4" />
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
                    <p className="text-xs text-gray-500">{kpi.label}</p>
                  </div>
                ))}
              </div>

              {/* Two columns */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Common questions */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Vanligaste frågorna</h3>
                  {analytics.common_questions.length > 0 ? (
                    <div className="space-y-2">
                      {analytics.common_questions.slice(0, 8).map((q, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <p className="text-sm text-gray-700 truncate flex-1 mr-2">{q.question}</p>
                          <span className="text-xs text-gray-400 flex-shrink-0">{q.count}x</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Inga konversationer ännu</p>
                  )}
                </div>

                {/* Recent conversations */}
                <div className="bg-white border border-gray-200 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Senaste konversationer</h3>
                  {analytics.recent_conversations.length > 0 ? (
                    <div className="space-y-3">
                      {analytics.recent_conversations.slice(0, 6).map((c, i) => (
                        <div key={i} className="flex items-start gap-3 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                          <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                            <Users className="w-4 h-4 text-gray-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {c.visitor_name || 'Anonym besökare'}
                            </p>
                            <p className="text-xs text-gray-500 truncate">{c.first_message}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-gray-400">
                                {new Date(c.created_at).toLocaleDateString('sv-SE')}
                              </span>
                              {c.lead_created && (
                                <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full">Lead</span>
                              )}
                              <span className="text-xs text-gray-400">{c.message_count} meddelanden</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Inga konversationer ännu</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-16">
              <BarChart3 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">Kunde inte ladda statistik</p>
              <button onClick={fetchAnalytics} className="mt-2 text-sm text-sky-700 hover:underline">
                Försök igen
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'appearance' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
          {/* Bot Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Botens namn
            </label>
            <input
              type="text"
              value={config.widget_bot_name}
              onChange={e => setConfig(prev => ({ ...prev, widget_bot_name: e.target.value }))}
              placeholder={`${business.business_name}s assistent`}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            />
            <p className="text-xs text-gray-400 mt-1">Lämna tomt för standardnamn</p>
          </div>

          {/* Welcome Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Välkomstmeddelande
            </label>
            <textarea
              value={config.widget_welcome_message}
              onChange={e => setConfig(prev => ({ ...prev, widget_welcome_message: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent resize-none"
            />
          </div>

          {/* Color */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Färg
            </label>
            <div className="flex items-center gap-3 flex-wrap">
              {COLOR_PRESETS.map(c => (
                <button
                  key={c.value}
                  onClick={() => setConfig(prev => ({ ...prev, widget_color: c.value }))}
                  className={`w-10 h-10 rounded-full border-2 transition-all ${
                    config.widget_color === c.value
                      ? 'border-gray-900 scale-110'
                      : 'border-transparent hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
              <div className="flex items-center gap-2 ml-2">
                <input
                  type="color"
                  value={config.widget_color}
                  onChange={e => setConfig(prev => ({ ...prev, widget_color: e.target.value }))}
                  className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200"
                />
                <span className="text-xs text-gray-400 font-mono">{config.widget_color}</span>
              </div>
            </div>
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Position
            </label>
            <div className="flex gap-3">
              {(['right', 'left'] as const).map(pos => (
                <button
                  key={pos}
                  onClick={() => setConfig(prev => ({ ...prev, widget_position: pos }))}
                  className={`flex-1 px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                    config.widget_position === pos
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {pos === 'right' ? 'Höger' : 'Vänster'}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Questions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Snabbfrågor (visas som knappar)
            </label>
            <div className="space-y-2">
              {config.widget_quick_questions.map((q, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-700">{q}</span>
                  <button
                    onClick={() => removeQuickQuestion(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {config.widget_quick_questions.length < 5 && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addQuickQuestion()}
                    placeholder="Ny snabbfråga..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent"
                  />
                  <button
                    onClick={addQuickQuestion}
                    disabled={!newQuestion.trim()}
                    className="p-2 text-sky-700 hover:bg-primary-50 rounded-lg disabled:opacity-30 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'behavior' && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-6">
          {/* Toggle options */}
          {[
            {
              key: 'widget_collect_contact' as const,
              label: 'Samla kontaktuppgifter',
              desc: 'Boten frågar naturligt efter namn, telefon och email',
            },
            {
              key: 'widget_give_estimates' as const,
              label: 'Ge prisuppskattningar',
              desc: 'Boten ger ungefärliga priser baserat på din prislista',
            },
            {
              key: 'widget_ask_budget' as const,
              label: 'Fråga om budget',
              desc: 'Boten frågar naturligt om kundens budget och tidsram',
            },
            {
              key: 'widget_book_time' as const,
              label: 'Erbjud tidsbokning',
              desc: 'Boten kan föreslå att kunden bokar en tid (kommande)',
            },
          ].map(opt => (
            <div key={opt.key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.desc}</p>
              </div>
              <button
                onClick={() =>
                  setConfig(prev => ({ ...prev, [opt.key]: !prev[opt.key] }))
                }
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  config[opt.key] ? 'bg-primary-700' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    config[opt.key] ? 'translate-x-5' : ''
                  }`}
                />
              </button>
            </div>
          ))}

          {/* Max estimate */}
          <div className="pt-4 border-t border-gray-100">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Max prisuppskattning (kr)
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Jobb som uppskattas över detta belopp hänvisas till offert istället
            </p>
            <input
              type="number"
              value={config.widget_max_estimate}
              onChange={e => setConfig(prev => ({ ...prev, widget_max_estimate: parseInt(e.target.value) || 0 }))}
              className="w-48 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-600 focus:border-transparent"
            />
            <span className="text-sm text-gray-400 ml-2">kr</span>
          </div>
        </div>
      )}

      {activeTab === 'install' && (
        <div className="space-y-6">
          {/* Embed code */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
              <Code className="w-4 h-4 text-sky-700" />
              Installationskod
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Klistra in denna kod precis innan &lt;/body&gt; på din hemsida
            </p>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {embedCode}
              </pre>
              <button
                onClick={copyEmbedCode}
                className="absolute top-2 right-2 flex items-center gap-1 px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-xs rounded-md transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Kopierat!' : 'Kopiera'}
              </button>
            </div>
          </div>

          {/* Platform guides */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Plattformsguider</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  name: 'WordPress',
                  steps: 'Utseende → Tema-editor → footer.php → Klistra in koden innan </body>',
                },
                {
                  name: 'Squarespace',
                  steps: 'Inställningar → Avancerat → Kodinjektion → Klistra in i Footer',
                },
                {
                  name: 'Wix',
                  steps: 'Inställningar → Anpassad kod → Lägg till kod → Klistra in (Body - End)',
                },
              ].map(p => (
                <div key={p.name} className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900 mb-1">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.steps}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div className={`p-4 rounded-xl border ${config.widget_enabled ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
            <div className="flex items-center gap-2">
              {config.widget_enabled ? (
                <Check className="w-5 h-5 text-green-600" />
              ) : (
                <Sparkles className="w-5 h-5 text-amber-600" />
              )}
              <p className="text-sm font-medium text-gray-900">
                {config.widget_enabled
                  ? 'Widgeten är aktiv och redo att användas'
                  : 'Aktivera widgeten först (knappen uppe till höger), spara, och installera sedan koden'}
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'preview' && (
        <div className="space-y-4">
          {/* Preview container */}
          <div className="bg-gray-100 rounded-xl p-8 min-h-[500px] relative overflow-hidden">
            <div className="text-center text-gray-400 text-sm mb-8">
              Din hemsida
            </div>

            {/* Simulated widget */}
            <div
              className={`absolute bottom-6 ${config.widget_position === 'right' ? 'right-6' : 'left-6'}`}
              style={{ width: '360px' }}
            >
              {/* Chat window */}
              <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200">
                {/* Header */}
                <div
                  className="px-4 py-3 text-white flex items-center gap-3"
                  style={{ backgroundColor: config.widget_color }}
                >
                  <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{botName}</p>
                    <p className="text-xs opacity-80">Online</p>
                  </div>
                </div>

                {/* Messages */}
                <div className="p-4 space-y-3 bg-gray-50" style={{ minHeight: '200px' }}>
                  {/* Bot message */}
                  <div className="flex gap-2">
                    <div
                      className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center"
                      style={{ backgroundColor: config.widget_color }}
                    >
                      <MessageSquare className="w-3 h-3 text-white" />
                    </div>
                    <div className="bg-white rounded-xl rounded-tl-sm px-3 py-2 shadow-sm max-w-[80%]">
                      <p className="text-sm text-gray-800">{config.widget_welcome_message}</p>
                    </div>
                  </div>
                </div>

                {/* Quick questions */}
                {config.widget_quick_questions.length > 0 && (
                  <div className="px-4 pb-2 flex flex-wrap gap-1.5 bg-gray-50">
                    {config.widget_quick_questions.map((q, i) => (
                      <button
                        key={i}
                        className="px-3 py-1.5 text-xs rounded-full border border-gray-200 text-gray-600 bg-white hover:bg-gray-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <div className="px-4 py-3 border-t border-gray-100 bg-white flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Skriv ett meddelande..."
                    className="flex-1 text-sm text-gray-400 bg-transparent outline-none"
                    readOnly
                  />
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: config.widget_color }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Floating button (shown at opposite side for reference) */}
            <div
              className={`absolute bottom-6 ${config.widget_position === 'right' ? 'left-6' : 'right-6'}`}
            >
              <p className="text-xs text-gray-400 mb-2 text-center">Stängd widget-knapp:</p>
              <div
                className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: config.widget_color }}
              >
                <MessageSquare className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>

          <p className="text-xs text-gray-400 text-center">
            Detta är en förhandsgranskning. Den faktiska widgeten renderas i en iframe på din hemsida.
          </p>
        </div>
      )}
    </div>
  )
}
