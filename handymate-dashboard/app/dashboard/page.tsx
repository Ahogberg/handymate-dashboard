'use client'

import { useEffect, useState } from 'react'
import { 
  Calendar, 
  Users, 
  Phone, 
  AlertTriangle,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

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
  totalCustomers: number
  callsToday: number
  urgentCases: number
}

export default function DashboardPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [stats, setStats] = useState<Stats>({ bookingsToday: 0, totalCustomers: 0, callsToday: 0, urgentCases: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const today = new Date().toISOString().split('T')[0]
      
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
        .gte('scheduled_start', today)
        .lt('scheduled_start', today + 'T23:59:59')
        .order('scheduled_start', { ascending: true })

      const { count: totalCustomers } = await supabase
        .from('customer')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', 'elexperten_sthlm')

      const { count: bookingsToday } = await supabase
        .from('booking')
        .select('*', { count: 'exact', head: true })
        .gte('scheduled_start', today)
        .lt('scheduled_start', today + 'T23:59:59')

      setBookings(bookingsData || [])
      setStats({
        bookingsToday: bookingsToday || 0,
        totalCustomers: totalCustomers || 0,
        callsToday: 12,
        urgentCases: 2
      })
      setLoading(false)
    }

    fetchData()
  }, [])

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  }

  const getServiceFromNotes = (notes: string) => {
    if (!notes) return 'Tjänst'
    return notes.split(' - ')[0] || notes.substring(0, 20)
  }

  const statCards = [
    { name: 'Bokningar idag', value: stats.bookingsToday.toString(), change: '+12%', trend: 'up', icon: Calendar, color: 'from-violet-500 to-fuchsia-500' },
    { name: 'Aktiva kunder', value: stats.totalCustomers.toString(), change: '+5%', trend: 'up', icon: Users, color: 'from-cyan-500 to-blue-500' },
    { name: 'Samtal idag', value: stats.callsToday.toString(), change: '+18%', trend: 'up', icon: Phone, color: 'from-emerald-500 to-green-500' },
    { name: 'Akuta ärenden', value: stats.urgentCases.toString(), change: '-1', trend: 'down', icon: AlertTriangle, color: 'from-orange-500 to-red-500' },
  ]

  const aiInsights = [
    { type: 'warning', title: 'Akut ärende väntar', description: 'Kund med strömavbrott har väntat 2 timmar.' },
    { type: 'suggestion', title: 'Optimera rutten', description: 'Byt ordning på bokning 2 och 3 för att spara 30 min.' },
    { type: 'info', title: 'Veckosammanfattning', description: '23% fler bokningar än förra veckan.' },
  ]

  if (loading) {
    return (
      <div className="p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">God morgon! 👋</h1>
          <p className="text-zinc-400">Här är en översikt av dagen.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {statCards.map((stat) => (
            <div key={stat.name} className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl p-6 border border-zinc-800">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color}`}>
                  <stat.icon className="w-5 h-5 text-white" />
                </div>
                <div className={`flex items-center text-sm ${stat.trend === 'up' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {stat.trend === 'up' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                  {stat.change}
                </div>
              </div>
              <p className="text-3xl font-bold text-white mb-1">{stat.value}</p>
              <p className="text-sm text-zinc-500">{stat.name}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800">
            <div className="p-6 border-b border-zinc-800">
              <h2 className="text-lg font-semibold text-white">Dagens bokningar</h2>
            </div>
            <div className="divide-y divide-zinc-800">
              {bookings.length === 0 ? (
                <div className="p-6 text-center text-zinc-500">Inga bokningar idag</div>
              ) : (
                bookings.map((booking) => (
                  <div key={booking.booking_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center border border-violet-500/30">
                          <Clock className="w-5 h-5 text-violet-400" />
                        </div>
                        <div className="ml-4">
                          <p className="font-medium text-white">{booking.customer?.name || 'Okänd kund'}</p>
                          <p className="text-sm text-zinc-500">{getServiceFromNotes(booking.notes)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-white">{formatTime(booking.scheduled_start)}</p>
                        <span className="inline-flex px-2.5 py-1 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          {booking.status === 'confirmed' ? 'Bekräftad' : booking.status}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800">
            <div className="p-6 border-b border-zinc-800">
              <div className="flex items-center">
                <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 mr-3">
                  <TrendingUp className="w-4 h-4 text-violet-400" />
                </div>
                <h2 className="text-lg font-semibold text-white">AI Insikter</h2>
              </div>
            </div>
            <div className="p-4 space-y-4">
              {aiInsights.map((insight, i) => (
                <div key={i} className={`p-4 rounded-xl border ${
                  insight.type === 'warning' ? 'bg-red-500/10 border-red-500/30' :
                  insight.type === 'suggestion' ? 'bg-violet-500/10 border-violet-500/30' :
                  'bg-zinc-800/50 border-zinc-700'
                }`}>
                  <p className="font-medium text-white text-sm">{insight.title}</p>
                  <p className="text-xs text-zinc-400 mt-1">{insight.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
