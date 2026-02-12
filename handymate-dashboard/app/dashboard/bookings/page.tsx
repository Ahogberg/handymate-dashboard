'use client'

import { useEffect, useState } from 'react'
import { Calendar, Plus, Clock, User, X, Loader2, Trash2, Edit } from 'lucide-react'
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
      case 'completed': return 'bg-blue-100 text-blue-400 border-blue-500/30'
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
      <div className="p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Laddar...</div>
      </div>
    )
  }

  return (
    <div className="p-8 bg-slate-50 min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${
          toast.type === 'success' ? 'bg-emerald-100 border-emerald-200 text-emerald-600' : 'bg-red-100 border-red-200 text-red-600'
        }`}>
          {toast.message}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900">{editingBooking ? 'Redigera bokning' : 'Ny bokning'}</h3>
              <button onClick={() => setModalOpen(false)} className="text-gray-400 hover:text-gray-900"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-500 mb-1">Kund *</label>
                <select
                  value={form.customer_id}
                  onChange={(e) => setForm({ ...form, customer_id: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Starttid *</label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Sluttid *</label>
                  <input
                    type="time"
                    value={form.end_time}
                    onChange={(e) => setForm({ ...form, end_time: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
              </div>
              {editingBooking && (
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
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
                  className="w-full px-4 py-2 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-gray-500 hover:text-gray-900">Avbryt</button>
              <button
                onClick={handleSubmit}
                disabled={actionLoading || customers.length === 0}
                className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingBooking ? 'Spara' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Bokningar</h1>
            <p className="text-gray-500">{filteredBookings.length} bokningar</p>
          </div>
          <div className="flex space-x-4">
            <div className="flex bg-white border border-gray-200 rounded-xl p-1">
              {(['all', 'today', 'upcoming'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    filter === f ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white' : 'text-gray-500 hover:text-white'
                  }`}
                >
                  {f === 'all' ? 'Alla' : f === 'today' ? 'Idag' : 'Kommande'}
                </button>
              ))}
            </div>
            <button onClick={openCreateModal} className="flex items-center px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl font-medium text-white hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Ny bokning
            </button>
          </div>
        </div>

        <div className="bg-white shadow-sm rounded-2xl border border-gray-200 overflow-hidden">
          {filteredBookings.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-400">{filter === 'today' ? 'Inga bokningar idag' : 'Inga bokningar ännu'}</p>
              {customers.length > 0 ? (
                <button onClick={openCreateModal} className="mt-4 text-blue-600 hover:text-blue-500">
                  Skapa din första bokning →
                </button>
              ) : (
                <a href="/dashboard/customers" className="mt-4 text-blue-600 hover:text-blue-500 block">
                  Skapa en kund först →
                </a>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Kund</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Tjänst</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Datum & Tid</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Åtgärd</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredBookings.map((booking) => (
                  <tr key={booking.booking_id} className="hover:bg-gray-100/30 transition-all">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-500/20 to-cyan-500/20 rounded-xl flex items-center justify-center border border-blue-300">
                          <User className="w-5 h-5 text-blue-600" />
                        </div>
                        <div className="ml-4">
                          <p className="font-medium text-gray-900">{booking.customer?.name || 'Okänd'}</p>
                          <p className="text-sm text-gray-400">{booking.customer?.phone_number || '-'}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-900">{getServiceFromNotes(booking.notes)}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <p className="text-gray-900">{formatDate(booking.scheduled_start)}</p>
                          <p className="text-sm text-gray-400">{formatTime(booking.scheduled_start)} - {formatTime(booking.scheduled_end)}</p>
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
                        <button onClick={() => openEditModal(booking)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(booking.booking_id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
