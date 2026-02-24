'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  Play,
  Square,
  Coffee,
  MapPin,
  Clock,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'

interface ActiveEntry {
  time_entry_id: string
  check_in_time: string
  check_in_address?: string | null
  break_minutes?: number
  work_category?: string
  customer?: { customer_id: string; name: string } | null
}

interface TimerWidgetProps {
  onCheckInOut?: () => void
}

const WORK_CATEGORIES = [
  { value: 'work', label: 'Arbete', icon: '🔨' },
  { value: 'travel', label: 'Restid', icon: '🚗' },
  { value: 'material_pickup', label: 'Material', icon: '📦' },
  { value: 'meeting', label: 'Möte', icon: '👥' },
  { value: 'admin', label: 'Admin', icon: '📋' },
]

export default function TimerWidget({ onCheckInOut }: TimerWidgetProps) {
  const business = useBusiness()
  const { user: currentUser } = useCurrentUser()

  const [active, setActive] = useState<ActiveEntry | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [breakMinutes, setBreakMinutes] = useState(0)
  const [workCategory, setWorkCategory] = useState('work')
  const [geoPermission, setGeoPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt')

  // Check for active timer on mount
  useEffect(() => {
    if (business.business_id && currentUser?.id) {
      fetchActive()
    }
  }, [business.business_id, currentUser?.id])

  // Tick
  useEffect(() => {
    if (!active) return
    const checkIn = new Date(active.check_in_time).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - checkIn) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [active])

  // Check geo permission
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setGeoPermission(result.state as any)
        result.onchange = () => setGeoPermission(result.state as any)
      }).catch(() => {})
    }
  }, [])

  async function fetchActive() {
    try {
      const res = await fetch(`/api/time-entry/check-in?businessUserId=${currentUser?.id}`)
      if (res.ok) {
        const data = await res.json()
        setActive(data.active)
        if (data.active) {
          setBreakMinutes(data.active.break_minutes || 0)
          setWorkCategory(data.active.work_category || 'work')
        }
      }
    } catch { /* ignore */ }
    setLoading(false)
  }

  const getGeo = useCallback((): Promise<{ lat: number; lng: number } | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return Promise.resolve(null)
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, enableHighAccuracy: true }
      )
    })
  }, [])

  const handleCheckIn = async () => {
    setActionLoading(true)
    try {
      const geo = await getGeo()
      const res = await fetch('/api/time-entry/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: geo?.lat,
          lng: geo?.lng,
          work_category: workCategory,
          business_user_id: currentUser?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActive(data.entry)
      setBreakMinutes(0)
      setExpanded(false)
      onCheckInOut?.()
    } catch (err: any) {
      alert(err.message || 'Kunde inte stämpla in')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCheckOut = async () => {
    if (!active) return
    setActionLoading(true)
    try {
      const geo = await getGeo()
      const res = await fetch('/api/time-entry/check-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time_entry_id: active.time_entry_id,
          lat: geo?.lat,
          lng: geo?.lng,
          break_minutes: breakMinutes,
          work_category: workCategory,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActive(null)
      setElapsed(0)
      setExpanded(false)
      onCheckInOut?.()
    } catch (err: any) {
      alert(err.message || 'Kunde inte stämpla ut')
    } finally {
      setActionLoading(false)
    }
  }

  const handleBreakChange = async (mins: number) => {
    setBreakMinutes(mins)
    if (!active) return
    try {
      await fetch('/api/time-entry/break', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          time_entry_id: active.time_entry_id,
          break_minutes: mins,
        }),
      })
    } catch { /* fire and forget */ }
  }

  const fmtTimer = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const netSeconds = Math.max(0, elapsed - breakMinutes * 60)

  if (loading) return null

  // ===== FLOATING TIMER (active) =====
  if (active) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-80 z-40">
        <div className="bg-white border border-emerald-200 rounded-2xl shadow-2xl shadow-emerald-500/10 overflow-hidden">
          {/* Main bar — always visible, large touch targets */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between p-4 active:bg-emerald-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full animate-pulse" />
              </div>
              <div className="text-left">
                <p className="text-2xl font-mono font-bold text-gray-900 tabular-nums">
                  {fmtTimer(netSeconds)}
                </p>
                <p className="text-xs text-gray-500">
                  {WORK_CATEGORIES.find(c => c.value === workCategory)?.icon}{' '}
                  {active.customer?.name || 'Aktiv timer'}
                  {breakMinutes > 0 && ` · ${breakMinutes}m rast`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {expanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronUp className="w-4 h-4 text-gray-400" />}
            </div>
          </button>

          {/* Expanded options */}
          {expanded && (
            <div className="border-t border-gray-100 p-4 space-y-3">
              {/* GPS badge */}
              {active.check_in_address && (
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="truncate">{active.check_in_address}</span>
                </div>
              )}

              {/* Arbetstyp */}
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Arbetstyp</p>
                <div className="flex gap-1.5">
                  {WORK_CATEGORIES.map(cat => (
                    <button
                      key={cat.value}
                      onClick={() => setWorkCategory(cat.value)}
                      className={`flex-1 py-2 text-xs rounded-lg border text-center transition-colors ${
                        workCategory === cat.value
                          ? 'bg-blue-50 border-blue-300 text-blue-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}
                    >
                      <span className="text-base">{cat.icon}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Rast snabbval */}
              <div>
                <p className="text-xs text-gray-500 mb-1.5">Rast</p>
                <div className="flex gap-1.5">
                  {[0, 15, 30, 45, 60].map(mins => (
                    <button
                      key={mins}
                      onClick={() => handleBreakChange(mins)}
                      className={`flex-1 py-2.5 text-sm rounded-lg border font-medium transition-colors ${
                        breakMinutes === mins
                          ? 'bg-amber-50 border-amber-300 text-amber-700'
                          : 'bg-gray-50 border-gray-200 text-gray-600'
                      }`}
                    >
                      {mins === 0 ? '–' : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Stämpla ut — stor knapp, alltid synlig */}
          <div className="p-3 pt-0">
            <button
              onClick={handleCheckOut}
              disabled={actionLoading}
              className="w-full py-4 bg-red-500 hover:bg-red-600 active:bg-red-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
            >
              {actionLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Square className="w-5 h-5" />
              )}
              Stämpla ut
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== CHECK-IN BUTTON (idle) =====
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:w-80 z-40">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden">
        {expanded && (
          <div className="p-4 space-y-3 border-b border-gray-100">
            {/* Arbetstyp */}
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Arbetstyp</p>
              <div className="flex gap-1.5">
                {WORK_CATEGORIES.map(cat => (
                  <button
                    key={cat.value}
                    onClick={() => setWorkCategory(cat.value)}
                    className={`flex-1 py-2 text-xs rounded-lg border text-center transition-colors ${
                      workCategory === cat.value
                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                        : 'bg-gray-50 border-gray-200 text-gray-600'
                    }`}
                  >
                    <span className="text-base">{cat.icon}</span>
                    <span className="block mt-0.5">{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* GPS status */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <MapPin className={`w-3.5 h-3.5 ${geoPermission === 'granted' ? 'text-emerald-500' : 'text-gray-400'}`} />
              {geoPermission === 'granted' ? 'GPS aktiv' : geoPermission === 'denied' ? 'GPS nekad' : 'GPS tillgänglig'}
            </div>
          </div>
        )}

        <div className="p-3 flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-3 bg-gray-100 rounded-xl text-gray-500 hover:text-gray-900 active:bg-gray-200"
          >
            {expanded ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
          <button
            onClick={handleCheckIn}
            disabled={actionLoading}
            className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white rounded-xl font-semibold text-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {actionLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Play className="w-5 h-5" />
            )}
            Stämpla in
          </button>
        </div>
      </div>
    </div>
  )
}
