'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { 
  ArrowLeft, 
  Calendar,
  Clock,
  User,
  Phone,
  MapPin,
  FileText,
  CheckCircle,
  Play,
  XCircle,
  Star,
  Send,
  Loader2
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
  job_status: string
  notes: string
  job_notes: string
  customer_rating: number | null
  rating_feedback: string | null
  completed_at: string | null
  customer?: {
    customer_id: string
    name: string
    phone_number: string
    email: string
    address_line: string
  }
}

export default function BookingDetailPage() {
  const params = useParams()
  const business = useBusiness()
  const bookingId = params.id as string

  const [booking, setBooking] = useState<Booking | null>(null)
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState(false)
  const [jobNotes, setJobNotes] = useState('')
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [toast, setToast] = useState<{ show: boolean; message: string; type: 'success' | 'error' }>({ show: false, message: '', type: 'success' })

  useEffect(() => {
    fetchBooking()
  }, [bookingId])

  async function fetchBooking() {
    const { data } = await supabase
      .from('booking')
      .select('*, customer (customer_id, name, phone_number, email, address_line)')
      .eq('booking_id', bookingId)
      .single()
    setBooking(data)
    setJobNotes(data?.job_notes || '')
    setLoading(false)
  }

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ show: true, message, type })
    setTimeout(() => setToast({ show: false, message: '', type: 'success' }), 3000)
  }

  const updateJobStatus = async (newStatus: string, sendSMS: boolean = false) => {
    setUpdating(true)
    const updateData: Record<string, unknown> = { job_status: newStatus, job_notes: jobNotes }
    if (newStatus === 'completed') {
      updateData.completed_at = new Date().toISOString()
    }

    const { error } = await supabase.from('booking').update(updateData).eq('booking_id', bookingId)
    if (error) {
      showToast('Kunde inte uppdatera', 'error')
      setUpdating(false)
      return
    }

    if (booking?.customer_id) {
      await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        customer_id: booking.customer_id,
        business_id: business.business_id,
        activity_type: newStatus === 'completed' ? 'job_completed' : 'booking_updated',
        title: newStatus === 'completed' ? 'Jobb slutfört' : 'Jobb uppdaterat',
        description: jobNotes || null,
        created_by: 'user'
      })
    }

    if (sendSMS && booking?.customer?.phone_number && newStatus === 'completed') {
      const message = `Tack för att du valde ${business.business_name}! Vi hoppas du är nöjd. Hur upplevde du servicen? Svara med 1-5 där 5 är bäst.`
      await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: booking.customer.phone_number, message, businessName: business.business_name })
      })
      await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        customer_id: booking.customer_id,
        business_id: business.business_id,
        activity_type: 'sms_sent',
        title: 'Uppföljnings-SMS skickat',
        description: message,
        created_by: 'ai'
      })
      await supabase.from('booking').update({ follow_up_sent: true }).eq('booking_id', bookingId)
    }

    showToast(newStatus === 'completed' ? 'Jobb markerat som klart!' : 'Status uppdaterad!', 'success')
    setShowCompleteModal(false)
    fetchBooking()
    setUpdating(false)
  }

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'scheduled': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'in_progress': return 'bg-amber-500/20 text-amber-400 border-amber-500/30'
      case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
      case 'cancelled': return 'bg-red-500/20 text-red-400 border-red-500/30'
      default: return 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30'
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'scheduled': return 'Schemalagt'
      case 'in_progress': return 'Pågående'
      case 'completed': return 'Slutfört'
      case 'cancelled': return 'Avbokat'
      default: return status
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
      </div>
    )
  }

  if (!booking) {
    return (
      <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen flex items-center justify-center">
        <div className="text-zinc-400">Bokningen hittades inte</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-[#09090b] min-h-screen">
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border ${toast.type === 'success' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-red-500/20 border-red-500/30 text-red-400'}`}>
          {toast.message}
        </div>
      )}

      <div className="relative max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/dashboard/bookings" className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Bokningsdetaljer</h1>
            <p className="text-sm text-zinc-400">{formatDateTime(booking.scheduled_start)}</p>
          </div>
          <span className={`px-3 py-1.5 text-sm rounded-full border ${getStatusColor(booking.job_status || 'scheduled')}`}>
            {getStatusLabel(booking.job_status || 'scheduled')}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Bokningsinformation</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-violet-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-zinc-500">Datum & tid</p>
                    <p className="text-white">{formatDateTime(booking.scheduled_start)}</p>
                  </div>
                </div>
                {booking.customer && (
                  <Link href={`/dashboard/customers/${booking.customer.customer_id}`} className="flex items-start gap-3 hover:bg-zinc-800/50 rounded-lg p-2 -m-2 transition-all">
                    <User className="w-5 h-5 text-cyan-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-500">Kund</p>
                      <p className="text-white">{booking.customer.name}</p>
                    </div>
                  </Link>
                )}
                {booking.customer?.phone_number && (
                  <a href={`tel:${booking.customer.phone_number}`} className="flex items-start gap-3">
                    <Phone className="w-5 h-5 text-emerald-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-500">Telefon</p>
                      <p className="text-white">{booking.customer.phone_number}</p>
                    </div>
                  </a>
                )}
                {booking.customer?.address_line && (
                  <div className="flex items-start gap-3">
                    <MapPin className="w-5 h-5 text-amber-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-500">Adress</p>
                      <p className="text-white">{booking.customer.address_line}</p>
                    </div>
                  </div>
                )}
              </div>
              {booking.notes && (
                <div className="mt-4 pt-4 border-t border-zinc-800">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-zinc-400 mt-0.5" />
                    <div>
                      <p className="text-sm text-zinc-500">Beskrivning</p>
                      <p className="text-white">{booking.notes}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Jobbanteckningar</h2>
              <textarea
                value={jobNotes}
                onChange={(e) => setJobNotes(e.target.value)}
                placeholder="Skriv anteckningar om jobbet här..."
                rows={4}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              />
              <button
                onClick={() => updateJobStatus(booking.job_status || 'scheduled')}
                disabled={updating || jobNotes === (booking.job_notes || '')}
                className="mt-3 px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm hover:bg-zinc-700 disabled:opacity-50"
              >
                Spara anteckningar
              </button>
            </div>

            {booking.customer_rating && (
              <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Kundbetyg</h2>
                <div className="flex items-center gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star key={star} className={`w-6 h-6 ${star <= booking.customer_rating! ? 'text-yellow-400 fill-yellow-400' : 'text-zinc-600'}`} />
                  ))}
                  <span className="ml-2 text-white font-medium">{booking.customer_rating}/5</span>
                </div>
                {booking.rating_feedback && <p className="text-zinc-400 text-sm mt-2">&quot;{booking.rating_feedback}&quot;</p>}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Uppdatera status</h2>
              <div className="space-y-3">
                {booking.job_status !== 'in_progress' && booking.job_status !== 'completed' && (
                  <button onClick={() => updateJobStatus('in_progress')} disabled={updating} className="w-full flex items-center justify-center gap-2 p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400 hover:bg-amber-500/30 transition-all">
                    <Play className="w-4 h-4" /> Starta jobb
                  </button>
                )}
                {booking.job_status !== 'completed' && (
                  <button onClick={() => setShowCompleteModal(true)} disabled={updating} className="w-full flex items-center justify-center gap-2 p-3 bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-emerald-400 hover:bg-emerald-500/30 transition-all">
                    <CheckCircle className="w-4 h-4" /> Markera som klart
                  </button>
                )}
                {booking.job_status === 'completed' && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-center">
                    <CheckCircle className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                    <p className="text-emerald-400 font-medium">Jobb slutfört!</p>
                    {booking.completed_at && <p className="text-xs text-zinc-500 mt-1">{formatDateTime(booking.completed_at)}</p>}
                  </div>
                )}
                {booking.job_status !== 'cancelled' && booking.job_status !== 'completed' && (
                  <button onClick={() => updateJobStatus('cancelled')} disabled={updating} className="w-full flex items-center justify-center gap-2 p-3 bg-zinc-800 border border-zinc-700 rounded-xl text-zinc-400 hover:text-red-400 hover:border-red-500/30 transition-all">
                    <XCircle className="w-4 h-4" /> Avboka
                  </button>
                )}
              </div>
            </div>

            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-xl border border-zinc-800 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-4">Snabbåtgärder</h2>
              <div className="space-y-2">
                {booking.customer?.phone_number && (
                  <a href={`tel:${booking.customer.phone_number}`} className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 transition-all">
                    <Phone className="w-4 h-4 text-emerald-400" />
                    <span className="text-white text-sm">Ring kund</span>
                  </a>
                )}
                {booking.customer && (
                  <Link href={`/dashboard/customers/${booking.customer.customer_id}`} className="w-full flex items-center gap-3 p-3 bg-zinc-800/50 rounded-xl hover:bg-zinc-800 transition-all">
                    <User className="w-4 h-4 text-cyan-400" />
                    <span className="text-white text-sm">Visa kundprofil</span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCompleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-md p-6">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Markera jobb som klart?</h2>
              <p className="text-zinc-400 text-sm mt-2">Vill du skicka ett uppföljnings-SMS till kunden för att be om betyg?</p>
            </div>
            <div className="space-y-3">
              <button onClick={() => updateJobStatus('completed', true)} disabled={updating} className="w-full flex items-center justify-center gap-2 p-4 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50">
                {updating ? <Loader2 className="w-5 h-5 animate-spin" /> : <><Send className="w-5 h-5" /> Ja, skicka SMS</>}
              </button>
              <button onClick={() => updateJobStatus('completed', false)} disabled={updating} className="w-full p-4 bg-zinc-800 border border-zinc-700 rounded-xl text-white hover:bg-zinc-700 disabled:opacity-50">
                Nej, bara markera klart
              </button>
              <button onClick={() => setShowCompleteModal(false)} disabled={updating} className="w-full p-3 text-zinc-500 hover:text-white">
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
