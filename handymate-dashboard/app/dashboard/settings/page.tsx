'use client'

import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { 
  Building2, 
  Clock, 
  Bot, 
  CreditCard,
  Save,
  Loader2,
  Plus,
  X,
  Phone,
  Mail,
  MapPin
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

interface BusinessConfig {
  business_id: string
  business_name: string
  contact_name: string
  contact_email: string
  phone_number: string
  services_offered: string[]
  service_area: string
  working_hours: any
  greeting_script: string
  subscription_plan: string
  subscription_status: string
  trial_ends_at: string
}

const DEFAULT_HOURS = {
  monday: { open: '08:00', close: '17:00', enabled: true },
  tuesday: { open: '08:00', close: '17:00', enabled: true },
  wednesday: { open: '08:00', close: '17:00', enabled: true },
  thursday: { open: '08:00', close: '17:00', enabled: true },
  friday: { open: '08:00', close: '17:00', enabled: true },
  saturday: { open: '10:00', close: '14:00', enabled: false },
  sunday: { open: '10:00', close: '14:00', enabled: false },
}

const DAY_NAMES: Record<string, string> = {
  monday: 'Måndag',
  tuesday: 'Tisdag',
  wednesday: 'Onsdag',
  thursday: 'Torsdag',
  friday: 'Fredag',
  saturday: 'Lördag',
  sunday: 'Söndag',
}

const SERVICE_SUGGESTIONS = [
  'Elinstallation', 'Felsökning', 'Säkringsbyte', 'Elbilsladdare',
  'Rörläggning', 'Avloppsrensning', 'Värmepump', 'Badrumsrenovering',
  'Målning', 'Tapetsering', 'Snickeri', 'Golvläggning',
  'Låsbyte', 'Inbrottsskydd', 'Städning', 'Fönsterputs'
]

function SMSUsageWidget({ businessId, plan }: { businessId: string; plan: string }) {
  const [usage, setUsage] = useState({ sent: 0, delivered: 0, failed: 0 })
  const [loading, setLoading] = useState(true)

  const included = plan === 'Business' ? 2000 : plan === 'Professional' ? 500 : 100
  const overage = Math.max(0, usage.sent - included)
  const overageRate = plan === 'Business' ? 0.59 : plan === 'Professional' ? 0.79 : 0.99
  const overageCost = overage * overageRate

  useEffect(() => {
    async function fetchUsage() {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { data: campaigns } = await supabase
        .from('sms_campaign')
        .select('delivered_count, failed_count, recipient_count')
        .eq('business_id', businessId)
        .eq('status', 'sent')
        .gte('sent_at', startOfMonth.toISOString())

      const { data: bookings } = await supabase
        .from('booking')
        .select('booking_id')
        .eq('business_id', businessId)
        .gte('created_at', startOfMonth.toISOString())

      let sent = 0
      let delivered = 0
      let failed = 0

      campaigns?.forEach((c: any) => {
        sent += c.recipient_count || 0
        delivered += c.delivered_count || 0
        failed += c.failed_count || 0
      })

      const confirmationSMS = bookings?.length || 0
      sent += confirmationSMS
      delivered += confirmationSMS

      setUsage({ sent, delivered, failed })
      setLoading(false)
    }

    fetchUsage()
  }, [businessId])

  if (loading) {
    return <div className="text-zinc-500">Laddar...</div>
  }

  const percentUsed = Math.min(100, (usage.sent / included) * 100)

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-zinc-400">Använda SMS</span>
          <span className="text-sm text-white font-medium">{usage.sent} / {included}</span>
        </div>
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              percentUsed > 90 ? 'bg-red-500' : percentUsed > 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
            }`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        {percentUsed > 90 && (
          <p className="text-xs text-amber-400 mt-2">
            ⚠️ Du närmar dig gränsen. Överskjutande SMS kostar {overageRate} kr/st.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 bg-zinc-800/50 rounded-xl text-center">
          <p className="text-xl font-bold text-white">{usage.sent}</p>
          <p className="text-xs text-zinc-500">Skickade</p>
        </div>
        <div className="p-3 bg-zinc-800/50 rounded-xl text-center">
          <p className="text-xl font-bold text-emerald-400">{usage.delivered}</p>
          <p className="text-xs text-zinc-500">Levererade</p>
        </div>
        <div className="p-3 bg-zinc-800/50 rounded-xl text-center">
          <p className="text-xl font-bold text-red-400">{usage.failed}</p>
          <p className="text-xs text-zinc-500">Misslyckade</p>
        </div>
      </div>

      {overage > 0 && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-400 font-medium">Överskjutande SMS</p>
              <p className="text-sm text-amber-400/70">{overage} SMS × {overageRate} kr</p>
            </div>
            <p className="text-xl font-bold text-amber-400">{overageCost.toFixed(0)} kr</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function SettingsPage() {
  const business = useBusiness()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('company')
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [config, setConfig] = useState<BusinessConfig | null>(null)
  const [workingHours, setWorkingHours] = useState(DEFAULT_HOURS)
  const [newService, setNewService] = useState('')

  useEffect(() => {
    fetchConfig()
  }, [business.business_id])

  async function fetchConfig() {
    const { data } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    if (data) {
      setConfig(data)
      
      if (data.working_hours && typeof data.working_hours === 'object') {
        setWorkingHours(prev => {
          const merged = { ...prev }
          for (const day of Object.keys(prev)) {
            if (data.working_hours[day]) {
              merged[day as keyof typeof merged] = {
                ...prev[day as keyof typeof prev],
                ...data.working_hours[day]
              }
            }
          }
          return merged
        })
      }
    }
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const handleSave = async () => {
    if (!config) return
    
    setSaving(true)
    try {
      const { error } = await supabase
        .from('business_config')
        .update({
          business_name: config.business_name,
          contact_name: config.contact_name,
          contact_email: config.contact_email,
          phone_number: config.phone_number,
          services_offered: config.services_offered,
          service_area: config.service_area,
          working_hours: workingHours,
          greeting_script: config.greeting_script,
          updated_at: new Date().toISOString(),
        })
        .eq('business_id', business.business_id)

      if (error) throw error
      showToast('Inställningar sparade!', 'success')
    } catch (error) {
      showToast('Kunde inte spara', 'error')
    } finally {
      setSaving(false)
    }
  }

  const addService = () => {
    if (!newService.trim() || !config) return
    if (config.services_offered?.includes(newService.trim())) return
    
    setConfig({
      ...config,
      services_offered: [...(config.services_offered || []), newService.trim()]
    })
    setNewService('')
  }

  const removeService = (service: string) => {
    if (!config) return
    setConfig({
      ...config,
      services_offered: config.services_offered?.filter(s => s !== service) || []
    })
  }

  const updateHours = (day: string, field: string, value: any) => {
    setWorkingHours({
      ...workingHours,
      [day]: { ...workingHours[day as keyof typeof workingHours], [field]: value }
    })
  }

  const getTrialDaysLeft = () => {
    if (!config?.trial_ends_at) return null
    const trialEnd = new Date(config.trial_ends_at)
    const now = new Date()
    const diff = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return diff > 0 ? diff : 0
  }

  const trialDaysLeft = getTrialDaysLeft()

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Kunde inte ladda inställningar</div>
      </div>
    )
  }

  const tabs = [
    { id: 'company', label: 'Företag', icon: Building2 },
    { id: 'hours', label: 'Öppettider', icon: Clock },
    { id: 'ai', label: 'AI-assistent', icon: Bot },
    { id: 'subscription', label: 'Prenumeration', icon: CreditCard },
  ]

  const currentPlan = config.subscription_plan || 'Starter'

  return (
    <div className="p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Inställningar</h1>
            <p className="text-zinc-400">Konfigurera ditt företag och AI-assistent</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            Spara ändringar
          </button>
        </div>

        {/* Tabs */}
        <div className="flex space-x-2 mb-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center px-4 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Company Tab */}
        {activeTab === 'company' && (
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-white">Företagsinformation</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Building2 className="w-4 h-4" />
                  Företagsnamn
                </label>
                <input
                  type="text"
                  value={config.business_name || ''}
                  onChange={(e) => setConfig({ ...config, business_name: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <p className="text-xs text-zinc-600 mt-1">Visas i SMS och används av AI-assistenten</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  Kontaktperson
                </label>
                <input
                  type="text"
                  value={config.contact_name || ''}
                  onChange={(e) => setConfig({ ...config, contact_name: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Mail className="w-4 h-4" />
                  E-post
                </label>
                <input
                  type="email"
                  value={config.contact_email || ''}
                  onChange={(e) => setConfig({ ...config, contact_email: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  <Phone className="w-4 h-4" />
                  Telefon
                </label>
                <input
                  type="tel"
                  value={config.phone_number || ''}
                  onChange={(e) => setConfig({ ...config, phone_number: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                <MapPin className="w-4 h-4" />
                Tjänsteområde
              </label>
              <input
                type="text"
                value={config.service_area || ''}
                onChange={(e) => setConfig({ ...config, service_area: e.target.value })}
                placeholder="T.ex. Stockholm, Solna, Sundbyberg"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
              <p className="text-xs text-zinc-600 mt-1">AI-assistenten berättar för kunder var ni jobbar</p>
            </div>

            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Tjänster ni erbjuder</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {config.services_offered?.map((service) => (
                  <span key={service} className="flex items-center px-3 py-1.5 bg-violet-500/20 border border-violet-500/30 rounded-lg text-sm text-violet-300">
                    {service}
                    <button onClick={() => removeService(service)} className="ml-2 text-violet-400 hover:text-white">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newService}
                  onChange={(e) => setNewService(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addService()}
                  placeholder="Lägg till tjänst..."
                  className="flex-1 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <button
                  onClick={addService}
                  className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {SERVICE_SUGGESTIONS.filter(s => !config.services_offered?.includes(s)).slice(0, 6).map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setConfig({ ...config, services_offered: [...(config.services_offered || []), suggestion] })}
                    className="px-2 py-1 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-xs text-zinc-500 hover:text-white hover:border-zinc-600"
                  >
                    + {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Hours Tab */}
        {activeTab === 'hours' && (
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
            <h2 className="text-lg font-semibold text-white mb-2">Öppettider</h2>
            <p className="text-sm text-zinc-500 mb-6">AI-assistenten bokar endast tider inom dessa tider</p>
            
            <div className="space-y-4">
              {Object.entries(workingHours).map(([day, hours]) => (
                <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-zinc-800/50 rounded-xl">
                  <label className="flex items-center gap-3 sm:w-32">
                    <input
                      type="checkbox"
                      checked={hours.enabled}
                      onChange={(e) => updateHours(day, 'enabled', e.target.checked)}
                      className="w-5 h-5 rounded border-zinc-600 bg-zinc-700 text-violet-500 focus:ring-violet-500/50"
                    />
                    <span className={`font-medium ${hours.enabled ? 'text-white' : 'text-zinc-500'}`}>
                      {DAY_NAMES[day]}
                    </span>
                  </label>
                  
                  {hours.enabled ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={hours.open}
                        onChange={(e) => updateHours(day, 'open', e.target.value)}
                        className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                      <span className="text-zinc-500">–</span>
                      <input
                        type="time"
                        value={hours.close}
                        onChange={(e) => updateHours(day, 'close', e.target.value)}
                        className="px-3 py-2 bg-zinc-700 border border-zinc-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>
                  ) : (
                    <span className="text-zinc-600">Stängt</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI Tab */}
        {activeTab === 'ai' && (
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-white mb-2">AI-assistent</h2>
            <p className="text-sm text-zinc-500">Konfigurera hur Lisa svarar på samtal</p>
            
            <div>
              <label className="text-sm text-zinc-400 mb-2 block">Hälsningsfras</label>
              <textarea
                value={config.greeting_script || ''}
                onChange={(e) => setConfig({ ...config, greeting_script: e.target.value })}
                placeholder={`Hej och välkommen till ${config.business_name}! Mitt namn är Lisa, hur kan jag hjälpa dig idag?`}
                rows={4}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              />
              <p className="text-xs text-zinc-600 mt-1">Detta säger AI-assistenten när den svarar</p>
              <Link
              href="/dashboard/settings/knowledge"
              className="mt-4 flex items-center justify-between p-4 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/30 rounded-xl hover:bg-violet-500/20 transition-all"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-violet-400" />
                <div>
                  <p className="font-medium text-white text-sm">Knowledge Base</p>
                  <p className="text-xs text-zinc-400">Lär AI:n om dina tjänster, priser och policyer</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-violet-400" />
            </Link>
            </div>

            <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded-xl">
              <div className="flex items-start gap-3">
                <Bot className="w-5 h-5 text-violet-400 mt-0.5" />
                <div>
                  <p className="font-medium text-white text-sm">AI-röst</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Just nu används "Lisa" (sv-SE-SofieNeural). 
                    Fler röster kommer snart.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-zinc-800/50 border border-zinc-700 rounded-xl">
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-zinc-400 mt-0.5" />
                <div>
                  <p className="font-medium text-white text-sm">AI-telefonnummer</p>
                  <p className="text-xs text-zinc-400 mt-1">
                    Ditt AI-telefonnummer tilldelas när voice-assistenten aktiveras.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Tab */}
        {activeTab === 'subscription' && (
          <div className="space-y-6">
            {/* Nuvarande plan */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Din prenumeration</h2>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/30 rounded-xl mb-4 gap-4">
                <div>
                  <p className="text-white font-semibold text-lg">{currentPlan}</p>
                  <p className="text-zinc-400 text-sm">
                    {config.subscription_status === 'trial' && trialDaysLeft !== null
                      ? `Provperiod - ${trialDaysLeft} dagar kvar`
                      : 'Aktiv prenumeration'
                    }
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-2xl font-bold text-white">
                    {currentPlan === 'Professional' ? '4 995' : currentPlan === 'Business' ? '9 995' : '1 995'}
                  </p>
                  <p className="text-zinc-500 text-sm">kr/mån</p>
                </div>
              </div>

              {config.subscription_status === 'trial' && trialDaysLeft !== null && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                  <p className="text-amber-400 text-sm">
                    ⏰ Din provperiod går ut om {trialDaysLeft} dagar. Uppgradera för att fortsätta använda tjänsten.
                  </p>
                </div>
              )}
            </div>

            {/* SMS-användning */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">SMS-användning denna månad</h2>
              
              <SMSUsageWidget businessId={business.business_id} plan={currentPlan} />
            </div>

            {/* Planöversikt */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Tillgängliga planer</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { name: 'Starter', price: '1 995', sms: 100, calls: 75 },
                  { name: 'Professional', price: '4 995', sms: 500, calls: 300 },
                  { name: 'Business', price: '9 995', sms: 2000, calls: 1000 }
                ].map((plan) => (
                  <div 
                    key={plan.name}
                    className={`p-4 rounded-xl border ${
                      currentPlan === plan.name 
                        ? 'bg-violet-500/10 border-violet-500/30' 
                        : 'bg-zinc-800/50 border-zinc-700'
                    }`}
                  >
                    <p className="font-semibold text-white">{plan.name}</p>
                    <p className="text-2xl font-bold text-white mt-1">{plan.price} <span className="text-sm text-zinc-500">kr/mån</span></p>
                    <div className="mt-3 space-y-1 text-sm text-zinc-400">
                      <p>✓ {plan.sms} SMS/mån</p>
                      <p>✓ {plan.calls} samtal/mån</p>
                    </div>
                    {currentPlan === plan.name && (
                      <p className="mt-3 text-xs text-violet-400 font-medium">Nuvarande plan</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
