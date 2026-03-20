'use client'

import { useState } from 'react'
import { Car, Send, X, MapPin, Loader2 } from 'lucide-react'

interface OnMyWayProps {
  customerName: string
  customerPhone: string
  customerAddress?: string
  bookingId?: string
  projectId?: string
  businessName?: string
  contactName?: string
  contactPhone?: string
  compact?: boolean
}

export default function OnMyWayButton({
  customerName,
  customerPhone,
  customerAddress,
  bookingId,
  projectId,
  businessName,
  contactName,
  contactPhone,
  compact = false,
}: OnMyWayProps) {
  const [showModal, setShowModal] = useState(false)
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [eta, setEta] = useState('')
  const [message, setMessage] = useState('')
  const [gettingLocation, setGettingLocation] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)

  const firstName = customerName?.split(' ')[0] || 'kund'

  const buildDefaultMessage = (etaTime?: string) => {
    const etaPart = etaTime ? ` Beräknad ankomsttid: ${etaTime}.` : ''
    const phonePart = contactPhone ? ` Vid frågor, ring ${contactPhone}.` : ''
    return `Hej ${firstName}! ${contactName || ''} från ${businessName || 'oss'} är nu på väg till dig.${etaPart}${phonePart} Vi ses snart!`
  }

  const handleOpen = () => {
    setMessage(buildDefaultMessage())
    setSent(false)
    setShowModal(true)

    // Try to get GPS position
    if (navigator.geolocation && customerAddress) {
      setGettingLocation(true)
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
          setGettingLocation(false)
        },
        () => setGettingLocation(false),
        { timeout: 5000, enableHighAccuracy: false }
      )
    }
  }

  const handleSend = async () => {
    setSending(true)
    try {
      const res = await fetch('/api/sms/on-my-way', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_phone: customerPhone,
          customer_name: customerName,
          customer_address: customerAddress,
          lat: location?.lat,
          lng: location?.lng,
          message,
          booking_id: bookingId,
          project_id: projectId,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setSent(true)
        if (data.eta) setEta(data.eta)
        setTimeout(() => setShowModal(false), 2000)
      } else {
        alert(data.error || 'Kunde inte skicka SMS')
      }
    } catch {
      alert('Något gick fel')
    }
    setSending(false)
  }

  return (
    <>
      <button
        onClick={handleOpen}
        disabled={sent}
        className={compact
          ? 'flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-medium hover:bg-teal-700 transition-colors disabled:opacity-50'
          : 'flex items-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors shadow-sm disabled:opacity-50'
        }
      >
        <Car className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        {sent ? 'Skickat!' : 'Jag är på väg'}
      </button>

      {/* Bekräftelsedialog */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <Car className="w-5 h-5 text-teal-600" />
                <h3 className="font-semibold text-gray-900">På väg till {firstName}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Adress */}
              {customerAddress && (
                <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-xl">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm text-gray-700">{customerAddress}</p>
                    {gettingLocation && (
                      <p className="text-xs text-teal-600 mt-1 flex items-center gap-1">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Hämtar din position för ETA...
                      </p>
                    )}
                    {location && !gettingLocation && (
                      <p className="text-xs text-teal-600 mt-1">GPS-position hämtad</p>
                    )}
                  </div>
                </div>
              )}

              {/* SMS-text (redigerbar) */}
              <div>
                <label className="text-xs text-gray-500 font-medium mb-1 block">SMS till {customerName}</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  maxLength={320}
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-none"
                />
                <p className="text-xs text-gray-400 mt-1 text-right">{message.length}/320</p>
              </div>

              {eta && (
                <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-center">
                  <p className="text-sm text-teal-700 font-medium">Beräknad ankomst: {eta}</p>
                </div>
              )}

              {sent ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                  <p className="text-sm text-emerald-700 font-semibold">SMS skickat till {customerName}!</p>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                  >
                    Avbryt
                  </button>
                  <button
                    onClick={handleSend}
                    disabled={sending || !message.trim()}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50"
                  >
                    {sending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    Skicka
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
