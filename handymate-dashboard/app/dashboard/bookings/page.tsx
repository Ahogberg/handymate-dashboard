'use client'

import { useEffect, useState } from 'react'
import { Calendar, Plus, Clock, User, X, Loader2, Trash2, Edit } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'

// Reskin (Etapp L2b1, docs/HANDYMATE_DESIGN_SYSTEM.md): dag-rubriken för
// kortlistan som ersätter den råa HTML-tabellen. `filteredBookings` kommer
// redan sorterad `scheduled_start ascending` från fetchData() — samma
// ordning som innan, den här funktionen lägger bara in en rubrik-rad
// mellan dagar, den sorterar aldrig om. Se dayLabel-mönstret i
// app/dashboard/approvals/page.tsx.
function bookingDayLabel(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  if (date.toDateString() === now.toDateString()) return 'I dag'
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (date.toDateString() === tomorrow.toDateString()) return 'I morgon'
  return date.toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long' })
}

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

interface Customer {
  customer_id: string
  name: string
  phone_number: string
}

export default function BookingsPage() {
  const business = useBusiness()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'today' | 'upcoming'>('upcoming')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  const [form, setForm] = useState({
    customer_id: '',
    date: '',
    start_time: '',
    end_time: '',
    notes: '',
    status: 'confirmed'
  })

  useEffect(() => {
    fetchData()
  }, [business.business_id])

  async function fetchData() {
    const { data: bookingsData } = await supabase
      .from('booking')
      .select(`
        booking_id, customer_id, scheduled_start, scheduled_end, status, notes, created_at,
        customer (name, phone_number)
      `)
      .eq('business_id', business.business_id)
      .order('scheduled_start', { ascending: true })

    const { data: customersData } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .eq('business_id', business.business_id)

    setBookings(bookingsData || [])
    setCustomers(customersData || [])
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const openCreateModal = () => {
    setEditingBooking(null)
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setForm({ 
      customer_id: '', 
      date: tomorrow.toISOString().split('T')[0], 
      start_time: '09:00', 
      end_time: '10:00', 
      notes: '', 
      status: 'confirmed' 
    })
    setModalOpen(true)
  }

  const openEditModal = (booking: Booking) => {
    setEditingBooking(booking)
    const startDate = new Date(booking.scheduled_start)
    const endDate = new Date(booking.scheduled_end)
    setForm({
      customer_id: booking.customer_id,
      date: startDate.toISOString().split('T')[0],
      start_time: startDate.toTimeString().substring(0, 5),
      end_time: endDate.toTimeString().substring(0, 5),
      notes: booking.notes || '',
      status: booking.status
    })
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!form.customer_id || !form.date || !form.start_time) {
      showToast('Kund, datum och tid krävs', 'error')
      return
    }

    const scheduledStart = `${form.date}T${form.start_time}:00`
    const scheduledEnd = `${form.date}T${form.end_time}:00`

    setActionLoading(true)
    try {
      const response = await fetch('/api/actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingBooking ? 'update_booking' : 'create_booking',
          data: editingBooking
            ? { bookingId: editingBooking.booking_id, scheduledStart, scheduledEnd, status: form.status, notes: form.notes }
            : { customerId: form.customer_id, scheduledStart, scheduledEnd, notes: form.notes, businessId: business.business_id }
        }),
      })

      if (!response.ok) throw new Error('Något gick fel')

      showToast(editingBooking ? 'Bokning uppdaterad!' : 'Bokning skapad!', 'success')
      setModalOpen(false)
      fetchData()
    } catch (error) {
      showToast('Något gick fel', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async (bookingId: string) => {
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
    } catch (error) {
      showToast('Något gick fel', 'error')
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const filteredBookings = bookings.filter(booking => {
    const bookingDate = booking.scheduled_start?.split('T')[0]
    if (filter === 'today') return bookingDate === today
    if (filter === 'upcoming') return bookingDate >= today
    return true
  })

  const formatDate = (dateString: string) => new Date(dateString).toLocaleDateString('sv-SE', { weekday: 'short', month: 'short', day: 'numeric' })
  const formatTime = (dateString: string) => new Date(dateString).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
  const getServiceFromNotes = (notes: string | null) => notes ? notes.split(' - ')[0] : 'Tjänst ej angiven'

  const getStatusStyle = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-emerald-100 text-emerald-600 border-emerald-200'
      case 'completed': return 'bg-primary-100 text-primary-600 border-primary-600/30'
      case 'cancelled': return 'bg-red-100 text-red-600 border-red-200'
      default: return 'bg-gray-100 text-gray-500 border-gray-300'
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
      <div className="p-8 bg-[#F8FAFC] min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
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

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-heading text-lg font-semibold text-gray-900">{editingBooking ? 'Redigera bokning' : 'Ny bokning'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900 min-h-[44px] min-w-[44px] flex items-center justify-center"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Kund *</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                >
                  <option value="">Välj kund...</option>
                  {customers.map(c => (
                    <option key={c.customer_id} value={c.customer_id}>{c.name} ({c.phone_number})</option>
                  ))}
                </select>
                {customers.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">Du behöver skapa en kund först</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Datum *</label>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Starttid *</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Sluttid *</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                  />
                </div>
              </div>
              {editingBooking && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E]"
                  >
                    <option value="confirmed">Bekräftad</option>
                    <option value="completed">Slutförd</option>
                    <option value="cancelled">Avbokad</option>
                    <option value="no_show">Uteblev</option>
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm text-gray-500 mb-1">Anteckningar</label>
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="T.ex. Elinstallation - 3 nya uttag"
                  rows={3}
                  className="w-full px-4 py-2 bg-white border border-[#E2E8F0] rounded-lg text-gray-900 focus:outline-none focus:border-[#0F766E] resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 min-h-[44px] text-gray-500 hover:text-gray-900">Avbryt</button>
              <button
                onClick={handleSubmit}
                disabled={actionLoading || customers.length === 0}
                className="flex items-center px-4 py-2 min-h-[44px] bg-primary-700 rounded-xl font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-all"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingBooking ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        {/* Header — ljust idiom (docs/HANDYMATE_DESIGN_SYSTEM.md), samma
            uppbyggnad som Godkännanden: ikon-platta + font-heading-titel. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-primary-100 rounded-xl flex items-center justify-center shrink-0">
              <Calendar className="w-5 h-5 text-primary-700" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-2xl sm:text-3xl font-bold text-slate-900">Bokningar</h1>
              <p className="text-gray-600 text-sm mt-0.5">{filteredBookings.length} bokningar</p>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {(['all', 'today', 'upcoming'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 min-h-[44px] rounded-lg text-sm font-semibold transition-all ${
                    filter === f ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {f === 'all' ? 'Alla' : f === 'today' ? 'Idag' : 'Kommande'}
                </button>
              ))}
            </div>
            <button onClick={openCreateModal} className="flex items-center justify-center gap-2 px-4 py-2 min-h-[44px] bg-primary-700 rounded-card font-medium text-white hover:bg-primary-600 transition-all">
              <Plus className="w-4 h-4" />
              Ny bokning
            </button>
          </div>
        </div>

        {filteredBookings.length === 0 ? (
          <div className="bg-white rounded-card border border-[#E2E8F0] text-center py-16">
            <div className="w-16 h-16 bg-primary-50 rounded-card flex items-center justify-center mx-auto mb-4">
              <Calendar className="w-8 h-8 text-primary-700" />
            </div>
            <p className="font-heading text-slate-900 font-semibold text-lg mb-1">
              {filter === 'today' ? 'Inga bokningar idag' : 'Inga bokningar ännu'}
            </p>
            {customers.length > 0 ? (
              <button onClick={openCreateModal} className="mt-2 text-primary-700 hover:text-primary-800 text-sm font-medium min-h-[44px] px-2">
                Skapa din första bokning →
              </button>
            ) : (
              <a href="/dashboard/customers" className="mt-2 text-primary-700 hover:text-primary-800 text-sm font-medium block">
                Skapa en kund först →
              </a>
            )}
          </div>
        ) : (
          // Kortlista med dag-gruppering — bokningar är tidsdata, samma
          // idiom som Godkännanden. Listan kommer redan sorterad
          // scheduled_start ascending (fetchData ovan), så headern
          // sorterar aldrig om — bara en rubrik-rad läggs in mellan dagar.
          <div className="space-y-3">
            {filteredBookings.map((booking, idx) => {
              const day = bookingDayLabel(booking.scheduled_start)
              const prevDay = idx > 0 ? bookingDayLabel(filteredBookings[idx - 1].scheduled_start) : null
              const dayHeader = day !== prevDay ? (
                <div key={`day-${booking.booking_id}`} className="flex items-center gap-2 px-1 pt-1 first:pt-0">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 whitespace-nowrap">{day}</span>
                  <span className="flex-1 h-px bg-slate-200" aria-hidden />
                </div>
              ) : null

              const card = (
                <div
                  key={booking.booking_id}
                  className="flex items-center gap-3 p-4 bg-white border border-slate-200 rounded-card hover:border-slate-300 transition-all"
                >
                  <div className="w-10 h-10 bg-[#F0FDFA] rounded-xl flex items-center justify-center border border-[#E2E8F0] shrink-0">
                    <User className="w-5 h-5 text-primary-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-heading text-[15px] font-semibold text-slate-900">{booking.customer?.name || 'Okänd'}</p>
                      <span className={`inline-flex px-2.5 py-0.5 text-xs font-semibold rounded-full border ${getStatusStyle(booking.status)}`}>
                        {getStatusText(booking.status)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">{getServiceFromNotes(booking.notes)}</p>
                    <div className="flex items-center gap-3 text-sm text-slate-500 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {formatDate(booking.scheduled_start)} · {formatTime(booking.scheduled_start)}–{formatTime(booking.scheduled_end)}
                      </span>
                      {booking.customer?.phone_number && (
                        <span className="text-slate-400">{booking.customer.phone_number}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditModal(booking)}
                      className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(booking.booking_id)}
                      className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )
              return dayHeader ? [dayHeader, card] : card
            })}
          </div>
        )}
      </div>
    </div>
  )
}
