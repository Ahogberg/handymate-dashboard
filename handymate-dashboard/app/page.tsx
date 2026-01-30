'use client'

import { useEffect, useState } from 'react'
import { 
  Calendar, 
  Users, 
  Phone, 
  AlertTriangle,
  TrendingUp,
  Clock,
  MessageSquare,
  ArrowRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

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

interface Stats {
  bookingsToday: number
  bookingsWeek: number
  totalCustomers: number
  callsToday: number
  urgentCases: number
  smsThisMonth: number
}

export default function DashboardPage() {
  const business = useBusiness()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [stats, setStats] = useState<Stats>({ 
    bookingsToday: 0, 
    bookingsWeek: 0,
    totalCustomers: 0, 
    callsToday: 0, 
    urgentCases: 0,
    smsThisMonth: 0
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const today = new Date()
      const todayStr = today.toISOString().split('T')[0]
      
      // Veckans start (måndag)
      const weekStart = new Date(today)
      weekStart.setDate(today.getDate() - today.getDay() + 1)
      const weekStartStr = weekStart.toISOString().split('T')[0]

      // Månadens start
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1)

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

      // Statistik
      const { count: totalCustomers } = await supabase
        .from('customer')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business.business_id)

      const { count: bookingsToday } = await supabase
        .from('booking')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business.business_id)
        .gte('scheduled_start', todayStr)
        .lt('scheduled_start', todayStr + 'T23:59:59')

      const { count: bookingsWeek } = await supabase
        .from('booking')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', business.business_id)
        .gte('scheduled_start', weekStartStr)

      // SMS denna månad
      const { data: campaigns } = await supabase
        .from('sms_campaign')
        .select('recipient_count')
        .eq('business_id', business.business_id)
        .eq('status', 'sent')
        .gte('sent_at', monthStart.toISOString())

      const smsFromCampaigns = campaigns?.reduce((sum: number, c: any) => sum + (c.recipient_count || 0), 0) || 0

      setBookings(bookingsData || [])
      setStats({
        bookingsToday: bookingsToday || 0,
        bookingsWeek: bookingsWeek || 0,
        totalCustomers: totalCustomers || 0,
        callsToday: 0,
        urgentCases: 0,
        smsThisMonth: smsFromCampaigns
      })
      setLoading(false)
    }

    fetchData()
  }, [business.business_id])

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

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background - dold på mobil för prestanda */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">
            {getGreeting()}{getFirstName() ? `, ${getFirstName()}` : ''}! 👋
          </h1>
          <p className="text-sm sm:text-base text-zinc-400">
            Översikt för {business.business_name}
          </p>
        </div>

        {/* Stat cards - 2x2 på mobil, 4 i rad på desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">{stats.bookingsToday}</p>
            <p className="text-xs sm:text-sm text-zinc-500">Bokningar idag</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500">
                <Users className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">{stats.totalCustomers}</p>
            <p className="text-xs sm:text-sm text-zinc-500">Aktiva kunder</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-500 to-green-500">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">{stats.smsThisMonth}</p>
            <p className="text-xs sm:text-sm text-zinc-500">SMS denna månad</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">{stats.bookingsWeek}</p>
            <p className="text-xs sm:text-sm text-zinc-500">Bokningar denna vecka</p>
          </div>
        </div>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-8">
          {/* Dagens bokningar */}
          <div className="lg:col-span-2 bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-zinc-800">
            <div className="p-4 sm:p-6 border-b border-zinc-800 flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-semibold text-white">Dagens bokningar</h2>
              <Link 
                href="/dashboard/bookings" 
                className="text-xs sm:text-sm text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                Visa alla
                <ArrowRight className="w-3 h-3 sm:w-4 sm:h-4" />
              </Link>
            </div>
            <div className="divide-y divide-zinc-800">
              {bookings.length === 0 ? (
                <div className="p-6 sm:p-8 text-center">
                  <Calendar className="w-10 h-10 sm:w-12 sm:h-12 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500 text-sm sm:text-base">Inga bokningar idag</p>
                  <Link 
                    href="/dashboard/bookings" 
                    className="inline-block mt-3 text-sm text-violet-400 hover:text-violet-300"
                  >
                    Skapa en bokning →
                  </Link>
                </div>
              ) : (
                bookings.slice(0, 5).map((booking) => (
                  <div key={booking.booking_id} className="p-3 sm:p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center min-w-0">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-lg sm:rounded-xl flex items-center justify-center border border-violet-500/30 flex-shrink-0">
                          <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
                        </div>
                        <div className="ml-3 sm:ml-4 min-w-0">
                          <p className="font-medium text-white text-sm sm:text-base truncate">
                            {booking.customer?.name || 'Okänd kund'}
                          </p>
                          <p className="text-xs sm:text-sm text-zinc-500 truncate">
                            {getServiceFromNotes(booking.notes)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p className="font-medium text-white text-sm sm:text-base">
                          {formatTime(booking.scheduled_start)}
                        </p>
                        <span className="inline-flex px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {booking.status === 'confirmed' ? 'Bekräftad' : booking.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
              {bookings.length > 5 && (
                <div className="p-3 sm:p-4 text-center">
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

          {/* Snabblänkar & Insikter */}
          <div className="space-y-4 sm:space-y-6">
            {/* Snabblänkar */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="text-base sm:text-lg font-semibold text-white mb-3 sm:mb-4">Snabbåtgärder</h2>
              <div className="space-y-2 sm:space-y-3">
                <Link 
                  href="/dashboard/bookings"
                  className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-violet-400" />
                    <span className="text-sm text-white">Ny bokning</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-violet-400 transition-colors" />
                </Link>
                
                <Link 
                  href="/dashboard/customers"
                  className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 sm:w-5 sm:h-5 text-cyan-400" />
                    <span className="text-sm text-white">Lägg till kund</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-cyan-400 transition-colors" />
                </Link>
                
                <Link 
                  href="/dashboard/campaigns/new"
                  className="flex items-center justify-between p-3 bg-zinc-800/50 hover:bg-zinc-800 rounded-xl transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
                    <span className="text-sm text-white">Skicka kampanj</span>
                  </div>
                  <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-emerald-400 transition-colors" />
                </Link>
              </div>
            </div>

            {/* AI Insikter */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-zinc-800">
              <div className="p-4 sm:p-6 border-b border-zinc-800">
                <div className="flex items-center">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 mr-2 sm:mr-3">
                    <TrendingUp className="w-3 h-3 sm:w-4 sm:h-4 text-violet-400" />
                  </div>
                  <h2 className="text-base sm:text-lg font-semibold text-white">AI Insikter</h2>
                </div>
              </div>
              <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
                {stats.bookingsToday === 0 && stats.totalCustomers === 0 ? (
                  <div className="p-3 sm:p-4 rounded-xl border bg-violet-500/10 border-violet-500/30">
                    <p className="font-medium text-white text-sm">Välkommen! 🎉</p>
                    <p className="text-xs text-zinc-400 mt-1">
                      Skapa din första kund och bokning för att komma igång.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="p-3 sm:p-4 rounded-xl border bg-emerald-500/10 border-emerald-500/30">
                      <p className="font-medium text-white text-sm">Allt under kontroll ✓</p>
                      <p className="text-xs text-zinc-400 mt-1">
                        Inga akuta ärenden just nu.
                      </p>
                    </div>
                    {stats.totalCustomers > 10 && stats.smsThisMonth === 0 && (
                      <div className="p-3 sm:p-4 rounded-xl border bg-amber-500/10 border-amber-500/30">
                        <p className="font-medium text-white text-sm">Tips 💡</p>
                        <p className="text-xs text-zinc-400 mt-1">
                          Du har {stats.totalCustomers} kunder. Skicka en kampanj för att återaktivera dem!
                        </p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
