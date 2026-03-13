'use client'

import { useEffect, useState, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import { useBusiness } from '@/lib/BusinessContext'
import { useCurrentUser } from '@/lib/CurrentUserContext'
import { useJobbuddy } from '@/lib/JobbuddyContext'

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

export default function TimerWidget({ onCheckInOut }: TimerWidgetProps) {
  const business = useBusiness()
  const { user: currentUser } = useCurrentUser()
  const { setActiveTimer } = useJobbuddy()

  const [active, setActive] = useState<ActiveEntry | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    if (business.business_id && currentUser?.id) {
      fetchActive()
    }
  }, [business.business_id, currentUser?.id])

  useEffect(() => {
    if (active) {
      setActiveTimer({
        time_entry_id: active.time_entry_id,
        check_in_time: active.check_in_time,
        check_in_address: active.check_in_address,
        break_minutes: active.break_minutes,
        work_category: active.work_category,
        customer: active.customer,
      })
    } else {
      setActiveTimer(null)
    }
  }, [active, setActiveTimer])

  useEffect(() => {
    if (!active) return
    const checkIn = new Date(active.check_in_time).getTime()
    const tick = () => setElapsed(Math.floor((Date.now() - checkIn) / 1000))
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [active])

  async function fetchActive() {
    try {
      const res = await fetch(`/api/time-entry/check-in?businessUserId=${currentUser?.id}`)
      if (res.ok) {
        const data = await res.json()
        setActive(data.active)
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
          work_category: 'work',
          business_user_id: currentUser?.id,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActive(data.entry)
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
          break_minutes: active.break_minutes || 0,
          work_category: active.work_category || 'work',
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setActive(null)
      setElapsed(0)
      onCheckInOut?.()
    } catch (err: any) {
      alert(err.message || 'Kunde inte stämpla ut')
    } finally {
      setActionLoading(false)
    }
  }

  const fmtTimer = (s: number) => {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  }

  const netSeconds = Math.max(0, elapsed - (active?.break_minutes || 0) * 60)

  if (loading) return null

  // Horizontal inline card — NOT floating
  return (
    <div className="flex items-center justify-between px-[18px] py-[14px] bg-white border-thin border-[#E2E8F0] rounded-[10px] mb-5">
      <div>
        <div className="text-[10px] tracking-[0.1em] uppercase text-[#CBD5E1] mb-[3px]">Stämpelklocka</div>
        <div className="text-[16px] font-medium text-[#1E293B]">
          {active ? fmtTimer(netSeconds) : 'Inte instämplad'}
        </div>
      </div>
      <button
        onClick={active ? handleCheckOut : handleCheckIn}
        disabled={actionLoading}
        className={`px-5 py-2 border-none rounded-lg text-[13px] font-medium cursor-pointer disabled:opacity-50 ${
          active
            ? 'bg-red-500 text-white hover:bg-red-600'
            : 'bg-[#0F766E] text-white hover:bg-[#0F766E]/90'
        }`}
      >
        {actionLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : active ? (
          'Stämpla ut'
        ) : (
          'Stämpla in'
        )}
      </button>
    </div>
  )
}
