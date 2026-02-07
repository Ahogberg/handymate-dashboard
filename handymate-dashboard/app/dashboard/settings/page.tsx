'use client'

import Link from 'next/link'
import { ChevronRight, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
  MapPin,
  PhoneCall,
  Mic,
  AlertTriangle,
  Receipt,
  Bell,
  Link2,
  ExternalLink,
  CheckCircle,
  XCircle,
  Download,
  Upload
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
  // Telefoni
  assigned_phone_number: string | null
  forward_phone_number: string | null
  call_recording_enabled: boolean
  call_recording_consent_message: string | null
  // Faktura
  default_payment_days: number
  bankgiro: string | null
  swish_number: string | null
  reminder_sms_template: string | null
  auto_reminder_enabled: boolean
  auto_reminder_days: number
  late_fee_percent: number
}

interface FortnoxStatus {
  connected: boolean
  companyName: string | null
  connectedAt: string | null
  expiresAt: string | null
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
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('company')
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [config, setConfig] = useState<BusinessConfig | null>(null)
  const [workingHours, setWorkingHours] = useState(DEFAULT_HOURS)
  const [newService, setNewService] = useState('')

  // Phone provisioning state
  const [forwardNumber, setForwardNumber] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)

  // Fortnox integration state
  const [fortnoxStatus, setFortnoxStatus] = useState<FortnoxStatus | null>(null)
  const [fortnoxLoading, setFortnoxLoading] = useState(false)
  const [disconnectingFortnox, setDisconnectingFortnox] = useState(false)
  const [syncingCustomers, setSyncingCustomers] = useState(false)
  const [importingCustomers, setImportingCustomers] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced?: number; imported?: number; failed?: number } | null>(null)
  const [syncingInvoices, setSyncingInvoices] = useState(false)
  const [syncingPayments, setSyncingPayments] = useState(false)
  const [invoiceSyncResult, setInvoiceSyncResult] = useState<{ synced?: number; failed?: number; updated?: number; unchanged?: number } | null>(null)

  useEffect(() => {
    fetchConfig()
    fetchFortnoxStatus()
  }, [business.business_id])

  // Handle Fortnox OAuth callback
  useEffect(() => {
    const fortnoxParam = searchParams.get('fortnox')
    if (fortnoxParam === 'connected') {
      setActiveTab('integrations')
      showToast('Fortnox kopplat!', 'success')
      fetchFortnoxStatus()
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (fortnoxParam === 'error') {
      setActiveTab('integrations')
      const message = searchParams.get('message') || 'Kunde inte koppla Fortnox'
      showToast(message, 'error')
      window.history.replaceState({}, '', '/dashboard/settings')
    }
  }, [searchParams])

  async function fetchFortnoxStatus() {
    try {
      const response = await fetch('/api/fortnox/status')
      if (response.ok) {
        const data = await response.json()
        setFortnoxStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch Fortnox status:', error)
    }
  }

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
          org_number: (config as any).org_number || null,
          // Fakturainställningar
          default_payment_days: config.default_payment_days || 30,
          bankgiro: config.bankgiro || null,
          swish_number: config.swish_number || null,
          reminder_sms_template: config.reminder_sms_template || null,
          auto_reminder_enabled: config.auto_reminder_enabled || false,
          auto_reminder_days: config.auto_reminder_days || 7,
          late_fee_percent: config.late_fee_percent || 8,
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

  const handleProvisionPhone = async () => {
    if (!forwardNumber.trim()) {
      showToast('Ange ditt mobilnummer för vidarekoppling', 'error')
      return
    }

    setProvisioning(true)
    try {
      const response = await fetch('/api/phone/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          forward_phone_number: forwardNumber.trim()
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte tilldela nummer')
      }

      showToast(`Telefonnummer ${result.number} har tilldelats!`, 'success')
      fetchConfig()
      setForwardNumber('')

    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setProvisioning(false)
    }
  }

  const handleSavePhoneSettings = async () => {
    if (!config) return

    setSavingPhone(true)
    try {
      const response = await fetch('/api/phone/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_id: business.business_id,
          forward_phone_number: config.forward_phone_number,
          call_recording_enabled: config.call_recording_enabled,
          call_recording_consent_message: config.call_recording_consent_message
        })
      })

      if (!response.ok) {
        throw new Error('Kunde inte spara inställningar')
      }

      showToast('Telefoninställningar sparade!', 'success')

    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSavingPhone(false)
    }
  }

  const handleRemovePhone = async () => {
    if (!confirm('Är du säker på att du vill ta bort telefonnumret? Detta kan inte ångras.')) {
      return
    }

    setProvisioning(true)
    try {
      const response = await fetch(`/api/phone/provision?business_id=${business.business_id}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Kunde inte ta bort nummer')
      }

      showToast('Telefonnummer borttaget', 'success')
      fetchConfig()

    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setProvisioning(false)
    }
  }

  const handleConnectFortnox = () => {
    setFortnoxLoading(true)
    window.location.href = '/api/fortnox/connect'
  }

  const handleDisconnectFortnox = async () => {
    if (!confirm('Är du säker på att du vill koppla bort Fortnox? Synkroniserade data påverkas inte.')) {
      return
    }

    setDisconnectingFortnox(true)
    try {
      const response = await fetch('/api/fortnox/disconnect', { method: 'POST' })
      if (response.ok) {
        setFortnoxStatus({ connected: false, companyName: null, connectedAt: null, expiresAt: null })
        showToast('Fortnox bortkopplat', 'success')
      } else {
        throw new Error('Kunde inte koppla bort Fortnox')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setDisconnectingFortnox(false)
    }
  }

  const handleSyncCustomersToFortnox = async () => {
    setSyncingCustomers(true)
    setSyncResult(null)
    try {
      const response = await fetch('/api/fortnox/sync/customers', { method: 'POST' })
      const data = await response.json()
      if (response.ok) {
        setSyncResult({ synced: data.synced, failed: data.failed })
        if (data.synced > 0) {
          showToast(`${data.synced} kunder synkade till Fortnox`, 'success')
        } else {
          showToast('Inga nya kunder att synka', 'success')
        }
      } else {
        throw new Error(data.error || 'Synkronisering misslyckades')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSyncingCustomers(false)
    }
  }

  const handleImportCustomersFromFortnox = async () => {
    setImportingCustomers(true)
    setSyncResult(null)
    try {
      const response = await fetch('/api/fortnox/import/customers', { method: 'POST' })
      const data = await response.json()
      if (response.ok) {
        setSyncResult({ imported: data.imported })
        if (data.imported > 0) {
          showToast(`${data.imported} kunder importerade från Fortnox`, 'success')
        } else {
          showToast('Inga nya kunder att importera', 'success')
        }
      } else {
        throw new Error(data.error || 'Import misslyckades')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setImportingCustomers(false)
    }
  }

  const handleSyncInvoicesToFortnox = async () => {
    setSyncingInvoices(true)
    setInvoiceSyncResult(null)
    try {
      const response = await fetch('/api/fortnox/sync/invoices', { method: 'POST' })
      const data = await response.json()
      if (response.ok) {
        setInvoiceSyncResult({ synced: data.synced, failed: data.failed })
        if (data.synced > 0) {
          showToast(`${data.synced} fakturor synkade till Fortnox`, 'success')
        } else {
          showToast('Inga nya fakturor att synka', 'success')
        }
      } else {
        throw new Error(data.error || 'Synkronisering misslyckades')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSyncingInvoices(false)
    }
  }

  const handleSyncPayments = async () => {
    setSyncingPayments(true)
    setInvoiceSyncResult(null)
    try {
      const response = await fetch('/api/fortnox/sync/payments', { method: 'POST' })
      const data = await response.json()
      if (response.ok) {
        setInvoiceSyncResult({ updated: data.updated, unchanged: data.unchanged })
        if (data.updated > 0) {
          showToast(`${data.updated} betalningar uppdaterade`, 'success')
        } else {
          showToast('Inga nya betalningar att hämta', 'success')
        }
      } else {
        throw new Error(data.error || 'Synkronisering misslyckades')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSyncingPayments(false)
    }
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
    { id: 'phone', label: 'Telefoni', icon: PhoneCall },
    { id: 'invoice', label: 'Faktura', icon: Receipt },
    { id: 'integrations', label: 'Integrationer', icon: Link2 },
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <label className="flex items-center gap-2 text-sm text-zinc-400 mb-2">
                  Organisationsnummer
                </label>
                <input
                  type="text"
                  value={(config as any).org_number || ''}
                  onChange={(e) => setConfig({ ...config, org_number: e.target.value } as any)}
                  placeholder="XXXXXX-XXXX"
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
                <p className="text-xs text-zinc-600 mt-1">Visas på offerter och fakturor</p>
              </div>
            </div>

            {/* Länk till prislista */}
            <Link
              href="/dashboard/settings/pricelist"
              className="flex items-center justify-between p-4 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl border border-zinc-700 hover:border-violet-500/30 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30">
                  <FileText className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="font-medium text-white">Grossistprislista</p>
                  <p className="text-sm text-zinc-500">Hantera leverantörer och produktpriser</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-zinc-600 group-hover:text-violet-400 transition-colors" />
            </Link>

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

        {/* Phone Tab */}
        {activeTab === 'phone' && (
          <div className="space-y-6">
            {/* Nuvarande nummer eller tilldela nytt */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Ditt Handymate-nummer</h2>

              {config.assigned_phone_number ? (
                // Har redan ett nummer
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/10 border border-violet-500/30 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-xl">
                          <Phone className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-white">{config.assigned_phone_number}</p>
                          <p className="text-sm text-zinc-400">Ditt kundnummer för samtal</p>
                        </div>
                      </div>
                      <button
                        onClick={handleRemovePhone}
                        disabled={provisioning}
                        className="px-3 py-1.5 text-red-400 hover:bg-red-500/10 rounded-lg text-sm"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-zinc-800/50 rounded-xl">
                    <p className="text-sm text-zinc-400 mb-1">Vidarekopplas till</p>
                    <input
                      type="tel"
                      value={config.forward_phone_number || ''}
                      onChange={(e) => setConfig({ ...config, forward_phone_number: e.target.value })}
                      placeholder="+46701234567"
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                    <p className="text-xs text-zinc-600 mt-1">Din mobil eller fast telefon dit samtal kopplas</p>
                  </div>
                </div>
              ) : (
                // Inget nummer - visa formulär för att tilldela
                <div className="space-y-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                      <div>
                        <p className="font-medium text-white">Inget telefonnummer tilldelat</p>
                        <p className="text-sm text-zinc-400 mt-1">
                          För att ta emot samtal via Handymate behöver du ett telefonnummer.
                          Kunder ringer detta nummer och samtalet spelas in och analyseras av AI.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-zinc-400 mb-2">Ditt mobilnummer (för vidarekoppling)</label>
                    <input
                      type="tel"
                      value={forwardNumber}
                      onChange={(e) => setForwardNumber(e.target.value)}
                      placeholder="+46701234567"
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    />
                    <p className="text-xs text-zinc-600 mt-1">
                      Samtal till ditt Handymate-nummer kopplas hit efter GDPR-meddelandet
                    </p>
                  </div>

                  <button
                    onClick={handleProvisionPhone}
                    disabled={provisioning || !forwardNumber.trim()}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {provisioning ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Phone className="w-5 h-5" />
                    )}
                    Tilldela telefonnummer
                  </button>
                </div>
              )}
            </div>

            {/* Inspelningsinställningar (endast om nummer finns) */}
            {config.assigned_phone_number && (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Mic className="w-5 h-5 text-violet-400" />
                  <h2 className="text-lg font-semibold text-white">Samtalsinspelning</h2>
                </div>

                <div className="space-y-4">
                  {/* Toggle inspelning */}
                  <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                    <div>
                      <p className="font-medium text-white">Spela in samtal</p>
                      <p className="text-sm text-zinc-500">
                        Samtal spelas in för AI-analys och transkribering
                      </p>
                    </div>
                    <button
                      onClick={() => setConfig({
                        ...config,
                        call_recording_enabled: !config.call_recording_enabled
                      })}
                      className={`w-12 h-6 rounded-full transition-all ${
                        config.call_recording_enabled
                          ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                          : 'bg-zinc-700'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        config.call_recording_enabled ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* GDPR-meddelande */}
                  {config.call_recording_enabled && (
                    <div>
                      <label className="block text-sm text-zinc-400 mb-2">
                        GDPR-meddelande (spelas upp innan samtalet kopplas)
                      </label>
                      <textarea
                        value={config.call_recording_consent_message || ''}
                        onChange={(e) => setConfig({
                          ...config,
                          call_recording_consent_message: e.target.value
                        })}
                        placeholder="Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål."
                        rows={3}
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                      />
                      <p className="text-xs text-zinc-600 mt-1">
                        Enligt GDPR måste du informera att samtalet spelas in
                      </p>
                    </div>
                  )}

                  {/* Info om vad som händer */}
                  <div className="p-4 bg-violet-500/10 border border-violet-500/30 rounded-xl">
                    <p className="text-sm text-violet-300">
                      <strong>Så här fungerar det:</strong>
                    </p>
                    <ol className="mt-2 space-y-1 text-sm text-zinc-400">
                      <li>1. Kund ringer ditt Handymate-nummer</li>
                      <li>2. GDPR-meddelandet spelas upp</li>
                      <li>3. Samtalet kopplas till din mobil</li>
                      <li>4. Inspelningen transkriberas automatiskt</li>
                      <li>5. AI analyserar och skapar förslag (bokningar, offerter, etc.)</li>
                    </ol>
                  </div>

                  {/* Spara-knapp */}
                  <button
                    onClick={handleSavePhoneSettings}
                    disabled={savingPhone}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {savingPhone ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Save className="w-5 h-5" />
                    )}
                    Spara telefoninställningar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invoice Tab */}
        {activeTab === 'invoice' && (
          <div className="space-y-6">
            {/* Betalningsvillkor */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Betalningsvillkor</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Standard betalningsvillkor</label>
                  <select
                    value={config.default_payment_days || 30}
                    onChange={(e) => setConfig({ ...config, default_payment_days: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    <option value={10}>10 dagar</option>
                    <option value={15}>15 dagar</option>
                    <option value={20}>20 dagar</option>
                    <option value={30}>30 dagar</option>
                  </select>
                  <p className="text-xs text-zinc-600 mt-1">Förfallodatum räknas från fakturadatum</p>
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Dröjsmålsränta</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.late_fee_percent || 8}
                      onChange={(e) => setConfig({ ...config, late_fee_percent: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 pr-12"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500">%</span>
                  </div>
                  <p className="text-xs text-zinc-600 mt-1">Referensräntan (2024) + 8% = ca 11.5%</p>
                </div>
              </div>
            </div>

            {/* Betalningsinformation */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Betalningsinformation</h2>
              <p className="text-sm text-zinc-500 mb-4">Visas på fakturor och i påminnelser</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Bankgiro</label>
                  <input
                    type="text"
                    value={config.bankgiro || ''}
                    onChange={(e) => setConfig({ ...config, bankgiro: e.target.value })}
                    placeholder="123-4567"
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm text-zinc-400 mb-2">Swish-nummer</label>
                  <input
                    type="text"
                    value={config.swish_number || ''}
                    onChange={(e) => setConfig({ ...config, swish_number: e.target.value })}
                    placeholder="123 456 78 90"
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Påminnelser */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-violet-400" />
                <h2 className="text-lg font-semibold text-white">Påminnelser</h2>
              </div>

              {/* Auto-påminnelse toggle */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl mb-4">
                <div>
                  <p className="font-medium text-white">Automatiska påminnelser</p>
                  <p className="text-sm text-zinc-500">
                    Skicka påminnelse automatiskt efter förfallodatum
                  </p>
                </div>
                <button
                  onClick={() => setConfig({
                    ...config,
                    auto_reminder_enabled: !config.auto_reminder_enabled
                  })}
                  className={`w-12 h-6 rounded-full transition-all ${
                    config.auto_reminder_enabled
                      ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500'
                      : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    config.auto_reminder_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {config.auto_reminder_enabled && (
                <div className="mb-4">
                  <label className="block text-sm text-zinc-400 mb-2">Skicka påminnelse efter</label>
                  <select
                    value={config.auto_reminder_days || 7}
                    onChange={(e) => setConfig({ ...config, auto_reminder_days: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    <option value={3}>3 dagar efter förfall</option>
                    <option value={5}>5 dagar efter förfall</option>
                    <option value={7}>7 dagar efter förfall</option>
                    <option value={14}>14 dagar efter förfall</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm text-zinc-400 mb-2">Påminnelse-mall (SMS)</label>
                <textarea
                  value={config.reminder_sms_template || ''}
                  onChange={(e) => setConfig({ ...config, reminder_sms_template: e.target.value })}
                  placeholder="Påminnelse: Faktura {invoice_number} på {amount} kr förföll {due_date}. Betala till bankgiro {bankgiro} eller Swish {swish}. //{business_name}"
                  rows={4}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
                <div className="mt-2 text-xs text-zinc-600">
                  <p className="font-medium mb-1">Tillgängliga variabler:</p>
                  <div className="flex flex-wrap gap-2">
                    {['{invoice_number}', '{amount}', '{due_date}', '{ocr}', '{business_name}', '{days_overdue}', '{late_fee_percent}'].map(v => (
                      <code key={v} className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-400">{v}</code>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            {/* Fortnox Integration */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-[#1A3A32]">
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">Fortnox</h2>
                  <p className="text-sm text-zinc-500">Bokföring och fakturering</p>
                </div>
              </div>

              {fortnoxStatus?.connected ? (
                // Kopplad
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-400" />
                        <div>
                          <p className="font-medium text-white">Kopplad till Fortnox</p>
                          <p className="text-sm text-zinc-400">{fortnoxStatus.companyName || 'Företag'}</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-emerald-500/20 text-emerald-400 text-xs rounded-lg">
                        Aktiv
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-zinc-800/50 rounded-xl">
                      <p className="text-xs text-zinc-500">Kopplad sedan</p>
                      <p className="text-sm text-white">
                        {fortnoxStatus.connectedAt
                          ? new Date(fortnoxStatus.connectedAt).toLocaleDateString('sv-SE')
                          : '-'
                        }
                      </p>
                    </div>
                    <div className="p-3 bg-zinc-800/50 rounded-xl">
                      <p className="text-xs text-zinc-500">Token giltig till</p>
                      <p className="text-sm text-white">
                        {fortnoxStatus.expiresAt
                          ? new Date(fortnoxStatus.expiresAt).toLocaleDateString('sv-SE')
                          : '-'
                        }
                      </p>
                    </div>
                  </div>

                  {/* Kundsynkronisering */}
                  <div className="p-4 bg-zinc-800/50 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-white">Kundsynkronisering</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleSyncCustomersToFortnox}
                        disabled={syncingCustomers}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500/20 border border-violet-500/30 rounded-xl text-sm text-violet-300 hover:bg-violet-500/30 disabled:opacity-50 transition-colors"
                      >
                        {syncingCustomers ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Synka till Fortnox
                      </button>
                      <button
                        onClick={handleImportCustomersFromFortnox}
                        disabled={importingCustomers}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-700/50 border border-zinc-600 rounded-xl text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                      >
                        {importingCustomers ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Importera från Fortnox
                      </button>
                    </div>
                    {syncResult && (
                      <div className="text-xs text-zinc-500">
                        {syncResult.synced !== undefined && `${syncResult.synced} kunder synkade`}
                        {syncResult.imported !== undefined && `${syncResult.imported} kunder importerade`}
                        {syncResult.failed !== undefined && syncResult.failed > 0 && ` (${syncResult.failed} misslyckades)`}
                      </div>
                    )}
                  </div>

                  {/* Fakturasynkronisering */}
                  <div className="p-4 bg-zinc-800/50 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-white">Fakturasynkronisering</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleSyncInvoicesToFortnox}
                        disabled={syncingInvoices}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-violet-500/20 border border-violet-500/30 rounded-xl text-sm text-violet-300 hover:bg-violet-500/30 disabled:opacity-50 transition-colors"
                      >
                        {syncingInvoices ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Upload className="w-4 h-4" />
                        )}
                        Synka fakturor
                      </button>
                      <button
                        onClick={handleSyncPayments}
                        disabled={syncingPayments}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-700/50 border border-zinc-600 rounded-xl text-sm text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 transition-colors"
                      >
                        {syncingPayments ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        Hämta betalningar
                      </button>
                    </div>
                    {invoiceSyncResult && (
                      <div className="text-xs text-zinc-500">
                        {invoiceSyncResult.synced !== undefined && `${invoiceSyncResult.synced} fakturor synkade`}
                        {invoiceSyncResult.updated !== undefined && `${invoiceSyncResult.updated} betalningar uppdaterade`}
                        {invoiceSyncResult.unchanged !== undefined && `, ${invoiceSyncResult.unchanged} oförändrade`}
                        {invoiceSyncResult.failed !== undefined && invoiceSyncResult.failed > 0 && ` (${invoiceSyncResult.failed} misslyckades)`}
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-zinc-800/50 rounded-xl">
                    <p className="text-sm text-zinc-400 mb-3">Med Fortnox kopplat kan du:</p>
                    <ul className="space-y-2 text-sm text-zinc-300">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        Synka kunder automatiskt
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        Exportera fakturor till bokföringen
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-400" />
                        Hämta artiklar och priser
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleDisconnectFortnox}
                    disabled={disconnectingFortnox}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-colors"
                  >
                    {disconnectingFortnox ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                    Koppla bort Fortnox
                  </button>
                </div>
              ) : (
                // Ej kopplad
                <div className="space-y-4">
                  <div className="p-4 bg-zinc-800/50 rounded-xl">
                    <p className="text-sm text-zinc-400 mb-3">Koppla Fortnox för att:</p>
                    <ul className="space-y-2 text-sm text-zinc-300">
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                        Synkronisera kunder mellan systemen
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                        Exportera fakturor direkt till bokföringen
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                        Importera artiklar och prislista
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                        Automatisk bokföring av betalningar
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleConnectFortnox}
                    disabled={fortnoxLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {fortnoxLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-5 h-5" />
                    )}
                    Koppla Fortnox-konto
                  </button>

                  <p className="text-xs text-zinc-600 text-center">
                    Du kommer att omdirigeras till Fortnox för att godkänna kopplingen
                  </p>
                </div>
              )}
            </div>

            {/* Fler integrationer kommer */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h3 className="text-lg font-semibold text-white mb-2">Fler integrationer</h3>
              <p className="text-sm text-zinc-500 mb-4">Kommande integrationer för Handymate</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { name: 'Google Calendar', desc: 'Synka bokningar', soon: true },
                  { name: 'Visma', desc: 'Bokföring', soon: true },
                  { name: 'Björn Lundén', desc: 'Bokföring', soon: true },
                  { name: 'Zapier', desc: 'Automatisering', soon: true },
                ].map((integration) => (
                  <div
                    key={integration.name}
                    className="p-4 bg-zinc-800/30 border border-zinc-700/50 rounded-xl opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">{integration.name}</p>
                        <p className="text-xs text-zinc-500">{integration.desc}</p>
                      </div>
                      <span className="px-2 py-1 bg-zinc-700 text-zinc-400 text-xs rounded">
                        Kommer snart
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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
