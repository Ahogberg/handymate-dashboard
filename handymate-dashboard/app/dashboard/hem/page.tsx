'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useBusiness } from '@/lib/BusinessContext'
import { svDateStr } from '@/lib/dates'
import JarvisHome from '@/components/jarvis/JarvisHome'

/**
 * /dashboard/hem — Jarvis-first-hemskärmen (2026-08-07).
 *
 * ═══ VARFÖR EN EGEN ROUTE ═══
 *
 * Dagens Idag-vy (`/dashboard`) står i prod hos betalande kunder. Den byggs
 * INTE om på plats: den nya vyn lever bredvid tills Christoffer sagt att den
 * är bättre, och routebytet blir en egen commit. Så länge är en halvfärdig
 * hemskärm aldrig det första någon möts av.
 *
 * Sidan hämtar bara det som JarvisHome inte kan hämta själv — bokningar,
 * pipeline och ekonomi ligger i Supabase respektive två rutter som redan
 * finns. Kön, observationerna, aktivitetsloggen och bevisbandet hämtar
 * JarvisHome själv.
 *
 * Layout, sidomeny och providers ärvs från app/dashboard/layout.tsx.
 */

interface BookingRow {
  booking_id: string
  scheduled_start: string
  notes: string
  customer?: { name: string } | null
}

export default function JarvisHemPage() {
  const business = useBusiness()

  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [bookingsLoaded, setBookingsLoaded] = useState(false)
  const [pipelineStats, setPipelineStats] = useState<{ totalDeals: number; totalValue: number; newLeadsToday: number } | null>(null)
  const [economics, setEconomics] = useState<{ unpaidCount: number; unpaidAmount: number } | null>(null)
  const [greetingName, setGreetingName] = useState('')

  useEffect(() => {
    if (!business?.business_id) return
    let active = true

    // Dagens datum i SVENSK lokaltid — toISOString().split('T')[0] ger
    // UTC-dagen, som är gårdagen mellan 22/23-midnatt svensk tid.
    const todayStr = svDateStr(new Date())

    void supabase
      .from('booking')
      .select('booking_id, scheduled_start, scheduled_end, status, notes, customer (name)')
      .eq('business_id', business.business_id)
      .gte('scheduled_start', todayStr)
      .lt('scheduled_start', `${todayStr}T23:59:59`)
      .order('scheduled_start', { ascending: true })
      .then(({ data }: { data: any }) => {
        if (!active) return
        setBookings(data || [])
        setBookingsLoaded(true)
      })

    fetch('/api/pipeline/stats')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!active || !d) return
        setPipelineStats({
          totalDeals: d.totalDeals ?? d.total_deals ?? 0,
          totalValue: d.totalValue ?? d.total_value ?? 0,
          newLeadsToday: d.newLeadsToday ?? d.new_leads_today ?? 0,
        })
      })
      .catch(() => { if (active) setPipelineStats({ totalDeals: 0, totalValue: 0, newLeadsToday: 0 }) })

    void (async () => {
      const { data } = await supabase
        .from('invoice')
        .select('total')
        .eq('business_id', business.business_id)
        .in('status', ['sent', 'overdue'])
      if (!active) return
      const rader = data || []
      setEconomics({
        unpaidCount: rader.length,
        unpaidAmount: rader.reduce((s: number, i: any) => s + (i.total || 0), 0),
      })
    })()

    fetch('/api/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (active && d?.user?.name) setGreetingName(String(d.user.name).split(' ')[0]) })
      .catch(() => { /* hälsningen klarar sig utan namn */ })

    return () => { active = false }
  }, [business?.business_id])

  if (!business?.business_id) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      <JarvisHome
        greetingName={greetingName}
        bookings={bookings}
        bookingsLoaded={bookingsLoaded}
        pipelineStats={pipelineStats}
        economics={economics}
      />
    </div>
  )
}
