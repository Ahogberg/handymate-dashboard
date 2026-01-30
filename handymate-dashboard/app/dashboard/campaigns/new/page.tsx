'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { 
  ArrowLeft, 
  Users, 
  MessageSquare, 
  Send,
  Loader2,
  Search,
  Check,
  Clock,
  Filter,
  Sparkles
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import Link from 'next/link'

interface Customer {
  customer_id: string
  name: string
  phone_number: string
  created_at: string
  last_booking_at?: string
}

interface Booking {
  customer_id: string
  scheduled_start: string
}

type FilterType = 'all' | 'inactive_30' | 'inactive_90' | 'manual'

export default function NewCampaignPage() {
  const router = useRouter()
  const business = useBusiness()
  
  const [step, setStep] = useState(1)
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  
  // Form state
  const [campaignName, setCampaignName] = useState('')
  const [message, setMessage] = useState('')
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [campaignType, setCampaignType] = useState<'broadcast' | 'interactive'>('interactive')
  const [autoReply, setAutoReply] = useState(true)

  useEffect(() => {
    fetchCustomers()
  }, [business.business_id])

  async function fetchCustomers() {
    // Hämta kunder med senaste bokning
    const { data: customersData } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number, created_at')
      .eq('business_id', business.business_id)
      .not('phone_number', 'is', null)
      .order('created_at', { ascending: false })

    // Hämta senaste bokning per kund
    const { data: bookingsData } = await supabase
      .from('booking')
      .select('customer_id, scheduled_start')
      .eq('business_id', business.business_id)
      .order('scheduled_start', { ascending: false })

    // Mappa senaste bokning till kunder
    const lastBookingMap = new Map<string, string>()
    if (bookingsData) {
      bookingsData.forEach((b: Booking) => {
        if (!lastBookingMap.has(b.customer_id)) {
          lastBookingMap.set(b.customer_id, b.scheduled_start)
        }
      })
    }

    const customersWithBookings: Customer[] = customersData?.map((c: Customer) => ({
      ...c,
      last_booking_at: lastBookingMap.get(c.customer_id)
    })) || []

    setCustomers(customersWithBookings)
    setLoading(false)
  }

  // Filtrera kunder baserat på vald filter
  const getFilteredCustomers = (): Customer[] => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)

    let filtered = customers

    // Sök
    if (searchTerm) {
      filtered = filtered.filter((c: Customer) => 
        c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone_number?.includes(searchTerm)
      )
    }

    // Filter
    switch (filterType) {
      case 'inactive_30':
        filtered = filtered.filter((c: Customer) => {
          if (!c.last_booking_at) return true
          return new Date(c.last_booking_at) < thirtyDaysAgo
        })
        break
      case 'inactive_90':
        filtered = filtered.filter((c: Customer) => {
          if (!c.last_booking_at) return true
          return new Date(c.last_booking_at) < ninetyDaysAgo
        })
        break
      case 'manual':
        filtered = filtered.filter((c: Customer) => selectedCustomers.has(c.customer_id))
        break
    }

    return filtered
  }

  const filteredCustomers = getFilteredCustomers()
  const recipientCount = filterType === 'manual' ? selectedCustomers.size : filteredCustomers.length

  const toggleCustomer = (customerId: string) => {
    const newSelected = new Set(selectedCustomers)
    if (newSelected.has(customerId)) {
      newSelected.delete(customerId)
    } else {
      newSelected.add(customerId)
    }
    setSelectedCustomers(newSelected)
  }

  const selectAll = () => {
    const allIds = filteredCustomers.map((c: Customer) => c.customer_id)
    setSelectedCustomers(new Set(allIds))
  }

  const deselectAll = () => {
    setSelectedCustomers(new Set())
  }

  const handleSend = async () => {
    if (!campaignName || !message || recipientCount === 0) return

    setSending(true)

    try {
      // Hämta mottagare
      const recipients = filterType === 'manual' 
        ? customers.filter((c: Customer) => selectedCustomers.has(c.customer_id))
        : filteredCustomers

      // Skapa kampanj
      const campaignId = 'camp_' + Math.random().toString(36).substr(2, 12)
      
      const { error: campaignError } = await supabase
        .from('sms_campaign')
        .insert({
          campaign_id: campaignId,
          business_id: business.business_id,
          name: campaignName,
          message: message,
          status: 'sending',
          recipient_filter: { type: filterType },
          recipient_count: recipients.length,
        })

      if (campaignError) throw campaignError

      // Skapa mottagare
      const recipientRows = recipients.map((c: Customer) => ({
        campaign_id: campaignId,
        customer_id: c.customer_id,
        phone_number: c.phone_number,
        status: 'pending'
      }))

      await supabase
        .from('sms_campaign_recipient')
        .insert(recipientRows)

      // Skicka SMS via API
      const response = await fetch('/api/campaigns/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId })
      })

      if (!response.ok) {
        throw new Error('Kunde inte skicka kampanj')
      }

      router.push('/dashboard/campaigns')

    } catch (error) {
      console.error('Error sending campaign:', error)
      alert('Något gick fel. Försök igen.')
    } finally {
      setSending(false)
    }
  }

  const getDaysInactive = (lastBooking: string | undefined): string => {
    if (!lastBooking) return 'Aldrig bokat'
    const days = Math.floor((Date.now() - new Date(lastBooking).getTime()) / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Idag'
    if (days === 1) return 'Igår'
    return `${days} dagar sedan`
  }

  // Beräkna inaktiva kunder för filter-knapparna
  const getInactiveCount = (days: number): number => {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return customers.filter((c: Customer) => !c.last_booking_at || new Date(c.last_booking_at) < cutoff).length
  }

  // Förslag på meddelanden
const messageSuggestions = [
  {
    title: 'Återaktivering',
    text: `Hej! Det var ett tag sedan – har du något hemma som behöver fixas? Vi har lediga tider! Svara så hjälper vi dig. //${business.business_name}`
  },
  {
    title: 'Säsongserbjudande',
    text: `Hej! Nu är perfekt tid för [TJÄNST]. Vi har bra tider i [MÅNAD]. Svara JA för kostnadsfri offert! //${business.business_name}`
  },
  {
    title: 'Rabatt',
    text: `Hej! Som tidigare kund får du 10% rabatt på ditt nästa jobb. Gäller tom månadsskiftet. Svara för att boka! //${business.business_name}`
  },
  {
    title: 'Ledig tid',
    text: `Hej! Vi har fått en ledig tid [DAG]. Passar det dig? Svara JA så bokar vi in dig! //${business.business_name}`
  }
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
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 right-1/4 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[128px]"></div>
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-fuchsia-500/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="relative max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/dashboard/campaigns"
            className="p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-lg transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">Ny kampanj</h1>
            <p className="text-zinc-400 text-sm">Skicka SMS till dina kunder</p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-4 mb-8">
          {[
            { num: 1, label: 'Mottagare' },
            { num: 2, label: 'Meddelande' },
            { num: 3, label: 'Skicka' }
          ].map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s.num 
                  ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white' 
                  : 'bg-zinc-800 text-zinc-500'
              }`}>
                {step > s.num ? <Check className="w-4 h-4" /> : s.num}
              </div>
              <span className={`ml-2 text-sm ${step >= s.num ? 'text-white' : 'text-zinc-500'}`}>
                {s.label}
              </span>
              {i < 2 && <div className="w-12 h-px bg-zinc-800 mx-4"></div>}
            </div>
          ))}
        </div>

        {/* Step 1: Välj mottagare */}
        {step === 1 && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Välj mottagare</h2>
              
              {/* Filter options */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                {[
                  { id: 'all', label: 'Alla kunder', icon: Users, count: customers.length },
                  { id: 'inactive_30', label: 'Inaktiva 30+ dagar', icon: Clock, count: getInactiveCount(30) },
                  { id: 'inactive_90', label: 'Inaktiva 90+ dagar', icon: Clock, count: getInactiveCount(90) },
                  { id: 'manual', label: 'Välj manuellt', icon: Filter, count: selectedCustomers.size }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterType(f.id as FilterType)}
                    className={`p-4 rounded-xl border text-left transition-all ${
                      filterType === f.id 
                        ? 'bg-violet-500/10 border-violet-500/30' 
                        : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                    }`}
                  >
                    <f.icon className={`w-5 h-5 mb-2 ${filterType === f.id ? 'text-violet-400' : 'text-zinc-500'}`} />
                    <p className={`text-sm font-medium ${filterType === f.id ? 'text-white' : 'text-zinc-300'}`}>
                      {f.label}
                    </p>
                    <p className="text-xs text-zinc-500 mt-1">{f.count} kunder</p>
                  </button>
                ))}
              </div>

              {/* Manual selection */}
              {filterType === 'manual' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                      <input
                        type="text"
                        placeholder="Sök kund..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
                      />
                    </div>
                    <button onClick={selectAll} className="text-sm text-violet-400 hover:text-violet-300">
                      Välj alla
                    </button>
                    <button onClick={deselectAll} className="text-sm text-zinc-500 hover:text-zinc-300">
                      Avmarkera
                    </button>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {customers.filter((c: Customer) => 
                      !searchTerm || 
                      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                      c.phone_number?.includes(searchTerm)
                    ).map((customer: Customer) => (
                      <label
                        key={customer.customer_id}
                        className={`flex items-center p-3 rounded-xl cursor-pointer transition-all ${
                          selectedCustomers.has(customer.customer_id)
                            ? 'bg-violet-500/10 border border-violet-500/30'
                            : 'bg-zinc-800/50 border border-transparent hover:bg-zinc-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedCustomers.has(customer.customer_id)}
                          onChange={() => toggleCustomer(customer.customer_id)}
                          className="w-4 h-4 rounded border-zinc-600 bg-zinc-700 text-violet-500 focus:ring-violet-500/50 mr-3"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{customer.name || 'Okänd'}</p>
                          <p className="text-xs text-zinc-500">{customer.phone_number}</p>
                        </div>
                        <span className="text-xs text-zinc-600">
                          {getDaysInactive(customer.last_booking_at)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/20">
                    <Users className="w-5 h-5 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-white font-medium">{recipientCount} mottagare</p>
                    <p className="text-sm text-zinc-500">kommer få ditt meddelande</p>
                  </div>
                </div>
                <button
                  onClick={() => setStep(2)}
                  disabled={recipientCount === 0}
                  className="px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Fortsätt
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Skriv meddelande */}
        {step === 2 && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Kampanjnamn</h2>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="T.ex. Vårens reaktivering"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
              />
            </div>

            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Meddelande</h2>
              
              {/* Förslag */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <Sparkles className="w-4 h-4 text-violet-400" />
                <span className="text-sm text-zinc-400">Förslag:</span>
                {messageSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setMessage(s.text)}
                    className="px-3 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-300"
                  >
                    {s.title}
                  </button>
                ))}
              </div>

              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Skriv ditt meddelande här..."
                rows={5}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
              />
              
              <div className="flex items-center justify-between mt-3">
                <p className="text-sm text-zinc-500">
                  {message.length} tecken
                  {message.length > 160 && <span className="text-amber-400"> (kommer delas upp i {Math.ceil(message.length / 153)} SMS)</span>}
                </p>
                <p className="text-sm text-zinc-500">
                  Kostnad: ~{Math.ceil(message.length / 160) * recipientCount} SMS
                </p>
              </div>
            </div>

            {/* Preview */}
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Förhandsgranskning</h2>
              <div className="bg-zinc-950 rounded-2xl p-4 max-w-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-violet-500 to-fuchsia-500 rounded-full flex items-center justify-center">
                    <MessageSquare className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-white">{business.business_name}</span>
                </div>
                <div className="bg-zinc-800 rounded-2xl rounded-tl-none p-3">
                  <p className="text-sm text-zinc-200 whitespace-pre-wrap">
                    {message || 'Ditt meddelande visas här...'}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(1)}
                className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
              >
                ← Tillbaka
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!campaignName || !message}
                className="px-6 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Fortsätt
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Bekräfta och skicka */}
        {step === 3 && (
          <div className="space-y-6">
            <div className="bg-zinc-900/50 backdrop-blur-xl rounded-2xl border border-zinc-800 p-6">
              <h2 className="text-lg font-semibold text-white mb-6">Bekräfta och skicka</h2>
              
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                  <span className="text-zinc-400">Kampanjnamn</span>
                  <span className="text-white font-medium">{campaignName}</span>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                  <span className="text-zinc-400">Mottagare</span>
                  <span className="text-white font-medium">{recipientCount} kunder</span>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                  <span className="text-zinc-400">SMS per person</span>
                  <span className="text-white font-medium">{Math.ceil(message.length / 160)} st</span>
                </div>
                
                <div className="flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl">
                  <span className="text-zinc-400">Totalt SMS</span>
                  <span className="text-white font-medium">{Math.ceil(message.length / 160) * recipientCount} st</span>
                </div>
              </div>

              <div className="mt-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                <p className="text-sm text-amber-400">
                  ⚠️ När du skickar kommer {recipientCount} SMS att skickas direkt. Detta kan inte ångras.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep(2)}
                className="px-6 py-3 text-zinc-400 hover:text-white transition-colors"
              >
                ← Tillbaka
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex items-center px-8 py-3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-xl font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {sending ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Skickar...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    Skicka nu
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
