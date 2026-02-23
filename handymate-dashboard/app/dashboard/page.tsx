'use client'

import { useEffect, useState } from 'react'
import {
  Calendar,
  CalendarDays,
  Users,
  TrendingUp,
  TrendingDown,
  Clock,
  ArrowRight,
  FileText,
  Sparkles,
  Mic,
  FolderKanban,
  XCircle,
  BarChart3,
  Receipt,
  UserPlus,
  Activity,
  Phone,
  Zap,
  Mail,
  Globe,
  X
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import OnboardingChecklist from '@/components/OnboardingChecklist'

interface Booking {
  booking_id: string
  customer_id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string
  customer?: {
    name: string
    phone_number: string
  }
}

interface DashboardStats {
  bookings: { week: number; month: number; trend: number }
  customers: { new_this_month: number; total: number; trend: number }
  calls: { week: number; month: number; trend: number }
  quotes: { sent: number; accepted: number; acceptance_rate: number; total_value: number; accepted_value: number }
  time: { week_hours: number; month_hours: number }
  revenue: { month: number }
  ai: { pending_suggestions: number }
  bookings_per_day: { date: string; count: number }[]
}

interface OnboardingData {
  email_confirmed_at?: string | null
  assigned_phone_number?: string | null
  phone_setup_type?: string | null
  forwarding_confirmed?: boolean
  working_hours?: any
  logo_url?: string | null
  onboarding_dismissed?: boolean
  onboarding_data?: Record<string, unknown>
  lead_sources?: string[]
  google_calendar_connected?: boolean
  gmail_enabled?: boolean
}

interface RecentActivity {
  activity_id: string
  activity_type: string
  title: string
  description: string | null
  created_at: string
  customer?: { name: string } | null
}

export default function DashboardPage() {
  const business = useBusiness()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null)
  const [callCount, setCallCount] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [activeProjects, setActiveProjects] = useState(0)
  const [pipelineStats, setPipelineStats] = useState<{
    byStage: Array<{ stage: string; slug: string; color: string; count: number; value: number }>
    totalDeals: number; totalValue: number; wonValue: number; lostCount: number; newLeadsToday: number; needsFollowUp: number
  } | null>(null)
  const [scheduleToday, setScheduleToday] = useState<{ count: number; people: number; entries: { title: string; color: string; time: string }[] }>({ count: 0, people: 0, entries: [] })
  const [profitProjects, setProfitProjects] = useState<{
    project_id: string; name: string; status: string
    revenue: number; costs: number; margin_amount: number; margin_percent: number
    hours_worked: number; budget_hours: number
  }[]>([])
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())
  const [speedData, setSpeedData] = useState<{
    avg_response_seconds: number
    industry_avg_seconds: number
    total_leads: number
    response_distribution: Record<string, number>
    win_rate_by_speed: Record<string, number>
  } | null>(null)

  useEffect(() => {
    fetchData()
    fetchSpeedToLead()
  }, [business.business_id])

  async function fetchData() {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Dagens bokningar
    const { data: bookingsData } = await supabase
      .from('booking')
      .select(`
        booking_id,
        customer_id,
        scheduled_start,
        scheduled_end,
        status,
        notes,
        customer (
          name,
          phone_number
        )
      `)
      .eq('business_id', business.business_id)
      .gte('scheduled_start', todayStr)
      .lt('scheduled_start', todayStr + 'T23:59:59')
      .order('scheduled_start', { ascending: true })

    setBookings(bookingsData || [])

    // Hämta onboarding-data
    const { data: configData } = await supabase
      .from('business_config')
      .select(`
        email_confirmed_at,
        assigned_phone_number,
        phone_setup_type,
        forwarding_confirmed,
        working_hours,
        logo_url,
        onboarding_dismissed,
        onboarding_data,
        lead_sources
      `)
      .eq('business_id', business.business_id)
      .single()

    if (configData) {
      // Check Google Calendar connection
      const { data: calConn } = await supabase
        .from('calendar_connection')
        .select('id, gmail_sync_enabled')
        .eq('business_id', business.business_id)
        .maybeSingle()

      const enriched = {
        ...configData,
        google_calendar_connected: !!calConn,
        gmail_enabled: calConn?.gmail_sync_enabled || false,
      }
      setOnboardingData(enriched)
      setShowOnboarding(!configData.onboarding_dismissed)
      // Load dismissed reminders
      const obData = (configData.onboarding_data || {}) as Record<string, unknown>
      const dismissed = (obData.dismissed_reminders as string[]) || []
      if (dismissed.length > 0) {
        setDismissedReminders(new Set(dismissed))
      }
    }

    // Hämta antal samtal
    const { count: calls } = await supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)

    setCallCount(calls || 0)

    // Hämta aktiva projekt
    const { count: projectCount } = await supabase
      .from('project')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .in('status', ['planning', 'active', 'paused'])

    setActiveProjects(projectCount || 0)

    // Hämta dagens schema
    try {
      const schedRes = await fetch(`/api/schedule?start_date=${todayStr}&end_date=${todayStr}`)
      if (schedRes.ok) {
        const schedData = await schedRes.json()
        const entries = schedData.entries || []
        const uniquePeople = new Set(entries.map((e: any) => e.business_user_id))
        setScheduleToday({
          count: entries.length,
          people: uniquePeople.size,
          entries: entries.slice(0, 3).map((e: any) => ({
            title: e.title,
            color: e.color || e.business_user?.color || '#8B5CF6',
            time: e.all_day ? 'Heldag' : new Date(e.start_datetime).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
          }))
        })
      }
    } catch { /* ignore */ }

    // Hämta pipeline-statistik
    try {
      const pipeRes = await fetch('/api/pipeline/stats')
      if (pipeRes.ok) {
        const pipeData = await pipeRes.json()
        setPipelineStats(pipeData)
      }
    } catch { /* ignore */ }

    // Hämta statistik från API
    try {
      const response = await fetch(`/api/dashboard/stats?businessId=${business.business_id}`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to fetch stats:', error)
    }

    // Hämta projektlönsamhet
    try {
      const profitRes = await fetch('/api/dashboard/profitability')
      if (profitRes.ok) {
        const profitData = await profitRes.json()
        setProfitProjects(profitData.projects || [])
      }
    } catch { /* ignore */ }

    // Hämta senaste aktivitet
    try {
      const { data: activityData } = await supabase
        .from('customer_activity')
        .select('activity_id, activity_type, title, description, created_at, customer:customer_id(name)')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: false })
        .limit(5)

      setRecentActivity(activityData || [])
    } catch { /* ignore */ }

    setLoading(false)
  }

  async function fetchSpeedToLead() {
    try {
      const res = await fetch(`/api/analytics/speed-to-lead?period=30d&business_id=${business.business_id}`)
      if (res.ok) {
        const data = await res.json()
        setSpeedData(data)
      }
    } catch { /* ignore if feature not available */ }
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  }

  const getServiceFromNotes = (notes: string) => {
    if (!notes) return 'Tjänst'
    return notes.split(' - ')[0] || notes.substring(0, 20)
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 10) return 'God morgon'
    if (hour < 18) return 'Hej'
    return 'God kväll'
  }

  const getFirstName = () => {
    return business.contact_name?.split(' ')[0] || ''
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)
  }

  const TrendIndicator = ({ value }: { value: number }) => {
    if (value === 0) return null
    const isPositive = value > 0
    return (
      <span className={`flex items-center text-xs ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
        {Math.abs(value)}%
      </span>
    )
  }

  const BookingsChart = ({ data }: { data: { date: string; count: number }[] }) => {
    const maxCount = Math.max(...data.map(d => d.count), 1)
    const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

    return (
      <div className="flex items-end justify-between h-28 gap-2">
        {data.map((day, i) => {
          const height = Math.max((day.count / maxCount) * 100, 8)
          const date = new Date(day.date)
          const dayName = dayNames[date.getDay()]
          const isToday = day.date === new Date().toISOString().split('T')[0]

          return (
            <div key={i} className="flex flex-col items-center flex-1">
              <div className="w-full flex flex-col items-center justify-end h-20">
                <span className="text-xs text-gray-500 mb-1 font-medium">{day.count}</span>
                <div
                  className={`w-full max-w-[56px] rounded-t-md transition-all ${
                    isToday
                      ? 'bg-gradient-to-t from-blue-500 to-cyan-400'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  style={{ height: `${height}%`, minHeight: '4px' }}
                />
              </div>
              <span className={`text-xs mt-1.5 font-medium ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                {dayName}
              </span>
            </div>
          )
        })}
      </div>
    )
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'booking_created':
      case 'booking_updated':
        return <Calendar className="w-3.5 h-3.5 text-blue-500" />
      case 'quote_sent':
      case 'quote_accepted':
      case 'quote_declined':
        return <FileText className="w-3.5 h-3.5 text-cyan-500" />
      case 'invoice_sent':
      case 'invoice_paid':
        return <Receipt className="w-3.5 h-3.5 text-amber-500" />
      case 'call_recorded':
        return <Mic className="w-3.5 h-3.5 text-purple-500" />
      default:
        return <Activity className="w-3.5 h-3.5 text-gray-400" />
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  const todaysBookingsCount = bookings.length

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
            {getGreeting()}{getFirstName() ? `, ${getFirstName()}` : ''}!
          </h1>
          <p className="text-sm sm:text-base text-gray-500">
            Översikt för {business.business_name}
          </p>
        </div>

        {/* Onboarding Checklist */}
        {showOnboarding && onboardingData && (
          <OnboardingChecklist
            businessId={business.business_id}
            businessConfig={onboardingData}
            callCount={callCount}
            onDismiss={() => setShowOnboarding(false)}
            onUpdate={fetchData}
          />
        )}

        {/* AI Inbox Banner — fixed: no floating "0" when pending_suggestions is 0 */}
        {(stats?.ai?.pending_suggestions ?? 0) > 0 && (
          <Link href="/dashboard/ai-inbox">
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl hover:border-blue-300 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {stats!.ai.pending_suggestions} AI-förslag väntar
                    </p>
                    <p className="text-sm text-gray-500">
                      Från samtalsanalys – granska och godkänn
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </Link>
        )}

        {/* Phone setup banner — show when phone not configured and onboarding dismissed */}
        {!showOnboarding && onboardingData && !onboardingData.assigned_phone_number && (
          <Link href="/dashboard/settings/phone">
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl hover:border-blue-300 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-500">
                    <Phone className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      Koppla ditt nummer och missa aldrig ett samtal igen
                    </p>
                    <p className="text-sm text-gray-500">
                      Det tar bara 5 minuter.
                    </p>
                  </div>
                </div>
                <span className="text-blue-600 font-medium text-sm flex items-center gap-1">
                  Kom igång <ArrowRight className="w-4 h-4" />
                </span>
              </div>
            </div>
          </Link>
        )}

        {/* Setup reminder banners — show one at a time after onboarding */}
        {!showOnboarding && onboardingData && (
          (() => {
            const reminders = []
            if (!onboardingData.google_calendar_connected && !dismissedReminders.has('google')) {
              reminders.push({ id: 'google', icon: Calendar, gradient: 'from-red-50 to-orange-50', border: 'border-red-200', iconBg: 'from-red-500 to-orange-500', title: 'Koppla Google Calendar för att synka bokningar', desc: 'Dina bokningar visas i Google Calendar automatiskt.', href: '/dashboard/settings?tab=integrations', cta: 'Koppla nu' })
            }
            if (!onboardingData.gmail_enabled && !dismissedReminders.has('gmail')) {
              reminders.push({ id: 'gmail', icon: Mail, gradient: 'from-blue-50 to-cyan-50', border: 'border-blue-200', iconBg: 'from-blue-500 to-cyan-500', title: 'Koppla Gmail för att se all kundkommunikation', desc: 'Se email-historik direkt i kundkortet.', href: '/dashboard/settings?tab=integrations', cta: 'Aktivera' })
            }
            if ((!onboardingData.lead_sources || onboardingData.lead_sources.length === 0) && !dismissedReminders.has('leads')) {
              reminders.push({ id: 'leads', icon: Globe, gradient: 'from-emerald-50 to-teal-50', border: 'border-emerald-200', iconBg: 'from-emerald-500 to-teal-500', title: 'Konfigurera lead-källor för att få in kunder automatiskt', desc: 'Ta emot förfrågningar från Offerta, ServiceFinder m.fl.', href: '/dashboard/settings?tab=integrations', cta: 'Kom igång' })
            }
            const r = reminders[0]
            if (!r) return null
            return (
              <div className={`mb-6 p-4 bg-gradient-to-r ${r.gradient} border ${r.border} rounded-xl`}>
                <div className="flex items-center justify-between">
                  <Link href={r.href} className="flex items-center gap-3 flex-1">
                    <div className={`p-2 rounded-lg bg-gradient-to-br ${r.iconBg}`}>
                      <r.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{r.title}</p>
                      <p className="text-sm text-gray-500">{r.desc}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 ml-3">
                    <Link href={r.href} className="text-blue-600 font-medium text-sm flex items-center gap-1 whitespace-nowrap">
                      {r.cta} <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button
                      onClick={async () => {
                        setDismissedReminders(prev => new Set(prev).add(r.id))
                        // Persist dismiss
                        const existing = (onboardingData.onboarding_data || {}) as Record<string, unknown>
                        const dismissed = ((existing.dismissed_reminders as string[]) || [])
                        await supabase
                          .from('business_config')
                          .update({ onboarding_data: { ...existing, dismissed_reminders: [...dismissed, r.id] } })
                          .eq('business_id', business.business_id)
                      }}
                      className="p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })()
        )}

        {/* KPI cards — 2 per row on mobile, 5 on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <TrendIndicator value={stats?.bookings?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.bookings?.week || 0}</p>
            <p className="text-xs text-gray-400">Bokningar denna vecka</p>
          </div>

          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500">
                <Users className="w-4 h-4 text-white" />
              </div>
              <TrendIndicator value={stats?.customers?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.customers?.new_this_month || 0}</p>
            <p className="text-xs text-gray-400">Nya kunder i månad</p>
          </div>

          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <TrendIndicator value={stats?.calls?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.calls?.week || 0}</p>
            <p className="text-xs text-gray-400">Samtal denna vecka</p>
          </div>

          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                <Clock className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.time?.week_hours || 0}h</p>
            <p className="text-xs text-gray-400">Arbetad tid vecka</p>
          </div>

          <Link href="/dashboard/projects" className="bg-white shadow-sm rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500">
                <FolderKanban className="w-4 h-4 text-white" />
              </div>
              <ArrowRight className="w-3 h-3 text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeProjects}</p>
            <p className="text-xs text-gray-400">Aktiva projekt</p>
          </Link>
        </div>

        {/* Speed-to-Lead Widget */}
        {speedData && speedData.total_leads > 0 && (
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-500" />
                Svarstid
              </h3>
              <Link href="/dashboard/analytics" className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
                Detaljer <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-900">
                  {speedData.avg_response_seconds < 60
                    ? `${speedData.avg_response_seconds}s`
                    : speedData.avg_response_seconds < 3600
                    ? `${Math.round(speedData.avg_response_seconds / 60)}m`
                    : `${Math.round(speedData.avg_response_seconds / 3600)}h`
                  }
                </p>
                <p className="text-xs text-gray-400">Din snitt</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">4h 00m</p>
                <p className="text-xs text-gray-400">Branschen</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600">
                  {speedData.avg_response_seconds > 0 ? `${Math.round(speedData.industry_avg_seconds / speedData.avg_response_seconds)}x` : '-'}
                </p>
                <p className="text-xs text-gray-400">Snabbare</p>
              </div>
            </div>
            <div className="space-y-1.5">
              {[
                { label: '< 1 min', key: 'under_1_min' },
                { label: '1-15 min', key: '1_to_15_min' },
                { label: '15-60 min', key: '15_to_60_min' },
                { label: '1-4 tim', key: '1_to_4_hours' },
                { label: '> 4 tim', key: 'over_4_hours' },
              ].map(bucket => {
                const count = speedData.response_distribution[bucket.key] || 0
                const pct = speedData.total_leads > 0 ? (count / speedData.total_leads) * 100 : 0
                return (
                  <div key={bucket.key} className="flex items-center gap-2 text-xs">
                    <span className="w-14 text-gray-500 text-right">{bucket.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500 transition-all" style={{ width: `${Math.max(pct, 1)}%` }} />
                    </div>
                    <span className="w-8 text-gray-400 text-right">{count}</span>
                    <span className="w-10 text-gray-400 text-right">({Math.round(pct)}%)</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Main 2-column grid (50/50) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

          {/* ═══ Row 1: Dagens bokningar + Säljtratt ═══ */}

          {/* Dagens bokningar (compact, max 4) */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Dagens bokningar
                <span className="text-sm font-normal text-gray-400">({todaysBookingsCount})</span>
              </h2>
              <Link href="/dashboard/bookings" className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
                Visa alla <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {bookings.length === 0 ? (
              <div className="p-4 flex items-center justify-between">
                <p className="text-sm text-gray-400">Inga bokningar idag</p>
                <Link href="/dashboard/bookings" className="text-sm text-blue-600 hover:text-blue-500 font-medium">
                  Skapa bokning
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {bookings.slice(0, 4).map((booking) => (
                  <div key={booking.booking_id} className="px-4 py-3 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center min-w-0">
                        <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center border border-blue-100 flex-shrink-0">
                          <Clock className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="ml-3 min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">
                            {booking.customer?.name || 'Okänd kund'}
                          </p>
                          <p className="text-xs text-gray-400 truncate">
                            {getServiceFromNotes(booking.notes)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-medium text-gray-900 text-sm">
                          {formatTime(booking.scheduled_start)}
                        </p>
                        <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                          booking.status === 'confirmed'
                            ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
                            : 'bg-amber-50 text-amber-600 border border-amber-200'
                        }`}>
                          {booking.status === 'confirmed' ? 'Bekräftad' :
                           booking.status === 'pending' ? 'Väntar' : booking.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {bookings.length > 4 && (
                  <div className="p-3 text-center">
                    <Link href="/dashboard/bookings" className="text-sm text-blue-600 hover:text-blue-500 font-medium">
                      +{bookings.length - 4} fler bokningar →
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Säljtratt (horizontal bars with full stage names) */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                Säljtratt
              </h2>
              <Link href="/dashboard/pipeline" className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
                Pipeline <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {(() => {
              if (!pipelineStats?.byStage || pipelineStats.byStage.length === 0) {
                return (
                  <div className="py-4 text-center">
                    <p className="text-sm text-gray-400">Ingen pipeline-data ännu</p>
                    <Link href="/dashboard/pipeline" className="text-sm text-blue-600 hover:text-blue-500 mt-1 inline-block">
                      Gå till pipeline →
                    </Link>
                  </div>
                )
              }

              const funnelStages = pipelineStats.byStage.filter(s => s.slug !== 'lost')
              const totalDeals = funnelStages.reduce((sum, s) => sum + s.count, 0)

              // Simple summary for 0-1 deals
              if (totalDeals <= 1) {
                return (
                  <div className="py-4">
                    <p className="text-sm text-gray-600">
                      {totalDeals === 0 ? 'Inga aktiva deals i pipeline' : '1 aktiv deal i pipeline'}
                    </p>
                    {pipelineStats.totalValue > 0 && (
                      <p className="text-sm text-gray-500 mt-1">{formatCurrency(pipelineStats.totalValue)} kr i pipeline</p>
                    )}
                    <Link href="/dashboard/pipeline" className="text-sm text-blue-600 hover:text-blue-500 mt-2 inline-block">
                      Öppna pipeline →
                    </Link>
                  </div>
                )
              }

              const maxCount = Math.max(...funnelStages.map(s => s.count), 1)
              const showConversion = totalDeals >= 3

              const stageColors: Record<string, string> = {
                'new_lead': '#3B82F6',
                'contacted': '#06B6D4',
                'quote_sent': '#8B5CF6',
                'negotiation': '#F59E0B',
                'won': '#22C55E',
              }

              return (
                <div>
                  <div className="space-y-2">
                    {funnelStages.map((stage, i) => {
                      const barWidth = stage.count === 0 ? 3 : Math.max((stage.count / maxCount) * 100, 8)
                      const color = stageColors[stage.slug] || stage.color || '#6B7280'
                      const nextStage = funnelStages[i + 1]
                      const conversion = showConversion && nextStage && stage.count > 0
                        ? Math.round((nextStage.count / stage.count) * 100)
                        : null

                      return (
                        <div key={stage.slug}>
                          <Link
                            href={`/dashboard/pipeline?stage=${stage.slug}`}
                            className="flex items-center gap-3 group hover:bg-gray-50 rounded-lg p-1.5 -mx-1.5 transition-colors"
                          >
                            <span className="text-sm text-gray-600 w-28 sm:w-36 shrink-0 truncate">{stage.stage}</span>
                            <div className="flex-1 h-7 bg-gray-100 rounded-md overflow-hidden">
                              <div
                                className="h-full rounded-md transition-all duration-500 group-hover:brightness-110"
                                style={{ width: `${barWidth}%`, backgroundColor: color }}
                              />
                            </div>
                            <span className="text-sm font-bold text-gray-900 w-8 text-right shrink-0">{stage.count}</span>
                          </Link>
                          {conversion !== null && (
                            <div className="ml-28 sm:ml-36 pl-5 -mt-0.5 mb-0.5">
                              <span className="text-[10px] text-gray-400">↓ {conversion}%</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary */}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-4">
                      <span className="text-gray-500">{pipelineStats.totalDeals} aktiva</span>
                      {pipelineStats.totalValue > 0 && (
                        <span className="text-gray-500">{formatCurrency(pipelineStats.totalValue)} kr</span>
                      )}
                      {pipelineStats.wonValue > 0 && (
                        <span className="text-emerald-600 font-medium">{formatCurrency(pipelineStats.wonValue)} kr vunnet</span>
                      )}
                    </div>
                    {pipelineStats.lostCount > 0 && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <XCircle className="w-3 h-3 text-red-400" />
                        {pipelineStats.lostCount}
                      </span>
                    )}
                  </div>

                  {(pipelineStats.newLeadsToday > 0 || pipelineStats.needsFollowUp > 0) && (
                    <div className="mt-2 flex items-center gap-3 text-xs">
                      {pipelineStats.newLeadsToday > 0 && (
                        <span className="text-emerald-600">{pipelineStats.newLeadsToday} nya leads idag</span>
                      )}
                      {pipelineStats.needsFollowUp > 0 && (
                        <span className="text-amber-600">{pipelineStats.needsFollowUp} behöver uppföljning</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          {/* ═══ Row 2: Senaste aktivitet + Projektlönsamhet ═══ */}

          {/* Senaste aktivitet */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-blue-600" />
              Senaste aktivitet
            </h2>
            {recentActivity.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Ingen aktivitet ännu</p>
            ) : (
              <div className="space-y-3">
                {recentActivity.map((act) => (
                  <div key={act.activity_id} className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0">
                      {getActivityIcon(act.activity_type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-700 truncate">{act.title}</p>
                      {act.customer?.name && (
                        <p className="text-xs text-gray-400 truncate">{act.customer.name}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">
                      {formatTime(act.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Projektlönsamhet */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                Projektlönsamhet
              </h2>
              {profitProjects.length > 0 && (
                <Link href="/dashboard/projects" className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
                  Alla projekt <ArrowRight className="w-3 h-3" />
                </Link>
              )}
            </div>
            {profitProjects.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">Inga aktiva projekt</p>
            ) : (
              <div className="space-y-2">
                {profitProjects.slice(0, 5).map((p) => {
                  const color = p.margin_percent >= 20 ? 'emerald' : p.margin_percent >= 5 ? 'amber' : 'red'
                  return (
                    <Link
                      key={p.project_id}
                      href={`/dashboard/projects/${p.project_id}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-900 truncate">{p.name}</p>
                        <p className="text-xs text-gray-400">
                          {formatCurrency(p.revenue)} kr intäkter
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <p className={`text-sm font-bold ${
                          color === 'emerald' ? 'text-emerald-600' :
                          color === 'amber' ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {p.margin_percent}%
                        </p>
                        <div className={`w-2 h-2 rounded-full ${
                          color === 'emerald' ? 'bg-emerald-500' :
                          color === 'amber' ? 'bg-amber-500' : 'bg-red-500'
                        }`} />
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* ═══ Row 3: Dagens schema + Snabbåtgärder ═══ */}

          {/* Dagens schema */}
          <Link href="/dashboard/schedule" className="block bg-white shadow-sm rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-all group">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-600" />
                Dagens schema
              </h2>
              <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
            </div>
            {scheduleToday.count === 0 ? (
              <p className="text-sm text-gray-400">Inga schemalagda aktiviteter idag</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-3">
                  {scheduleToday.count} aktiviteter · {scheduleToday.people} {scheduleToday.people === 1 ? 'person' : 'personer'}
                </p>
                <div className="space-y-2">
                  {scheduleToday.entries.map((entry, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="text-sm text-gray-700 truncate flex-1">{entry.title}</span>
                      <span className="text-xs text-gray-400 shrink-0">{entry.time}</span>
                    </div>
                  ))}
                  {scheduleToday.count > 3 && (
                    <p className="text-xs text-blue-600">+{scheduleToday.count - 3} fler</p>
                  )}
                </div>
              </>
            )}
          </Link>

          {/* Snabbåtgärder (2x2 grid) */}
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
            <h2 className="text-base font-semibold text-gray-900 mb-4">Snabbåtgärder</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/dashboard/quotes/new"
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-blue-50 hover:border-blue-200 border border-gray-200 rounded-xl transition-all group min-h-[80px]"
              >
                <FileText className="w-6 h-6 text-blue-600 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-gray-700">Ny offert</span>
              </Link>
              <Link
                href="/dashboard/invoices"
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-cyan-50 hover:border-cyan-200 border border-gray-200 rounded-xl transition-all group min-h-[80px]"
              >
                <Receipt className="w-6 h-6 text-cyan-600 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-gray-700">Ny faktura</span>
              </Link>
              <Link
                href="/dashboard/bookings"
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-emerald-50 hover:border-emerald-200 border border-gray-200 rounded-xl transition-all group min-h-[80px]"
              >
                <Calendar className="w-6 h-6 text-emerald-600 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-gray-700">Ny bokning</span>
              </Link>
              <Link
                href="/dashboard/customers"
                className="flex flex-col items-center justify-center p-4 bg-gray-50 hover:bg-amber-50 hover:border-amber-200 border border-gray-200 rounded-xl transition-all group min-h-[80px]"
              >
                <UserPlus className="w-6 h-6 text-amber-600 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-medium text-gray-700">Ny kund</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Full-width: Bokningar senaste 7 dagarna */}
        {stats?.bookings_per_day && stats.bookings_per_day.length > 0 && (
          <div className="mt-4 sm:mt-6 bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
            <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-600" />
              Bokningar senaste 7 dagarna
            </h2>
            <BookingsChart data={stats.bookings_per_day} />
          </div>
        )}
      </div>
    </div>
  )
}
