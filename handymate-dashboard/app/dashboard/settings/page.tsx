'use client'

import Link from 'next/link'
import { ChevronRight, FileText, TrendingUp } from 'lucide-react'
import { Fragment, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { PermissionGate } from '@/components/PermissionGate'
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
  Briefcase,
  CalendarDays,
  UsersRound,
  Star,
  RefreshCw,
  Zap,
  MailCheck
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { useBusinessPlan } from '@/lib/useBusinessPlan'
import UpgradePrompt from '@/components/UpgradePrompt'
import dynamic from 'next/dynamic'
const TeamPageContent = dynamic(() => import('@/app/dashboard/team/page'), {
  loading: () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-6 h-6 text-secondary-700 animate-spin" />
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
  logo_url: string | null
  leads_addon: boolean
  // Telefoni
  assigned_phone_number: string | null
  forward_phone_number: string | null
  call_recording_enabled: boolean
  call_recording_consent_message: string | null
  // Faktura
  default_payment_days: number
  bankgiro: string | null
  plusgiro: string | null
  bank_account_number: string | null
  swish_number: string | null
  invoice_prefix: string | null
  next_invoice_number: number
  invoice_footer_text: string | null
  reminder_sms_template: string | null
  auto_reminder_enabled: boolean
  auto_reminder_days: number
  late_fee_percent: number
  penalty_interest: number
  reminder_fee: number
  max_auto_reminders: number
  f_skatt_registered: boolean
  // Tidrapport
  default_hourly_rate: number
  time_rounding_minutes: number
  time_require_description: boolean
  standard_work_hours: number
  overtime_after: number
  break_after_hours: number
  default_break_minutes: number
  require_gps_checkin: boolean
  require_project: boolean
  mileage_rate: number
  allowance_full_day: number
  allowance_half_day: number
  ob1_rate: number
  ob2_rate: number
  overtime_50_rate: number
  overtime_100_rate: number
  // Auto-faktura
  auto_invoice_enabled: boolean
  auto_invoice_send: boolean
  auto_invoice_max_amount: number
  auto_invoice_on_complete: boolean
  // Google Reviews
  google_review_url: string | null
  review_request_enabled: boolean
  review_request_delay_days: number
  website_api_key: string | null
  // Ekonomi
  pricing_settings: Record<string, any> | null
  overhead_monthly_sek: number
  margin_target_percent: number
  // Autopilot
  autopilot_enabled: boolean
  autopilot_auto_book: boolean
  autopilot_auto_sms: boolean
  autopilot_auto_materials: boolean
  autopilot_booking_buffer_days: number
  autopilot_default_duration_hours: number
  four_eyes_enabled: boolean
  four_eyes_threshold_sek: number
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

function AutoInvoiceButton({ businessId, autoSend, maxAmount }: { businessId: string; autoSend: boolean; maxAmount: number }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<{ invoices_created: number; invoices: { customer_name: string; total: number }[]; errors: string[] } | null>(null)

  async function runAutoGenerate() {
    setRunning(true)
    setResult(null)
    try {
      const res = await fetch('/api/invoices/auto-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_send: autoSend, max_amount: maxAmount }),
      })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ invoices_created: 0, invoices: [], errors: ['Nätverksfel'] })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div>
      <button
        onClick={runAutoGenerate}
        disabled={running}
        className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-primary-600 text-white rounded-xl text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center gap-2"
      >
        {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Receipt className="w-4 h-4" />}
        {running ? 'Genererar...' : 'Generera fakturor nu'}
      </button>

      {result && (
        <div className="mt-3 p-3 bg-gray-50 rounded-xl text-sm">
          {result.invoices_created > 0 ? (
            <>
              <p className="font-medium text-emerald-700">
                {result.invoices_created} faktura{result.invoices_created > 1 ? 'or' : ''} skapad{result.invoices_created > 1 ? 'e' : ''}
              </p>
              <ul className="mt-1 space-y-0.5 text-gray-600">
                {result.invoices.map((inv, i) => (
                  <li key={i}>{inv.customer_name}: {inv.total.toLocaleString('sv-SE')} kr</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-gray-500">Inga fakturor att skapa (inga ofakturerade tidrapporter)</p>
          )}
          {result.errors.length > 0 && (
            <div className="mt-2 text-red-600">
              {result.errors.map((err, i) => <p key={i}>{err}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

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
              percentUsed > 90 ? 'bg-red-500' : percentUsed > 70 ? 'bg-amber-500' : 'bg-primary-700'
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
  const { hasFeature: canAccess } = useBusinessPlan()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('company')
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [config, setConfig] = useState<BusinessConfig | null>(null)
  const [workingHours, setWorkingHours] = useState(DEFAULT_HOURS)
  const [newService, setNewService] = useState('')

  // Ekonomi-inställningar
  const [econPrefs, setEconPrefs] = useState<{ hourly_cost_sek: number; overhead_monthly_sek: number; margin_target_percent: number }>({ hourly_cost_sek: 450, overhead_monthly_sek: 0, margin_target_percent: 50 })
  const [econSaving, setEconSaving] = useState(false)

  // Phone provisioning state
  const [forwardNumber, setForwardNumber] = useState('')
  const [provisioning, setProvisioning] = useState(false)
  const [savingPhone, setSavingPhone] = useState(false)
  const [syncingWebhooks, setSyncingWebhooks] = useState(false)
  const [sendingTestSms, setSendingTestSms] = useState(false)
  const [webhookSyncMsg, setWebhookSyncMsg] = useState<{ text: string; ok: boolean } | null>(null)

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
  const [googleStatus, setGoogleStatus] = useState<{ connected: boolean; email: string | null; calendarId: string | null; syncDirection: string; lastSyncAt: string | null; syncError: string | null; gmailScopeGranted?: boolean; gmailSyncEnabled?: boolean; gmailLastSyncAt?: string | null } | null>(null)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [googleSyncing, setGoogleSyncing] = useState(false)
  const [googleSyncResult, setGoogleSyncResult] = useState<any>(null)

  // Gmail lead import state
  const [gmailLeadEnabled, setGmailLeadEnabled] = useState(false)
  const [gmailLeadApprovedSenders, setGmailLeadApprovedSenders] = useState('')
  const [gmailLeadBlockedSenders, setGmailLeadBlockedSenders] = useState('')
  const [gmailLeadLastImport, setGmailLeadLastImport] = useState<string | null>(null)
  const [gmailLeadSaving, setGmailLeadSaving] = useState(false)

  // Google Reviews state
  const [googleReviewUrl, setGoogleReviewUrl] = useState('')
  const [reviewRequestEnabled, setReviewRequestEnabled] = useState(true)
  const [reviewRequestDelayDays, setReviewRequestDelayDays] = useState(3)
  const [reviewStats, setReviewStats] = useState({ sent: 0, clicked: 0 })
  const [quoteSignedEmailEnabled, setQuoteSignedEmailEnabled] = useState(true)
  const [savingReview, setSavingReview] = useState(false)

  // Lead Sources state
  const [leadSources, setLeadSources] = useState<any[]>([])
  const [leadSourcesLoading, setLeadSourcesLoading] = useState(false)
  const [showAddLeadSource, setShowAddLeadSource] = useState(false)
  const [newLeadSourcePlatform, setNewLeadSourcePlatform] = useState('offerta')
  const [newLeadSourceName, setNewLeadSourceName] = useState('')
  const [addingLeadSource, setAddingLeadSource] = useState(false)

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

  // Helper: get Authorization header with current Supabase session token
  async function getAuthHeaders(): Promise<Record<string, string>> {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        return { 'Authorization': `Bearer ${session.access_token}` }
      }
    } catch { /* ignore */ }
    return {}
  }

  useEffect(() => {
    fetchConfig()
    fetchFortnoxStatus()
    fetchGoogleStatus()
    fetchGmailLeadSettings()
    fetchWorkTypes()
    fetchGrossistStatus()
    fetchLeadSources()
  }, [business.business_id])

  // Handle Fortnox OAuth callback
  useEffect(() => {
    const fortnoxParam = searchParams?.get('fortnox')
    if (fortnoxParam === 'connected') {
      setActiveTab('integrations')
      showToast('Fortnox kopplat!', 'success')
      fetchFortnoxStatus()
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (fortnoxParam === 'error') {
      setActiveTab('integrations')
      const message = searchParams?.get('message') || 'Kunde inte koppla Fortnox'
      showToast(message, 'error')
      window.history.replaceState({}, '', '/dashboard/settings')
    }

    // Handle tab param
    const tabParam = searchParams?.get('tab')
    if (tabParam && ['company','hours','phone','invoice','time','team','integrations','pipeline','ai','subscription'].includes(tabParam)) {
      setActiveTab(tabParam)
    }

    // Handle Google Calendar OAuth callback
    const googleParam = searchParams?.get('google')
    if (googleParam === 'connected') {
      setActiveTab('integrations')
      showToast('Google Calendar kopplat!', 'success')
      fetchGoogleStatus()
      window.history.replaceState({}, '', '/dashboard/settings')
    } else if (googleParam === 'error') {
      setActiveTab('integrations')
      const message = searchParams?.get('message') || 'Kunde inte koppla Google Calendar'
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
      const authHeaders = await getAuthHeaders()
      const response = await fetch('/api/google/status', { headers: authHeaders })
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
      // Auto-generera website_api_key om det saknas
      if (!data.website_api_key) {
        const newKey = `HM-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
        await supabase
          .from('business_config')
          .update({ website_api_key: newKey })
          .eq('business_id', business.business_id)
        data.website_api_key = newKey
      }
      setConfig(data)
      setGoogleReviewUrl(data.google_review_url || '')
      setReviewRequestEnabled(data.review_request_enabled ?? true)
      setReviewRequestDelayDays(data.review_request_delay_days ?? 3)

      // Fetch quote signed email toggle from v3_automation_settings
      try {
        const { data: autoSettings } = await supabase
          .from('v3_automation_settings')
          .select('quote_signed_email_enabled')
          .eq('business_id', data.business_id)
          .single()
        if (autoSettings) setQuoteSignedEmailEnabled(autoSettings.quote_signed_email_enabled ?? true)
      } catch { /* table may not exist */ }

      // Fetch review request stats
      const { count: sentCount } = await supabase
        .from('review_request')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', data.business_id)
      const { count: clickedCount } = await supabase
        .from('review_request')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', data.business_id)
        .not('clicked_at', 'is', null)
      setReviewStats({ sent: sentCount || 0, clicked: clickedCount || 0 })

      // Ekonomi-inställningar från business_config
      const ps = (data.pricing_settings as Record<string, any>) || {}
      setEconPrefs({
        hourly_cost_sek: Number(ps.hourly_rate) || 450,
        overhead_monthly_sek: Number(data.overhead_monthly_sek) || 0,
        margin_target_percent: Number(data.margin_target_percent) || 50,
      })

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
          bank_account_number: config.bank_account_number || null,
          f_skatt_registered: (config as any).f_skatt_registered || false,
          swish_number: config.swish_number || null,
          invoice_prefix: config.invoice_prefix || 'FV',
          next_invoice_number: config.next_invoice_number || 1,
          invoice_footer_text: config.invoice_footer_text || null,
          penalty_interest: config.penalty_interest || config.late_fee_percent || 8,
          reminder_fee: config.reminder_fee || 60,
          max_auto_reminders: config.max_auto_reminders || 3,
          reminder_sms_template: config.reminder_sms_template || null,
          auto_reminder_enabled: config.auto_reminder_enabled || false,
          auto_reminder_days: config.auto_reminder_days || 7,
          late_fee_percent: config.late_fee_percent || 8,
          // Tidrapport-inställningar
          default_hourly_rate: config.default_hourly_rate || 500,
          time_rounding_minutes: config.time_rounding_minutes || 15,
          time_require_description: config.time_require_description || false,
          standard_work_hours: config.standard_work_hours || 8,
          overtime_after: config.overtime_after || 8,
          break_after_hours: config.break_after_hours || 5,
          default_break_minutes: config.default_break_minutes || 30,
          require_gps_checkin: config.require_gps_checkin || false,
          require_project: config.require_project || false,
          mileage_rate: config.mileage_rate || 25,
          allowance_full_day: config.allowance_full_day || 290,
          allowance_half_day: config.allowance_half_day || 145,
          ob1_rate: config.ob1_rate || 1.3,
          ob2_rate: config.ob2_rate || 1.7,
          overtime_50_rate: config.overtime_50_rate || 1.5,
          overtime_100_rate: config.overtime_100_rate || 2.0,
          // Auto-faktura
          auto_invoice_enabled: config.auto_invoice_enabled || false,
          auto_invoice_send: config.auto_invoice_send || false,
          auto_invoice_max_amount: config.auto_invoice_max_amount || 50000,
          auto_invoice_on_complete: config.auto_invoice_on_complete || false,
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
      const authHeaders = await getAuthHeaders()
      const response = await fetch('/api/phone/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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
      const authHeaders = await getAuthHeaders()
      const response = await fetch('/api/phone/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
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

  const handleSyncWebhooks = async () => {
    setSyncingWebhooks(true)
    setWebhookSyncMsg(null)
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/phone/settings', { method: 'POST', headers: authHeaders })
      if (res.ok) {
        setWebhookSyncMsg({ text: 'Telefonikoppling uppdaterad!', ok: true })
      } else {
        const data = await res.json()
        setWebhookSyncMsg({ text: data.error || 'Synkfel', ok: false })
      }
    } catch {
      setWebhookSyncMsg({ text: 'Nätverksfel', ok: false })
    } finally {
      setSyncingWebhooks(false)
      setTimeout(() => setWebhookSyncMsg(null), 5000)
    }
  }

  const handleTestSms = async () => {
    const testPhone = config?.forward_phone_number
    if (!testPhone) {
      setWebhookSyncMsg({ text: 'Inget vidarekopplingsnummer inställt', ok: false })
      setTimeout(() => setWebhookSyncMsg(null), 5000)
      return
    }
    setSendingTestSms(true)
    setWebhookSyncMsg(null)
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          to: testPhone,
          message: `Test från Handymate! Om du ser detta fungerar SMS korrekt. ${new Date().toLocaleTimeString('sv-SE')}`,
        }),
      })
      if (res.ok) {
        setWebhookSyncMsg({ text: `Test-SMS skickat till ${testPhone}`, ok: true })
      } else {
        const text = await res.text()
        let errMsg = 'Kunde inte skicka test-SMS'
        try { errMsg = JSON.parse(text).error || errMsg } catch { errMsg = text || errMsg }
        setWebhookSyncMsg({ text: errMsg, ok: false })
      }
    } catch {
      setWebhookSyncMsg({ text: 'Nätverksfel', ok: false })
    } finally {
      setSendingTestSms(false)
      setTimeout(() => setWebhookSyncMsg(null), 8000)
    }
  }

  const handleRemovePhone = async () => {
    if (!confirm('Är du säker på att du vill ta bort telefonnumret? Detta kan inte ångras.')) {
      return
    }

    setProvisioning(true)
    try {
      const authHeaders = await getAuthHeaders()
      const response = await fetch(`/api/phone/provision?business_id=${business.business_id}`, {
        method: 'DELETE',
        headers: { ...authHeaders },
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
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/google/disconnect', { method: 'DELETE', headers: authHeaders })
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
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/google/sync', { method: 'POST', headers: authHeaders })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setGoogleSyncResult(data)
      // Refresh status
      const statusRes = await fetch('/api/google/status', { headers: authHeaders })
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

  const handleToggleGmailSync = async (enabled: boolean) => {
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/google/gmail-toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ enabled }),
      })
      if (res.ok) {
        setGoogleStatus(prev => prev ? { ...prev, gmailSyncEnabled: enabled } : null)
        showToast(enabled ? 'Gmail-visning aktiverad' : 'Gmail-visning inaktiverad', 'success')
      }
    } catch {
      showToast('Kunde inte ändra Gmail-inställning', 'error')
    }
  }

  async function fetchGmailLeadSettings() {
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/settings/gmail-lead', { headers: authHeaders })
      if (res.ok) {
        const data = await res.json()
        setGmailLeadEnabled(data.enabled)
        setGmailLeadApprovedSenders(data.approved_senders || '')
        setGmailLeadBlockedSenders(data.blocked_senders || '')
        setGmailLeadLastImport(data.last_import_at)
      }
    } catch { /* ignore */ }
  }

  async function handleSaveGmailLeadSettings() {
    setGmailLeadSaving(true)
    try {
      const authHeaders = await getAuthHeaders()
      const res = await fetch('/api/settings/gmail-lead', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          enabled: gmailLeadEnabled,
          approved_senders: gmailLeadApprovedSenders,
          blocked_senders: gmailLeadBlockedSenders,
        }),
      })
      if (res.ok) {
        showToast('Gmail lead-inställningar sparade', 'success')
      } else {
        showToast('Kunde inte spara inställningar', 'error')
      }
    } catch {
      showToast('Kunde inte spara inställningar', 'error')
    } finally {
      setGmailLeadSaving(false)
    }
  }


  async function handleSaveReviewSettings() {
    setSavingReview(true)
    try {
      const { error } = await supabase
        .from('business_config')
        .update({
          google_review_url: googleReviewUrl || null,
          review_request_enabled: reviewRequestEnabled,
          review_request_delay_days: reviewRequestDelayDays,
        })
        .eq('business_id', business.business_id)
      if (error) throw error
      showToast('Recensionsinställningar sparade', 'success')
    } catch {
      showToast('Kunde inte spara', 'error')
    } finally {
      setSavingReview(false)
    }
  }

  async function fetchLeadSources() {
    setLeadSourcesLoading(true)
    try {
      const res = await fetch('/api/lead-sources')
      if (res.ok) {
        const data = await res.json()
        setLeadSources(data.sources || [])
      }
    } catch (e) { console.error(e) }
    finally { setLeadSourcesLoading(false) }
  }

  async function handleAddLeadSource() {
    if (!newLeadSourceName.trim()) return
    setAddingLeadSource(true)
    try {
      const res = await fetch('/api/lead-sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform: newLeadSourcePlatform,
          name: newLeadSourceName.trim(),
        }),
      })
      if (res.ok) {
        showToast('Leadkälla tillagd', 'success')
        setNewLeadSourceName('')
        setShowAddLeadSource(false)
        fetchLeadSources()
      } else {
        const data = await res.json()
        showToast(data.error || 'Kunde inte lägga till', 'error')
      }
    } catch { showToast('Fel vid skapande', 'error') }
    finally { setAddingLeadSource(false) }
  }

  async function handleToggleLeadSource(id: string, isActive: boolean) {
    try {
      await fetch('/api/lead-sources', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: !isActive }),
      })
      setLeadSources(prev => prev.map(s => s.id === id ? { ...s, is_active: !isActive } : s))
    } catch { showToast('Kunde inte uppdatera', 'error') }
  }

  async function handleDeleteLeadSource(id: string) {
    if (!confirm('Ta bort denna leadkälla?')) return
    try {
      await fetch(`/api/lead-sources?id=${id}`, { method: 'DELETE' })
      setLeadSources(prev => prev.filter(s => s.id !== id))
      showToast('Leadkälla borttagen', 'success')
    } catch { showToast('Kunde inte ta bort', 'error') }
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
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Kunde inte ladda inställningar</div>
      </div>
    )
  }

  const tabGroups: { label: string; tabs: { id: string; label: string; icon: any; href?: string }[] }[] = [
    {
      label: 'Företag',
      tabs: [
        { id: 'company', label: 'Företag', icon: Building2 },
        { id: 'hours', label: 'Öppettider', icon: Clock },
        { id: 'invoice', label: 'Faktura', icon: Receipt },
        { id: 'phone', label: 'Telefoni', icon: PhoneCall },
        { id: 'subscription', label: 'Prenumeration', icon: CreditCard },
      ],
    },
    {
      label: 'Försäljning',
      tabs: [
        { id: '_link_quote_style', label: 'Dokumentstil', icon: FileText, href: '/dashboard/settings/quote-style' },
        { id: '_link_templates', label: 'Offertmallar', icon: FileText, href: '/dashboard/settings/quote-templates' },
        { id: '_link_texts', label: 'Standardtexter', icon: FileText, href: '/dashboard/settings/quote-texts' },
        { id: '_link_pricelist', label: 'Prislista', icon: Package, href: '/dashboard/settings/pricelist' },
        { id: '_link_pricing', label: 'Prisstruktur', icon: TrendingUp, href: '/dashboard/settings/pricing' },
        { id: '_link_categories', label: 'Offertkategorier', icon: FileText, href: '/dashboard/settings/quote-categories' },
      ],
    },
    {
      label: 'Drift',
      tabs: [
        { id: 'team', label: 'Team', icon: UsersRound },
        { id: 'time', label: 'Tidrapport', icon: Clock },
        { id: 'economics', label: 'Ekonomi', icon: TrendingUp },
        { id: 'pipeline', label: 'Pipeline', icon: TrendingUp },
        { id: '_link_automations', label: 'Automationer', icon: Zap, href: '/dashboard/automations' },
        { id: '_link_leads', label: 'Lead-källor', icon: Link2, href: '/dashboard/settings/lead-sources' },
        { id: '_link_jobtypes', label: 'Jobbtyper', icon: Briefcase, href: '/dashboard/settings/job-types' },
        { id: '_link_inventory', label: 'Lager & Material', icon: Package, href: '/dashboard/settings/inventory' },
      ],
    },
    {
      label: 'AI & Integrationer',
      tabs: [
        { id: 'ai', label: 'AI-assistent', icon: Bot },
        { id: 'autopilot', label: 'Autopilot', icon: Zap },
        { id: 'integrations', label: 'Integrationer', icon: Link2 },
        { id: 'preferences', label: 'Preferenser', icon: Star },
      ],
    },
  ]
  const tabs = tabGroups.flatMap(g => g.tabs)

  const currentPlan = config.subscription_plan || 'Starter'

  return (
    <PermissionGate permission="manage_settings">
    <div className="p-8 bg-[#F8FAFC] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-primary-50 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Inställningar</h1>
            <p className="text-gray-500">Konfigurera ditt företag och AI-assistent</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center px-6 py-3 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}
            Spara ändringar
          </button>
        </div>

        {/* Layout: vertical sidebar + content */}
        <div className="flex flex-col lg:flex-row gap-6">

        {/* Settings sidebar nav */}
        <nav className="lg:w-56 shrink-0">
          {/* Mobile: horizontal scroll tabs */}
          <div className="lg:hidden flex overflow-x-auto gap-1.5 pb-2 -mx-2 px-2 scrollbar-hide">
            {tabs.filter(t => !t.id.startsWith('_link_')).map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.id
                    ? 'bg-primary-700 text-white'
                    : 'bg-white text-gray-500 border border-[#E2E8F0]'
                }`}
              >
                <tab.icon className="w-3.5 h-3.5 mr-1" />
                {tab.label}
              </button>
            ))}
          </div>

          {/* Desktop: vertical grouped menu */}
          <div className="hidden lg:block bg-white border border-[#E2E8F0] rounded-xl overflow-hidden">
            {tabGroups.map((group, gi) => (
              <div key={group.label}>
                {gi > 0 && <div className="border-t border-gray-100" />}
                <p className="px-4 pt-3 pb-1 text-[10px] tracking-widest uppercase text-gray-400 font-semibold">
                  {group.label}
                </p>
                {group.tabs.map((tab) =>
                  tab.href ? (
                    <Link
                      key={tab.id}
                      href={tab.href}
                      className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
                    >
                      <tab.icon className="w-4 h-4 text-gray-400" />
                      {tab.label}
                      <ChevronRight className="w-3 h-3 text-gray-300 ml-auto" />
                    </Link>
                  ) : (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition-colors text-left ${
                        activeTab === tab.id
                          ? 'bg-primary-50 text-primary-700 font-medium border-l-2 border-primary-700'
                          : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                      }`}
                    >
                      <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-primary-700' : 'text-gray-400'}`} />
                      {tab.label}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0">

        {/* Company Tab */}
        {activeTab === 'company' && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">Företagsinformation</h2>

            {/* Logotyp-upload */}
            <div className="border border-[#E2E8F0] rounded-xl p-4">
              <label className="flex items-center gap-2 text-sm text-gray-500 mb-3">
                <Upload className="w-4 h-4" />
                Företagslogga
              </label>
              <div className="flex items-center gap-4">
                {config.logo_url ? (
                  <img
                    src={config.logo_url}
                    alt="Logga"
                    className="w-16 h-16 object-contain rounded-lg border border-[#E2E8F0] bg-white"
                  />
                ) : (
                  <div className="w-16 h-16 bg-gray-100 rounded-lg border border-dashed border-gray-300 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-gray-300" />
                  </div>
                )}
                <div>
                  <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary-50 text-primary-700 text-sm font-medium rounded-lg hover:bg-primary-100 transition-colors">
                    <Upload className="w-3.5 h-3.5" />
                    {config.logo_url ? 'Byt logga' : 'Ladda upp'}
                    <input
                      type="file"
                      className="hidden"
                      accept=".png,.jpg,.jpeg,.svg,.webp"
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const formData = new FormData()
                        formData.append('file', file)
                        try {
                          const res = await fetch('/api/business/logo', { method: 'POST', body: formData })
                          const data = await res.json()
                          if (res.ok && data.logo_url) {
                            setConfig({ ...config, logo_url: data.logo_url })
                            showToast('Logga uppladdad!', 'success')
                          } else {
                            showToast(data.error || 'Kunde inte ladda upp', 'error')
                          }
                        } catch {
                          showToast('Uppladdning misslyckades', 'error')
                        }
                        e.target.value = ''
                      }}
                    />
                  </label>
                  <p className="text-xs text-gray-400 mt-1">PNG, JPG eller SVG, max 2 MB</p>
                </div>
              </div>
            </div>

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
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
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
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                />
                <p className="text-xs text-gray-400 mt-1">Visas på offerter och fakturor</p>
              </div>
            </div>

            {/* Länk till prislista */}
            <Link
              href="/dashboard/settings/pricelist"
              className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-300 hover:border-primary-300 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F0FDFA] border border-[#E2E8F0]">
                  <FileText className="w-5 h-5 text-secondary-700" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Grossistprislista</p>
                  <p className="text-sm text-gray-400">Hantera leverantörer och produktpriser</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-secondary-700 transition-colors" />
            </Link>

            {/* Länk till produktregister */}
            <Link
              href="/dashboard/settings/products"
              className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-300 hover:border-primary-300 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-amber-600/20 to-amber-500/20 border border-amber-300">
                  <Package className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Produkter & Material</p>
                  <p className="text-sm text-gray-400">Sökbart register för offerter och fakturor</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-secondary-700 transition-colors" />
            </Link>

            {/* Länk till offertkategorier */}
            <Link
              href="/dashboard/settings/quote-categories"
              className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-300 hover:border-primary-300 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-[#F0FDFA] border border-[#E2E8F0]">
                  <FileText className="w-5 h-5 text-primary-700" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Offertkategorier</p>
                  <p className="text-sm text-gray-400">Egna kategorier för offertrader</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-secondary-700 transition-colors" />
            </Link>

            {/* Länk till formulärmallar */}
            <Link
              href="/dashboard/settings/form-templates"
              className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-gray-300 hover:border-primary-300 transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-sky-600/20 to-sky-500/20 border border-sky-300">
                  <FileText className="w-5 h-5 text-secondary-700" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Formulärmallar</p>
                  <p className="text-sm text-gray-400">Egenkontroller, säkerhetschecklistor och egna formulär</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-secondary-700 transition-colors" />
            </Link>

            {/* Tjänster har flyttat till egen sida: Jobbtyper */}
            <Link
              href="/dashboard/settings/job-types"
              className="flex items-center justify-between p-4 bg-white border border-[#E2E8F0] rounded-xl hover:border-primary-400 hover:bg-primary-50/30 transition-colors group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-gradient-to-br from-primary-600/20 to-primary-500/20 border border-primary-300">
                  <Briefcase className="w-5 h-5 text-primary-700" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">Jobbtyper</p>
                  <p className="text-sm text-gray-400">
                    Hantera vilka typer av arbete ni utför — används för delegering och statistik
                  </p>
                  {config.services_offered && config.services_offered.length > 0 && (
                    <p className="text-xs text-primary-700 mt-1">
                      {config.services_offered.length} befintlig{config.services_offered.length === 1 ? '' : 'a'} tjänst{config.services_offered.length === 1 ? '' : 'er'} migreras automatiskt
                    </p>
                  )}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-primary-700 transition-colors" />
            </Link>
          </div>
        )}

        {/* Hours Tab */}
        {activeTab === 'hours' && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
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
                      className="w-5 h-5 rounded border-gray-300 bg-gray-200 text-secondary-700 focus:ring-primary-600/50"
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
                        className="px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                      />
                      <span className="text-gray-400">–</span>
                      <input
                        type="time"
                        value={hours.close}
                        onChange={(e) => updateHours(day, 'close', e.target.value)}
                        className="px-3 py-2 bg-gray-200 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Ditt Handymate-nummer</h2>

              {config.assigned_phone_number ? (
                // Har redan ett nummer
                <div className="space-y-4">
                  <div className="p-4 bg-gradient-to-r from-primary-700/10 to-primary-600/10 border border-[#E2E8F0] rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-3 bg-primary-700 rounded-xl">
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
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Samtal till ditt Handymate-nummer kopplas hit efter GDPR-meddelandet
                    </p>
                  </div>

                  <button
                    onClick={handleProvisionPhone}
                    disabled={provisioning || !forwardNumber.trim()}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Mic className="w-5 h-5 text-secondary-700" />
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
                          ? 'bg-primary-700'
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
                        className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] resize-none"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Enligt GDPR måste du informera att samtalet spelas in
                      </p>
                    </div>
                  )}

                  {/* Info om vad som händer */}
                  <div className="p-4 bg-primary-50 border border-[#E2E8F0] rounded-xl">
                    <p className="text-sm text-primary-700">
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
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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

            {/* Samtalsläge */}
            {config.assigned_phone_number && (
              <CallHandlingModeSection businessId={business.business_id} />
            )}

            {/* SMS-koppling & Felsökning */}
            {config.assigned_phone_number && (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5">
                <div>
                  <h2 className="text-base font-semibold text-gray-900 mb-1">SMS-koppling</h2>
                  <p className="text-xs text-gray-400">Status för inkommande SMS och samtal</p>
                </div>

                <div className="bg-gray-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-28 shrink-0">Ditt nummer:</span>
                    <span className="text-gray-700 font-medium">{config.assigned_phone_number}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-28 shrink-0">Vidarekopplas till:</span>
                    <span className="text-gray-700">{config.forward_phone_number || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-gray-400 w-28 shrink-0">Status:</span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="text-emerald-600 font-medium">Aktiv</span>
                    </span>
                  </div>
                </div>

                <p className="text-xs text-gray-400">
                  Kopplingar uppdateras automatiskt. Använd knapparna nedan vid problem.
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <button
                    onClick={handleSyncWebhooks}
                    disabled={syncingWebhooks}
                    className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncingWebhooks ? 'animate-spin' : ''}`} />
                    Uppdatera koppling
                  </button>
                  <button
                    onClick={handleTestSms}
                    disabled={sendingTestSms}
                    className="flex items-center gap-2 px-4 py-2.5 border border-[#E2E8F0] text-primary-700 rounded-xl text-sm font-medium hover:bg-primary-50 disabled:opacity-50 transition-colors"
                  >
                    {sendingTestSms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                    Skicka test-SMS
                  </button>
                  {webhookSyncMsg && (
                    <span className={`text-sm font-medium ${webhookSyncMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {webhookSyncMsg.text}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Invoice Tab */}
        {activeTab === 'invoice' && (
          <div className="space-y-6">
            {/* Betalningsvillkor */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Betalningsvillkor</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Standard betalningsvillkor</label>
                  <select
                    value={config.default_payment_days || 30}
                    onChange={(e) => setConfig({ ...config, default_payment_days: parseInt(e.target.value) })}
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-12"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Referensräntan (2024) + 8% = ca 11.5%</p>
                </div>
              </div>
            </div>

            {/* F-skatt */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Skatteuppgifter</h2>
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                <div>
                  <p className="font-medium text-gray-900">Godkänd för F-skatt</p>
                  <p className="text-sm text-gray-400">Visas på offerter och fakturor</p>
                </div>
                <button
                  onClick={() => setConfig({
                    ...config!,
                    f_skatt_registered: !config.f_skatt_registered
                  })}
                  className={`w-12 h-6 rounded-full transition-all ${
                    config.f_skatt_registered
                      ? 'bg-primary-700'
                      : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    config.f_skatt_registered ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>

            {/* Betalningsinformation */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
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
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Plusgiro</label>
                  <input
                    type="text"
                    value={config.plusgiro || ''}
                    onChange={(e) => setConfig({ ...config, plusgiro: e.target.value })}
                    placeholder="12 34 56-7"
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Swish-nummer</label>
                  <input
                    type="text"
                    value={config.swish_number || ''}
                    onChange={(e) => setConfig({ ...config, swish_number: e.target.value })}
                    placeholder="123 456 78 90"
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                  />
                  <p className="text-xs text-gray-400 mt-1.5">Ditt Swish-nummer visas som QR-kod på fakturor — kunden skannar och betalar direkt.</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Bankkontonummer</label>
                  <input
                    type="text"
                    value={config.bank_account_number || ''}
                    onChange={(e) => setConfig({ ...config, bank_account_number: e.target.value })}
                    placeholder="1234-12 345 67"
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
              </div>
            </div>

            {/* Fakturainställningar */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Fakturainställningar</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Fakturaprefix</label>
                  <input
                    type="text"
                    value={config.invoice_prefix || 'FV'}
                    onChange={(e) => setConfig({ ...config, invoice_prefix: e.target.value })}
                    placeholder="FV"
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                  />
                  <p className="text-xs text-gray-400 mt-1">Prefix för fakturanummer, t.ex. FV-2026-001</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Nästa fakturanummer</label>
                  <input
                    type="number"
                    value={config.next_invoice_number || 1}
                    onChange={(e) => setConfig({ ...config, next_invoice_number: parseInt(e.target.value) || 1 })}
                    min={1}
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                  />
                  <p className="text-xs text-gray-400 mt-1">Numret som nästa faktura får</p>
                </div>
              </div>

              <div className="mt-6">
                <label className="block text-sm text-gray-500 mb-2">Fakturafotstext</label>
                <textarea
                  value={config.invoice_footer_text || ''}
                  onChange={(e) => setConfig({ ...config, invoice_footer_text: e.target.value })}
                  placeholder="Tack för att du anlitar oss! Vid frågor kontakta oss på..."
                  rows={3}
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] resize-none"
                />
                <p className="text-xs text-gray-400 mt-1">Visas längst ner på varje faktura</p>
              </div>
            </div>

            {/* Påminnelser */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-secondary-700" />
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
                      ? 'bg-primary-700'
                      : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    config.auto_reminder_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {config.auto_reminder_enabled && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-500 mb-2">Skicka påminnelse efter</label>
                    <select
                      value={config.auto_reminder_days || 7}
                      onChange={(e) => setConfig({ ...config, auto_reminder_days: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                    >
                      <option value={3}>3 dagar efter förfall</option>
                      <option value={5}>5 dagar efter förfall</option>
                      <option value={7}>7 dagar efter förfall</option>
                      <option value={14}>14 dagar efter förfall</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-500 mb-2">Påminnelseavgift</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={config.reminder_fee || 60}
                        onChange={(e) => setConfig({ ...config, reminder_fee: parseFloat(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-12"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-500 mb-2">Max automatiska</label>
                    <select
                      value={config.max_auto_reminders || 3}
                      onChange={(e) => setConfig({ ...config, max_auto_reminders: parseInt(e.target.value) })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                    >
                      <option value={1}>1 påminnelse</option>
                      <option value={2}>2 påminnelser</option>
                      <option value={3}>3 påminnelser</option>
                      <option value={4}>4 påminnelser</option>
                      <option value={5}>5 påminnelser</option>
                    </select>
                    <p className="text-xs text-gray-400 mt-1">Sedan krävs manuell hantering</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-500 mb-2">Påminnelse-mall (SMS)</label>
                <textarea
                  value={config.reminder_sms_template || ''}
                  onChange={(e) => setConfig({ ...config, reminder_sms_template: e.target.value })}
                  placeholder="Påminnelse: Faktura {invoice_number} på {amount} kr förföll {due_date}. Betala till bankgiro {bankgiro} eller Swish {swish}. //{business_name}"
                  rows={4}
                  className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] resize-none"
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
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Grundinställningar</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Standard timpris</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.default_hourly_rate || 500}
                      onChange={(e) => setConfig({ ...config, default_hourly_rate: parseFloat(e.target.value) || 0 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-16"
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
                    className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value={1}>1 minut (ingen avrundning)</option>
                    <option value={5}>5 minuter</option>
                    <option value={15}>15 minuter</option>
                    <option value={30}>30 minuter</option>
                    <option value={60}>60 minuter</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-1">Tid avrundas uppåt till närmaste intervall</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Standardarbetstid</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={config.standard_work_hours || 8}
                      onChange={(e) => setConfig({ ...config, standard_work_hours: parseFloat(e.target.value) || 8 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-20"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">tim/dag</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Övertid efter</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={config.overtime_after || 8}
                      onChange={(e) => setConfig({ ...config, overtime_after: parseFloat(e.target.value) || 8 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">timmar</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Tid utöver detta räknas som övertid</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Obligatorisk rast efter</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={config.break_after_hours || 5}
                      onChange={(e) => setConfig({ ...config, break_after_hours: parseFloat(e.target.value) || 5 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">timmar</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Standard rasttid</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.default_break_minutes || 30}
                      onChange={(e) => setConfig({ ...config, default_break_minutes: parseInt(e.target.value) || 30 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-16"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">minuter</span>
                  </div>
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-3 mt-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-medium text-gray-900">Kräv beskrivning</p>
                    <p className="text-sm text-gray-400">Tidrapporter måste ha en beskrivning</p>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, time_require_description: !config.time_require_description })}
                    className={`w-12 h-6 rounded-full transition-all ${config.time_require_description ? 'bg-primary-700' : 'bg-gray-200'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${config.time_require_description ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-medium text-gray-900">Kräv GPS vid instämpling</p>
                    <p className="text-sm text-gray-400">Medarbetare måste ha GPS aktiverat vid check-in</p>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, require_gps_checkin: !config.require_gps_checkin })}
                    className={`w-12 h-6 rounded-full transition-all ${config.require_gps_checkin ? 'bg-primary-700' : 'bg-gray-200'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${config.require_gps_checkin ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <p className="font-medium text-gray-900">Kräv projekt vid tidrapportering</p>
                    <p className="text-sm text-gray-400">Alla tidrapporter måste kopplas till ett projekt</p>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, require_project: !config.require_project })}
                    className={`w-12 h-6 rounded-full transition-all ${config.require_project ? 'bg-primary-700' : 'bg-gray-200'}`}
                  >
                    <div className={`w-5 h-5 bg-white rounded-full transition-transform ${config.require_project ? 'translate-x-6' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            </div>

            {/* Resa & Traktamente */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">Resa &amp; traktamente</h2>
              <p className="text-sm text-gray-400 mb-4">Skatteverkets schabloner som standard, konfigurerbart per företag</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">Milersättning</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.5"
                      value={config.mileage_rate || 25}
                      onChange={(e) => setConfig({ ...config, mileage_rate: parseFloat(e.target.value) || 25 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-14"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr/km</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Skatteverket: 25 kr/km (2024)</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Traktamente heldag</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.allowance_full_day || 290}
                      onChange={(e) => setConfig({ ...config, allowance_full_day: parseInt(e.target.value) || 290 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-10"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Skatteverket: 290 kr (2024)</p>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Traktamente halvdag</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={config.allowance_half_day || 145}
                      onChange={(e) => setConfig({ ...config, allowance_half_day: parseInt(e.target.value) || 145 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-10"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Skatteverket: 145 kr (2024)</p>
                </div>
              </div>
            </div>

            {/* OB & Övertid */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">OB-tillägg &amp; övertid</h2>
              <p className="text-sm text-gray-400 mb-4">Multiplikatorer för löneunderlag</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <label className="block text-sm text-gray-500 mb-2">OB1 (kväll/helg)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      value={Math.round((config.ob1_rate || 1.3) * 100)}
                      onChange={(e) => setConfig({ ...config, ob1_rate: (parseInt(e.target.value) || 130) / 100 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">OB2 (natt/storhelg)</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      value={Math.round((config.ob2_rate || 1.7) * 100)}
                      onChange={(e) => setConfig({ ...config, ob2_rate: (parseInt(e.target.value) || 170) / 100 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Övertid 50%</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      value={Math.round((config.overtime_50_rate || 1.5) * 100)}
                      onChange={(e) => setConfig({ ...config, overtime_50_rate: (parseInt(e.target.value) || 150) / 100 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-gray-500 mb-2">Övertid 100%</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.05"
                      value={Math.round((config.overtime_100_rate || 2.0) * 100)}
                      onChange={(e) => setConfig({ ...config, overtime_100_rate: (parseInt(e.target.value) || 200) / 100 })}
                      className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Arbetstyper */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Arbetstyper</h2>
                  <p className="text-sm text-gray-400">Kategorisera tid med multiplikatorer</p>
                </div>
                <button
                  onClick={() => setShowAddWorkType(!showAddWorkType)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-100 border border-[#E2E8F0] rounded-xl text-sm text-primary-700 hover:bg-primary-700/30"
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
                      className="px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E]"
                    />
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        value={newWorkType.multiplier}
                        onChange={(e) => setNewWorkType({ ...newWorkType, multiplier: parseFloat(e.target.value) || 1.0 })}
                        className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] pr-8"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">x</span>
                    </div>
                    <label className="flex items-center gap-2 px-4 py-2.5">
                      <input
                        type="checkbox"
                        checked={newWorkType.billable_default}
                        onChange={(e) => setNewWorkType({ ...newWorkType, billable_default: e.target.checked })}
                        className="w-4 h-4 rounded border-gray-300 bg-gray-200 text-secondary-700"
                      />
                      <span className="text-sm text-gray-700">Fakturerbar</span>
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddWorkType}
                      disabled={!newWorkType.name.trim() || savingWorkType}
                      className="flex items-center gap-2 px-4 py-2 bg-primary-700 rounded-xl text-sm text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {savingWorkType ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                      Spara
                    </button>
                    <button
                      onClick={() => { setShowAddWorkType(false); setNewWorkType({ name: '', multiplier: 1.0, billable_default: true }) }}
                      className="px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-500 hover:text-gray-900"
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
                          className="px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E]"
                        />
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            value={editingWorkType.multiplier}
                            onChange={(e) => setEditingWorkType({ ...editingWorkType, multiplier: parseFloat(e.target.value) || 1.0 })}
                            className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 text-sm focus:outline-none focus:border-[#0F766E] pr-8"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs">x</span>
                        </div>
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={editingWorkType.billable_default}
                            onChange={(e) => setEditingWorkType({ ...editingWorkType, billable_default: e.target.checked })}
                            className="w-4 h-4 rounded border-gray-300 bg-gray-200 text-secondary-700"
                          />
                          <span className="text-xs text-gray-700">Fakturerbar</span>
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateWorkType(editingWorkType)}
                            disabled={savingWorkType}
                            className="px-3 py-1.5 bg-primary-100 border border-[#E2E8F0] rounded-lg text-xs text-primary-700 hover:bg-primary-700/30 disabled:opacity-50"
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
                              <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs rounded-lg">
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
                    <p className="text-xs mt-1">Kontakta support för att aktivera arbetstyper</p>
                  </div>
                )}
              </div>
            </div>

            {/* Auto-faktura */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <Receipt className="w-6 h-6 text-emerald-500" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Auto-faktura</h2>
                  <p className="text-sm text-gray-400">Skapa fakturor automatiskt från tidrapporter</p>
                </div>
              </div>

              {/* Master toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl mb-4">
                <div>
                  <p className="font-medium text-gray-900">Aktivera auto-faktura</p>
                  <p className="text-sm text-gray-400">Samla tidrapporter per kund och skapa fakturautkast automatiskt</p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, auto_invoice_enabled: !config.auto_invoice_enabled })}
                  className={`w-12 h-6 rounded-full transition-all ${
                    config.auto_invoice_enabled
                      ? 'bg-gradient-to-r from-emerald-500 to-primary-600'
                      : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    config.auto_invoice_enabled ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              {config.auto_invoice_enabled && (
                <div className="space-y-4">
                  {/* Auto-send toggle */}
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <p className="font-medium text-gray-900">Skicka automatiskt</p>
                      <p className="text-sm text-gray-400">Skicka fakturan via e-post direkt efter skapande</p>
                    </div>
                    <button
                      onClick={() => setConfig({ ...config, auto_invoice_send: !config.auto_invoice_send })}
                      className={`w-12 h-6 rounded-full transition-all ${
                        config.auto_invoice_send
                          ? 'bg-gradient-to-r from-emerald-500 to-primary-600'
                          : 'bg-gray-200'
                      }`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                        config.auto_invoice_send ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  {/* Max amount */}
                  <div>
                    <label className="block text-sm text-gray-500 mb-2">Max belopp per faktura (säkerhetsgräns)</label>
                    <div className="relative">
                      <input
                        type="number"
                        value={config.auto_invoice_max_amount || 50000}
                        onChange={(e) => setConfig({ ...config, auto_invoice_max_amount: parseFloat(e.target.value) || 50000 })}
                        className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 pr-12"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">kr</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Fakturor över detta belopp skapas inte automatiskt</p>
                  </div>

                  {/* Manual trigger button */}
                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-sm text-gray-500 mb-3">Generera fakturor nu från alla ofakturerade tidrapporter:</p>
                    <AutoInvoiceButton businessId={business.business_id} autoSend={config.auto_invoice_send} maxAmount={config.auto_invoice_max_amount || 50000} />
                  </div>
                </div>
              )}
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-gray-900">Auto-faktura vid projektavslut</h3>
                  <p className="text-sm text-gray-400 mt-1">
                    {config.auto_invoice_on_complete
                      ? 'Fakturan skapas och skickas direkt till kund vid projektavslut'
                      : 'Fakturan skapas som utkast vid projektavslut'}
                  </p>
                </div>
                <button
                  onClick={() => setConfig({ ...config, auto_invoice_on_complete: !config.auto_invoice_on_complete })}
                  className={`w-12 h-6 rounded-full transition-all flex-shrink-0 ${config.auto_invoice_on_complete ? 'bg-gradient-to-r from-emerald-500 to-primary-600' : 'bg-gray-200'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${config.auto_invoice_on_complete ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500 bg-gray-50 rounded-xl p-3">
                {config.auto_invoice_on_complete
                  ? 'Fakturan baseras på offertens rader och godkända ÄTA och skickas automatiskt.'
                  : 'Fakturan skapas automatiskt men du granskar innan den skickas. Se under Godkännanden.'}
              </p>
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
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary-100">
                  <CalendarDays className="w-6 h-6 text-primary-600" />
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
                      className="w-full px-4 py-2.5 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
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
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary-100 border border-[#E2E8F0] rounded-xl text-primary-700 hover:bg-primary-700/30 disabled:opacity-50 transition-colors"
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

                  {/* Gmail integration toggle */}
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-gray-500" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">Visa kundmail</p>
                          <p className="text-xs text-gray-400">
                            {googleStatus?.gmailScopeGranted
                              ? 'Visa Gmail-konversationer i kundkort'
                              : 'Koppla om Google för att aktivera e-post'}
                          </p>
                        </div>
                      </div>
                      {googleStatus?.gmailScopeGranted ? (
                        <button
                          onClick={() => handleToggleGmailSync(!googleStatus?.gmailSyncEnabled)}
                          className={`relative w-11 h-6 rounded-full transition-colors ${
                            googleStatus?.gmailSyncEnabled ? 'bg-primary-700' : 'bg-gray-300'
                          }`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                            googleStatus?.gmailSyncEnabled ? 'translate-x-5' : ''
                          }`} />
                        </button>
                      ) : (
                        <button
                          onClick={handleConnectGoogle}
                          className="px-3 py-1.5 text-xs font-medium text-secondary-700 bg-primary-50 border border-[#E2E8F0] rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          Koppla om
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Gmail lead import */}
                  {googleStatus?.gmailScopeGranted && (
                    <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Bot className="w-5 h-5 text-gray-500" />
                          <div>
                            <p className="text-sm font-medium text-gray-900">AI Lead-import från Gmail</p>
                            <p className="text-xs text-gray-400">Läs inkommande mail, hitta leads automatiskt</p>
                          </div>
                        </div>
                        <button
                          onClick={async () => {
                            const next = !gmailLeadEnabled
                            setGmailLeadEnabled(next)
                            const authHeaders = await getAuthHeaders()
                            fetch('/api/settings/gmail-lead', {
                              method: 'PUT',
                              headers: { 'Content-Type': 'application/json', ...authHeaders },
                              body: JSON.stringify({
                                enabled: next,
                                approved_senders: gmailLeadApprovedSenders,
                                blocked_senders: gmailLeadBlockedSenders,
                              }),
                            }).then(() => showToast(next ? 'Lead-import aktiverad' : 'Lead-import inaktiverad', 'success'))
                              .catch(() => showToast('Fel vid sparning', 'error'))
                          }}
                          className={`relative w-11 h-6 rounded-full transition-colors ${gmailLeadEnabled ? 'bg-primary-700' : 'bg-gray-300'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${gmailLeadEnabled ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>

                      {gmailLeadEnabled && (
                        <div className="space-y-2 pt-1 border-t border-gray-200">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Godkända avsändare (valfritt)
                            </label>
                            <input
                              type="text"
                              value={gmailLeadApprovedSenders}
                              onChange={(e) => setGmailLeadApprovedSenders(e.target.value)}
                              placeholder="t.ex. blocket.se, hemnet.se, @gmail.com"
                              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-600 focus:border-primary-600"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">Kommaseparerade domäner/e-poster som alltid är leads</p>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">
                              Blockerade avsändare (valfritt)
                            </label>
                            <input
                              type="text"
                              value={gmailLeadBlockedSenders}
                              onChange={(e) => setGmailLeadBlockedSenders(e.target.value)}
                              placeholder="t.ex. noreply@, newsletter@"
                              className="w-full px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-1 focus:ring-primary-600 focus:border-primary-600"
                            />
                          </div>
                          <button
                            onClick={handleSaveGmailLeadSettings}
                            disabled={gmailLeadSaving}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-700 text-white rounded-lg hover:bg-primary-800 disabled:opacity-50"
                          >
                            {gmailLeadSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                            Spara filter
                          </button>
                          {gmailLeadLastImport && (
                            <p className="text-xs text-gray-400">
                              Senaste import: {new Date(gmailLeadLastImport).toLocaleString('sv-SE')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Disconnect */}
                  <button
                    onClick={handleDisconnectGoogle}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors"
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
                        <div className="w-1.5 h-1.5 bg-primary-600 rounded-full" />
                        Synka ditt schema med Google Calendar
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary-600 rounded-full" />
                        Se externa events som upptagen tid
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary-600 rounded-full" />
                        Automatisk tvåvägssynk
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleConnectGoogle}
                    disabled={googleLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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

            {/* Email info */}
            <div className="bg-primary-50 border border-[#E2E8F0] rounded-xl p-4">
              <p className="text-sm text-primary-700">
                <strong>Om e-post:</strong> Utgående e-post skickas via Handymate (Resend). Med Gmail-koppling kan du se inkommande kundmail direkt i kundkortet.
              </p>
            </div>

            {/* Bekräftelsemail vid godkänd offert */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-100">
                    <MailCheck className="w-5 h-5 text-primary-700" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">Bekräftelsemail vid godkänd offert</p>
                    <p className="text-xs text-gray-500 mt-0.5">Skickar automatiskt ett mail med faktura- och ROT-uppgifter när kund signerar offert</p>
                  </div>
                </div>
                <button
                  onClick={async () => {
                    const newVal = !quoteSignedEmailEnabled
                    setQuoteSignedEmailEnabled(newVal)
                    try {
                      const { supabase: sb } = await import('@/lib/supabase')
                      await sb
                        .from('v3_automation_settings')
                        .upsert({ business_id: config?.business_id, quote_signed_email_enabled: newVal }, { onConflict: 'business_id' })
                    } catch { /* non-blocking */ }
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${quoteSignedEmailEnabled ? 'bg-primary-800' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${quoteSignedEmailEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            {/* Google Reviews */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-amber-100">
                  <Star className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Google Recensioner</h2>
                  <p className="text-sm text-gray-400">Automatisk recensionsförfrågan efter slutfört jobb</p>
                </div>
              </div>
              {!canAccess('google_reviews') ? (
                <UpgradePrompt featureKey="google_reviews" inline />
              ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Din Google Reviews-länk</label>
                  <input
                    type="url"
                    value={googleReviewUrl}
                    onChange={e => setGoogleReviewUrl(e.target.value)}
                    placeholder="https://g.page/r/ditt-foretagsnamn/review"
                    className="w-full px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-xl text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Sök på ditt företag i Google Maps → Dela → Kopiera länk, eller gå till Google Business Profile → Be om recensioner
                  </p>
                </div>

                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Automatisk förfrågan</p>
                    <p className="text-xs text-gray-400">Skicka SMS + email till kund efter slutfört jobb</p>
                  </div>
                  <button
                    onClick={() => setReviewRequestEnabled(!reviewRequestEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${reviewRequestEnabled ? 'bg-primary-800' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${reviewRequestEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {reviewRequestEnabled && (
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Skicka efter</label>
                    <select
                      value={reviewRequestDelayDays}
                      onChange={e => setReviewRequestDelayDays(parseInt(e.target.value))}
                      className="px-3 py-2.5 bg-gray-50 border border-[#E2E8F0] rounded-xl text-sm text-gray-900 focus:outline-none focus:border-primary-500"
                    >
                      <option value={1}>1 dag efter slutfört jobb</option>
                      <option value={3}>3 dagar efter slutfört jobb</option>
                      <option value={7}>7 dagar efter slutfört jobb</option>
                    </select>
                  </div>
                )}

                {reviewRequestEnabled && googleReviewUrl && (
                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Förhandsvisning SMS</p>
                    <p className="text-sm text-gray-700">
                      Hej {'{'}<span className="text-secondary-700">kundnamn</span>{'}'}! Tack för att du valde {config?.business_name || 'oss'}. Vi hoppas du är nöjd med resultatet! Om du har en minut skulle vi uppskatta en recension: {googleReviewUrl.substring(0, 30)}... /Mvh {config?.business_name || 'oss'}
                    </p>
                  </div>
                )}

                {reviewStats.sent > 0 && (
                  <div className="p-3 bg-primary-50 border border-[#E2E8F0] rounded-xl">
                    <p className="text-xs text-primary-700 uppercase tracking-wider font-semibold mb-1">Statistik</p>
                    <p className="text-sm text-primary-800">
                      {reviewStats.sent} förfrågningar skickade · {reviewStats.clicked} klickade på länken
                      {reviewStats.sent > 0 && (
                        <span className="text-primary-700"> ({Math.round((reviewStats.clicked / reviewStats.sent) * 100)}%)</span>
                      )}
                    </p>
                  </div>
                )}

                <button
                  onClick={handleSaveReviewSettings}
                  disabled={savingReview}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-700 rounded-xl text-white font-medium text-sm hover:opacity-90 disabled:opacity-50 transition-all"
                >
                  {savingReview ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Spara recensionsinställningar
                </button>
              </div>
              )}
            </div>

            {/* Outlook Calendar (placeholder) */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 opacity-60">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary-800/20">
                  <CalendarDays className="w-6 h-6 text-primary-700" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Microsoft Outlook</h2>
                  <p className="text-sm text-gray-400">Kommer snart</p>
                </div>
              </div>
              <p className="text-sm text-gray-400">Outlook-kalender integration är under utveckling.</p>
            </div>

            {/* Fortnox Integration */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
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

              {!canAccess('fortnox_integration') ? (
                <UpgradePrompt featureKey="fortnox_integration" inline />
              ) : fortnoxStatus?.connected ? (
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
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-100 border border-[#E2E8F0] rounded-xl text-sm text-primary-700 hover:bg-primary-700/30 disabled:opacity-50 transition-colors"
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
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-100 border border-[#E2E8F0] rounded-xl text-sm text-primary-700 hover:bg-primary-700/30 disabled:opacity-50 transition-colors"
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
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-500 hover:text-red-600 hover:border-red-200 transition-colors"
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
                        <div className="w-1.5 h-1.5 bg-primary-700 rounded-full" />
                        Synkronisera kunder mellan systemen
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary-700 rounded-full" />
                        Exportera fakturor direkt till bokföringen
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary-700 rounded-full" />
                        Importera artiklar och prislista
                      </li>
                      <li className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 bg-primary-700 rounded-full" />
                        Automatisk bokföring av betalningar
                      </li>
                    </ul>
                  </div>

                  <button
                    onClick={handleConnectFortnox}
                    disabled={fortnoxLoading}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
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

            {/* Hemsideintegration (Embed Widget) */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-primary-100">
                  <ExternalLink className="w-6 h-6 text-primary-600" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Hemsideintegration</h2>
                  <p className="text-sm text-gray-400">Leads från din hemsida direkt i Handymate</p>
                </div>
              </div>

              <p className="text-sm text-gray-500 mb-4">
                Koppla din hemsida till Handymate — leads som skickas via ditt kontaktformulär hamnar automatiskt i din pipeline.
              </p>

              {config?.website_api_key ? (
                <div className="space-y-4">
                  {/* Embed code */}
                  <div>
                    <label className="text-sm font-medium text-gray-900 block mb-2">Din inbäddningskod</label>
                    <div className="relative">
                      <pre className="p-4 bg-gray-50 border border-gray-300 rounded-xl text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap break-all select-all">
{`<script src="https://app.handymate.se/embed.js"
        data-key="${config.website_api_key}">
</script>`}
                      </pre>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `<script src="https://app.handymate.se/embed.js" data-key="${config.website_api_key}"></script>`
                          )
                          showToast('Kod kopierad!', 'success')
                        }}
                        className="absolute top-2 right-2 px-3 py-1.5 bg-primary-700 text-white text-xs rounded-lg hover:opacity-90"
                      >
                        Kopiera
                      </button>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          `<script src="https://app.handymate.se/embed.js" data-key="${config.website_api_key}"></script>`
                        )
                        showToast('Kod kopierad!', 'success')
                      }}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-primary-700 rounded-xl text-white font-medium hover:opacity-90"
                    >
                      <Download className="w-4 h-4" />
                      Kopiera kod
                    </button>
                    <a
                      href={`mailto:?subject=${encodeURIComponent('Lägg till kontaktformulär på vår hemsida')}&body=${encodeURIComponent(
                        `Hej!\n\nKan du lägga till denna kod precis före </body> på vår hemsida?\n\n<script src="https://app.handymate.se/embed.js" data-key="${config.website_api_key}"></script>\n\nDet räcker med det — ett kontaktformulär dyker upp automatiskt.\n\nTack!`
                      )}`}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-700 font-medium hover:bg-gray-200"
                    >
                      <Mail className="w-4 h-4" />
                      Skicka till webbyrå
                    </a>
                  </div>

                  {/* DIY Guide */}
                  <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-gray-700">Gör det själv — steg för steg</p>
                    <ol className="text-sm text-gray-500 space-y-2 list-decimal list-inside">
                      <li>
                        <strong className="text-gray-700">WordPress:</strong> Gå till <em>Utseende → Temaredigerare → footer.php</em> och klistra in koden precis före <code className="bg-gray-200 px-1 rounded text-xs">&lt;/body&gt;</code>
                      </li>
                      <li>
                        <strong className="text-gray-700">Wix:</strong> Gå till <em>Inställningar → Anpassad kod</em> och lägg till koden i &quot;Body - end&quot;
                      </li>
                      <li>
                        <strong className="text-gray-700">Squarespace:</strong> Gå till <em>Inställningar → Avancerat → Kodinmatning</em> och klistra in i &quot;Footer&quot;
                      </li>
                      <li>
                        <strong className="text-gray-700">Vanlig HTML:</strong> Klistra in koden precis före <code className="bg-gray-200 px-1 rounded text-xs">&lt;/body&gt;</code> i din HTML-fil
                      </li>
                    </ol>
                    <div className="pt-2 border-t border-gray-200 mt-3">
                      <p className="text-xs text-gray-400">
                        Vill du visa formuläret på en specifik plats istället för den flytande knappen? Lägg till <code className="bg-gray-200 px-1 rounded">&lt;div id=&quot;handymate-form&quot;&gt;&lt;/div&gt;</code> där du vill att det ska synas.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-gray-50 rounded-xl text-center">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-gray-500">Genererar din widget-nyckel...</p>
                </div>
              )}
            </div>

            {/* Grossist-kopplingar */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-lg bg-slate-600">
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
                            className="px-3 py-1.5 text-xs bg-primary-100 text-secondary-700 border border-[#E2E8F0] rounded-lg hover:bg-primary-700/30 disabled:opacity-50"
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
                          className="px-3 py-1.5 text-xs bg-primary-700 text-white rounded-lg hover:opacity-90"
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
                  <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 w-full max-w-md">
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
                            className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:border-primary-600 focus:outline-none"
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
                        className="flex-1 px-4 py-2 bg-primary-700 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                      >
                        {connectLoading ? 'Ansluter...' : 'Testa & Anslut'}
                      </button>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Lead Sources / Lead-generering */}
            {!canAccess('lead_generation') ? (
              <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-green-100">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Leadkällor</h2>
                    <p className="text-sm text-gray-400">Importera leads från externa plattformar</p>
                  </div>
                </div>
                <UpgradePrompt featureKey="lead_generation" inline />
              </div>
            ) : (
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-green-100">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900">Leadkällor</h2>
                    <p className="text-sm text-gray-400">Importera leads från externa plattformar</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowAddLeadSource(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-primary-700 text-white rounded-lg hover:opacity-90"
                >
                  <Plus className="w-4 h-4" />
                  Lägg till
                </button>
              </div>

              {/* Add new lead source form */}
              {showAddLeadSource && (
                <div className="p-4 bg-gray-50 rounded-xl border border-[#E2E8F0] mb-4 space-y-3">
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Plattform</label>
                    <select
                      value={newLeadSourcePlatform}
                      onChange={e => setNewLeadSourcePlatform(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 focus:outline-none focus:border-primary-500"
                    >
                      <option value="offerta">Offerta.se</option>
                      <option value="servicefinder">ServiceFinder</option>
                      <option value="byggahus">Byggahus.se</option>
                      <option value="website">Egen hemsida</option>
                      <option value="email">E-post vidarebefordring</option>
                      <option value="manual">Manuell</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-500 mb-1">Namn / Etikett</label>
                    <input
                      type="text"
                      value={newLeadSourceName}
                      onChange={e => setNewLeadSourceName(e.target.value)}
                      placeholder="T.ex. Offerta Stockholm"
                      className="w-full px-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setShowAddLeadSource(false); setNewLeadSourceName('') }}
                      className="flex-1 px-3 py-2 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200"
                    >
                      Avbryt
                    </button>
                    <button
                      onClick={handleAddLeadSource}
                      disabled={addingLeadSource || !newLeadSourceName.trim()}
                      className="flex-1 px-3 py-2 text-sm bg-primary-700 text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      {addingLeadSource ? 'Lägger till...' : 'Lägg till källa'}
                    </button>
                  </div>
                </div>
              )}

              {/* List of lead sources */}
              {leadSourcesLoading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
              ) : leadSources.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Inga leadkällor konfigurerade</p>
                  <p className="text-xs text-gray-400 mt-1">Lägg till plattformar som Offerta.se eller ServiceFinder för att importera leads automatiskt</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {leadSources.map((source: any) => {
                    const platformLabels: Record<string, string> = {
                      offerta: 'Offerta.se',
                      servicefinder: 'ServiceFinder',
                      byggahus: 'Byggahus.se',
                      website: 'Hemsida',
                      email: 'E-post',
                      manual: 'Manuell',
                    }
                    const platformColors: Record<string, string> = {
                      offerta: 'bg-orange-100 text-orange-700',
                      servicefinder: 'bg-primary-100 text-primary-700',
                      byggahus: 'bg-yellow-100 text-yellow-700',
                      website: 'bg-purple-100 text-purple-700',
                      email: 'bg-gray-100 text-gray-700',
                      manual: 'bg-gray-100 text-gray-700',
                    }
                    return (
                      <div key={source.id} className="p-4 bg-gray-50 rounded-xl border border-[#E2E8F0]">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${platformColors[source.platform] || 'bg-gray-100 text-gray-700'}`}>
                              {platformLabels[source.platform] || source.platform}
                            </span>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{source.name}</p>
                              <p className="text-xs text-gray-400">
                                {source.leads_imported || 0} leads importerade
                                {source.last_import_at && ` · Senast ${new Date(source.last_import_at).toLocaleDateString('sv-SE')}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleToggleLeadSource(source.id, source.is_active)}
                              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${source.is_active ? 'bg-primary-800' : 'bg-gray-300'}`}
                            >
                              <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${source.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                            </button>
                            <button
                              onClick={() => handleDeleteLeadSource(source.id)}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Inbound email for email-based platforms */}
                        {source.inbound_email && (source.platform === 'offerta' || source.platform === 'servicefinder' || source.platform === 'email') && (
                          <div className="mt-3 p-3 bg-white rounded-lg border border-[#E2E8F0]">
                            <p className="text-xs text-gray-500 mb-1">Vidarebefodra leads till denna adress:</p>
                            <div className="flex items-center gap-2">
                              <code className="flex-1 text-xs text-secondary-700 bg-primary-50 px-2 py-1 rounded font-mono break-all">
                                {source.inbound_email}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(source.inbound_email)
                                  showToast('Kopierad!', 'success')
                                }}
                                className="px-2 py-1 text-xs text-secondary-700 bg-primary-50 rounded hover:bg-primary-100"
                              >
                                Kopiera
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Setup instructions per platform */}
                        {source.platform === 'offerta' && (
                          <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                            <p className="text-xs font-medium text-amber-800 mb-1">Så kopplar du Offerta.se:</p>
                            <ol className="text-xs text-amber-700 space-y-0.5 list-decimal list-inside">
                              <li>Logga in på Offerta.se → Inställningar</li>
                              <li>Under &quot;Notifieringar&quot;, lägg till e-postadressen ovan</li>
                              <li>Nya förfrågningar skickas hit och skapar leads automatiskt</li>
                            </ol>
                          </div>
                        )}
                        {source.platform === 'servicefinder' && (
                          <div className="mt-3 p-3 bg-primary-50 rounded-lg border border-[#E2E8F0]">
                            <p className="text-xs font-medium text-primary-800 mb-1">Så kopplar du ServiceFinder:</p>
                            <ol className="text-xs text-primary-700 space-y-0.5 list-decimal list-inside">
                              <li>Logga in på ServiceFinder → Mitt konto → Notiser</li>
                              <li>Ställ in e-postadressen ovan för jobbnotiser</li>
                              <li>Nya jobb importeras automatiskt som leads</li>
                            </ol>
                          </div>
                        )}
                        {source.platform === 'website' && (
                          <div className="mt-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <p className="text-xs font-medium text-purple-800 mb-1">Hemsida-integration:</p>
                            <p className="text-xs text-purple-700">Konfigurera ditt kontaktformulär att skicka till e-postadressen ovan, eller lägg till en webhook mot <code className="bg-purple-100 px-1 rounded">/api/lead-sources/webhook</code></p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Info about how lead import works */}
              {leadSources.length > 0 && (
                <div className="mt-4 p-3 bg-primary-50 rounded-lg border border-[#E2E8F0]">
                  <p className="text-xs text-primary-700">
                    <strong>Så fungerar det:</strong> När e-post tas emot på den unika adressen parsas innehållet och skapar automatiskt en lead i din pipeline med rätt källa markerad.
                  </p>
                </div>
              )}
            </div>
            )}

            {/* Fler integrationer kommer */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
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
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">AI-assistent</h2>
            <p className="text-sm text-gray-400">Konfigurera hur Lisa svarar på samtal</p>
            
            <div>
              <label className="text-sm text-gray-500 mb-2 block">Hälsningsfras</label>
              <textarea
                value={config.greeting_script || ''}
                onChange={(e) => setConfig({ ...config, greeting_script: e.target.value })}
                placeholder={`Hej och välkommen till ${config.business_name}! Mitt namn är Lisa, hur kan jag hjälpa dig idag?`}
                rows={4}
                className="w-full px-4 py-3 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:border-[#0F766E] resize-none"
              />
              <p className="text-xs text-gray-400 mt-1">Detta säger AI-assistenten när den svarar</p>
              <Link
              href="/dashboard/settings/knowledge"
              className="mt-4 flex items-center justify-between p-4 bg-gradient-to-r from-primary-700/10 to-primary-600/10 border border-[#E2E8F0] rounded-xl hover:bg-primary-100 transition-all"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-secondary-700" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Knowledge Base</p>
                  <p className="text-xs text-gray-500">Lär AI:n om dina tjänster, priser och policyer</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-secondary-700" />
            </Link>
            </div>

            <div className="p-4 bg-primary-50 border border-[#E2E8F0] rounded-xl">
              <div className="flex items-start gap-3">
                <Bot className="w-5 h-5 text-secondary-700 mt-0.5" />
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

        {/* Autopilot Tab */}
        {activeTab === 'autopilot' && config && (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Zap className="w-5 h-5 text-amber-500" />
                  Autopilot-läge
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  När en offert accepteras förbereder AI:n ett komplett förslag som du godkänner med ett tryck.
                </p>
              </div>
              <button
                onClick={async () => {
                  const newVal = !config.autopilot_enabled
                  setConfig({ ...config, autopilot_enabled: newVal })
                  await supabase.from('business_config').update({ autopilot_enabled: newVal }).eq('business_id', business.business_id)
                }}
                className={`relative w-12 h-7 rounded-full transition-colors ${config.autopilot_enabled ? 'bg-primary-700' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${config.autopilot_enabled ? 'translate-x-5' : ''}`} />
              </button>
            </div>

            {config.autopilot_enabled && (
              <div className="space-y-4 pt-4 border-t border-gray-200">
                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Föreslå bokning</span>
                    <p className="text-xs text-gray-400">Hittar nästa lediga tid i din kalender</p>
                  </div>
                  <button
                    onClick={async () => {
                      const newVal = !config.autopilot_auto_book
                      setConfig({ ...config, autopilot_auto_book: newVal })
                      await supabase.from('business_config').update({ autopilot_auto_book: newVal }).eq('business_id', business.business_id)
                    }}
                    className={`relative w-10 h-6 rounded-full transition-colors ${config.autopilot_auto_book !== false ? 'bg-primary-700' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.autopilot_auto_book !== false ? 'translate-x-4' : ''}`} />
                  </button>
                </label>

                {config.autopilot_auto_book !== false && (
                  <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-gray-100">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Buffertdagar</label>
                      <input
                        type="number"
                        min={0}
                        max={14}
                        value={config.autopilot_booking_buffer_days ?? 2}
                        onChange={async e => {
                          const val = parseInt(e.target.value) || 2
                          setConfig({ ...config, autopilot_booking_buffer_days: val })
                          await supabase.from('business_config').update({ autopilot_booking_buffer_days: val }).eq('business_id', business.business_id)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Jobblängd (timmar)</label>
                      <input
                        type="number"
                        min={1}
                        max={16}
                        value={config.autopilot_default_duration_hours ?? 4}
                        onChange={async e => {
                          const val = parseInt(e.target.value) || 4
                          setConfig({ ...config, autopilot_default_duration_hours: val })
                          await supabase.from('business_config').update({ autopilot_default_duration_hours: val }).eq('business_id', business.business_id)
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                  </div>
                )}

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Förbered kund-SMS</span>
                    <p className="text-xs text-gray-400">AI:n skriver ett bekräftelse-SMS</p>
                  </div>
                  <button
                    onClick={async () => {
                      const newVal = !config.autopilot_auto_sms
                      setConfig({ ...config, autopilot_auto_sms: newVal })
                      await supabase.from('business_config').update({ autopilot_auto_sms: newVal }).eq('business_id', business.business_id)
                    }}
                    className={`relative w-10 h-6 rounded-full transition-colors ${config.autopilot_auto_sms !== false ? 'bg-primary-700' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.autopilot_auto_sms !== false ? 'translate-x-4' : ''}`} />
                  </button>
                </label>

                <label className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-gray-700">Generera materiallista</span>
                    <p className="text-xs text-gray-400">Extraherar material från offertrader</p>
                  </div>
                  <button
                    onClick={async () => {
                      const newVal = !config.autopilot_auto_materials
                      setConfig({ ...config, autopilot_auto_materials: newVal })
                      await supabase.from('business_config').update({ autopilot_auto_materials: newVal }).eq('business_id', business.business_id)
                    }}
                    className={`relative w-10 h-6 rounded-full transition-colors ${config.autopilot_auto_materials !== false ? 'bg-primary-700' : 'bg-gray-300'}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.autopilot_auto_materials !== false ? 'translate-x-4' : ''}`} />
                  </button>
                </label>

                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>Ingenting sker utan att du godkänner det i Godkännanden. Autopiloten föreslår — du beslutar.</span>
                </div>
              </div>
            )}

            {/* 4-eyes / Dubbelt godkännande */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    🔒 Dubbelt godkännande
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Offerter och projektstängningar över en viss summa kräver admin-godkännande
                  </p>
                </div>
                <button
                  onClick={async () => {
                    const newVal = !config.four_eyes_enabled
                    setConfig({ ...config, four_eyes_enabled: newVal })
                    await supabase.from('business_config').update({ four_eyes_enabled: newVal }).eq('business_id', business.business_id)
                  }}
                  className={`relative w-10 h-6 rounded-full transition-colors ${config.four_eyes_enabled ? 'bg-primary-700' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.four_eyes_enabled ? 'translate-x-4' : ''}`} />
                </button>
              </div>

              {config.four_eyes_enabled && (
                <div className="pt-4 border-t border-gray-100 space-y-4">
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1">Beloppsträskel</label>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500">Kräv godkännande för belopp över</span>
                      <input
                        type="number"
                        value={config.four_eyes_threshold_sek || 50000}
                        onChange={async (e) => {
                          const val = parseInt(e.target.value) || 50000
                          setConfig({ ...config, four_eyes_threshold_sek: val })
                          await supabase.from('business_config').update({ four_eyes_threshold_sek: val }).eq('business_id', business.business_id)
                        }}
                        onFocus={(e) => e.target.select()}
                        className="w-28 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm text-right focus:outline-none focus:border-primary-600"
                      />
                      <span className="text-sm text-gray-500">kr</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-400">
                    Gäller offertskickning och projektstängning. Admin och ägare kan alltid godkänna direkt.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Subscription Tab */}
        {activeTab === 'pipeline' && (
          <PipelineSettings businessId={business.business_id} />
        )}

        {activeTab === 'subscription' && (
          <div className="space-y-6">
            {/* Nuvarande plan - snabbvy */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Din prenumeration</h2>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gradient-to-r from-primary-700/10 to-primary-600/10 border border-[#E2E8F0] rounded-xl mb-4 gap-4">
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
                    {currentPlan === 'Professional' ? '5 995' : currentPlan === 'Business' ? '11 995' : '2 495'}
                  </p>
                  <p className="text-gray-400 text-sm">kr/mån</p>
                </div>
              </div>

              {config.subscription_status === 'trial' && trialDaysLeft !== null && (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-4">
                  <p className="text-amber-600 text-sm">
                    Din provperiod går ut om {trialDaysLeft} dagar. Uppgradera för att fortsätta använda tjänsten.
                  </p>
                </div>
              )}

              <Link
                href="/dashboard/settings/billing"
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 rounded-xl border border-[#E2E8F0] transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-700 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Prenumeration & Fakturering</p>
                    <p className="text-xs text-gray-500">Hantera plan, se användning och betalningshistorik</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </Link>
            </div>

            {/* SMS-användning */}
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">SMS-användning denna månad</h2>

              <SMSUsageWidget businessId={business.business_id} plan={currentPlan} />
            </div>

            {/* Referral */}
            <ReferralWidget businessId={business.business_id} />
          </div>
        )}

        {/* Preferences Tab */}
        {activeTab === 'economics' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Ekonomi</h2>
              <p className="text-sm text-gray-500 mt-1">Används för lönsamhetsberäkningar och estimat på dashboarden</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E2E8F0] p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Din timkostnad</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={econPrefs.hourly_cost_sek}
                    onChange={e => setEconPrefs(p => ({ ...p, hourly_cost_sek: Number(e.target.value) || 0 }))}
                    className="w-32 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-primary-500"
                    min={0}
                  />
                  <span className="text-sm text-gray-400">kr/h</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Vad din tid kostar — används för att beräkna din faktiska vinst per jobb</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Månatlig overhead</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={econPrefs.overhead_monthly_sek}
                    onChange={e => setEconPrefs(p => ({ ...p, overhead_monthly_sek: Number(e.target.value) || 0 }))}
                    className="w-32 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-primary-500"
                    min={0}
                  />
                  <span className="text-sm text-gray-400">kr/månad</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Bil, verktyg, försäkringar och andra fasta månadskostnader</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Marginalmål</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={econPrefs.margin_target_percent}
                    onChange={e => setEconPrefs(p => ({ ...p, margin_target_percent: Number(e.target.value) || 0 }))}
                    className="w-32 px-3 py-2 border border-[#E2E8F0] rounded-lg text-sm focus:outline-none focus:border-primary-500"
                    min={0}
                    max={100}
                  />
                  <span className="text-sm text-gray-400">%</span>
                </div>
                <p className="text-xs text-gray-400 mt-1">Din målmarginal — visar om du är över eller under mål</p>
              </div>
              <button
                onClick={async () => {
                  setEconSaving(true)
                  try {
                    // Spara timkostnad i pricing_settings, overhead + marginal direkt på business_config
                    const currentPricing = (config?.pricing_settings as Record<string, any>) || {}
                    const updatedPricing = { ...currentPricing, hourly_rate: econPrefs.hourly_cost_sek }
                    await supabase
                      .from('business_config')
                      .update({
                        pricing_settings: updatedPricing,
                        overhead_monthly_sek: econPrefs.overhead_monthly_sek,
                        margin_target_percent: econPrefs.margin_target_percent,
                      })
                      .eq('business_id', business.business_id)
                    showToast('Ekonomi-inställningar sparade', 'success')
                    fetchConfig()
                  } catch {
                    showToast('Kunde inte spara', 'error')
                  }
                  setEconSaving(false)
                }}
                disabled={econSaving}
                className="px-4 py-2 bg-primary-700 text-white rounded-lg text-sm font-medium hover:bg-primary-800 disabled:opacity-50 transition-colors"
              >
                {econSaving ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'preferences' && (
          <PreferencesTab businessId={business.business_id} />
        )}

        </div>{/* close content area */}
        </div>{/* close flex layout */}
      </div>
    </div>
    </PermissionGate>
  )
}

function PreferencesTab({ businessId }: { businessId: string }) {
  const [prefs, setPrefs] = useState<Array<{ id: string; key: string; value: string; source: string; updated_at: string }>>([])
  const [loading, setLoading] = useState(true)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: string }>({ show: false, message: '', type: 'success' })

  useEffect(() => { fetchPrefs() }, [businessId])

  async function fetchPrefs() {
    setLoading(true)
    try {
      const res = await fetch('/api/preferences')
      if (res.ok) {
        const { preferences } = await res.json()
        setPrefs(preferences || [])
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleAdd() {
    if (!newKey.trim() || !newValue.trim()) return
    setSaving(true)
    const res = await fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: newKey.trim(), value: newValue.trim() }),
    })
    if (res.ok) {
      setNewKey('')
      setNewValue('')
      await fetchPrefs()
      setToast({ show: true, message: 'Preferens sparad', type: 'success' })
      setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000)
    }
    setSaving(false)
  }

  async function handleDelete(key: string) {
    await fetch('/api/preferences', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
    })
    await fetchPrefs()
  }

  const SOURCE_LABEL: Record<string, string> = {
    agent: 'AI-agenten',
    user: 'Du',
    onboarding: 'Onboarding',
  }

  return (
    <div className="space-y-6">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-primary-100">
            <Star className="w-5 h-5 text-primary-700" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900">AI-preferenser</h2>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Inlärda preferenser som AI-agenten använder för att anpassa sitt beteende. Agenten kan lägga till preferenser
          automatiskt när den lär sig hur du jobbar, och du kan redigera dem här.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
          </div>
        ) : prefs.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Star className="w-8 h-8 mx-auto mb-2 text-gray-300" />
            <p className="text-sm">Inga preferenser inlärda ännu.</p>
            <p className="text-xs mt-1">AI-agenten lär sig om dig allt eftersom, eller så kan du lägga till manuellt nedan.</p>
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {prefs.map(pref => (
              <div key={pref.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-mono text-gray-700 font-medium">{pref.key}</span>
                    <span className="text-xs text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">
                      {SOURCE_LABEL[pref.source] || pref.source}
                    </span>
                  </div>
                  <p className="text-sm text-gray-900 mt-0.5">{pref.value}</p>
                </div>
                <button
                  onClick={() => handleDelete(pref.key)}
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add new preference */}
        <div className="border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Lägg till preferens</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nyckel, ex: min_job_value_sek"
              value={newKey}
              onChange={e => setNewKey(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none"
            />
            <input
              type="text"
              placeholder="Värde, ex: 5000"
              value={newValue}
              onChange={e => setNewValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-600 focus:border-transparent outline-none"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !newKey.trim() || !newValue.trim()}
              className="px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 disabled:opacity-50 transition-all flex items-center gap-1"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              Lägg till
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReferralWidget({ businessId }: { businessId: string }) {
  const [data, setData] = useState<{ code: string; referral_url: string; referral_count: number } | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch('/api/referral')
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setData(d))
      .catch(() => {})
  }, [businessId])

  async function copyUrl() {
    if (!data) return
    await navigator.clipboard.writeText(data.referral_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!data) return null

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">Tipsa en kollega 🎁</h2>
      <p className="text-sm text-gray-500 mb-4">
        Dela din referralslänk — vi belönar dig med 1 månads gratis när din kontakt tecknar en prenumeration.
        Du har {data.referral_count} godkända tips hittills.
      </p>
      <div className="flex gap-2">
        <input
          readOnly
          value={data.referral_url}
          className="flex-1 px-3 py-2 text-sm bg-gray-50 border border-gray-300 rounded-lg text-gray-700 select-all"
          onClick={e => (e.target as HTMLInputElement).select()}
        />
        <button
          onClick={copyUrl}
          className="px-4 py-2 bg-primary-700 hover:bg-primary-800 text-white text-sm font-medium rounded-lg transition-all"
        >
          {copied ? 'Kopierat!' : 'Kopiera'}
        </button>
      </div>
      <p className="text-xs text-gray-400 mt-2">Din kod: <span className="font-mono font-semibold">{data.code}</span></p>
    </div>
  )
}

function CallHandlingModeSection({ businessId }: { businessId: string }) {
  const [mode, setMode] = useState('agent_with_transfer')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const modes = [
    {
      value: 'agent_always',
      label: 'Agenten svarar alltid',
      description: 'Agenten hanterar alla samtal, du behöver aldrig svara telefon',
    },
    {
      value: 'agent_with_transfer',
      label: 'Agenten filtrerar, du tar vid vid behov',
      description: 'Agenten svarar, men kan koppla till dig om kunden vill prata direkt',
    },
    {
      value: 'human_work_hours',
      label: 'Du svarar under arbetstid, agenten tar kvällar och helger',
      description: 'Under arbetstid ringer din telefon direkt — agenten täcker resten',
    },
  ]

  useEffect(() => {
    fetch('/api/automation/settings')
      .then(r => r.json())
      .then(data => {
        setMode(data?.call_handling_mode || 'agent_with_transfer')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async (newMode: string) => {
    setMode(newMode)
    setSaving(true)
    try {
      await fetch('/api/automation/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ call_handling_mode: newMode }),
      })
    } catch { /* ignore */ }
    setSaving(false)
  }

  if (loading) return null

  return (
    <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
      <div className="flex items-center gap-2 mb-4">
        <PhoneCall className="w-5 h-5 text-primary-700" />
        <h2 className="text-lg font-semibold text-gray-900">Samtalsläge</h2>
      </div>
      <p className="text-sm text-gray-400 mb-4">Hur vill du hantera inkommande samtal?</p>
      <div className="space-y-2">
        {modes.map(m => (
          <button
            key={m.value}
            onClick={() => handleSave(m.value)}
            disabled={saving}
            className={`w-full p-4 rounded-xl border text-left transition-all ${
              mode === m.value
                ? 'bg-primary-50 border-primary-300'
                : 'bg-gray-50 border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                mode === m.value ? 'border-primary-700' : 'border-gray-300'
              }`}>
                {mode === m.value && <div className="w-2 h-2 rounded-full bg-primary-700" />}
              </div>
              <p className={`text-sm font-medium ${mode === m.value ? 'text-primary-700' : 'text-gray-900'}`}>{m.label}</p>
            </div>
            <p className="text-xs text-gray-400 mt-1 ml-6">{m.description}</p>
          </button>
        ))}
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
  const [leadStages, setLeadStages] = useState<Array<{ id: string; key: string; label: string; color: string; sort_order: number; creates_project: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: string }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    fetchSettings()
  }, [businessId])

  async function fetchSettings() {
    try {
      const [settingsRes, stagesRes, leadStagesRes] = await Promise.all([
        fetch('/api/pipeline/settings'),
        fetch('/api/pipeline/stages'),
        fetch('/api/leads/pipeline-stages'),
      ])
      if (settingsRes.ok) {
        const data = await settingsRes.json()
        setSettings(prev => ({ ...prev, ...data }))
      }
      if (stagesRes.ok) {
        const data = await stagesRes.json()
        setStages(data.stages || [])
      }
      if (leadStagesRes.ok) {
        const data = await leadStagesRes.json()
        setLeadStages(data.stages || [])
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
        <Loader2 className="w-6 h-6 text-secondary-700 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-[9999] px-4 py-3 rounded-xl text-sm font-medium ${
          toast.type === 'success' ? 'bg-emerald-100 text-emerald-600 border border-emerald-200' : 'bg-red-100 text-red-600 border border-red-200'
        }`}>
          {toast.message}
        </div>
      )}

      {/* AI Automation */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
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
                  (settings as any)[key] ? 'bg-primary-700' : 'bg-gray-200'
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
                settings.ai_analyze_calls ? 'bg-primary-700' : 'bg-gray-200'
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
              <span className="text-sm text-secondary-700 font-mono">{settings.ai_auto_move_threshold}%</span>
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
              <span className="text-sm text-secondary-700 font-mono">{settings.ai_create_lead_threshold}%</span>
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
                settings.show_ai_activity ? 'bg-primary-700' : 'bg-gray-200'
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
          className="mt-6 flex items-center px-6 py-3 bg-primary-700 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Spara pipeline-inställningar
        </button>
      </div>

      {/* Pipeline Stages */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Pipeline-steg</h2>
        <p className="text-sm text-gray-400 mb-4">Stegen i din säljpipeline</p>

        <div className="space-y-2">
          {stages.filter(s => !s.is_lost).map((stage, i) => (
            <div key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <span className="text-gray-400 text-sm w-6">{i + 1}.</span>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-gray-900 text-sm flex-1">{stage.name}</span>
              {stage.is_won && <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">{stage.name}</span>}
            </div>
          ))}
          {stages.filter(s => s.is_lost).map((stage) => (
            <div key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border-t border-gray-300 mt-2">
              <span className="text-gray-400 text-sm w-6" />
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
              <span className="text-gray-900 text-sm flex-1">{stage.name}</span>
              <span className="text-xs text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{stage.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lead Pipeline — Automatiskt projekt */}
      {leadStages.length > 0 && (
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Automatiskt projekt</h2>
          <p className="text-sm text-gray-400 mb-4">Välj vilka lead-steg som automatiskt skapar ett projekt</p>

          <div className="space-y-2">
            {leadStages.filter(s => s.key !== 'lost').map((stage) => (
              <label key={stage.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-all">
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                <span className="text-gray-900 text-sm flex-1">{stage.label}</span>
                <div
                  className={`w-10 h-6 rounded-full transition-all relative cursor-pointer ${
                    stage.creates_project ? 'bg-primary-700' : 'bg-gray-200'
                  }`}
                  onClick={async (e) => {
                    e.preventDefault()
                    const newValue = !stage.creates_project
                    setLeadStages(prev => prev.map(s => s.id === stage.id ? { ...s, creates_project: newValue } : s))
                    try {
                      await fetch('/api/leads/pipeline-stages', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stage_id: stage.id, creates_project: newValue }),
                      })
                    } catch {
                      setLeadStages(prev => prev.map(s => s.id === stage.id ? { ...s, creates_project: !newValue } : s))
                    }
                  }}
                >
                  <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    stage.creates_project ? 'left-5' : 'left-1'
                  }`} />
                </div>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
