'use client'

import { useEffect, useState } from 'react'
import {
  Clock,
  Plus,
  Calendar,
  User,
  Briefcase,
  Play,
  Square,
  Trash2,
  Edit2,
  X,
  Check,
  Loader2,
  DollarSign
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, parseISO } from 'date-fns'
import { sv } from 'date-fns/locale'

interface TimeEntry {
  time_entry_id: string
  booking_id: string | null
  customer_id: string | null
  description: string | null
  work_date: string
  start_time: string | null
  end_time: string | null
  duration_minutes: number
  hourly_rate: number | null
  is_billable: boolean
  created_at: string
  customer?: {
    name: string
    customer_id: string
  }
  booking?: {
    booking_id: string
    notes: string
  }
}

interface Customer {
  customer_id: string
  name: string
}

interface Booking {
  booking_id: string
  notes: string
  customer_id: string
  customer?: {
    name: string
  }
}

interface Stats {
  totalMinutesWeek: number
  totalMinutesMonth: number
  billableMinutesWeek: number
  entriesThisWeek: number
}

export default function TimePage() {
  const business = useBusiness()
  const [entries, setEntries] = useState<TimeEntry[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [stats, setStats] = useState<Stats>({
    totalMinutesWeek: 0,
    totalMinutesMonth: 0,
    billableMinutesWeek: 0,
    entriesThisWeek: 0
  })
  const [loading, setLoading] = useState(true)
  const [activeTimer, setActiveTimer] = useState<string | null>(null)
  const [timerStart, setTimerStart] = useState<Date | null>(null)
  const [timerElapsed, setTimerElapsed] = useState(0)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingEntry, setEditingEntry] = useState<TimeEntry | null>(null)
  const [formData, setFormData] = useState({
    customer_id: '',
    booking_id: '',
    description: '',
    work_date: format(new Date(), 'yyyy-MM-dd'),
    duration_hours: 0,
    duration_minutes: 0,
    hourly_rate: '',
    is_billable: true
  })
  const [saving, setSaving] = useState(false)

  // Toast
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({
    show: false, message: '', type: 'success'
  })

  useEffect(() => {
    fetchData()
    fetchCustomersAndBookings()
  }, [business.business_id])

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (activeTimer && timerStart) {
      interval = setInterval(() => {
        setTimerElapsed(Math.floor((Date.now() - timerStart.getTime()) / 1000))
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [activeTimer, timerStart])

  async function fetchData() {
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
    const monthStart = startOfMonth(today)
    const monthEnd = endOfMonth(today)

    // Hämta tidposter
    const { data: entriesData } = await supabase
      .from('time_entry')
      .select(`
        *,
        customer (
          customer_id,
          name
        ),
        booking (
          booking_id,
          notes
        )
      `)
      .eq('business_id', business.business_id)
      .order('work_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50)

    // Statistik för veckan
    const { data: weekData } = await supabase
      .from('time_entry')
      .select('duration_minutes, is_billable')
      .eq('business_id', business.business_id)
      .gte('work_date', format(weekStart, 'yyyy-MM-dd'))
      .lte('work_date', format(weekEnd, 'yyyy-MM-dd'))

    // Statistik för månaden
    const { data: monthData } = await supabase
      .from('time_entry')
      .select('duration_minutes')
      .eq('business_id', business.business_id)
      .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
      .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))

    const totalMinutesWeek = weekData?.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) || 0
    const billableMinutesWeek = weekData?.filter(e => e.is_billable).reduce((sum, e) => sum + (e.duration_minutes || 0), 0) || 0
    const totalMinutesMonth = monthData?.reduce((sum, e) => sum + (e.duration_minutes || 0), 0) || 0

    setEntries(entriesData || [])
    setStats({
      totalMinutesWeek,
      totalMinutesMonth,
      billableMinutesWeek,
      entriesThisWeek: weekData?.length || 0
    })
    setLoading(false)
  }

  async function fetchCustomersAndBookings() {
    const { data: customersData } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', business.business_id)
      .order('name')

    const { data: bookingsData } = await supabase
      .from('booking')
      .select(`
        booking_id,
        notes,
        customer_id,
        customer (
          name
        )
      `)
      .eq('business_id', business.business_id)
      .in('status', ['confirmed', 'pending'])
      .order('scheduled_start', { ascending: false })
      .limit(50)

    setCustomers(customersData || [])
    setBookings(bookingsData || [])
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (hours === 0) return `${mins} min`
    if (mins === 0) return `${hours} tim`
    return `${hours} tim ${mins} min`
  }

  const formatTimerDisplay = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const startTimer = () => {
    setActiveTimer('new')
    setTimerStart(new Date())
    setTimerElapsed(0)
  }

  const stopTimer = () => {
    if (timerStart) {
      const elapsed = Math.floor((Date.now() - timerStart.getTime()) / 1000)
      const minutes = Math.floor(elapsed / 60)

      setFormData({
        ...formData,
        duration_hours: Math.floor(minutes / 60),
        duration_minutes: minutes % 60,
        work_date: format(new Date(), 'yyyy-MM-dd')
      })
      setShowModal(true)
    }
    setActiveTimer(null)
    setTimerStart(null)
    setTimerElapsed(0)
  }

  const openAddModal = () => {
    setEditingEntry(null)
    setFormData({
      customer_id: '',
      booking_id: '',
      description: '',
      work_date: format(new Date(), 'yyyy-MM-dd'),
      duration_hours: 0,
      duration_minutes: 0,
      hourly_rate: '',
      is_billable: true
    })
    setShowModal(true)
  }

  const openEditModal = (entry: TimeEntry) => {
    setEditingEntry(entry)
    const totalMinutes = entry.duration_minutes || 0
    setFormData({
      customer_id: entry.customer_id || '',
      booking_id: entry.booking_id || '',
      description: entry.description || '',
      work_date: entry.work_date,
      duration_hours: Math.floor(totalMinutes / 60),
      duration_minutes: totalMinutes % 60,
      hourly_rate: entry.hourly_rate?.toString() || '',
      is_billable: entry.is_billable
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const totalMinutes = (formData.duration_hours * 60) + formData.duration_minutes

      if (totalMinutes <= 0) {
        showToast('Ange en tid längre än 0 minuter', 'error')
        setSaving(false)
        return
      }

      const entryData = {
        business_id: business.business_id,
        customer_id: formData.customer_id || null,
        booking_id: formData.booking_id || null,
        description: formData.description || null,
        work_date: formData.work_date,
        duration_minutes: totalMinutes,
        hourly_rate: formData.hourly_rate ? parseFloat(formData.hourly_rate) : null,
        is_billable: formData.is_billable
      }

      if (editingEntry) {
        const { error } = await supabase
          .from('time_entry')
          .update(entryData)
          .eq('time_entry_id', editingEntry.time_entry_id)

        if (error) throw error
        showToast('Tidpost uppdaterad!', 'success')
      } else {
        const { error } = await supabase
          .from('time_entry')
          .insert(entryData)

        if (error) throw error
        showToast('Tid registrerad!', 'success')
      }

      setShowModal(false)
      fetchData()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (entryId: string) => {
    if (!confirm('Är du säker på att du vill ta bort denna tidpost?')) return

    try {
      const { error } = await supabase
        .from('time_entry')
        .delete()
        .eq('time_entry_id', entryId)

      if (error) throw error
      showToast('Tidpost borttagen', 'success')
      fetchData()
    } catch (error: any) {
      showToast(error.message || 'Något gick fel', 'error')
    }
  }

  // När booking väljs, sätt customer automatiskt
  const handleBookingChange = (bookingId: string) => {
    setFormData({ ...formData, booking_id: bookingId })
    const booking = bookings.find(b => b.booking_id === bookingId)
    if (booking?.customer_id) {
      setFormData(prev => ({ ...prev, booking_id: bookingId, customer_id: booking.customer_id }))
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
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
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

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">
                {editingEntry ? 'Redigera tidpost' : 'Registrera tid'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-zinc-500 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Datum */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Datum</label>
                <input
                  type="date"
                  value={formData.work_date}
                  onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                />
              </div>

              {/* Tid */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Tid arbetad</label>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        value={formData.duration_hours}
                        onChange={(e) => setFormData({ ...formData, duration_hours: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                        placeholder="0"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">tim</span>
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={formData.duration_minutes}
                        onChange={(e) => setFormData({ ...formData, duration_minutes: parseInt(e.target.value) || 0 })}
                        className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                        placeholder="0"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">min</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Kund */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Kund (valfritt)</label>
                <select
                  value={formData.customer_id}
                  onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Välj kund...</option>
                  {customers.map((c) => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Bokning */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Bokning (valfritt)</label>
                <select
                  value={formData.booking_id}
                  onChange={(e) => handleBookingChange(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                >
                  <option value="">Välj bokning...</option>
                  {bookings.map((b) => (
                    <option key={b.booking_id} value={b.booking_id}>
                      {b.customer?.name || 'Okänd'} - {b.notes?.substring(0, 30) || 'Ingen beskrivning'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Beskrivning */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Beskrivning</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Vad har du gjort?"
                  rows={3}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
              </div>

              {/* Timpris */}
              <div>
                <label className="block text-sm text-zinc-400 mb-2">Timpris (valfritt)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    value={formData.hourly_rate}
                    onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                    placeholder="0"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 text-sm">kr/tim</span>
                </div>
              </div>

              {/* Fakturerbar */}
              <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                <span className="text-white">Fakturerbar tid</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, is_billable: !formData.is_billable })}
                  className={`w-12 h-6 rounded-full transition-all ${
                    formData.is_billable ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500' : 'bg-zinc-700'
                  }`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                    formData.is_billable ? 'translate-x-6' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition-colors"
              >
                Avbryt
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center px-6 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {editingEntry ? 'Spara' : 'Registrera'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 sm:mb-8 gap-4">
          <div className="flex items-center">
            <div className="p-3 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 mr-4">
              <Clock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Tidrapportering</h1>
              <p className="text-zinc-400">Logga arbetstid per jobb</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Timer */}
            {activeTimer ? (
              <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/20 border border-emerald-500/30 rounded-xl">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 font-mono text-lg">{formatTimerDisplay(timerElapsed)}</span>
                <button
                  onClick={stopTimer}
                  className="p-2 bg-red-500/20 hover:bg-red-500/30 rounded-lg transition-colors"
                >
                  <Square className="w-4 h-4 text-red-400" />
                </button>
              </div>
            ) : (
              <button
                onClick={startTimer}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700 transition-colors"
              >
                <Play className="w-4 h-4" />
                <span className="hidden sm:inline">Starta timer</span>
              </button>
            )}

            <button
              onClick={openAddModal}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Lägg till</span>
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">
              {formatDuration(stats.totalMinutesWeek)}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500">Total tid denna vecka</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-500 to-green-500">
                <DollarSign className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">
              {formatDuration(stats.billableMinutesWeek)}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500">Fakturerbar tid</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500">
                <Briefcase className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">{stats.entriesThisWeek}</p>
            <p className="text-xs sm:text-sm text-zinc-500">Poster denna vecka</p>
          </div>

          <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-zinc-800">
            <div className="flex items-center justify-between mb-2 sm:mb-4">
              <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500 to-orange-500">
                <Calendar className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">
              {formatDuration(stats.totalMinutesMonth)}
            </p>
            <p className="text-xs sm:text-sm text-zinc-500">Total tid denna månad</p>
          </div>
        </div>

        {/* Time entries list */}
        <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl sm:rounded-2xl border border-zinc-800">
          <div className="p-4 sm:p-6 border-b border-zinc-800">
            <h2 className="text-base sm:text-lg font-semibold text-white">Tidposter</h2>
          </div>

          <div className="divide-y divide-zinc-800">
            {entries.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <Clock className="w-12 h-12 text-zinc-700 mx-auto mb-4" />
                <p className="text-zinc-400">Inga tidposter ännu</p>
                <p className="text-zinc-600 text-sm mt-2">Klicka på "Lägg till" för att registrera din första tid</p>
              </div>
            ) : (
              entries.map((entry) => (
                <div key={entry.time_entry_id} className="p-4 hover:bg-zinc-800/30 transition-all">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0 ${
                        entry.is_billable
                          ? 'bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border-violet-500/30'
                          : 'bg-zinc-800/50 border-zinc-700'
                      }`}>
                        <Clock className={`w-5 h-5 ${entry.is_billable ? 'text-violet-400' : 'text-zinc-500'}`} />
                      </div>
                      <div className="ml-4 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-white">
                            {formatDuration(entry.duration_minutes)}
                          </p>
                          {entry.is_billable && (
                            <span className="px-2 py-0.5 text-xs rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                              Fakturerbar
                            </span>
                          )}
                        </div>
                        {entry.description && (
                          <p className="text-sm text-zinc-400 mt-1 truncate">{entry.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500 flex-wrap">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {format(parseISO(entry.work_date), 'd MMM yyyy', { locale: sv })}
                          </span>
                          {entry.customer && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {entry.customer.name}
                            </span>
                          )}
                          {entry.hourly_rate && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3" />
                              {entry.hourly_rate} kr/tim
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => openEditModal(entry)}
                        className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(entry.time_entry_id)}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
