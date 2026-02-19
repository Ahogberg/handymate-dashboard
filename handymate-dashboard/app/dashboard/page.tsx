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
  MessageSquare,
  Zap,
  XCircle,
  BarChart3
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
  const [commStats, setCommStats] = useState<{ today: number; weekTotal: number; deliveryRate: number } | null>(null)
  const [profitProjects, setProfitProjects] = useState<{
    project_id: string; name: string; status: string
    revenue: number; costs: number; margin_amount: number; margin_percent: number
    hours_worked: number; budget_hours: number
  }[]>([])


  useEffect(() => {
    fetchData()
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
        onboarding_dismissed
      `)
      .eq('business_id', business.business_id)
      .single()

    if (configData) {
      setOnboardingData(configData)
      setShowOnboarding(!configData.onboarding_dismissed)
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

    // Hämta kommunikationsstatistik
    try {
      const commRes = await fetch(`/api/communication/stats?businessId=${business.business_id}`)
      if (commRes.ok) {
        const commData = await commRes.json()
        setCommStats({
          today: commData.today,
          weekTotal: commData.week.total,
          deliveryRate: commData.week.deliveryRate,
        })
      }
    } catch { /* ignore */ }

    // Hämta projektlönsamhet
    try {
      const profitRes = await fetch('/api/dashboard/profitability')
      if (profitRes.ok) {
        const profitData = await profitRes.json()
        setProfitProjects(profitData.projects || [])
      }
    } catch { /* ignore */ }

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
      <span className={`flex items-center text-xs ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
        {isPositive ? <TrendingUp className="w-3 h-3 mr-0.5" /> : <TrendingDown className="w-3 h-3 mr-0.5" />}
        {Math.abs(value)}%
      </span>
    )
  }

  // Mini bar chart för bokningar per dag
  const BookingsChart = ({ data }: { data: { date: string; count: number }[] }) => {
    const maxCount = Math.max(...data.map(d => d.count), 1)
    const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']

    return (
      <div className="flex items-end justify-between h-20 gap-1">
        {data.map((day, i) => {
          const height = Math.max((day.count / maxCount) * 100, 5)
          const date = new Date(day.date)
          const dayName = dayNames[date.getDay()]
          const isToday = day.date === new Date().toISOString().split('T')[0]

          return (
            <div key={i} className="flex flex-col items-center flex-1">
              <div className="w-full flex flex-col items-center justify-end h-14">
                <span className="text-xs text-gray-400 mb-1">{day.count}</span>
                <div
                  className={`w-full rounded-t transition-all ${
                    isToday
                      ? 'bg-gradient-to-t from-blue-500 to-cyan-500'
                      : 'bg-gray-200'
                  }`}
                  style={{ height: `${height}%`, minHeight: '4px' }}
                />
              </div>
              <span className={`text-xs mt-1 ${isToday ? 'text-blue-600' : 'text-gray-400'}`}>
                {dayName}
              </span>
            </div>
          )
        })}
      </div>
    )
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

        {/* AI Inbox Banner - visa om det finns väntande förslag */}
        {stats?.ai?.pending_suggestions && stats.ai.pending_suggestions > 0 && (
          <Link href="/dashboard/ai-inbox">
            <div className="mb-6 p-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-300 rounded-xl hover:border-blue-300 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                    <Sparkles className="w-5 h-5 text-gray-900" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">
                      {stats.ai.pending_suggestions} AI-förslag väntar
                    </p>
                    <p className="text-sm text-gray-500">
                      Från samtalsanalys - granska och godkänn
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </Link>
        )}

        {/* Stat cards - huvudstatistik */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
          {/* Bokningar denna vecka */}
          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                <Calendar className="w-4 h-4 text-gray-900" />
              </div>
              <TrendIndicator value={stats?.bookings?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.bookings?.week || 0}</p>
            <p className="text-xs text-gray-400">Bokningar denna vecka</p>
          </div>

          {/* Nya kunder */}
          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500">
                <Users className="w-4 h-4 text-gray-900" />
              </div>
              <TrendIndicator value={stats?.customers?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.customers?.new_this_month || 0}</p>
            <p className="text-xs text-gray-400">Nya kunder i månad</p>
          </div>

          {/* Samtal */}
          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500">
                <Mic className="w-4 h-4 text-gray-900" />
              </div>
              <TrendIndicator value={stats?.calls?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.calls?.week || 0}</p>
            <p className="text-xs text-gray-400">Samtal denna vecka</p>
          </div>

          {/* Timmar */}
          <div className="bg-white shadow-sm rounded-xl p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                <Clock className="w-4 h-4 text-gray-900" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900">{stats?.time?.week_hours || 0}h</p>
            <p className="text-xs text-gray-400">Arbetad tid vecka</p>
          </div>

          {/* Aktiva projekt */}
          <Link href="/dashboard/projects" className="bg-white shadow-sm rounded-xl p-4 border border-gray-200 hover:border-blue-300 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500">
                <FolderKanban className="w-4 h-4 text-gray-900" />
              </div>
              <ArrowRight className="w-3 h-3 text-gray-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{activeProjects}</p>
            <p className="text-xs text-gray-400">Aktiva projekt</p>
          </Link>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Dagens bokningar */}
          <div className="lg:col-span-2 bg-white shadow-sm rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">
                Dagens bokningar
                <span className="ml-2 text-sm font-normal text-gray-400">({todaysBookingsCount})</span>
              </h2>
              <Link
                href="/dashboard/bookings"
                className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1"
              >
                Visa alla
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-gray-200">
              {bookings.length === 0 ? (
                <div className="p-6 text-center">
                  <Calendar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Inga bokningar idag</p>
                  <Link
                    href="/dashboard/bookings"
                    className="inline-block mt-3 text-sm text-blue-600 hover:text-blue-500"
                  >
                    Skapa en bokning
                  </Link>
                </div>
              ) : (
                bookings.slice(0, 5).map((booking) => (
                  <div key={booking.booking_id} className="p-3 hover:bg-gray-100/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center min-w-0">
                        <div className="w-8 h-8 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-lg flex items-center justify-center border border-blue-300 flex-shrink-0">
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
                        <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-200">
                          {booking.status === 'confirmed' ? 'Bekräftad' :
                           booking.status === 'pending' ? 'Väntar' : booking.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {bookings.length > 5 && (
                <div className="p-3 text-center">
                  <Link
                    href="/dashboard/bookings"
                    className="text-sm text-blue-600 hover:text-blue-500"
                  >
                    +{bookings.length - 5} fler bokningar
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Höger kolumn */}
          <div className="space-y-4">
            {/* Bokningar senaste 7 dagarna */}
            {stats?.bookings_per_day && stats.bookings_per_day.length > 0 && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
                <h3 className="text-sm font-medium text-gray-900 mb-4">Bokningar senaste 7 dagarna</h3>
                <BookingsChart data={stats.bookings_per_day} />
              </div>
            )}

            {/* Dagens schema */}
            <Link href="/dashboard/schedule" className="block bg-white shadow-sm rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-blue-600" />
                  Dagens schema
                </h3>
                <ArrowRight className="w-3 h-3 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </div>
              {scheduleToday.count === 0 ? (
                <p className="text-gray-400 text-sm">Inga schemalagda aktiviteter idag</p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-2">
                    {scheduleToday.count} aktiviteter · {scheduleToday.people} {scheduleToday.people === 1 ? 'person' : 'personer'}
                  </p>
                  <div className="space-y-1.5">
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

            {/* Pipeline Funnel */}
            {pipelineStats && pipelineStats.byStage && pipelineStats.byStage.length > 0 && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-600" />
                    Säljtratt
                  </h3>
                  <Link href="/dashboard/pipeline" className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
                    Pipeline <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>

                {/* Dynamic proportional funnel */}
                {(() => {
                  const funnelStages = pipelineStats.byStage.filter(s => s.slug !== 'lost')
                  const allZero = funnelStages.every(s => s.count === 0)

                  if (allZero) {
                    return (
                      <div className="text-center py-6">
                        <TrendingUp className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="text-sm text-gray-400">Inga leads ännu</p>
                        <p className="text-xs text-gray-300 mt-1">Din AI-assistent fyller på automatiskt</p>
                      </div>
                    )
                  }

                  const maxCount = Math.max(...funnelStages.map(s => s.count), 1)

                  // Proportional widths (percentage)
                  const rawWidths = funnelStages.map(s =>
                    s.count === 0 ? 12 : Math.max((s.count / maxCount) * 100, 18)
                  )

                  // Enforce strictly decreasing widths (funnel shape)
                  const widths = [rawWidths[0]]
                  for (let i = 1; i < rawWidths.length; i++) {
                    const maxAllowed = widths[i - 1] - 4
                    widths.push(Math.max(Math.min(rawWidths[i], maxAllowed), 12))
                  }

                  // Bottom edge of last stage tapers off
                  const lastBottom = Math.max(widths[widths.length - 1] * 0.65, 10)

                  // Gradient: light cyan → dark cyan, green for 'won'
                  const palette = ['#67e8f9', '#22d3ee', '#06b6d4', '#0891b2', '#0e7490', '#155e75']
                  const stageColors = funnelStages.map((s, i) =>
                    s.slug === 'won' ? '#22c55e' : palette[Math.min(i, palette.length - 1)]
                  )
                  const textColors = funnelStages.map((s, i) =>
                    s.slug === 'won' ? '#ffffff' : i < 2 ? '#0e7490' : '#ffffff'
                  )

                  return (
                    <div>
                      {funnelStages.map((stage, i) => {
                        const topW = widths[i]
                        const botW = i < widths.length - 1 ? widths[i + 1] : lastBottom
                        const nextStage = funnelStages[i + 1]
                        const conversion = nextStage && stage.count > 0
                          ? Math.round((nextStage.count / stage.count) * 100)
                          : null

                        return (
                          <div key={stage.slug}>
                            <Link
                              href={`/dashboard/pipeline?stage=${stage.slug}`}
                              className="block relative"
                              title={`${stage.stage}: ${stage.count} leads${stage.value > 0 ? ` \u00b7 ${formatCurrency(stage.value)} kr` : ''}`}
                              style={{ height: '40px' }}
                            >
                              <div
                                className="absolute inset-0 hover:brightness-110"
                                style={{
                                  background: stageColors[i],
                                  clipPath: `polygon(${(100 - topW) / 2}% 0%, ${(100 + topW) / 2}% 0%, ${(100 + botW) / 2}% 100%, ${(100 - botW) / 2}% 100%)`,
                                  transition: 'clip-path 0.7s ease-out, background 0.3s',
                                }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center gap-1.5 pointer-events-none">
                                <span
                                  className="text-xs font-semibold truncate"
                                  style={{ color: textColors[i], maxWidth: `${topW * 0.45}%` }}
                                >
                                  {stage.stage}
                                </span>
                                <span className="text-xs font-bold" style={{ color: textColors[i] }}>
                                  {stage.count}
                                </span>
                                {stage.value > 0 && topW > 50 && (
                                  <span className="text-[10px] opacity-75 hidden sm:inline" style={{ color: textColors[i] }}>
                                    {formatCurrency(stage.value)} kr
                                  </span>
                                )}
                              </div>
                            </Link>
                            {conversion !== null && (
                              <div className="flex justify-center -my-1 relative z-10">
                                <span className="text-[10px] text-gray-400 bg-white px-1.5 rounded">
                                  ↓ {conversion}%
                                </span>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}

                {/* Summary footer */}
                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <p className="text-sm font-bold text-gray-900">{pipelineStats.totalDeals}</p>
                      <p className="text-[10px] text-gray-400">Aktiva</p>
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-bold text-emerald-600">{formatCurrency(pipelineStats.wonValue)} kr</p>
                      <p className="text-[10px] text-gray-400">Vunnet</p>
                    </div>
                  </div>
                  {pipelineStats.lostCount > 0 && (
                    <div className="flex items-center gap-1 text-xs text-gray-400">
                      <XCircle className="w-3 h-3 text-red-400" />
                      {pipelineStats.lostCount} förlorade
                    </div>
                  )}
                </div>

                {(pipelineStats.newLeadsToday > 0 || pipelineStats.needsFollowUp > 0) && (
                  <div className="mt-2 space-y-1">
                    {pipelineStats.newLeadsToday > 0 && (
                      <p className="text-xs text-emerald-600">{pipelineStats.newLeadsToday} nya leads idag</p>
                    )}
                    {pipelineStats.needsFollowUp > 0 && (
                      <p className="text-xs text-amber-600">{pipelineStats.needsFollowUp} behöver uppföljning</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Projektlönsamhet */}
            {profitProjects.length > 0 && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-600" />
                    Projektlonsamhet
                  </h3>
                  <Link href="/dashboard/projects" className="text-xs text-blue-600 hover:text-blue-500 flex items-center gap-1">
                    Alla projekt <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
                <div className="space-y-2">
                  {profitProjects.map((p) => {
                    const color = p.margin_percent >= 20 ? 'emerald' : p.margin_percent >= 5 ? 'amber' : 'red'
                    return (
                      <Link
                        key={p.project_id}
                        href={`/dashboard/projects/${p.project_id}`}
                        className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 transition-colors group"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-gray-900 truncate">{p.name}</p>
                          <p className="text-xs text-gray-400">
                            {formatCurrency(p.revenue)} kr intakter
                          </p>
                        </div>
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <div className="text-right">
                            <p className={`text-sm font-bold ${
                              color === 'emerald' ? 'text-emerald-600' :
                              color === 'amber' ? 'text-amber-600' : 'text-red-600'
                            }`}>
                              {p.margin_percent}%
                            </p>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${
                            color === 'emerald' ? 'bg-emerald-500' :
                            color === 'amber' ? 'bg-amber-500' : 'bg-red-500'
                          }`} />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Snabblänkar */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Snabbåtgärder</h2>
              <div className="space-y-2">
                <Link
                  href="/dashboard/calendar"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-blue-600" />
                    <span className="text-sm text-gray-900">Ny bokning</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </Link>

                <Link
                  href="/dashboard/quotes/new"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-cyan-600" />
                    <span className="text-sm text-gray-900">Ny offert</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-cyan-600 transition-colors" />
                </Link>

                <Link
                  href="/dashboard/calendar"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-600" />
                    <span className="text-sm text-gray-900">Rapportera tid</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-amber-600 transition-colors" />
                </Link>

                <Link
                  href="/dashboard/assistant"
                  className="flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-emerald-600" />
                    <span className="text-sm text-gray-900">Röstassistent</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-gray-400 group-hover:text-emerald-600 transition-colors" />
                </Link>
              </div>
            </div>

            {/* Smart kommunikation */}
            {commStats && (
              <Link href="/dashboard/automations" className="block bg-white shadow-sm rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-all group">
                <div className="flex items-center gap-2 mb-3">
                  <div className="p-1.5 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500">
                    <Zap className="w-3.5 h-3.5 text-white" />
                  </div>
                  <h2 className="text-sm font-semibold text-gray-900">Smart kommunikation</h2>
                </div>
                <p className="text-sm text-gray-600 mb-1">
                  Idag: <span className="font-medium text-gray-900">{commStats.today}</span> meddelanden
                </p>
                <p className="text-xs text-gray-400">
                  Vecka: {commStats.weekTotal} st{commStats.weekTotal > 0 ? ` | ${commStats.deliveryRate}% levererade` : ''}
                </p>
                <div className="flex items-center gap-1 mt-2 text-xs text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span>Visa aktivitet</span>
                  <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            )}

            {/* Totala kunder */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stats?.customers?.total || 0}</p>
                  <p className="text-xs text-gray-400">Totalt antal kunder</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                  <Users className="w-5 h-5 text-cyan-600" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
