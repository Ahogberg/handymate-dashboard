import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { computeAvailableSlots, stockholmLocalToISO } from '@/lib/bookings/availability'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/availability/[slug]?date=YYYY-MM-DD&duration=60
 * Publik (ingen auth) — lediga tider för ett företag via storefront-slug.
 * Tillgänglighet = arbetstider (business_config.working_hours) minus befintliga
 * bokningar. (Google Calendar freebusy = senare förbättring.)
 */
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || new Date().toISOString().slice(0, 10)
  const duration = Math.min(Math.max(Number(searchParams.get('duration')) || 60, 15), 480)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Ogiltigt datum' }, { status: 400 })
  }

  // Slug → publicerat storefront → business_id
  const { data: storefront } = await supabase
    .from('storefront')
    .select('business_id, is_published')
    .eq('slug', params.slug)
    .maybeSingle()
  if (!storefront || !storefront.is_published) {
    return NextResponse.json({ error: 'Hittades inte' }, { status: 404 })
  }

  const { data: config } = await supabase
    .from('business_config')
    .select('working_hours')
    .eq('business_id', storefront.business_id)
    .single()

  // Befintliga bokningar den dagen (ej avbokade)
  const dayStart = stockholmLocalToISO(date, '00:00')
  const dayEnd = stockholmLocalToISO(date, '23:59')
  const { data: bookings } = await supabase
    .from('booking')
    .select('scheduled_start, scheduled_end, status')
    .eq('business_id', storefront.business_id)
    .gte('scheduled_start', dayStart)
    .lte('scheduled_start', dayEnd)
    .neq('status', 'cancelled')

  const slots = computeAvailableSlots({
    hours: config?.working_hours as any,
    dateStr: date,
    durationMin: duration,
    bookings: (bookings || []).map((b: any) => ({ scheduled_start: b.scheduled_start, scheduled_end: b.scheduled_end })),
  })

  return NextResponse.json({ date, duration, slots })
}
