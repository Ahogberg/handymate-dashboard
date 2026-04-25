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
  Activity,
  Phone,
  Zap,
  ClipboardList,
  Mail,
  Globe,
  X,
  ThumbsUp,
  ThumbsDown,
  Lightbulb,
  ChevronDown as ChevronDownIcon,
  Loader2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'
import OnboardingChecklist from '@/components/OnboardingChecklist'
import OnMyWayButton from '@/components/OnMyWayButton'
import TeamActivityStrip, { buildSummaryText } from '@/components/TeamActivityStrip'
import IdentityPill from '@/components/IdentityPill'

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
  const [priceListCount, setPriceListCount] = useState(0)
  const [showOnboarding, setShowOnboarding] = useState(true)
  const [showWelcome, setShowWelcome] = useState(false)
  const [morningReport, setMorningReport] = useState<string | null>(null)
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
  const [economics, setEconomics] = useState<{
    invoiced: number; unpaidCount: number; unpaidAmount: number
    estimatedMargin: number | null; overheadSet: boolean
  } | null>(null)
  const [todayItems, setTodayItems] = useState<{ id: string; type: string; title: string; subtitle?: string; priority: string; status: string; link?: string; icon: string }[]>([])
  const [todayLoaded, setTodayLoaded] = useState(false)
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([])
  const [dismissedReminders, setDismissedReminders] = useState<Set<string>>(new Set())
  const [projectsAtRisk, setProjectsAtRisk] = useState<{ project_id: string; name: string; ai_health_score: number | null; ai_health_summary: string | null; status: string }[]>([])
  const [speedData, setSpeedData] = useState<{
    avg_response_seconds: number
    industry_avg_seconds: number
    total_leads: number
    response_distribution: Record<string, number>
    win_rate_by_speed: Record<string, number>
  } | null>(null)
  const [insights, setInsights] = useState<Array<{
    id: string; insight_type: string; title: string; description: string; priority: string; feedback: string | null
  }>>([])
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [seasonSummary, setSeasonSummary] = useState<string | null>(null)
  const [savedTimeText, setSavedTimeText] = useState<string | null>(null)
  const [teamSummaryText, setTeamSummaryText] = useState<string | null>(null)

  // Per-section loading states for skeleton UI
  const [bookingsLoaded, setBookingsLoaded] = useState(false)
  const [configLoaded, setConfigLoaded] = useState(false)
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [pipelineLoaded, setPipelineLoaded] = useState(false)
  const [profitLoaded, setProfitLoaded] = useState(false)
  const [activityLoaded, setActivityLoaded] = useState(false)
  const [projectsLoaded, setProjectsLoaded] = useState(false)
  const [scheduleLoaded, setScheduleLoaded] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('hm_welcome_seen')) {
      setShowWelcome(true)
    }
    // Check for today's morning report
    const today = new Date().toISOString().slice(0, 10)
    const dismissedKey = `hm_morning_report_${today}`
    if (!localStorage.getItem(dismissedKey)) {
      supabase
        .from('business_preferences')
        .select('value')
        .eq('business_id', business.business_id)
        .eq('key', 'morning_report_latest')
        .single()
        .then(({ data }: { data: any }) => {
          if (data?.value) {
            try {
              const parsed = JSON.parse(data.value)
              if (parsed.date === today && parsed.summary) {
                setMorningReport(parsed.summary)
              }
            } catch { /* ignore */ }
          }
        })
    }
  }, [])

  const closeWelcome = () => {
    localStorage.setItem('hm_welcome_seen', '1')
    setShowWelcome(false)
  }

  useEffect(() => {
    fetchData()
  }, [business.business_id])

  // Realtime + polling: uppdatera när samtal/SMS/uppgifter/godkännanden händer
  useRealtimeRefresh({
    tables: ['pending_approvals', 'task', 'sms_conversation', 'booking', 'customer_activity'],
    businessId: business.business_id,
    onChange: () => fetchData(),
    pollIntervalMs: 30_000,
  })

  async function fetchInsights() {
    try {
      const res = await fetch('/api/insights')
      if (res.ok) {
        const { insights: data } = await res.json()
        setInsights(data || [])
      }
    } catch { /* silent */ }
  }

  async function fetchSeasonality() {
    try {
      const res = await fetch('/api/seasonality/insights')
      if (res.ok) {
        const data = await res.json()
        if (data.summary) setSeasonSummary(data.summary)
      }
    } catch { /* silent */ }
  }

  async function fetchSavedTime() {
    try {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await supabase
        .from('v3_automation_logs')
        .select('action_type, status')
        .eq('business_id', business.business_id)
        .eq('status', 'success')
        .gte('created_at', weekAgo)

      if (!data || data.length === 0) return

      const counts: Record<string, number> = {}
      for (const log of data) {
        counts[log.action_type] = (counts[log.action_type] || 0) + 1
      }

      const parts: string[] = []
      const reminders = (counts['send_reminder'] || 0) + (counts['send_invoice_reminder'] || 0)
      const followups = (counts['send_sms'] || 0) + (counts['send_email'] || 0) + (counts['quote_followup'] || 0)
      const leads = (counts['qualify_lead'] || 0) + (counts['contact_lead'] || 0)
      const bookings = counts['send_booking_reminder'] || 0
      const pipeline = counts['move_deal'] || 0
      const morning = counts['morning_report'] || 0

      if (reminders > 0) parts.push(`skickade ${reminders} påminnelse${reminders > 1 ? 'r' : ''}`)
      if (followups > 0) parts.push(`följde upp ${followups} offert${followups > 1 ? 'er' : ''}`)
      if (leads > 0) parts.push(`kvalificerade ${leads} lead${leads > 1 ? 's' : ''}`)
      if (bookings > 0) parts.push(`skickade ${bookings} bokningspåminnelse${bookings > 1 ? 'r' : ''}`)
      if (pipeline > 0) parts.push(`uppdaterade ${pipeline} affär${pipeline > 1 ? 'er' : ''}`)

      if (parts.length === 0 && data.length > 0) {
        parts.push(`utförde ${data.length} automatiska åtgärd${data.length > 1 ? 'er' : ''}`)
      }

      if (parts.length > 0) {
        const totalActions = data.length
        const savedMinutes = totalActions * 15
        const savedHours = Math.round(savedMinutes / 60 * 10) / 10
        const timeStr = savedHours >= 1 ? `~${savedHours}h` : `~${savedMinutes} min`
        setSavedTimeText(`Senaste 7 dagarna: Handymate ${parts.join(', ')} — sparade dig ${timeStr} administration`)
      }
    } catch { /* silent */ }
  }

  async function submitInsightFeedback(id: string, feedback: 'helpful' | 'not_helpful') {
    setInsights(prev => prev.map(i => i.id === id ? { ...i, feedback } : i))
    await fetch('/api/insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, feedback }),
    })
  }

  async function fetchData() {
    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]

    // Fire ALL independent fetches in parallel
    const bookingsPromise = supabase
      .from('booking')
      .select(`
        booking_id, customer_id, scheduled_start, scheduled_end, status, notes,
        customer (name, phone_number)
      `)
      .eq('business_id', business.business_id)
      .gte('scheduled_start', todayStr)
      .lt('scheduled_start', todayStr + 'T23:59:59')
      .order('scheduled_start', { ascending: true })
      .then(({ data }: { data: any }) => {
        setBookings(data || [])
        setBookingsLoaded(true)
      })

    const configPromise = (async () => {
      const { data: configData } = await supabase
        .from('business_config')
        .select(`
          email_confirmed_at, assigned_phone_number, phone_setup_type,
          forwarding_confirmed, working_hours, logo_url,
          onboarding_dismissed, onboarding_data, lead_sources
        `)
        .eq('business_id', business.business_id)
        .single()

      if (configData) {
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
        const obData = (configData.onboarding_data || {}) as Record<string, unknown>
        const dismissed = (obData.dismissed_reminders as string[]) || []
        if (dismissed.length > 0) {
          setDismissedReminders(new Set(dismissed))
        }
      }
      setConfigLoaded(true)
    })()

    const callsPromise = supabase
      .from('call_recording')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .then(({ count }: { count: number | null }) => {
        setCallCount(count || 0)
      })

    const priceListPromise = supabase
      .from('price_list')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business.business_id)
      .eq('is_active', true)
      .then(({ count }: { count: number | null }) => {
        setPriceListCount(count || 0)
      })

    const projectsPromise = supabase
      .from('project')
      .select('project_id, name, ai_health_score, ai_health_summary, status')
      .eq('business_id', business.business_id)
      .in('status', ['planning', 'active', 'paused'])
      .order('ai_health_score', { ascending: true, nullsFirst: false })
      .then(({ data }: { data: any }) => {
        setActiveProjects(data?.length || 0)
        const atRisk = (data || []).filter(
          (p: { ai_health_score: number | null }) => p.ai_health_score != null && p.ai_health_score < 70
        )
        setProjectsAtRisk(atRisk)
        setProjectsLoaded(true)
      })

    const schedulePromise = fetch(`/api/schedule?start_date=${todayStr}&end_date=${todayStr}`)
      .then(res => res.ok ? res.json() : null)
      .then(schedData => {
        if (schedData) {
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
        setScheduleLoaded(true)
      })
      .catch(() => setScheduleLoaded(true))

    const pipelinePromise = fetch('/api/pipeline/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setPipelineStats(data)
        setPipelineLoaded(true)
      })
      .catch(() => setPipelineLoaded(true))

    const statsPromise = fetch(`/api/dashboard/stats?businessId=${business.business_id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setStats(data)
        setStatsLoaded(true)
      })
      .catch(() => setStatsLoaded(true))

    const profitPromise = fetch('/api/dashboard/profitability')
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data) setProfitProjects(data.projects || [])
        setProfitLoaded(true)
      })
      .catch(() => setProfitLoaded(true))

    // Att göra idag
    fetch('/api/dashboard/today')
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setTodayItems(data.items || []); setTodayLoaded(true) })
      .catch(() => setTodayLoaded(true))

    // Ekonomisammanfattning — läser från business_config
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    Promise.all([
      supabase.from('invoices').select('total_amount').eq('business_id', business.business_id).neq('status', 'draft').gte('created_at', startOfMonth),
      supabase.from('invoices').select('id, total_amount').eq('business_id', business.business_id).eq('status', 'sent'),
      supabase.from('business_config').select('overhead_monthly_sek, margin_target_percent').eq('business_id', business.business_id).single(),
    ]).then(([invRes, unpaidRes, bizRes]) => {
      const invoiced = (invRes.data || []).reduce((s: number, i: any) => s + (Number(i.total_amount) || 0), 0)
      const unpaidCount = unpaidRes.data?.length || 0
      const unpaidAmount = (unpaidRes.data || []).reduce((s: number, i: any) => s + (Number(i.total_amount) || 0), 0)
      const overhead = Number(bizRes.data?.overhead_monthly_sek) || 0
      const estimatedMargin = invoiced > 0 ? Math.round(((invoiced - overhead) / invoiced) * 100) : null
      setEconomics({ invoiced, unpaidCount, unpaidAmount, estimatedMargin, overheadSet: overhead > 0 })
    }).catch(() => {})

    const activityPromise = supabase
      .from('customer_activity')
      .select('activity_id, activity_type, title, description, created_at, customer:customer_id(name)')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data }: { data: any }) => {
        setRecentActivity(data || [])
        setActivityLoaded(true)
      })

    const speedPromise = fetch(`/api/analytics/speed-to-lead?period=30d&business_id=${business.business_id}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => { if (data) setSpeedData(data) })
      .catch(() => {})

    const insightsPromise = fetchInsights()
    fetchSeasonality()
    fetchSavedTime()

    // Wait for all — each section renders independently as it resolves
    await Promise.all([
      bookingsPromise, configPromise, callsPromise, priceListPromise, projectsPromise,
      schedulePromise, pipelinePromise, statsPromise, profitPromise,
      activityPromise, speedPromise, insightsPromise,
    ])
    setLoading(false)
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
      <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-md ${
        isPositive
          ? 'text-emerald-700 bg-emerald-50'
          : 'text-red-700 bg-red-50'
      }`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {Math.abs(value)}%
      </span>
    )
  }

  const MiniSparkBars = ({ data }: { data: { date: string; count: number }[] }) => {
    if (!data || data.length === 0) return null
    const max = Math.max(...data.map(d => d.count), 1)
    return (
      <div className="flex items-end gap-[3px] h-8 mt-2">
        {data.slice(-7).map((d, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm bg-primary-200 min-h-[2px] transition-all"
            style={{ height: `${Math.max((d.count / max) * 100, 8)}%` }}
            title={`${d.date}: ${d.count}`}
          />
        ))}
      </div>
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
                      ? 'bg-primary-600'
                      : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                  style={{ height: `${height}%`, minHeight: '4px' }}
                />
              </div>
              <span className={`text-xs mt-1.5 font-medium ${isToday ? 'text-secondary-700' : 'text-gray-400'}`}>
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
        return <Calendar className="w-3.5 h-3.5 text-secondary-600" />
      case 'quote_sent':
      case 'quote_accepted':
      case 'quote_declined':
        return <FileText className="w-3.5 h-3.5 text-primary-700" />
      case 'invoice_sent':
      case 'invoice_paid':
        return <Receipt className="w-3.5 h-3.5 text-amber-500" />
      case 'call_recorded':
        return <Mic className="w-3.5 h-3.5 text-primary-600" />
      default:
        return <Activity className="w-3.5 h-3.5 text-gray-400" />
    }
  }

  // Skeleton components
  const SkeletonPulse = ({ className = '' }: { className?: string }) => (
    <div className={`animate-pulse bg-gray-200 rounded ${className}`} />
  )

  const SkeletonCard = ({ className = '', children }: { className?: string; children?: React.ReactNode }) => (
    <div className={`bg-white rounded-xl border border-[#E2E8F0] p-4 ${className}`}>
      {children || (
        <div className="space-y-3">
          <SkeletonPulse className="h-4 w-24" />
          <SkeletonPulse className="h-8 w-16" />
          <SkeletonPulse className="h-3 w-32" />
        </div>
      )}
    </div>
  )

  const todaysBookingsCount = bookings.length

  return (
    <div className="p-4 sm:p-8 bg-[#F8FAFC] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-primary-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-secondary-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <IdentityPill />
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-1 sm:mb-2">
            {getGreeting()}{getFirstName() ? `, ${getFirstName()}` : ''}!
          </h1>
          <p className="text-sm sm:text-base text-gray-500">
            <span className="capitalize">
              {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
            </span>
            {teamSummaryText && (
              <>
                {' · '}
                <span>{teamSummaryText}</span>
              </>
            )}
          </p>
        </div>

        {/* Team Activity Strip — vad varje AI-medlem gjort senaste 24h */}
        <TeamActivityStrip onLoaded={(summary) => setTeamSummaryText(buildSummaryText(summary))} />

        {/* Welcome popup — visas bara en gång */}
        {showWelcome && (
          <div className="mb-6 p-5 bg-[#F0FDFA] border border-[#E2E8F0] rounded-xl relative">
            <button
              onClick={closeWelcome}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-4">
              <div className="p-2.5 rounded-xl bg-primary-700 flex-shrink-0">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Välkommen till Handymate!</h2>
                <p className="text-sm text-gray-600 mb-3">
                  Din AI-assistent är redo att hjälpa dig hantera kunder, offerter och bokningar. Börja med att fylla i dina uppgifter i checklistan nedan.
                </p>
                <button
                  onClick={closeWelcome}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-700 text-white text-sm font-medium rounded-lg hover:bg-primary-800 transition-colors"
                >
                  Kom igång
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Morning report popup */}
        {morningReport && (
          <div className="mb-6 p-5 bg-[#F0FDFA] border border-[#E2E8F0] rounded-xl relative">
            <button
              onClick={() => {
                const today = new Date().toISOString().slice(0, 10)
                localStorage.setItem(`hm_morning_report_${today}`, '1')
                setMorningReport(null)
              }}
              className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-white/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5 text-primary-700" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">Din dagliga rapport</h3>
                <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                  {morningReport}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Dagens Plan — Jobbkompisen */}
        {!loading && bookings.length > 0 && (
          <div className="mb-6 p-5 bg-white border border-[#E2E8F0] rounded-xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary-100 rounded-lg flex items-center justify-center">
                  <Zap className="w-4 h-4 text-primary-700" />
                </div>
                <h2 className="font-semibold text-gray-900">Dagens plan</h2>
              </div>
              <span className="text-xs text-gray-400">
                {new Date().toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            </div>

            <div className="space-y-2">
              {bookings.slice(0, 4).map((booking) => (
                <Link
                  key={booking.booking_id}
                  href={`/dashboard/bookings/${booking.booking_id}`}
                  className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group"
                >
                  <div className="text-sm font-mono text-gray-500 w-12 flex-shrink-0">
                    {formatTime(booking.scheduled_start)}
                  </div>
                  <div className="w-1 h-8 rounded-full bg-primary-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {(booking.customer as any)?.name || 'Kund'}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {getServiceFromNotes(booking.notes)}
                    </p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-secondary-600 transition-colors flex-shrink-0" />
                </Link>
              ))}
            </div>

            {bookings.length > 4 && (
              <Link
                href="/dashboard/schedule"
                className="mt-3 flex items-center justify-center gap-1 text-xs text-secondary-700 hover:text-primary-700 font-medium py-2"
              >
                Visa alla {bookings.length} bokningar
                <ArrowRight className="w-3 h-3" />
              </Link>
            )}

            {/* Smart reminders */}
            {stats && (stats.quotes.sent > 0 || (stats.ai?.pending_suggestions ?? 0) > 0) && (
              <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                {stats.quotes.sent > 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-600">
                    <FileText className="w-3.5 h-3.5" />
                    <span>{stats.quotes.sent} offerter väntar på svar</span>
                  </div>
                )}
                {(stats.ai?.pending_suggestions ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-xs text-secondary-700">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{stats.ai.pending_suggestions} AI-förslag att granska</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Onboarding Checklist */}
        {showOnboarding && onboardingData && (
          <OnboardingChecklist
            businessId={business.business_id}
            businessConfig={onboardingData}
            callCount={callCount}
            priceListCount={priceListCount}
            onDismiss={() => setShowOnboarding(false)}
            onUpdate={fetchData}
          />
        )}

        {/* AI Inbox Banner — fixed: no floating "0" when pending_suggestions is 0 */}
        {(stats?.ai?.pending_suggestions ?? 0) > 0 && (
          <Link href="/dashboard/ai-inbox">
            <div className="mb-6 p-4 bg-primary-50 border border-[#E2E8F0] rounded-xl hover:border-primary-300 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-700">
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
                <ArrowRight className="w-5 h-5 text-secondary-700" />
              </div>
            </div>
          </Link>
        )}

        {/* Phone setup banner — show when phone not configured and onboarding dismissed */}
        {!showOnboarding && onboardingData && !onboardingData.assigned_phone_number && (
          <Link href="/dashboard/settings/phone">
            <div className="mb-6 p-4 bg-primary-50 border border-[#E2E8F0] rounded-xl hover:border-primary-300 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary-700">
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
                <span className="text-secondary-700 font-medium text-sm flex items-center gap-1">
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
              reminders.push({ id: 'google', icon: Calendar, bgColor: 'bg-orange-50', border: 'border-orange-200', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', title: 'Koppla Google Calendar för att synka bokningar', desc: 'Dina bokningar visas i Google Calendar automatiskt.', href: '/dashboard/settings?tab=integrations', cta: 'Koppla nu' })
            }
            if (!onboardingData.gmail_enabled && !dismissedReminders.has('gmail')) {
              reminders.push({ id: 'gmail', icon: Mail, bgColor: 'bg-primary-50', border: 'border-primary-200', iconBg: 'bg-primary-100', iconColor: 'text-primary-700', title: 'Koppla Gmail för att se all kundkommunikation', desc: 'Se email-historik direkt i kundkortet.', href: '/dashboard/settings?tab=integrations', cta: 'Aktivera' })
            }
            if ((!onboardingData.lead_sources || onboardingData.lead_sources.length === 0) && !dismissedReminders.has('leads')) {
              reminders.push({ id: 'leads', icon: Globe, bgColor: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconColor: 'text-emerald-600', title: 'Konfigurera lead-källor för att få in kunder automatiskt', desc: 'Ta emot förfrågningar från Offerta, ServiceFinder m.fl.', href: '/dashboard/settings?tab=integrations', cta: 'Kom igång' })
            }
            const r = reminders[0]
            if (!r) return null
            return (
              <div className={`mb-6 p-4 ${r.bgColor} border ${r.border} rounded-xl`}>
                <div className="flex items-center justify-between">
                  <Link href={r.href} className="flex items-center gap-3 flex-1">
                    <div className={`p-2 rounded-lg ${r.iconBg}`}>
                      <r.icon className={`w-5 h-5 ${r.iconColor}`} />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{r.title}</p>
                      <p className="text-sm text-gray-500">{r.desc}</p>
                    </div>
                  </Link>
                  <div className="flex items-center gap-2 ml-3">
                    <Link href={r.href} className="text-secondary-700 font-medium text-sm flex items-center gap-1 whitespace-nowrap">
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

        {/* KPI cards — 2 per row on mobile, 4 on desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {!statsLoaded ? (
            <>
              {[...Array(5)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </>
          ) : (
            <>
              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] card-base">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bokningar</p>
                  <TrendIndicator value={stats?.bookings?.trend || 0} />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900 font-heading">{stats?.bookings?.week || 0}</p>
                  <p className="text-sm text-gray-400">denna vecka</p>
                </div>
                <MiniSparkBars data={stats?.bookings_per_day || []} />
              </div>

              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] card-base">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Nya kunder</p>
                  <TrendIndicator value={stats?.customers?.trend || 0} />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900 font-heading">{stats?.customers?.new_this_month || 0}</p>
                  <p className="text-sm text-gray-400">i månaden</p>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                  <Users className="w-3 h-3" />
                  <span>{stats?.customers?.total || 0} totalt</span>
                </div>
              </div>

              <div className="bg-white rounded-xl p-4 border border-[#E2E8F0] card-base">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Arbetad tid</p>
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900 font-heading">{stats?.time?.week_hours || 0}<span className="text-lg font-medium text-gray-400">h</span></p>
                  <p className="text-sm text-gray-400">vecka</p>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  <span>{stats?.time?.month_hours || 0}h denna månad</span>
                </div>
              </div>

              <Link href="/dashboard/projects" className="bg-white rounded-xl p-4 border border-[#E2E8F0] card-base group cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Projekt</p>
                  <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-primary-600 group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-bold text-gray-900 font-heading">{activeProjects}</p>
                  <p className="text-sm text-gray-400">aktiva</p>
                </div>
                <div className="flex items-center gap-1.5 mt-2 text-xs text-gray-400">
                  <FolderKanban className="w-3 h-3" />
                  <span>Se alla projekt</span>
                </div>
              </Link>
            </>
          )}
        </div>

        {/* ═══ Att göra idag ═══ */}
        <div className="bg-white rounded-xl border border-[#E2E8F0] p-4 mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-primary-700" />
              Att göra idag
              {todayItems.filter(i => i.status === 'pending').length > 0 && (
                <span className="text-xs font-normal bg-primary-50 text-primary-700 px-2 py-0.5 rounded-full">{todayItems.filter(i => i.status === 'pending').length}</span>
              )}
            </h2>
            {savedTimeText && (
              <span className="text-xs text-primary-700 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {savedTimeText}
              </span>
            )}
          </div>
          {todayLoaded && todayItems.length > 0 ? (
            <div className="space-y-1.5">
              {todayItems.slice(0, 8).map(item => (
                <a
                  key={item.id}
                  href={item.link || '#'}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                    item.status === 'done' ? 'opacity-40' : 'hover:bg-gray-50'
                  } ${item.priority === 'high' ? 'border-l-2 border-red-400' : ''}`}
                >
                  <span className="text-base shrink-0">{item.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm text-gray-900 truncate ${item.status === 'done' ? 'line-through' : ''}`}>{item.title}</p>
                    {item.subtitle && <p className="text-xs text-gray-400 truncate">{item.subtitle}</p>}
                  </div>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    item.type === 'booking' ? 'bg-blue-50 text-blue-600' :
                    item.type === 'approval' ? 'bg-primary-50 text-primary-700' :
                    item.type === 'overdue_invoice' ? 'bg-red-50 text-red-600' :
                    item.type === 'work_order' ? 'bg-amber-50 text-amber-600' :
                    'bg-gray-50 text-gray-500'
                  }`}>
                    {item.type === 'booking' ? 'Bokning' :
                     item.type === 'approval' ? 'Godkännande' :
                     item.type === 'overdue_invoice' ? 'Förfallen' :
                     item.type === 'work_order' ? 'Arbetsorder' :
                     item.type === 'overdue_task' ? 'Förfallen' : 'Uppgift'}
                  </span>
                </a>
              ))}
              {todayItems.length > 8 && (
                <p className="text-xs text-gray-400 text-center pt-1">+{todayItems.length - 8} till</p>
              )}
            </div>
          ) : todayLoaded ? (
            <div className="flex items-center justify-center py-6">
              <div className="text-center max-w-sm">
                <p className="text-sm text-gray-700 font-medium">Inget på ditt bord just nu</p>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  AI-teamet håller i kommunikation, offerter och bokningar i bakgrunden — du blir notifierad när något kräver ditt godkännande.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
            </div>
          )}
        </div>

        {/* Main 2-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ═══ Säljtratt ═══ */}
          {!pipelineLoaded ? (
            <SkeletonCard>
              <SkeletonPulse className="h-4 w-24 mb-4" />
              <div className="space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <SkeletonPulse className="h-3 w-24" />
                    <SkeletonPulse className="h-7 flex-1 rounded-md" />
                    <SkeletonPulse className="h-4 w-6" />
                  </div>
                ))}
              </div>
            </SkeletonCard>
          ) : (
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-secondary-700" />
                Säljtratt
              </h2>
              <Link href="/dashboard/pipeline" className="text-xs text-secondary-700 hover:text-secondary-600 flex items-center gap-1">
                Pipeline <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {(() => {
              if (!pipelineStats?.byStage || pipelineStats.byStage.length === 0) {
                return (
                  <div className="py-4 text-center">
                    <p className="text-sm text-gray-400">Ingen pipeline-data ännu</p>
                    <Link href="/dashboard/pipeline" className="text-sm text-secondary-700 hover:text-secondary-600 mt-1 inline-block">
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
                      <p className="text-sm text-gray-500 mt-1">{formatCurrency(pipelineStats.totalValue)} kr exkl. moms i pipeline</p>
                    )}
                    <Link href="/dashboard/pipeline" className="text-sm text-secondary-700 hover:text-secondary-600 mt-2 inline-block">
                      Öppna pipeline →
                    </Link>
                  </div>
                )
              }

              const maxCount = Math.max(...funnelStages.map(s => s.count), 1)
              const showConversion = totalDeals >= 3

              // Teal-baserade färger med fallande opacity per steg
              const tealOpacities = ['#0F766E', '#14917E', '#1AAC8E', '#2EC4A0', '#5EEAD4', '#99F6E4']
              const stageColors: Record<string, string> = {}
              funnelStages.forEach((s, i) => {
                stageColors[s.slug] = tealOpacities[i] || tealOpacities[tealOpacities.length - 1]
              })

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
                        <span className="text-gray-500">{formatCurrency(pipelineStats.totalValue)} kr exkl. moms</span>
                      )}
                      {pipelineStats.wonValue > 0 && (
                        <span className="text-emerald-600 font-medium">{formatCurrency(pipelineStats.wonValue)} kr vunnet exkl. moms</span>
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
          )}

          {/* ═══ Ekonomi ═══ */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-secondary-700" />
                Ekonomi
              </h2>
              <Link href="/dashboard/analytics" className="text-xs text-secondary-700 hover:text-secondary-600 flex items-center gap-1">
                Visa analys <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            {economics ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">Fakturerat denna månad</span>
                  <span className="text-sm font-semibold text-gray-900">
                    {economics.invoiced > 0 ? `~${economics.invoiced.toLocaleString('sv-SE')} kr` : '—'}
                  </span>
                </div>
                {economics.estimatedMargin !== null && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500">Uppskattad marginal</span>
                    <span className={`text-sm font-bold ${economics.estimatedMargin >= 50 ? 'text-emerald-600' : economics.estimatedMargin >= 30 ? 'text-amber-600' : 'text-red-600'}`}>
                      ~{economics.estimatedMargin}%
                    </span>
                  </div>
                )}
                {economics.unpaidCount > 0 && (
                  <Link href="/dashboard/invoices?status=sent" className="flex items-center justify-between p-2 -mx-2 rounded-lg hover:bg-amber-50 transition-colors">
                    <span className="text-sm text-amber-700">Obetalda fakturor</span>
                    <span className="text-sm font-medium text-amber-700">{economics.unpaidCount} st · {economics.unpaidAmount.toLocaleString('sv-SE')} kr</span>
                  </Link>
                )}
                {!economics.overheadSet && (
                  <Link href="/dashboard/settings" className="block text-xs text-gray-400 hover:text-primary-700 transition-colors mt-1">
                    Sätt overhead i inställningar för bättre estimat →
                  </Link>
                )}
                <p className="text-[10px] text-gray-300 mt-1">Estimat baserat på dina kostnadsinställningar</p>
              </div>
            ) : (
              <p className="text-sm text-gray-400 py-2">Laddar ekonomidata...</p>
            )}
          </div>

          {/* ═══ Senaste aktivitet ═══ */}
          <div className="bg-white rounded-xl border border-[#E2E8F0] p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary-700" />
                Senaste aktivitet
              </h2>
            </div>
            {activityLoaded && recentActivity.length > 0 ? (
              <div className="space-y-1">
                {recentActivity.slice(0, 5).map(activity => (
                  <div key={activity.activity_id} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                    <div className="mt-0.5 shrink-0">{getActivityIcon(activity.activity_type)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 truncate">{activity.title}</p>
                      {activity.customer && (
                        <p className="text-xs text-gray-400 truncate">{(activity.customer as any).name}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-300 shrink-0">
                      {new Date(activity.created_at).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>
            ) : activityLoaded ? (
              <p className="text-sm text-gray-400 py-4 text-center">Ingen aktivitet ännu</p>
            ) : (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 text-gray-300 animate-spin" />
              </div>
            )}
          </div>
        </div>

        {/* Widgetarna Säsongsinsikt, AI-insikter och Bokningsdiagram
            har flyttats till Analys-sidan för en renare dashboard */}
      </div>
    </div>
  )
}
