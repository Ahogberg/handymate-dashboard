'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  Calendar,
  MessageSquare,
  FileText,
  Clock,
  CheckCircle,
  Star,
  Plus,
  Edit,
  Trash2,
  Play,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Loader2,
  Send,
  Globe,
  Copy,
  RefreshCw,
  ExternalLink
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  email: string
  address_line: string
  created_at: string
}

interface Activity {
  activity_id: string
  activity_type: string
  title: string
  description: string
  recording_url?: string
  transcript?: string
  duration_seconds?: number
  metadata: any
  created_at: string
  created_by: string
}

interface Booking {
  booking_id: string
  scheduled_start: string
  scheduled_end: string
  status: string
  job_status: string
  notes: string
  job_notes: string
  customer_rating?: number
  completed_at?: string
}

export default function CustomerDetailPage() {
  const params = useParams()
  const router = useRouter()
  const business = useBusiness()
  const customerId = params.id as string

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timeline' | 'bookings'>('timeline')
  
  // Modals
  const [showLogCallModal, setShowLogCallModal] = useState(false)
  const [showAddNoteModal, setShowAddNoteModal] = useState(false)
  const [showSendSMSModal, setShowSendSMSModal] = useState(false)

  // Portal
  const [portalToken, setPortalToken] = useState<string | null>(null)
  const [portalEnabled, setPortalEnabled] = useState(false)
  const [portalLastVisited, setPortalLastVisited] = useState<string | null>(null)
  const [generatingPortal, setGeneratingPortal] = useState(false)
  const [portalCopied, setPortalCopied] = useState(false)

  useEffect(() => {
    fetchData()
  }, [customerId])

  async function fetchData() {
    // Hämta kund
    const { data: customerData } = await supabase
      .from('customer')
      .select('*')
      .eq('customer_id', customerId)
      .single()

    // Hämta aktiviteter
    const { data: activityData } = await supabase
      .from('customer_activity')
      .select('*')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(50)

    // Hämta bokningar
    const { data: bookingData } = await supabase
      .from('booking')
      .select('*')
      .eq('customer_id', customerId)
      .order('scheduled_start', { ascending: false })

    setCustomer(customerData)
    setActivities(activityData || [])
    setBookings(bookingData || [])

    // Load portal fields
    if (customerData) {
      setPortalToken(customerData.portal_token || null)
      setPortalEnabled(customerData.portal_enabled ?? false)
      setPortalLastVisited(customerData.portal_last_visited_at || null)
    }

    setLoading(false)
  }

  async function generatePortalLink() {
    setGeneratingPortal(true)
    try {
      const res = await fetch(`/api/customers/${customerId}/portal-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.business_id })
      })
      if (res.ok) {
        const data = await res.json()
        setPortalToken(data.token)
        setPortalEnabled(true)
      }
    } catch (err) {
      console.error('Failed to generate portal link:', err)
    }
    setGeneratingPortal(false)
  }

  async function copyPortalLink() {
    if (!portalToken) return
    const url = `${window.location.origin}/portal/${portalToken}`
    await navigator.clipboard.writeText(url)
    setPortalCopied(true)
    setTimeout(() => setPortalCopied(false), 2000)
  }

  async function disablePortal() {
    try {
      await fetch(`/api/customers/${customerId}/portal-link`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: business.business_id })
      })
      setPortalToken(null)
      setPortalEnabled(false)
    } catch (err) {
      console.error('Failed to disable portal:', err)
    }
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'call_inbound': return <PhoneIncoming className="w-4 h-4 text-emerald-600" />
      case 'call_outbound': return <PhoneOutgoing className="w-4 h-4 text-blue-400" />
      case 'call_logged': return <PhoneCall className="w-4 h-4 text-blue-600" />
      case 'sms_sent': return <Send className="w-4 h-4 text-cyan-600" />
      case 'sms_received': return <MessageSquare className="w-4 h-4 text-cyan-400" />
      case 'booking_created': return <Calendar className="w-4 h-4 text-amber-400" />
      case 'job_completed': return <CheckCircle className="w-4 h-4 text-emerald-600" />
      case 'note_added': return <FileText className="w-4 h-4 text-gray-500" />
      case 'rating_received': return <Star className="w-4 h-4 text-yellow-400" />
      default: return <Clock className="w-4 h-4 text-gray-500" />
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getJobStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <span className="px-2 py-1 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">Schemalagt</span>
      case 'in_progress':
        return <span className="px-2 py-1 text-xs rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">Pågående</span>
      case 'completed':
        return <span className="px-2 py-1 text-xs rounded-full bg-emerald-100 text-emerald-600 border border-emerald-500/30">Slutfört</span>
      case 'cancelled':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600 border border-red-500/30">Avbokat</span>
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-500 border border-gray-300">{status}</span>
    }
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="p-4 sm:p-8 bg-slate-50 min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Kunden hittades inte</div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-8 bg-slate-50 min-h-screen">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-blue-50 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-50 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/dashboard/customers"
            className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex-1">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{customer.name}</h1>
            <p className="text-sm text-gray-500">Kund sedan {new Date(customer.created_at).toLocaleDateString('sv-SE')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vänster kolumn - Kundinfo + Snabbåtgärder */}
          <div className="space-y-6">
            {/* Kundinfo */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Kontaktinfo</h2>
              
              <div className="space-y-3">
                {customer.phone_number && (
                  <a href={`tel:${customer.phone_number}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                    <Phone className="w-4 h-4 text-emerald-600" />
                    <span className="text-gray-900 text-sm">{customer.phone_number}</span>
                  </a>
                )}
                
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all">
                    <Mail className="w-4 h-4 text-blue-400" />
                    <span className="text-gray-900 text-sm truncate">{customer.email}</span>
                  </a>
                )}
                
                {customer.address_line && (
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <MapPin className="w-4 h-4 text-amber-400" />
                    <span className="text-gray-900 text-sm">{customer.address_line}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Snabbåtgärder */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Åtgärder</h2>
              
              <div className="space-y-2">
                <button
                  onClick={() => setShowLogCallModal(true)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <PhoneCall className="w-4 h-4 text-blue-600" />
                  <span className="text-gray-900 text-sm">Logga samtal</span>
                </button>
                
                <button
                  onClick={() => setShowSendSMSModal(true)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <MessageSquare className="w-4 h-4 text-cyan-600" />
                  <span className="text-gray-900 text-sm">Skicka SMS</span>
                </button>
                
                <button
                  onClick={() => setShowAddNoteModal(true)}
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <span className="text-gray-900 text-sm">Lägg till anteckning</span>
                </button>
                
                <Link
                  href="/dashboard/bookings"
                  className="w-full flex items-center gap-3 p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-left"
                >
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span className="text-gray-900 text-sm">Skapa bokning</span>
                </Link>
              </div>
            </div>

            {/* Kundportal */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Kundportal</h2>

              {portalToken && portalEnabled ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm text-emerald-600 font-medium">Aktiv</span>
                  </div>

                  <div className="p-3 bg-gray-50 rounded-xl">
                    <p className="text-xs text-gray-400 mb-1">Portallänk</p>
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-gray-700 truncate flex-1">
                        {window.location.origin}/portal/{portalToken.substring(0, 8)}...
                      </p>
                      <button
                        onClick={copyPortalLink}
                        className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-all"
                        title="Kopiera länk"
                      >
                        {portalCopied ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                      <a
                        href={`/portal/${portalToken}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg transition-all"
                        title="Öppna portal"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>

                  {portalLastVisited && (
                    <p className="text-xs text-gray-400">
                      Senast besökt: {new Date(portalLastVisited).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={generatePortalLink}
                      disabled={generatingPortal}
                      className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-gray-50 rounded-xl hover:bg-gray-100 transition-all text-sm text-gray-700"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${generatingPortal ? 'animate-spin' : ''}`} />
                      Ny länk
                    </button>
                    <button
                      onClick={disablePortal}
                      className="flex-1 flex items-center justify-center gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-xl hover:bg-red-100 transition-all text-sm text-red-600"
                    >
                      Inaktivera
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-gray-300" />
                    <span className="text-sm text-gray-400">Inaktiv</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Ge kunden tillgång till projekt, offerter, fakturor och meddelanden via en personlig portallänk.
                  </p>
                  <button
                    onClick={generatePortalLink}
                    disabled={generatingPortal}
                    className="w-full flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {generatingPortal ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Globe className="w-4 h-4" />
                    )}
                    {generatingPortal ? 'Genererar...' : 'Aktivera kundportal'}
                  </button>
                </div>
              )}
            </div>

            {/* Statistik */}
            <div className="bg-white shadow-sm rounded-xl border border-gray-200 p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">Statistik</h2>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{bookings.length}</p>
                  <p className="text-xs text-gray-400">Bokningar</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{bookings.filter(b => b.job_status === 'completed').length}</p>
                  <p className="text-xs text-gray-400">Slutförda jobb</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{activities.filter(a => a.activity_type.includes('call')).length}</p>
                  <p className="text-xs text-gray-400">Samtal</p>
                </div>
                <div className="p-3 bg-gray-50 rounded-xl text-center">
                  <p className="text-xl font-bold text-gray-900">{activities.filter(a => a.activity_type.includes('sms')).length}</p>
                  <p className="text-xs text-gray-400">SMS</p>
                </div>
              </div>
            </div>
          </div>

          {/* Höger kolumn - Tidslinje/Bokningar */}
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setActiveTab('timeline')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'timeline'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:text-white'
                }`}
              >
                Tidslinje
              </button>
              <button
                onClick={() => setActiveTab('bookings')}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  activeTab === 'bookings'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-500 text-white'
                    : 'bg-gray-100 text-gray-500 hover:text-white'
                }`}
              >
                Bokningar ({bookings.length})
              </button>
            </div>

            {/* Timeline */}
            {activeTab === 'timeline' && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                {activities.length === 0 ? (
                  <div className="p-8 text-center">
                    <Clock className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">Ingen aktivitet ännu</p>
                    <p className="text-xs text-gray-400 mt-1">Logga ett samtal eller skicka ett SMS för att komma igång</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {activities.map((activity) => (
                      <div key={activity.activity_id} className="p-4 hover:bg-gray-100/30 transition-all">
                        <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                            {getActivityIcon(activity.activity_type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-medium text-gray-900 text-sm">{activity.title}</p>
                              <span className="text-xs text-gray-400 whitespace-nowrap">
                                {formatDate(activity.created_at)}
                              </span>
                            </div>
                            {activity.description && (
                              <p className="text-sm text-gray-500 mt-1">{activity.description}</p>
                            )}
                            {activity.duration_seconds && (
                              <p className="text-xs text-gray-400 mt-1">
                                Längd: {formatDuration(activity.duration_seconds)}
                              </p>
                            )}
                            {activity.transcript && (
                              <details className="mt-2">
                                <summary className="text-xs text-blue-600 cursor-pointer hover:text-blue-500">
                                  Visa transkription
                                </summary>
                                <p className="mt-2 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 whitespace-pre-wrap">
                                  {activity.transcript}
                                </p>
                              </details>
                            )}
                            {activity.recording_url && (
                              <button className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-500">
                                <Play className="w-3 h-3" />
                                Spela upp inspelning
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Bookings */}
            {activeTab === 'bookings' && (
              <div className="bg-white shadow-sm rounded-xl border border-gray-200">
                {bookings.length === 0 ? (
                  <div className="p-8 text-center">
                    <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-400">Inga bokningar</p>
                    <Link href="/dashboard/bookings" className="text-sm text-blue-600 hover:text-blue-500 mt-2 inline-block">
                      Skapa första bokningen →
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {bookings.map((booking) => (
                      <div key={booking.booking_id} className="p-4 hover:bg-gray-100/30 transition-all">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-gray-900 text-sm">
                                {new Date(booking.scheduled_start).toLocaleDateString('sv-SE', {
                                  weekday: 'short',
                                  day: 'numeric',
                                  month: 'short'
                                })}
                              </p>
                              <span className="text-gray-400 text-sm">
                                kl {new Date(booking.scheduled_start).toLocaleTimeString('sv-SE', {
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                            {booking.notes && (
                              <p className="text-sm text-gray-500">{booking.notes}</p>
                            )}
                            {booking.job_notes && (
                              <p className="text-xs text-gray-400 mt-1">📝 {booking.job_notes}</p>
                            )}
                            {booking.customer_rating && (
                              <div className="flex items-center gap-1 mt-1">
                                {[1, 2, 3, 4, 5].map((star) => (
                                  <Star
                                    key={star}
                                    className={`w-3 h-3 ${star <= booking.customer_rating! ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`}
                                  />
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            {getJobStatusBadge(booking.job_status || 'scheduled')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log Call Modal */}
      {showLogCallModal && (
        <LogCallModal
          customerId={customerId}
          businessId={business.business_id}
          onClose={() => setShowLogCallModal(false)}
          onSaved={() => {
            setShowLogCallModal(false)
            fetchData()
          }}
        />
      )}

      {/* Add Note Modal */}
      {showAddNoteModal && (
        <AddNoteModal
          customerId={customerId}
          businessId={business.business_id}
          onClose={() => setShowAddNoteModal(false)}
          onSaved={() => {
            setShowAddNoteModal(false)
            fetchData()
          }}
        />
      )}

      {/* Send SMS Modal */}
      {showSendSMSModal && (
        <SendSMSModal
          customer={customer}
          businessId={business.business_id}
          businessName={business.business_name}
          onClose={() => setShowSendSMSModal(false)}
          onSaved={() => {
            setShowSendSMSModal(false)
            fetchData()
          }}
        />
      )}
    </div>
  )
}

// Log Call Modal Component
function LogCallModal({ customerId, businessId, onClose, onSaved }: {
  customerId: string
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [direction, setDirection] = useState<'inbound' | 'outbound'>('outbound')
  const [duration, setDuration] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    
    const activityId = 'act_' + Math.random().toString(36).substr(2, 9)
    const durationSeconds = duration ? parseInt(duration) * 60 : null

    await supabase.from('customer_activity').insert({
      activity_id: activityId,
      customer_id: customerId,
      business_id: businessId,
      activity_type: direction === 'inbound' ? 'call_inbound' : 'call_outbound',
      title: direction === 'inbound' ? 'Inkommande samtal' : 'Utgående samtal',
      description: notes || null,
      duration_seconds: durationSeconds,
      created_by: 'user'
    })

    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Logga samtal</h2>
        
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500 mb-2 block">Typ</label>
            <div className="flex gap-2">
              <button
                onClick={() => setDirection('outbound')}
                className={`flex-1 p-3 rounded-xl text-sm font-medium transition-all ${
                  direction === 'outbound'
                    ? 'bg-blue-100 border border-blue-300 text-gray-900'
                    : 'bg-gray-100 border border-gray-300 text-gray-500'
                }`}
              >
                <PhoneOutgoing className="w-4 h-4 mx-auto mb-1" />
                Utgående
              </button>
              <button
                onClick={() => setDirection('inbound')}
                className={`flex-1 p-3 rounded-xl text-sm font-medium transition-all ${
                  direction === 'inbound'
                    ? 'bg-blue-100 border border-blue-300 text-gray-900'
                    : 'bg-gray-100 border border-gray-300 text-gray-500'
                }`}
              >
                <PhoneIncoming className="w-4 h-4 mx-auto mb-1" />
                Inkommande
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Längd (minuter)</label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="5"
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>

          <div>
            <label className="text-sm text-gray-500 mb-2 block">Anteckningar</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Vad pratade ni om?"
              className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Add Note Modal Component
function AddNoteModal({ customerId, businessId, onClose, onSaved }: {
  customerId: string
  businessId: string
  onClose: () => void
  onSaved: () => void
}) {
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!note.trim()) return
    setSaving(true)
    
    const activityId = 'act_' + Math.random().toString(36).substr(2, 9)

    await supabase.from('customer_activity').insert({
      activity_id: activityId,
      customer_id: customerId,
      business_id: businessId,
      activity_type: 'note_added',
      title: 'Anteckning',
      description: note,
      created_by: 'user'
    })

    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Lägg till anteckning</h2>
        
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Skriv din anteckning..."
          autoFocus
          className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
        />

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !note.trim()}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Sparar...' : 'Spara'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Send SMS Modal Component
function SendSMSModal({ customer, businessId, businessName, onClose, onSaved }: {
  customer: Customer
  businessId: string
  businessName: string
  onClose: () => void
  onSaved: () => void
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!message.trim() || !customer.phone_number) return
    setSending(true)

    try {
      // Skicka SMS via API
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customer.phone_number,
          message: message,
          businessId: businessId,
          businessName: businessName
        })
      })

      if (response.ok) {
        // Logga aktivitet
        const activityId = 'act_' + Math.random().toString(36).substr(2, 9)
        await supabase.from('customer_activity').insert({
          activity_id: activityId,
          customer_id: customer.customer_id,
          business_id: businessId,
          activity_type: 'sms_sent',
          title: 'SMS skickat',
          description: message,
          created_by: 'user'
        })

        onSaved()
      } else {
        alert('Kunde inte skicka SMS')
        setSending(false)
      }
    } catch {
      alert('Något gick fel')
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl border border-gray-200 w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Skicka SMS</h2>
        
        <p className="text-sm text-gray-500 mb-4">
          Till: {customer.name} ({customer.phone_number})
        </p>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Skriv ditt meddelande..."
          autoFocus
          className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
        />
        
        <p className="text-xs text-gray-400 mt-2">{message.length} tecken</p>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-xl text-gray-900 hover:bg-gray-200"
          >
            Avbryt
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !message.trim()}
            className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-xl text-white font-medium hover:opacity-90 disabled:opacity-50"
          >
            {sending ? 'Skickar...' : 'Skicka'}
          </button>
        </div>
      </div>
    </div>
  )
}
