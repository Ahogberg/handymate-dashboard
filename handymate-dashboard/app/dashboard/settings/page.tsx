'use client'

import Link from 'next/link'
import { ChevronRight, FileText, TrendingUp } from 'lucide-react'
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
  Upload,
  Trash2,
  Pencil,
  Package,
  CalendarDays,
  UsersRound
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import dynamic from 'next/dynamic'
const TeamPageContent = dynamic(() => import('@/app/dashboard/team/page'), {
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
    </div>
  ),
})

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
  // Tidrapport
  default_hourly_rate: number
  time_rounding_minutes: number
  time_require_description: boolean
}

interface FortnoxStatus {
  connected: boolean
  companyName: string | null
  connectedAt: string | null
  expiresAt: string | null
}

interface WorkType {
  work_type_id: string
  name: string
  multiplier: number
  billable_default: boolean
  sort_order: number
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
    return <div className="text-gray-400">Laddar...</div>
  }

  const percentUsed = Math.min(100, (usage.sent / included) * 100)

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-500">Använda SMS</span>
          <span className="text-sm text-gray-900 font-medium">{usage.sent} / {included}</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full transition-all ${
              percentUsed > 90 ? 'bg-red-500' : percentUsed > 70 ? 'bg-amber-500' : 'bg-gradient-to-r from-blue-500 to-cyan-500'
            }`}
            style={{ width: `${percentUsed}%` }}
          />
        </div>
        {percentUsed > 90 && (
          <p className="text-xs text-amber-600 mt-2">
            ⚠️ Du närmar dig gränsen. Överskjutande SMS kostar {overageRate} kr/st.
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xl font-bold text-gray-900">{usage.sent}</p>
          <p className="text-xs text-gray-400">Skickade</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xl font-bold text-emerald-600">{usage.delivered}</p>
          <p className="text-xs text-gray-400">Levererade</p>
        </div>
        <div className="p-3 bg-gray-50 rounded-xl text-center">
          <p className="text-xl font-bold text-red-600">{usage.failed}</p>
          <p className="text-xs text-gray-400">Misslyckade</p>
        </div>
      </div>

      {overage > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-amber-600 font-medium">Överskjutande SMS</p>
              <p className="text-sm text-amber-600/70">{overage} SMS × {overageRate} kr</p>
            </div>
            <p className="text-xl font-bold text-amber-600">{overageCost.toFixed(0)} kr</p>
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

  // Google Calendar integration state
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null; calendarId: string | null; syncDirection: string; lastSyncAt: string | null; syncError: string | null } | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [googleSyncResult, setGoogleSyncResult] = useState<any>(null)

  // Time tracking state
  const [workTypes, setWorkTypes] = useState<WorkType[]>([])
  const [editingWorkType, setEditingWorkType] = useState<WorkType | null>(null)
  const [newWorkType, setNewWorkType] = useState({ name: '', multiplier: 1.0, billable_default: true })
  const [showAddWorkType, setShowAddWorkType] = useState(false)
  const [savingWorkType, setSavingWorkType] = useState(false)

  // Grossist state
  const [grossistSuppliers, setGrossistSuppliers] = useState<any[]>([])
  const [connectingSupplier, setConnectingSupplier] = useState<string | null>(null)
  const [credentialForm, setCredentialForm] = useState<Record<string, string>>({})
  const [connectLoading, setConnectLoading] = useState(false)
  const [syncLoading, setSyncLoading] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
    fetchFortnoxStatus()
    fetchGoogleStatus()
    fetchWorkTypes()
    fetchGrossistStatus()
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

    // Handle tab param
    const tabParam = searchParams.get('tab')
    if (tabParam === 'team') {
      setActiveTab('team')
    }

    // Handle Google Calendar OAuth callback
    const googleParam = searchParams.get('google')
    if (googleParam === 'connected') {
      setActiveTab('integrations')
      showToast('Google Calendar kopplat!', 'success')
      fetchGoogleStatus()
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (googleParam === 'error') {
      setActiveTab('integrations')
      const message = searchParams.get('message') || 'Kunde inte koppla Google Calendar'
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

  async function fetchGoogleStatus() {
    try {
      const response = await fetch('/api/google/status')
      if (response.ok) {
        const data = await response.json()
        setGoogleStatus(data)
      }
    } catch (error) {
      console.error('Failed to fetch Google Calendar status:', error)
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
          plusgiro: (config as any).plusgiro || null,
          f_skatt_registered: (config as any).f_skatt_registered || false,
          swish_number: config.swish_number || null,
          reminder_sms_template: config.reminder_sms_template || null,
          auto_reminder_enabled: config.auto_reminder_enabled || false,
          auto_reminder_days: config.auto_reminder_days || 7,
          late_fee_percent: config.late_fee_percent || 8,
          // Tidrapport-inställningar
          default_hourly_rate: config.default_hourly_rate || 500,
          time_rounding_minutes: config.time_rounding_minutes || 15,
          time_require_description: config.time_require_description || false,
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

  // Google Calendar handlers
  const handleConnectGoogle = () => {
    setGoogleLoading(true)
    window.location.href = '/api/google/connect'
  }

  const handleDisconnectGoogle = async () => {
    try {
      const res = await fetch('/api/google/disconnect', { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setGoogleStatus(null)
      showToast('Google Calendar bortkopplad', 'success')
    } catch {
      showToast('Kunde inte koppla bort', 'error')
    }
  }

  const handleGoogleSync = async () => {
    setGoogleSyncing(true)
    setGoogleSyncResult(null)
    try {
      const res = await fetch('/api/google/sync', { method: 'POST' })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setGoogleSyncResult(data)
      // Refresh status
      const statusRes = await fetch('/api/google/status')
      if (statusRes.ok) setGoogleStatus(await statusRes.json())
      showToast('Kalendersynk klar!', 'success')
    } catch {
      showToast('Synkning misslyckades', 'error')
    } finally {
      setGoogleSyncing(false)
    }
  }

  const handleChangeSyncDirection = async (direction: string) => {
    if (!googleStatus?.connected) return
    try {
      const { error } = await supabase
        .from('calendar_connection')
        .update({ sync_direction: direction })
        .eq('account_email', googleStatus.email)
      if (!error) {
        setGoogleStatus(prev => prev ? { ...prev, syncDirection: direction } : null)
      }
    } catch { /* ignore */ }
  }

  async function fetchGrossistStatus() {
    try {
      const res = await fetch(`/api/grossist?businessId=${business.business_id}`)
      if (res.ok) {
        const data = await res.json()
        setGrossistSuppliers(data.suppliers || [])
      }
    } catch (e) { console.error(e) }
  }

  async function handleConnectGrossist() {
    if (!connectingSupplier) return
    setConnectLoading(true)
    try {
      const res = await fetch('/api/grossist/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_key: connectingSupplier,
          credentials: credentialForm
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast('Grossist ansluten!', 'success')
      setConnectingSupplier(null)
      setCredentialForm({})
      fetchGrossistStatus()
    } catch (e: any) {
      showToast(e.message, 'error')
    }
    setConnectLoading(false)
  }

  async function handleDisconnectGrossist(supplierKey: string) {
    if (!confirm('Vill du koppla bort denna grossist?')) return
    try {
      const res = await fetch(`/api/grossist/connect?supplierKey=${supplierKey}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      showToast('Grossist bortkopplad', 'success')
      fetchGrossistStatus()
    } catch (e: any) {
      showToast(e.message, 'error')
    }
  }

  async function handleSyncPrices(supplierKey: string) {
    setSyncLoading(supplierKey)
    try {
      const res = await fetch('/api/grossist/sync-prices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplier_key: supplierKey })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      showToast(`${data.synced} priser uppdaterade`, 'success')
      fetchGrossistStatus()
    } catch (e: any) {
      showToast(e.message, 'error')
    }
    setSyncLoading(null)
  }

  async function fetchWorkTypes() {
    try {
      const response = await fetch('/api/work-types')
      if (response.ok) {
        const data = await response.json()
        setWorkTypes(data.workTypes || [])
      }
    } catch (error) {
      console.error('Failed to fetch work types:', error)
    }
  }

  const handleAddWorkType = async () => {
    if (!newWorkType.name.trim()) return
    setSavingWorkType(true)
    try {
      const response = await fetch('/api/work-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newWorkType)
      })
      if (response.ok) {
        showToast('Arbetstyp tillagd', 'success')
        setNewWorkType({ name: '', multiplier: 1.0, billable_default: true })
        setShowAddWorkType(false)
        fetchWorkTypes()
      } else {
        const data = await response.json()
        throw new Error(data.error || 'Kunde inte skapa arbetstyp')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSavingWorkType(false)
    }
  }

  const handleUpdateWorkType = async (wt: WorkType) => {
    setSavingWorkType(true)
    try {
      const response = await fetch('/api/work-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_type_id: wt.work_type_id,
          name: wt.name,
          multiplier: wt.multiplier,
          billable_default: wt.billable_default
        })
      })
      if (response.ok) {
        showToast('Arbetstyp uppdaterad', 'success')
        setEditingWorkType(null)
        fetchWorkTypes()
      } else {
        const data = await response.json()
        throw new Error(data.error || 'Kunde inte uppdatera')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSavingWorkType(false)
    }
  }

  const handleDeleteWorkType = async (id: string) => {
    if (!confirm('Är du säker? Arbetstypen kan inte tas bort om den används.')) return
    try {
      const response = await fetch(`/api/work-types?workTypeId=${id}`, { method: 'DELETE' })
      if (response.ok) {
        showToast('Arbetstyp borttagen', 'success')
        fetchWorkTypes()
      } else {
        const data = await response.json()
        throw new Error(data.error || 'Kunde inte ta bort')
      }
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
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
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Kunde inte ladda inställningar</div>
      </div>
    )
  }

  const tabs = [
    { id: 'company', label: 'Företag', icon: Building2 },
    { id: 'hours', label: 'Öppettider', icon: Clock },
    { id: 'phone', label: 'Telefoni', icon: PhoneCall },
    { id: 'invoice', label: 'Faktura', icon: Receipt },
    { id: 'time', label: 'Tidrapport', icon: Clock },
    { id: 'team', label: 'Team', icon: UsersRound },
    { id: 'integrations', label: 'Integrationer', icon: Link2 },
    { id: 'pipeline', label: 'Pipeline', icon: TrendingUp },
    { id: 'ai', label: 'AI-assistent', icon: Bot },
    { id: 'subscription', label: 'Prenumeration', icon: CreditCard },
  ]

  const currentPlan = config.subscription_plan || 'Starter'

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Inställningar</h1>
            <p className="text-gray-500">Konfigurera ditt företag och AI-assistent</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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
                  ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                  : 'bg-white text-gray-500 hover:text-white border border-gray-200'
              }`}
            >
              <tab.icon className="w-4 h-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Company Tab */}
        {activeTab === 'company' && (
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Företagsinformation</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Building2 className="w-4 h-4" />
                  Företagsnamn
                </label>
                <input
                  type="text"
                  value={config.business_name || ''}
                  onChange={(e) => setConfig({ ...config, business_name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">Visas i SMS och används av AI-assistenten</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  Kontaktperson
                </label>
                <input
                  type="text"
                  value={config.contact_name || ''}
                  onChange={(e) => setConfig({ ...config, contact_name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Mail className="w-4 h-4" />
                  E-post
                </label>
                <input
                  type="email"
                  value={config.contact_email || ''}
                  onChange={(e) => setConfig({ ...config, contact_email: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <Phone className="w-4 h-4" />
                  Telefon
                </label>
                <input
                  type="tel"
                  value={config.phone_number || ''}
                  onChange={(e) => setConfig({ ...config, phone_number: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  <MapPin className="w-4 h-4" />
                  Tjänsteområde
                </label>
                <input
                  type="text"
                  value={config.service_area || ''}
                  onChange={(e) => setConfig({ ...config, service_area: e.target.value })}
                  placeholder="T.ex. Stockholm, Solna, Sundbyberg"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">AI-assistenten berättar för kunder var ni jobbar</p>
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  Organisationsnummer
                </label>
                <input
                  type="text"
                  value={(config as any).org_number || ''}
                  onChange={(e) => setConfig({ ...config, org_number: e.target.value } as any)}
                  placeholder="XXXXXX-XXXX"
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">Visas på offerter och fakturor</p>
              </div>
            </div>

            {/* Länk till prislista */}
            <Link
              href="/dashboard/settings/pricelist"
              className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-300 hover:border-blue-300 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-300">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Grossistprislista</p>
                  <p className="text-sm text-gray-400">Hantera leverantörer och produktpriser</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </Link>

            <div>
              <label className="text-sm text-gray-500 mb-2 block">Tjänster ni erbjuder</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {config.services_offered?.map((service) => (
                  <span key={service} className="flex items-center px-3 py-1.5 bg-blue-100 border border-blue-300 rounded-lg text-sm text-blue-500">
                    {service}
                    <button onClick={() => removeService(service)} className="ml-2 text-blue-600 hover:text-gray-900">
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
                  className="flex-1 px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
                <button
                  onClick={addService}
                  className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {SERVICE_SUGGESTIONS.filter(s => !config.services_offered?.includes(s)).slice(0, 6).map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setConfig({ ...config, services_offered: [...(config.services_offered || []), suggestion] })}
                    className="px-2 py-1 bg-gray-50 border border-gray-300/50 rounded-lg text-xs text-gray-400 hover:text-gray-900 hover:border-gray-300"
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
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Öppettider</h2>
            <p className="text-sm text-gray-400 mb-6">AI-assistenten bokar endast tider inom dessa tider</p>
            
            <div className="space-y-4">
              {Object.entries(workingHours).map(([day, hours]) => (
                <div key={day} className="flex flex-col sm:flex-row sm:items-center gap-4 p-4 bg-gray-50 rounded-xl">
                  <label className="flex items-center gap-3 sm:w-32">
                    <input
                      type="checkbox"
                      checked={hours.enabled}
                      onChange={(e) => updateHours(day, 'enabled', e.target.checked)}
                      className="w-5 h-5 rounded border-gray-300 bg-gray-200 text-blue-600 focus:ring-blue-500/50"
                    />
                    <span className={`font-medium ${hours.enabled ? 'text-gray-900' : 'text-gray-400'}`}>
                      {DAY_NAMES[day]}
                    </span>
                  </label>
                  
                  {hours.enabled ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        value={hours.open}
                        onChange={(e) => updateHours(day, 'open', e.target.value)}
                        className="px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                      <span className="text-gray-400">–</span>
                      <input
                        type="time"
                        value={hours.close}
                        onChange={(e) => updateHours(day, 'close', e.target.value)}
                        className="px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                      />
                    </div>
                  ) : (
                    <span className="text-gray-400">Stängt</span>
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
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Ditt Handymate-nummer</h2>

              {config.assigned_phone_number ? (
                // Har redan ett nummer
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-300 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-xl">
                          <Phone className="w-6 h-6 text-gray-900" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-gray-900">{config.assigned_phone_number}</p>
                          <p className="text-sm text-gray-500">Ditt kundnummer för samtal</p>
                        </div>
                      </div>
                      <button
                        onClick={handleRemovePhone}
                        disabled={provisioning}
                        className="px-3 py-1.5 text-red-600 hover:bg-red-50 rounded-lg text-sm"
                      >
                        Ta bort
                      </button>
                    </div>
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-500 mb-1">Vidarekopplas till</p>
                    <input
                      type="tel"
                      value={config.forward_phone_number || ''}
                      onChange={(e) => setConfig({ ...config, forward_phone_number: e.target.value })}
                      placeholder="+46701234567"
                      className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <p className="text-xs text-gray-400 mt-1">Din mobil eller fast telefon dit samtal kopplas</p>
                  </div>
                </div>
              ) : (
                // Inget nummer - visa formulär för att tilldela
                <div className="space-y-4">
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-gray-900">Inget telefonnummer tilldelat</p>
                        <p className="text-sm text-gray-500 mt-1">
                          För att ta emot samtal via Handymate behöver du ett telefonnummer.
                          Kunder ringer detta nummer och samtalet spelas in och analyseras av AI.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-500 mb-2">Ditt mobilnummer (för vidarekoppling)</label>
                    <input
                      type="tel"
                      value={forwardNumber}
                      onChange={(e) => setForwardNumber(e.target.value)}
                      placeholder="+46701234567"
                      className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Samtal till ditt Handymate-nummer kopplas hit efter GDPR-meddelandet
                    </p>
                  </div>

                  <button
                    onClick={handleProvisionPhone}
                    disabled={provisioning || !forwardNumber.trim()}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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
              <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Mic className="w-5 h-5 text-blue-600" />
                  <h2 className="text-lg font-semibold text-gray-900">Samtalsinspelning</h2>
                </div>

                <div className="space-y-4">
                  {/* Toggle inspelning */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900">Spela in samtal</p>
                      <p className="text-sm text-gray-400">
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
                          ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                          : 'bg-gray-200'
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
                      <label className="block text-sm text-gray-500 mb-2">
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
                        className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Enligt GDPR måste du informera att samtalet spelas in
                      </p>
                    </div>
                  )}

                  {/* Info om vad som händer */}
                  <div className="p-4 bg-blue-50 border border-blue-300 rounded-xl">
                    <p className="text-sm text-blue-500">
                      <strong>Så här fungerar det:</strong>
                    </p>
                    <ol className="mt-2 space-y-1 text-sm text-gray-500">
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
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Betalningsvillkor</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Standard betalningsvillkor</label>
                  <select
                    value={config.default_payment_days || 30}
                    onChange={(e) => setConfig({ ...config, default_payment_days: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value={10}>10 dagar</option>
                    <option value={15}>15 dagar</option>
                    <option value={20}>20 dagar</option>
                    <option value={30}>30 dagar</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Förfallodatum räknas från fakturadatum</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Dröjsmålsränta</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.late_fee_percent || 8}
                      onChange={(e) => setConfig({ ...config, late_fee_percent: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-12"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Referensräntan (2024) + 8% = ca 11.5%</p>
                </div>
              </div>
            </div>

            {/* F-skatt */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Skatteuppgifter</h2>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900">Godkänd för F-skatt</p>
                  <p className="text-sm text-gray-400">Visas på offerter och fakturor</p>
                </div>
                <button
                  onClick={() => setConfig({
                    ...config!,
                    ...(({ f_skatt_registered: !(config as any).f_skatt_registered }) as any)
                  } as any)}
                  className={`w-12 h-6 rounded-full transition-all ${
                    (config as any).f_skatt_registered
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                      : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    (config as any).f_skatt_registered ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>

            {/* Betalningsinformation */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Betalningsinformation</h2>
              <p className="text-sm text-gray-400 mb-4">Visas på fakturor och i påminnelser</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Bankgiro</label>
                  <input
                    type="text"
                    value={config.bankgiro || ''}
                    onChange={(e) => setConfig({ ...config, bankgiro: e.target.value })}
                    placeholder="123-4567"
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Plusgiro</label>
                  <input
                    type="text"
                    value={(config as any).plusgiro || ''}
                    onChange={(e) => setConfig({ ...config, ...(({ plusgiro: e.target.value }) as any) } as any)}
                    placeholder="12 34 56-7"
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Swish-nummer</label>
                  <input
                    type="text"
                    value={config.swish_number || ''}
                    onChange={(e) => setConfig({ ...config, swish_number: e.target.value })}
                    placeholder="123 456 78 90"
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
            </div>

            {/* Påminnelser */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-gray-900">Påminnelser</h2>
              </div>

              {/* Auto-påminnelse toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-4">
                <div>
                  <p className="font-medium text-gray-900">Automatiska påminnelser</p>
                  <p className="text-sm text-gray-400">
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
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                      : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    config.auto_reminder_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {config.auto_reminder_enabled && (
                <div className="mb-4">
                  <label className="block text-sm text-gray-500 mb-2">Skicka påminnelse efter</label>
                  <select
                    value={config.auto_reminder_days || 7}
                    onChange={(e) => setConfig({ ...config, auto_reminder_days: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value={3}>3 dagar efter förfall</option>
                    <option value={5}>5 dagar efter förfall</option>
                    <option value={7}>7 dagar efter förfall</option>
                    <option value={14}>14 dagar efter förfall</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-2">Påminnelse-mall (SMS)</label>
                <textarea
                  value={config.reminder_sms_template || ''}
                  onChange={(e) => setConfig({ ...config, reminder_sms_template: e.target.value })}
                  placeholder="Påminnelse: Faktura {invoice_number} på {amount} kr förföll {due_date}. Betala till bankgiro {bankgiro} eller Swish {swish}. //{business_name}"
                  rows={4}
                  className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
                <div className="mt-2 text-xs text-gray-400">
                  <p className="font-medium mb-1">Tillgängliga variabler:</p>
                  <div className="flex flex-wrap gap-2">
                    {['{invoice_number}', '{amount}', '{due_date}', '{ocr}', '{business_name}', '{days_overdue}', '{late_fee_percent}'].map(v => (
                      <code key={v} className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-500">{v}</code>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Time Tracking Tab */}
        {activeTab === 'time' && (
          <div className="space-y-6">
            {/* Grundinställningar */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tidrapportering</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Standard timpris</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.default_hourly_rate || 500}
                      onChange={(e) => setConfig({ ...config, default_hourly_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr/tim</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Används som standard för nya tidrapporter</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Tidsavrundning</label>
                  <select
                    value={config.time_rounding_minutes || 15}
                    onChange={(e) => setConfig({ ...config, time_rounding_minutes: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  >
                    <option value={1}>1 minut (ingen avrundning)</option>
                    <option value={5}>5 minuter</option>
                    <option value={15}>15 minuter</option>
                    <option value={30}>30 minuter</option>
                    <option value={60}>60 minuter</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Tid avrundas uppåt till närmaste intervall</p>
                </div>
              </div>

              {/* Kräv beskrivning toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mt-6">
                <div>
                  <p className="font-medium text-gray-900">Kräv beskrivning</p>
                  <p className="text-sm text-gray-400">Tidrapporter måste ha en beskrivning</p>
                </div>
                <button
                  onClick={() => setConfig({
                    ...config,
                    time_require_description: !config.time_require_description
                  })}
                  className={`w-12 h-6 rounded-full transition-all ${
                    config.time_require_description
                      ? 'bg-gradient-to-r from-blue-500 to-cyan-500'
                      : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    config.time_require_description ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>

            {/* Arbetstyper */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Arbetstyper</h2>
                  <p className="text-sm text-gray-400">Kategorisera tid med multiplikatorer</p>
                </div>
                <button
                  onClick={() => setShowAddWorkType(!showAddWorkType)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-100 border border-blue-300 rounded-xl text-sm text-blue-500 hover:bg-blue-500/30"
                >
                  <Plus className="w-4 h-4" />
                  Lägg till
                </button>
              </div>

              {/* Add form */}
              {showAddWorkType && (
                <div className="p-4 bg-gray-50 rounded-xl mb-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      type="text"
                      value={newWorkType.name}
                      onChange={(e) => setNewWorkType({ ...newWorkType, name: e.target.value })}
                      placeholder="Namn på arbetstyp"
                      className="px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={newWorkType.multiplier}
                        onChange={(e) => setNewWorkType({ ...newWorkType, multiplier: parseFloat(e.target.value) || 1.0 })}
                        className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">x</span>
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={newWorkType.billable_default}
                        onChange={(e) => setNewWorkType({ ...newWorkType, billable_default: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 bg-gray-200 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">Fakturerbar</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddWorkType}
                      disabled={!newWorkType.name.trim() || savingWorkType}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-sm text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {savingWorkType ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Spara
                    </button>
                    <button
                      onClick={() => { setShowAddWorkType(false); setNewWorkType({ name: '', multiplier: 1.0, billable_default: true }) }}
                      className="px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-sm text-gray-500 hover:text-gray-900"
                    >
                      Avbryt
                    </button>
                  </div>
                </div>
              )}

              {/* Work types list */}
              <div className="space-y-2">
                {workTypes.map((wt) => (
                  <div key={wt.work_type_id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    {editingWorkType?.work_type_id === wt.work_type_id ? (
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
                        <input
                          type="text"
                          value={editingWorkType.name}
                          onChange={(e) => setEditingWorkType({ ...editingWorkType, name: e.target.value })}
                          className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                        />
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            value={editingWorkType.multiplier}
                            onChange={(e) => setEditingWorkType({ ...editingWorkType, multiplier: parseFloat(e.target.value) || 1.0 })}
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">x</span>
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingWorkType.billable_default}
                            onChange={(e) => setEditingWorkType({ ...editingWorkType, billable_default: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 bg-gray-200 text-blue-600"
                          />
                          <span className="text-xs text-gray-700">Fakturerbar</span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateWorkType(editingWorkType)}
                            disabled={savingWorkType}
                            className="px-3 py-1.5 bg-blue-100 border border-blue-300 rounded-lg text-xs text-blue-500 hover:bg-blue-500/30 disabled:opacity-50"
                          >
                            Spara
                          </button>
                          <button
                            onClick={() => setEditingWorkType(null)}
                            className="px-3 py-1.5 bg-gray-200 rounded-lg text-xs text-gray-500 hover:text-gray-900"
                          >
                            Avbryt
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="font-medium text-gray-900">{wt.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-500 text-xs rounded-lg">
                                {wt.multiplier}x
                              </span>
                              {wt.billable_default ? (
                                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs rounded-lg">
                                  Fakturerbar
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 bg-gray-200 text-gray-500 text-xs rounded-lg">
                                  Ej fakturerbar
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingWorkType(wt)}
                            className="p-2 hover:bg-gray-200 rounded-lg text-gray-500 hover:text-gray-900 transition-colors"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteWorkType(wt.work_type_id)}
                            className="p-2 hover:bg-red-50 rounded-lg text-gray-500 hover:text-red-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {workTypes.length === 0 && (
                  <div className="text-center py-8 text-gray-400">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Inga arbetstyper ännu</p>
                    <p className="text-xs mt-1">Kör SQL-migrationen för att skapa standardtyper</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Team Tab */}
        {activeTab === 'team' && (
          <TeamPageContent />
        )}

        {/* Integrations Tab */}
        {activeTab === 'integrations' && (
          <div className="space-y-6">
            {/* Google Calendar Integration */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-100">
                  <CalendarDays className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Google Calendar</h2>
                  <p className="text-sm text-gray-400">Tvåvägssynk med Google Calendar</p>
                </div>
              </div>

              {googleStatus?.connected ? (
                <div className="space-y-4">
                  {/* Connected status */}
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="font-medium text-gray-900">Ansluten</p>
                          <p className="text-sm text-gray-500">{googleStatus.email}</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs rounded-lg">Aktiv</span>
                    </div>
                  </div>

                  {/* Sync direction */}
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <label className="text-sm font-medium text-gray-900 block mb-2">Synk-riktning</label>
                    <select
                      value={googleStatus.syncDirection || 'both'}
                      onChange={(e) => handleChangeSyncDirection(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                    >
                      <option value="both">Båda riktningar</option>
                      <option value="export">Endast export (Handymate &rarr; Google)</option>
                      <option value="import">Endast import (Google &rarr; Handymate)</option>
                    </select>
                  </div>

                  {/* Last sync + manual sync */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-400">Senaste synk</p>
                      <p className="text-sm text-gray-900">
                        {googleStatus.lastSyncAt
                          ? new Date(googleStatus.lastSyncAt).toLocaleString('sv-SE')
                          : 'Aldrig'}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-400">Ansluten sedan</p>
                      <p className="text-sm text-gray-900">
                        Ansluten
                      </p>
                    </div>
                  </div>

                  {/* Sync error */}
                  {googleStatus.syncError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                      <p className="text-sm text-red-600">Synkfel: {googleStatus.syncError}</p>
                    </div>
                  )}

                  {/* Sync button */}
                  <button
                    onClick={handleGoogleSync}
                    disabled={googleSyncing}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-100 border border-blue-300 rounded-xl text-blue-500 hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
                  >
                    {googleSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
                    Synka nu
                  </button>

                  {/* Sync result */}
                  {googleSyncResult && (
                    <div className="text-xs text-gray-400">
                      {googleSyncResult.imported > 0 && `${googleSyncResult.imported} importerade`}
                      {googleSyncResult.exported > 0 && `, ${googleSyncResult.exported} exporterade`}
                      {googleSyncResult.updated > 0 && `, ${googleSyncResult.updated} uppdaterade`}
                    </div>
                  )}

                  {/* Features list */}
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-500 mb-3">Med Google Calendar kopplat kan du:</p>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Se dina Google-events i Handymate-kalendern
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Synka Handymate-schema till Google Calendar
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Automatisk synk var 2:a timme
                      </li>
                    </ul>
                  </div>

                  {/* Disconnect */}
                  <button
                    onClick={handleDisconnectGoogle}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors"
                  >
                    <XCircle className="w-4 h-4" />
                    Koppla bort Google Calendar
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-500 mb-3">Koppla Google Calendar för att:</p>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                        Synka ditt schema med Google Calendar
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                        Se externa events som upptagen tid
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                        Automatisk tvåvägssynk
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleConnectGoogle}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {googleLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ExternalLink className="w-5 h-5" />}
                    Anslut Google Calendar
                  </button>

                  <p className="text-xs text-gray-400 text-center">
                    Du omdirigeras till Google för att godkänna åtkomst till din kalender
                  </p>
                </div>
              )}
            </div>

            {/* Outlook Calendar (placeholder) */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 opacity-60">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-blue-600/20">
                  <CalendarDays className="w-6 h-6 text-blue-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Microsoft Outlook</h2>
                  <p className="text-sm text-gray-400">Kommer snart</p>
                </div>
              </div>
              <p className="text-sm text-gray-400">Outlook-kalender integration är under utveckling.</p>
            </div>

            {/* Fortnox Integration */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Fortnox</h2>
                  <p className="text-sm text-gray-400">Bokföring och fakturering</p>
                </div>
              </div>

              {fortnoxStatus?.connected ? (
                // Kopplad
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <p className="font-medium text-gray-900">Kopplad till Fortnox</p>
                          <p className="text-sm text-gray-500">{fortnoxStatus.companyName || 'Företag'}</p>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-emerald-100 text-emerald-600 text-xs rounded-lg">
                        Aktiv
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-400">Kopplad sedan</p>
                      <p className="text-sm text-gray-900">
                        {fortnoxStatus.connectedAt
                          ? new Date(fortnoxStatus.connectedAt).toLocaleDateString('sv-SE')
                          : '-'
                        }
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-400">Token giltig till</p>
                      <p className="text-sm text-gray-900">
                        {fortnoxStatus.expiresAt
                          ? new Date(fortnoxStatus.expiresAt).toLocaleDateString('sv-SE')
                          : '-'
                        }
                      </p>
                    </div>
                  </div>

                  {/* Kundsynkronisering */}
                  <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-gray-900">Kundsynkronisering</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleSyncCustomersToFortnox}
                        disabled={syncingCustomers}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-100 border border-blue-300 rounded-xl text-sm text-blue-500 hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
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
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-200/50 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
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
                      <div className="text-xs text-gray-400">
                        {syncResult.synced !== undefined && `${syncResult.synced} kunder synkade`}
                        {syncResult.imported !== undefined && `${syncResult.imported} kunder importerade`}
                        {syncResult.failed !== undefined && syncResult.failed > 0 && ` (${syncResult.failed} misslyckades)`}
                      </div>
                    )}
                  </div>

                  {/* Fakturasynkronisering */}
                  <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-gray-900">Fakturasynkronisering</p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={handleSyncInvoicesToFortnox}
                        disabled={syncingInvoices}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-100 border border-blue-300 rounded-xl text-sm text-blue-500 hover:bg-blue-500/30 disabled:opacity-50 transition-colors"
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
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gray-200/50 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
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
                      <div className="text-xs text-gray-400">
                        {invoiceSyncResult.synced !== undefined && `${invoiceSyncResult.synced} fakturor synkade`}
                        {invoiceSyncResult.updated !== undefined && `${invoiceSyncResult.updated} betalningar uppdaterade`}
                        {invoiceSyncResult.unchanged !== undefined && `, ${invoiceSyncResult.unchanged} oförändrade`}
                        {invoiceSyncResult.failed !== undefined && invoiceSyncResult.failed > 0 && ` (${invoiceSyncResult.failed} misslyckades)`}
                      </div>
                    )}
                  </div>

                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-500 mb-3">Med Fortnox kopplat kan du:</p>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Synka kunder automatiskt
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Exportera fakturor till bokföringen
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        Hämta artiklar och priser
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleDisconnectFortnox}
                    disabled={disconnectingFortnox}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors"
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
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="text-sm text-gray-500 mb-3">Koppla Fortnox för att:</p>
                    <ul className="space-y-2 text-sm text-gray-700">
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        Synkronisera kunder mellan systemen
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        Exportera fakturor direkt till bokföringen
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        Importera artiklar och prislista
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                        Automatisk bokföring av betalningar
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleConnectFortnox}
                    disabled={fortnoxLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {fortnoxLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <ExternalLink className="w-5 h-5" />
                    )}
                    Koppla Fortnox-konto
                  </button>

                  <p className="text-xs text-gray-400 text-center">
                    Du kommer att omdirigeras till Fortnox för att godkänna kopplingen
                  </p>
                </div>
              )}
            </div>

            {/* Grossist-kopplingar */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500">
                  <Package className="w-5 h-5 text-gray-900" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Grossister</h3>
                  <p className="text-sm text-gray-400">Koppla grossistkonton för produktsök och prisuppdatering</p>
                </div>
              </div>

              <div className="space-y-3">
                {grossistSuppliers.map(supplier => (
                  <div key={supplier.key} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-300/50">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-700">{supplier.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{supplier.name}</p>
                        <p className="text-xs text-gray-400">{supplier.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {supplier.connected ? (
                        <>
                          <span className="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">
                            Kopplad
                          </span>
                          {supplier.last_sync_at && (
                            <span className="text-xs text-gray-400">
                              Synkad {new Date(supplier.last_sync_at).toLocaleDateString('sv-SE')}
                            </span>
                          )}
                          <button
                            onClick={() => handleSyncPrices(supplier.key)}
                            disabled={syncLoading === supplier.key}
                            className="px-3 py-1.5 text-xs bg-blue-100 text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-500/30 disabled:opacity-50"
                          >
                            {syncLoading === supplier.key ? 'Synkar...' : 'Synka priser'}
                          </button>
                          <button
                            onClick={() => handleDisconnectGrossist(supplier.key)}
                            className="px-3 py-1.5 text-xs bg-red-100 text-red-600 border border-red-200 rounded-lg hover:bg-red-500/30"
                          >
                            Koppla bort
                          </button>
                        </>
                      ) : supplier.available ? (
                        <button
                          onClick={() => {
                            setConnectingSupplier(supplier.key)
                            setCredentialForm({})
                          }}
                          className="px-3 py-1.5 text-xs bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:opacity-90"
                        >
                          Anslut
                        </button>
                      ) : (
                        <span className="px-2 py-1 text-xs rounded-full bg-gray-200 text-gray-500">
                          Kommer snart
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Connect modal */}
            {connectingSupplier && (() => {
              const supplier = grossistSuppliers.find((s: any) => s.key === connectingSupplier)
              if (!supplier) return null
              return (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-lg font-semibold text-gray-900">Anslut {supplier.name}</h3>
                      <button onClick={() => setConnectingSupplier(null)} className="text-gray-400 hover:text-gray-900">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="space-y-4">
                      {supplier.credentialFields?.map((field: any) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-gray-500 mb-1">{field.label}</label>
                          <input
                            type={field.type}
                            value={credentialForm[field.key] || ''}
                            onChange={e => setCredentialForm(prev => ({ ...prev, [field.key]: e.target.value }))}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded-lg text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                          />
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3 mt-6">
                      <button
                        onClick={() => setConnectingSupplier(null)}
                        className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        Avbryt
                      </button>
                      <button
                        onClick={handleConnectGrossist}
                        disabled={connectLoading}
                        className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                      >
                        {connectLoading ? 'Ansluter...' : 'Testa & Anslut'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Fler integrationer kommer */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Fler integrationer</h3>
              <p className="text-sm text-gray-400 mb-4">Kommande integrationer för Handymate</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { name: 'Google Calendar', desc: 'Synka bokningar', soon: true },
                  { name: 'Visma', desc: 'Bokföring', soon: true },
                  { name: 'Björn Lundén', desc: 'Bokföring', soon: true },
                  { name: 'Zapier', desc: 'Automatisering', soon: true },
                ].map((integration) => (
                  <div
                    key={integration.name}
                    className="p-4 bg-gray-100/30 border border-gray-300/50 rounded-xl opacity-60"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{integration.name}</p>
                        <p className="text-xs text-gray-400">{integration.desc}</p>
                      </div>
                      <span className="px-2 py-1 bg-gray-200 text-gray-500 text-xs rounded">
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
          <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">AI-assistent</h2>
            <p className="text-sm text-gray-400">Konfigurera hur Lisa svarar på samtal</p>
            
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Hälsningsfras</label>
              <textarea
                value={config.greeting_script || ''}
                onChange={(e) => setConfig({ ...config, greeting_script: e.target.value })}
                placeholder={`Hej och välkommen till ${config.business_name}! Mitt namn är Lisa, hur kan jag hjälpa dig idag?`}
                rows={4}
                className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">Detta säger AI-assistenten när den svarar</p>
              <Link
              href="/dashboard/settings/knowledge"
              className="mt-4 flex items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-300 rounded-xl hover:bg-blue-100 transition-all"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-600" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Knowledge Base</p>
                  <p className="text-xs text-gray-500">Lär AI:n om dina tjänster, priser och policyer</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-600" />
            </Link>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-300 rounded-xl">
              <div className="flex items-start gap-3">
                <Bot className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">AI-röst</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Just nu används "Lisa" (sv-SE-SofieNeural). 
                    Fler röster kommer snart.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-gray-50 border border-gray-300 rounded-xl">
              <div className="flex items-start gap-3">
                <Phone className="w-5 h-5 text-gray-500 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">AI-telefonnummer</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Ditt AI-telefonnummer tilldelas när voice-assistenten aktiveras.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Subscription Tab */}
        {activeTab === 'pipeline' && (
          <PipelineSettings businessId={business.business_id} />
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-6">
            {/* Nuvarande plan */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Din prenumeration</h2>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-blue-500/10 to-cyan-500/10 border border-blue-300 rounded-xl mb-4 gap-4">
                <div>
                  <p className="text-gray-900 font-semibold text-lg">{currentPlan}</p>
                  <p className="text-gray-500 text-sm">
                    {config.subscription_status === 'trial' && trialDaysLeft !== null
                      ? `Provperiod - ${trialDaysLeft} dagar kvar`
                      : 'Aktiv prenumeration'
                    }
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-2xl font-bold text-gray-900">
                    {currentPlan === 'Professional' ? '4 995' : currentPlan === 'Business' ? '9 995' : '1 995'}
                  </p>
                  <p className="text-gray-400 text-sm">kr/mån</p>
                </div>
              </div>

              {config.subscription_status === 'trial' && trialDaysLeft !== null && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <p className="text-amber-600 text-sm">
                    ⏰ Din provperiod går ut om {trialDaysLeft} dagar. Uppgradera för att fortsätta använda tjänsten.
                  </p>
                </div>
              )}
            </div>

            {/* SMS-användning */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SMS-användning denna månad</h2>
              
              <SMSUsageWidget businessId={business.business_id} plan={currentPlan} />
            </div>

            {/* Planöversikt */}
            <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Tillgängliga planer</h2>
              
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
                        ? 'bg-blue-50 border-blue-300' 
                        : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{plan.name}</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">{plan.price} <span className="text-sm text-gray-400">kr/mån</span></p>
                    <div className="mt-3 space-y-1 text-sm text-gray-500">
                      <p>✓ {plan.sms} SMS/mån</p>
                      <p>✓ {plan.calls} samtal/mån</p>
                    </div>
                    {currentPlan === plan.name && (
                      <p className="mt-3 text-xs text-blue-600 font-medium">Nuvarande plan</p>
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

function PipelineSettings({ businessId }: { businessId: string }) {
  const [settings, setSettings] = useState({
    auto_create_leads: true,
    auto_move_on_signature: true,
    auto_move_on_payment: true,
    auto_move_on_project_complete: true,
    ai_analyze_calls: true,
    ai_auto_move_threshold: 80,
    ai_create_lead_threshold: 70,
    show_ai_activity: true,
  })
  const [stages, setStages] = useState<Array<{ id: string; name: string; slug: string; color: string; sort_order: number; is_won: boolean; is_lost: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: string }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    fetchSettings()
  }, [businessId])

  async function fetchSettings() {
    try {
      const [settingsRes, stagesRes] = await Promise.all([
        fetch('/api/pipeline/settings'),
        fetch('/api/pipeline/stages'),
      ])
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(prev => ({ ...prev, ...data }))
      }
      if (stagesRes.ok) {
        const data = await stagesRes.json()
        setStages(data.stages || [])
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  async function saveSettings() {
    setSaving(true)
    try {
      const res = await fetch('/api/pipeline/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        setToast({ show: true, message: 'Inställningar sparade', type: 'success' })
      } else {
        setToast({ show: true, message: 'Kunde inte spara', type: 'error' })
      }
    } catch {
      setToast({ show: true, message: 'Något gick fel', type: 'error' })
    }
    setSaving(false)
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-red-100 text-red-600 border border-red-200'
        }`}>
          {toast.message}
        </div>
      )}

      {/* AI Automation */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">AI-automatisering</h2>
        <p className="text-sm text-gray-400 mb-6">Styr hur pipeline-stegen automatiskt uppdateras</p>

        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700">Automatiskt (händer direkt)</h3>

          {[
            { key: 'auto_create_leads', label: 'Skapa lead från nya samtal' },
            { key: 'auto_move_on_signature', label: 'Flytta till "Accepterad" när offert signeras' },
            { key: 'auto_move_on_payment', label: 'Flytta till "Betalt" när faktura betalas' },
            { key: 'auto_move_on_project_complete', label: 'Flytta till "Faktureras" när projekt markeras klart' },
          ].map(({ key, label }) => (
            <label key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all">
              <span className="text-sm text-gray-900">{label}</span>
              <div
                className={`w-10 h-6 rounded-full transition-all relative cursor-pointer ${
                  (settings as any)[key] ? 'bg-blue-500' : 'bg-gray-200'
                }`}
                onClick={() => setSettings(prev => ({ ...prev, [key]: !(prev as any)[key] }))}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                  (settings as any)[key] ? 'left-5' : 'left-1'
                }`} />
              </div>
            </label>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-700">AI-drivet (baserat på samtalsanalys)</h3>

          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all">
            <span className="text-sm text-gray-900">Analysera samtal och identifiera kundintent</span>
            <div
              className={`w-10 h-6 rounded-full transition-all relative cursor-pointer ${
                settings.ai_analyze_calls ? 'bg-blue-500' : 'bg-gray-200'
              }`}
              onClick={() => setSettings(prev => ({ ...prev, ai_analyze_calls: !prev.ai_analyze_calls }))}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                settings.ai_analyze_calls ? 'left-5' : 'left-1'
              }`} />
            </div>
          </label>

          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-900">Tröskelvärde för automatisk flytt</span>
              <span className="text-sm text-blue-600 font-mono">{settings.ai_auto_move_threshold}%</span>
            </div>
            <input
              type="range"
              min="50"
              max="100"
              value={settings.ai_auto_move_threshold}
              onChange={(e) => setSettings(prev => ({ ...prev, ai_auto_move_threshold: parseInt(e.target.value) }))}
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">AI flyttar deals automatiskt när den är minst så säker</p>
          </div>

          <div className="p-3 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-900">Tröskelvärde för lead-skapande</span>
              <span className="text-sm text-blue-600 font-mono">{settings.ai_create_lead_threshold}%</span>
            </div>
            <input
              type="range"
              min="40"
              max="100"
              value={settings.ai_create_lead_threshold}
              onChange={(e) => setSettings(prev => ({ ...prev, ai_create_lead_threshold: parseInt(e.target.value) }))}
              className="w-full accent-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">AI skapar nya leads när den är minst så säker</p>
          </div>

          <label className="flex items-center justify-between p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all">
            <span className="text-sm text-gray-900">Visa AI-aktivitet i pipeline</span>
            <div
              className={`w-10 h-6 rounded-full transition-all relative cursor-pointer ${
                settings.show_ai_activity ? 'bg-blue-500' : 'bg-gray-200'
              }`}
              onClick={() => setSettings(prev => ({ ...prev, show_ai_activity: !prev.show_ai_activity }))}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                settings.show_ai_activity ? 'left-5' : 'left-1'
              }`} />
            </div>
          </label>
        </div>

        <button
          onClick={saveSettings}
          disabled={saving}
          className="mt-6 flex items-center px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Spara pipeline-inställningar
        </button>
      </div>

      {/* Pipeline Stages */}
      <div className="bg-white shadow-sm rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Pipeline-steg</h2>
        <p className="text-sm text-gray-400 mb-4">Stegen i din säljpipeline</p>

        <div className="space-y-2">
          {stages.filter(s => !s.is_lost).map((stage, i) => (
            <div key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="text-gray-400 text-sm w-6">{i + 1}.</span>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-gray-900 text-sm flex-1">{stage.name}</span>
              {stage.is_won && <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Vunnen</span>}
            </div>
          ))}
          {stages.filter(s => s.is_lost).map((stage) => (
            <div key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border-t border-gray-300 mt-2">
              <span className="text-gray-400 text-sm w-6" />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-gray-900 text-sm flex-1">{stage.name}</span>
              <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">Förlorad</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
