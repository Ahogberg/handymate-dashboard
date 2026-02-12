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
  FolderKanban
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
  const [pipelineStats, setPipelineStats] = useState<{ totalDeals: number; totalValue: number; newLeadsToday: number; needsFollowUp: number } | null>(null)
  const [scheduleToday, setScheduleToday] = useState<{ count: number; people: number; entries: { title: string; color: string; time: string }[] }>({ count: 0, people: 0, entries: [] })

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
      <span className={`flex items-center text-xs ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
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
                <span className="text-xs text-zinc-500 mb-1">{day.count}</span>
                <div
                  className={`w-full rounded-t transition-all ${
                    isToday
                      ? 'bg-gradient-to-t from-violet-500 to-fuchsia-500'
                      : 'bg-zinc-700'
                  }`}
                  style={{ height: `${height}%`, minHeight: '4px' }}
                />
              </div>
              <span className={`text-xs mt-1 ${isToday ? 'text-violet-400' : 'text-zinc-500'}`}>
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
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  const todaysBookingsCount = bookings.length

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">
            {getGreeting()}{getFirstName() ? `, ${getFirstName()}` : ''}!
          </h1>
          <p className="text-sm sm:text-base text-zinc-400">
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
            <div className="mb-6 p-4 bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 rounded-xl hover:border-violet-500/50 transition-all cursor-pointer">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {stats.ai.pending_suggestions} AI-förslag väntar
                    </p>
                    <p className="text-sm text-zinc-400">
                      Från samtalsanalys - granska och godkänn
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-violet-400" />
              </div>
            </div>
          </Link>
        )}

        {/* Stat cards - huvudstatistik */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
          {/* Bokningar denna vecka */}
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500">
                <Calendar className="w-4 h-4 text-white" />
              </div>
              <TrendIndicator value={stats?.bookings?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-white">{stats?.bookings?.week || 0}</p>
            <p className="text-xs text-zinc-500">Bokningar denna vecka</p>
          </div>

          {/* Nya kunder */}
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-blue-500">
                <Users className="w-4 h-4 text-white" />
              </div>
              <TrendIndicator value={stats?.customers?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-white">{stats?.customers?.new_this_month || 0}</p>
            <p className="text-xs text-zinc-500">Nya kunder i månad</p>
          </div>

          {/* Samtal */}
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-green-500">
                <Mic className="w-4 h-4 text-white" />
              </div>
              <TrendIndicator value={stats?.calls?.trend || 0} />
            </div>
            <p className="text-2xl font-bold text-white">{stats?.calls?.week || 0}</p>
            <p className="text-xs text-zinc-500">Samtal denna vecka</p>
          </div>

          {/* Timmar */}
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500">
                <Clock className="w-4 h-4 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{stats?.time?.week_hours || 0}h</p>
            <p className="text-xs text-zinc-500">Arbetad tid vecka</p>
          </div>

          {/* Aktiva projekt */}
          <Link href="/dashboard/projects" className="bg-zinc-900/50 backdrop-blur-xl rounded-xl p-4 border border-zinc-800 hover:border-violet-500/30 transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500 to-rose-500">
                <FolderKanban className="w-4 h-4 text-white" />
              </div>
              <ArrowRight className="w-3 h-3 text-zinc-600" />
            </div>
            <p className="text-2xl font-bold text-white">{activeProjects}</p>
            <p className="text-xs text-zinc-500">Aktiva projekt</p>
          </Link>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Dagens bokningar */}
          <div className="lg:col-span-2 bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">
                Dagens bokningar
                <span className="ml-2 text-sm font-normal text-zinc-500">({todaysBookingsCount})</span>
              </h2>
              <Link
                href="/dashboard/bookings"
                className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                Visa alla
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="divide-y divide-zinc-800">
              {bookings.length === 0 ? (
                <div className="p-6 text-center">
                  <Calendar className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm">Inga bokningar idag</p>
                  <Link
                    href="/dashboard/bookings"
                    className="inline-block mt-3 text-sm text-violet-400 hover:text-violet-300"
                  >
                    Skapa en bokning
                  </Link>
                </div>
              ) : (
                bookings.slice(0, 5).map((booking) => (
                  <div key={booking.booking_id} className="p-3 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center min-w-0">
                        <div className="w-8 h-8 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-lg flex items-center justify-center border border-violet-500/30 flex-shrink-0">
                          <Clock className="w-4 h-4 text-violet-400" />
                        </div>
                        <div className="ml-3 min-w-0">
                          <p className="font-medium text-white text-sm truncate">
                            {booking.customer?.name || 'Okänd kund'}
                          </p>
                          <p className="text-xs text-zinc-500 truncate">
                            {getServiceFromNotes(booking.notes)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-medium text-white text-sm">
                          {formatTime(booking.scheduled_start)}
                        </p>
                        <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
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
                    className="text-sm text-violet-400 hover:text-violet-300"
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
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
                <h3 className="text-sm font-medium text-white mb-4">Bokningar senaste 7 dagarna</h3>
                <BookingsChart data={stats.bookings_per_day} />
              </div>
            )}

            {/* Dagens schema */}
            <Link href="/dashboard/schedule" className="block bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 hover:border-violet-500/30 transition-all group">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-medium text-white flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-violet-400" />
                  Dagens schema
                </h3>
                <ArrowRight className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition-colors" />
              </div>
              {scheduleToday.count === 0 ? (
                <p className="text-zinc-500 text-sm">Inga schemalagda aktiviteter idag</p>
              ) : (
                <>
                  <p className="text-xs text-zinc-400 mb-2">
                    {scheduleToday.count} aktiviteter · {scheduleToday.people} {scheduleToday.people === 1 ? 'person' : 'personer'}
                  </p>
                  <div className="space-y-1.5">
                    {scheduleToday.entries.map((entry, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-sm text-zinc-300 truncate flex-1">{entry.title}</span>
                        <span className="text-xs text-zinc-500 shrink-0">{entry.time}</span>
                      </div>
                    ))}
                    {scheduleToday.count > 3 && (
                      <p className="text-xs text-violet-400">+{scheduleToday.count - 3} fler</p>
                    )}
                  </div>
                </>
              )}
            </Link>

            {/* Pipeline */}
            {pipelineStats && (pipelineStats.totalDeals > 0 || pipelineStats.newLeadsToday > 0) && (
              <Link href="/dashboard/pipeline" className="block bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 hover:border-violet-500/30 transition-all group">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-violet-400" />
                    Pipeline
                  </h3>
                  <ArrowRight className="w-3 h-3 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2 bg-zinc-800/50 rounded-lg text-center">
                    <p className="text-lg font-bold text-white">{pipelineStats.totalDeals}</p>
                    <p className="text-xs text-zinc-500">Aktiva deals</p>
                  </div>
                  <div className="p-2 bg-zinc-800/50 rounded-lg text-center">
                    <p className="text-lg font-bold text-white">{formatCurrency(pipelineStats.totalValue)} kr</p>
                    <p className="text-xs text-zinc-500">Totalt värde</p>
                  </div>
                </div>
                {(pipelineStats.newLeadsToday > 0 || pipelineStats.needsFollowUp > 0) && (
                  <div className="mt-2 space-y-1">
                    {pipelineStats.newLeadsToday > 0 && (
                      <p className="text-xs text-emerald-400">{pipelineStats.newLeadsToday} nya leads idag</p>
                    )}
                    {pipelineStats.needsFollowUp > 0 && (
                      <p className="text-xs text-amber-400">{pipelineStats.needsFollowUp} behöver uppföljning</p>
                    )}
                  </div>
                )}
              </Link>
            )}

            {/* Snabblänkar */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
              <h2 className="text-sm font-semibold text-white mb-3">Snabbåtgärder</h2>
              <div className="space-y-2">
                <Link
                  href="/dashboard/calendar"
                  className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5 text-violet-400" />
                    <span className="text-sm text-white">Ny bokning</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                </Link>

                <Link
                  href="/dashboard/quotes/new"
                  className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-fuchsia-400" />
                    <span className="text-sm text-white">Ny offert</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-fuchsia-400 transition-colors" />
                </Link>

                <Link
                  href="/dashboard/calendar"
                  className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-400" />
                    <span className="text-sm text-white">Rapportera tid</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-400 transition-colors" />
                </Link>

                <Link
                  href="/dashboard/assistant"
                  className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg transition-all group min-h-[48px]"
                >
                  <div className="flex items-center gap-3">
                    <Mic className="w-5 h-5 text-emerald-400" />
                    <span className="text-sm text-white">Röstassistent</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                </Link>
              </div>
            </div>

            {/* Totala kunder */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold text-white">{stats?.customers?.total || 0}</p>
                  <p className="text-xs text-zinc-500">Totalt antal kunder</p>
                </div>
                <div className="p-3 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
                  <Users className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
