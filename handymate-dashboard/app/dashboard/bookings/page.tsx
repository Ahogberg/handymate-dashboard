'use client'

import { useEffect, useState } from 'react'
import { Calendar, Plus, Filter, Clock, User, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Booking {
  booking_id: string
  customer_id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  notes: string | null
  created_at: string
  customer?: {
    name: string
    phone_number: string
    address_line: string
  }
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('all')

  useEffect(() => {
    async function fetchBookings() {
      const { data } = await supabase
        .from('booking')
        .select(`
          booking_id,
          customer_id,
          scheduled_start,
          scheduled_end,
          status,
          notes,
          created_at,
          customer (
            name,
            phone_number,
            address_line
          )
        `)
        .eq('business_id', 'elexperten_sthlm')
        .order('scheduled_start', { ascending: true })

      setBookings(data || [])
      setLoading(false)
    }

    fetchBookings()
  }, [])

  const today = new Date().toISOString().split('T')[0]

  const filteredBookings = bookings.filter(booking => {
    const bookingDate = booking.scheduled_start?.split('T')[0]
    if (filter === 'today') return bookingDate === today
    if (filter === 'upcoming') return bookingDate >= today
    return true
  })

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })
  }

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  }

  const getServiceFromNotes = (notes: string | null) => {
    if (!notes) return 'Tjänst ej angiven'
    return notes.split(' - ')[0] || notes
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      case 'completed':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'cancelled':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:
        return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'confirmed': return 'Bekräftad'
      case 'completed': return 'Slutförd'
      case 'cancelled': return 'Avbokad'
      case 'no_show': return 'Uteblev'
      default: return status
    }
  }

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
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Bokningar</h1>
            <p className="text-zinc-400">{filteredBookings.length} bokningar</p>
          </div>
          <div className="flex space-x-4">
            <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1">
              {(['all', 'today', 'upcoming'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    filter === f
                      ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'Alla' : f === 'today' ? 'Idag' : 'Kommande'}
                </button>
              ))}
            </div>
            <button className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 transition-opacity">
              <Plus className="w-4 h-4 mr-2" />
              Ny bokning
            </button>
          </div>
        </div>

        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-800">
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Kund</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Tjänst</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Datum & Tid</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {filteredBookings.map((booking) => (
                  <tr key={booking.booking_id} className="hover:bg-zinc-800/30 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 rounded-xl flex items-center justify-center border border-violet-500/30">
                          <User className="w-5 h-5 text-violet-400" />
                        </div>
                        <div className="ml-4">
                          <p className="font-medium text-white">{booking.customer?.name || 'Okänd kund'}</p>
                          <p className="text-sm text-zinc-500">{booking.customer?.phone_number || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-white">{getServiceFromNotes(booking.notes)}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 text-zinc-500 mr-2" />
                        <div>
                          <p className="text-white">{formatDate(booking.scheduled_start)}</p>
                          <p className="text-sm text-zinc-500">{formatTime(booking.scheduled_start)} - {formatTime(booking.scheduled_end)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 text-xs rounded-full border ${getStatusStyle(booking.status)}`}>
                        {getStatusText(booking.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <button className="text-violet-400 hover:text-violet-300 text-sm font-medium transition-colors">
                        Visa
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredBookings.length === 0 && (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
              <p className="text-zinc-500">Inga bokningar hittades</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
