'use client'

import { useEffect, useState } from 'react'
import {
  Calendar,
  Plus,
  Clock,
  User,
  X,
  Loader2,
  Trash2,
  Edit,
  Timer,
  DollarSign,
  ChevronLeft,
  ChevronRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

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
  }
}

interface TimeEntry {
  entry_id: string
  booking_id: string | null
  customer_id: string | null
  work_date: string
  start_time: string | null
  end_time: string | null
  hours_worked: number
  description: string | null
  hourly_rate: number | null
  materials_cost: number | null
  customer?: {
    customer_id: string
    name: string
    phone_number: string
  }
}

interface Customer {
  customer_id: string
  name: string
  phone_number: string
}

export default function CalendarPage() {
  const business = useBusiness()
  const [activeTab, setActiveTab] = useState<'bookings' | 'time'>('bookings')

  // Bookings state
  const [bookings, setBookings] = useState<Booking[]>([])
  const [bookingFilter, setBookingFilter] = useState<'all' | 'today' | 'upcoming'>('upcoming')
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)

  // Time entries state
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [timeTotals, setTimeTotals] = useState({ hours: 0, revenue: 0, count: 0 })
  const [selectedWeek, setSelectedWeek] = useState(getWeekDates(new Date()))
  const [timeModalOpen, setTimeModalOpen] = useState(false)
  const [editingTimeEntry, setEditingTimeEntry] = useState<TimeEntry | null>(null)

  // Shared state
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  // Forms
  const [bookingForm, setBookingForm] = useState({
    customer_id: '',
    date: '',
    start_time: '',
    end_time: '',
    notes: '',
    status: 'confirmed'
  })

  const [timeForm, setTimeForm] = useState({
    customer_id: '',
    work_date: '',
    start_time: '',
    end_time: '',
    hours_worked: '',
    description: '',
    hourly_rate: '500',
    materials_cost: '0'
  })

  useEffect(() => {
    if (business.business_id) {
      fetchData()
    }
  }, [business.business_id, selectedWeek])

  function getWeekDates(date: Date) {
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) // Monday
    const monday = new Date(date.setDate(diff))
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0]
    }
  }

  function changeWeek(direction: number) {
    const current = new Date(selectedWeek.start)
    current.setDate(current.getDate() + (direction * 7))
    setSelectedWeek(getWeekDates(current))
  }

  async function fetchData() {
    setLoading(true)

    // Fetch bookings
    const { data: bookingsData } = await supabase
      .from('booking')
      .select(`
        booking_id, customer_id, scheduled_start, scheduled_end, status, notes, created_at,
        customer (name, phone_number)
      `)
      .eq('business_id', business.business_id)
      .order('scheduled_start', { ascending: true })

    // Fetch time entries for selected week
    const timeResponse = await fetch(
      `/api/time-entry?businessId=${business.business_id}&startDate=${selectedWeek.start}&endDate=${selectedWeek.end}`
    )
    const timeData = await timeResponse.json()

    // Fetch customers
    const { data: customersData } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .eq('business_id', business.business_id)

    setBookings(bookingsData || [])
    setTimeEntries(timeData.entries || [])
    setTimeTotals(timeData.totals || { hours: 0, revenue: 0, count: 0 })
    setCustomers(customersData || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  // === BOOKING FUNCTIONS ===
  const openCreateBookingModal = () => {
    setEditingBooking(null)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setBookingForm({
      customer_id: '',
      date: tomorrow.toISOString().split('T')[0],
      start_time: '09:00',
      end_time: '10:00',
      notes: '',
      status: 'confirmed'
    })
    setBookingModalOpen(true)
  }

  const openEditBookingModal = (booking: Booking) => {
    setEditingBooking(booking)
    const startDate = new Date(booking.scheduled_start)
    const endDate = new Date(booking.scheduled_end)
    setBookingForm({
      customer_id: booking.customer_id,
      date: startDate.toISOString().split('T')[0],
      start_time: startDate.toTimeString().substring(0, 5),
      end_time: endDate.toTimeString().substring(0, 5),
      notes: booking.notes || '',
      status: booking.status
    })
    setBookingModalOpen(true)
  }

  const handleBookingSubmit = async () => {
    if (!bookingForm.customer_id || !bookingForm.date || !bookingForm.start_time) {
      showToast('Kund, datum och tid krävs', 'error')
      return
    }

    const scheduledStart = `${bookingForm.date}T${bookingForm.start_time}:00`
    const scheduledEnd = `${bookingForm.date}T${bookingForm.end_time}:00`

    setActionLoading(true)
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingBooking ? 'update_booking' : 'create_booking',
          data: editingBooking
            ? { bookingId: editingBooking.booking_id, scheduledStart, scheduledEnd, status: bookingForm.status, notes: bookingForm.notes }
            : { customerId: bookingForm.customer_id, scheduledStart, scheduledEnd, notes: bookingForm.notes, businessId: business.business_id }
        }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast(editingBooking ? 'Bokning uppdaterad!' : 'Bokning skapad!', 'success')
      setBookingModalOpen(false)
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBookingDelete = async (bookingId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna bokning?')) return

    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_booking', data: { bookingId } }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast('Bokning borttagen!', 'success')
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  // === TIME ENTRY FUNCTIONS ===
  const openCreateTimeModal = () => {
    setEditingTimeEntry(null)
    const today = new Date().toISOString().split('T')[0]
    setTimeForm({
      customer_id: '',
      work_date: today,
      start_time: '08:00',
      end_time: '16:00',
      hours_worked: '8',
      description: '',
      hourly_rate: '500',
      materials_cost: '0'
    })
    setTimeModalOpen(true)
  }

  const openEditTimeModal = (entry: TimeEntry) => {
    setEditingTimeEntry(entry)
    setTimeForm({
      customer_id: entry.customer_id || '',
      work_date: entry.work_date,
      start_time: entry.start_time || '',
      end_time: entry.end_time || '',
      hours_worked: String(entry.hours_worked || 0),
      description: entry.description || '',
      hourly_rate: String(entry.hourly_rate || 500),
      materials_cost: String(entry.materials_cost || 0)
    })
    setTimeModalOpen(true)
  }

  const handleTimeSubmit = async () => {
    if (!timeForm.work_date || !timeForm.hours_worked) {
      showToast('Datum och arbetade timmar krävs', 'error')
      return
    }

    setActionLoading(true)
    try {
      const method = editingTimeEntry ? 'PUT' : 'POST'
      const body = editingTimeEntry
        ? {
            entry_id: editingTimeEntry.entry_id,
            customer_id: timeForm.customer_id || null,
            work_date: timeForm.work_date,
            start_time: timeForm.start_time || null,
            end_time: timeForm.end_time || null,
            hours_worked: parseFloat(timeForm.hours_worked),
            description: timeForm.description || null,
            hourly_rate: parseFloat(timeForm.hourly_rate) || 500,
            materials_cost: parseFloat(timeForm.materials_cost) || 0
          }
        : {
            business_id: business.business_id,
            customer_id: timeForm.customer_id || null,
            work_date: timeForm.work_date,
            start_time: timeForm.start_time || null,
            end_time: timeForm.end_time || null,
            hours_worked: parseFloat(timeForm.hours_worked),
            description: timeForm.description || null,
            hourly_rate: parseFloat(timeForm.hourly_rate) || 500,
            materials_cost: parseFloat(timeForm.materials_cost) || 0
          }

      const response = await fetch('/api/time-entry', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast(editingTimeEntry ? 'Tid uppdaterad!' : 'Tid registrerad!', 'success')
      setTimeModalOpen(false)
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleTimeDelete = async (entryId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna tidrapport?')) return

    try {
      const response = await fetch(`/api/time-entry?entryId=${entryId}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast('Tidrapport borttagen!', 'success')
      fetchData()
    } catch {
      showToast('Något gick fel', 'error')
    }
  }

  // Calculate hours from time inputs
  const calculateHours = (start: string, end: string) => {
    if (!start || !end) return
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const hours = (eh * 60 + em - sh * 60 - sm) / 60
    if (hours > 0) {
      setTimeForm(prev => ({ ...prev, hours_worked: hours.toFixed(1) }))
    }
  }

  // === HELPERS ===
  const today = new Date().toISOString().split('T')[0]
  const filteredBookings = bookings.filter(booking => {
    const bookingDate = booking.scheduled_start?.split('T')[0]
    if (bookingFilter === 'today') return bookingDate === today
    if (bookingFilter === 'upcoming') return bookingDate >= today
    return true
  })

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })
  const formatTime = (dateString: string) => new Date(dateString).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  const formatWeekRange = () => {
    const start = new Date(selectedWeek.start)
    const end = new Date(selectedWeek.end)
    return `${start.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}`
  }

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      case 'completed': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30'
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
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
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Booking Modal */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">{editingBooking ? 'Redigera bokning' : 'Ny bokning'}</h3>
              <button onClick={() => setBookingModalOpen(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Kund *</label>
                <select
                  value={bookingForm.customer_id}
                  onChange={(e) => setBookingForm({ ...bookingForm, customer_id: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name} ({c.phone_number})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Datum *</label>
                <input
                  type="date"
                  value={bookingForm.date}
                  onChange={(e) => setBookingForm({ ...bookingForm, date: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Starttid *</label>
                  <input
                    type="time"
                    value={bookingForm.start_time}
                    onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Sluttid *</label>
                  <input
                    type="time"
                    value={bookingForm.end_time}
                    onChange={(e) => setBookingForm({ ...bookingForm, end_time: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
              </div>
              {editingBooking && (
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Status</label>
                  <select
                    value={bookingForm.status}
                    onChange={(e) => setBookingForm({ ...bookingForm, status: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  >
                    <option value="confirmed">Bekräftad</option>
                    <option value="completed">Slutförd</option>
                    <option value="cancelled">Avbokad</option>
                    <option value="no_show">Uteblev</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Anteckningar</label>
                <textarea
                  value={bookingForm.notes}
                  onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })}
                  placeholder="T.ex. Elinstallation - 3 nya uttag"
                  rows={3}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setBookingModalOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white">Avbryt</button>
              <button
                onClick={handleBookingSubmit}
                disabled={actionLoading || customers.length === 0}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingBooking ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Time Entry Modal */}
      {timeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">{editingTimeEntry ? 'Redigera tid' : 'Registrera tid'}</h3>
              <button onClick={() => setTimeModalOpen(false)} className="text-zinc-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Kund (valfritt)</label>
                <select
                  value={timeForm.customer_id}
                  onChange={(e) => setTimeForm({ ...timeForm, customer_id: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Ingen kund vald</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Datum *</label>
                <input
                  type="date"
                  value={timeForm.work_date}
                  onChange={(e) => setTimeForm({ ...timeForm, work_date: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Starttid</label>
                  <input
                    type="time"
                    value={timeForm.start_time}
                    onChange={(e) => {
                      setTimeForm({ ...timeForm, start_time: e.target.value })
                      calculateHours(e.target.value, timeForm.end_time)
                    }}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Sluttid</label>
                  <input
                    type="time"
                    value={timeForm.end_time}
                    onChange={(e) => {
                      setTimeForm({ ...timeForm, end_time: e.target.value })
                      calculateHours(timeForm.start_time, e.target.value)
                    }}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Timmar *</label>
                  <input
                    type="number"
                    step="0.5"
                    value={timeForm.hours_worked}
                    onChange={(e) => setTimeForm({ ...timeForm, hours_worked: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-zinc-400 mb-1">Timpris (kr)</label>
                  <input
                    type="number"
                    value={timeForm.hourly_rate}
                    onChange={(e) => setTimeForm({ ...timeForm, hourly_rate: e.target.value })}
                    className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Materialkostnad (kr)</label>
                <input
                  type="number"
                  value={timeForm.materials_cost}
                  onChange={(e) => setTimeForm({ ...timeForm, materials_cost: e.target.value })}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Beskrivning</label>
                <textarea
                  value={timeForm.description}
                  onChange={(e) => setTimeForm({ ...timeForm, description: e.target.value })}
                  placeholder="Vad gjordes?"
                  rows={2}
                  className="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setTimeModalOpen(false)} className="px-4 py-2 text-zinc-400 hover:text-white">Avbryt</button>
              <button
                onClick={handleTimeSubmit}
                disabled={actionLoading}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingTimeEntry ? 'Spara' : 'Registrera'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Kalender</h1>
            <p className="text-zinc-400">Hantera bokningar och tidrapportering</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1">
            <button
              onClick={() => setActiveTab('bookings')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'bookings'
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Bokningar
            </button>
            <button
              onClick={() => setActiveTab('time')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'time'
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Timer className="w-4 h-4" />
              Tidrapport
            </button>
          </div>

          {/* Tab-specific controls */}
          {activeTab === 'bookings' && (
            <>
              <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                {(['all', 'today', 'upcoming'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setBookingFilter(f)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                      bookingFilter === f ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {f === 'all' ? 'Alla' : f === 'today' ? 'Idag' : 'Kommande'}
                  </button>
                ))}
              </div>
              <button onClick={openCreateBookingModal} className="ml-auto flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Ny bokning
              </button>
            </>
          )}

          {activeTab === 'time' && (
            <>
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl p-1">
                <button onClick={() => changeWeek(-1)} className="p-2 text-zinc-400 hover:text-white">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 text-sm text-white min-w-[180px] text-center">{formatWeekRange()}</span>
                <button onClick={() => changeWeek(1)} className="p-2 text-zinc-400 hover:text-white">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <button onClick={openCreateTimeModal} className="ml-auto flex items-center px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Registrera tid
              </button>
            </>
          )}
        </div>

        {/* Time Stats */}
        {activeTab === 'time' && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-violet-500/20 rounded-xl flex items-center justify-center">
                  <Timer className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{timeTotals.hours.toFixed(1)}h</p>
                  <p className="text-sm text-zinc-500">Arbetade timmar</p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{timeTotals.revenue.toLocaleString('sv-SE')} kr</p>
                  <p className="text-sm text-zinc-500">Intäkter</p>
                </div>
              </div>
            </div>
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-500/20 rounded-xl flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{timeTotals.count}</p>
                  <p className="text-sm text-zinc-500">Registreringar</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 overflow-hidden">
          {activeTab === 'bookings' && (
            <>
              {filteredBookings.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-500">{bookingFilter === 'today' ? 'Inga bokningar idag' : 'Inga bokningar ännu'}</p>
                  {customers.length > 0 ? (
                    <button onClick={openCreateBookingModal} className="mt-4 text-violet-400 hover:text-violet-300">
                      Skapa din första bokning →
                    </button>
                  ) : (
                    <a href="/dashboard/customers" className="mt-4 text-violet-400 hover:text-violet-300 block">
                      Skapa en kund först →
                    </a>
                  )}
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Kund</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Tjänst</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Datum & Tid</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Åtgärd</th>
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
                              <p className="font-medium text-white">{booking.customer?.name || 'Okänd'}</p>
                              <p className="text-sm text-zinc-500">{booking.customer?.phone_number || '-'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-white">{booking.notes ? booking.notes.split(' - ')[0] : 'Tjänst ej angiven'}</td>
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
                          <div className="flex space-x-2">
                            <button onClick={() => openEditBookingModal(booking)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleBookingDelete(booking.booking_id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {activeTab === 'time' && (
            <>
              {timeEntries.length === 0 ? (
                <div className="text-center py-12">
                  <Timer className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                  <p className="text-zinc-500">Ingen tid registrerad denna vecka</p>
                  <button onClick={openCreateTimeModal} className="mt-4 text-violet-400 hover:text-violet-300">
                    Registrera din första tid →
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Datum</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Kund</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Beskrivning</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Tid</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Summa</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-zinc-500 uppercase">Åtgärd</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {timeEntries.map((entry) => {
                      const laborCost = (entry.hours_worked || 0) * (entry.hourly_rate || 0)
                      const total = laborCost + (entry.materials_cost || 0)
                      return (
                        <tr key={entry.entry_id} className="hover:bg-zinc-800/30 transition-all">
                          <td className="px-6 py-4">
                            <p className="text-white">{new Date(entry.work_date).toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
                            {entry.start_time && entry.end_time && (
                              <p className="text-sm text-zinc-500">{entry.start_time} - {entry.end_time}</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            {entry.customer ? (
                              <div>
                                <p className="text-white">{entry.customer.name}</p>
                                <p className="text-sm text-zinc-500">{entry.customer.phone_number}</p>
                              </div>
                            ) : (
                              <span className="text-zinc-500">-</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-white">{entry.description || '-'}</p>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                              <Timer className="w-4 h-4 text-zinc-500" />
                              <span className="text-white">{entry.hours_worked}h</span>
                              <span className="text-zinc-500 text-sm">@ {entry.hourly_rate} kr</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <p className="text-white font-medium">{total.toLocaleString('sv-SE')} kr</p>
                            {(entry.materials_cost || 0) > 0 && (
                              <p className="text-xs text-zinc-500">inkl. {entry.materials_cost} kr material</p>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex space-x-2">
                              <button onClick={() => openEditTimeModal(entry)} className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg">
                                <Edit className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleTimeDelete(entry.entry_id)} className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
