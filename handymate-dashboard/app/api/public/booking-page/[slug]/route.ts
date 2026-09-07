import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { computeAvailableSlots, stockholmLocalToISO, type WorkingHours } from '@/lib/bookings/availability'
import { loadBranding } from '@/lib/branding/get-branding'
import { formatSwedishPhone } from '@/lib/phone-normalize'
import {
  BOOKING_WINDOW_DAYS,
  VISIT_DURATION_MIN,
  activeWeekdays,
  addDays,
  hoursSummary,
  todayInStockholm,
  weekdayOf,
} from '@/lib/bookings/booking-page'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/booking-page/[slug]
 * Publik (ingen auth) — allt bokningssidan behöver i EN hämtning:
 * hantverkarens varumärke + stämpel (lib/branding), arbetstiderna som
 * kolumner och sammanfattning, och lediga 60-minuterstider för de närmaste
 * fjorton dagarna (arbetstid minus bokningar, som /availability men för
 * hela fönstret med en enda bokningsfråga).
 *
 * Kundens egna uppgifter lämnas aldrig ut. Samma slug-grind som book-
 * routen: storefront måste finnas och vara publicerad, annars 404.
 */
export async function GET(_request: NextRequest, { params }: { params: { slug: string } }) {
  const supabase = getServerSupabase()

  const { data: storefront } = await supabase
    .from('storefront')
    .select('business_id, is_published')
    .eq('slug', params.slug)
    .maybeSingle()
  if (!storefront || !storefront.is_published) {
    return NextResponse.json({ error: 'Hittades inte' }, { status: 404 })
  }
  const businessId = storefront.business_id as string

  const today = todayInStockholm()
  const windowEnd = addDays(today, BOOKING_WINDOW_DAYS - 1)

  const [branding, config, visitFree, bookingsRes] = await Promise.all([
    loadBranding(supabase, businessId),
    supabase.from('business_config').select('working_hours').eq('business_id', businessId).maybeSingle(),
    loadVisitFree(supabase, businessId),
    supabase
      .from('booking')
      .select('scheduled_start, scheduled_end')
      .eq('business_id', businessId)
      .gte('scheduled_start', stockholmLocalToISO(today, '00:00'))
      .lte('scheduled_start', stockholmLocalToISO(windowEnd, '23:59'))
      .neq('status', 'cancelled'),
  ])

  const hours = (config.data?.working_hours ?? null) as WorkingHours | null
  const bookings = (bookingsRes.data || []).map((b: { scheduled_start: string; scheduled_end: string | null }) => ({
    scheduled_start: b.scheduled_start,
    scheduled_end: b.scheduled_end,
  }))
  const columns = activeWeekdays(hours)
  const now = Date.now()

  const days: { date: string; slots: ReturnType<typeof computeAvailableSlots> }[] = []
  for (let i = 0; i < BOOKING_WINDOW_DAYS; i++) {
    const date = addDays(today, i)
    if (!columns.includes(weekdayOf(date))) continue
    days.push({
      date,
      slots: computeAvailableSlots({ hours, dateStr: date, durationMin: VISIT_DURATION_MIN, bookings, now }),
    })
  }

  return NextResponse.json({
    business: {
      name: branding.businessName,
      contact_name: branding.contactName ?? null,
      // Kunden ska se "076-686 77 59", inte E.164 — sidan gör tel:-länken själv.
      phone: branding.contactPhone ? formatSwedishPhone(branding.contactPhone) : null,
      email: branding.contactEmail ?? null,
      org_number: branding.orgNumber ?? null,
      f_skatt: branding.fSkattRegistered,
      logo_url: branding.logoUrl ?? null,
      accent_color: branding.accentColor,
    },
    attribution: branding.attribution,
    visit_free: visitFree,
    duration: VISIT_DURATION_MIN,
    today,
    columns,
    hours_summary: hoursSummary(hours),
    days,
  })
}

/**
 * "Besöket kostar inget" sägs bara om firman valt det
 * (business_config.booking_visit_free, sql/v222). Kolumnen kan saknas tills
 * migrationen är körd — PostgREST fäller hela selecten då, så vi läser den
 * separat och tolkar fel/saknad som AV. Ett löfte får aldrig gå ut av misstag.
 */
async function loadVisitFree(supabase: ReturnType<typeof getServerSupabase>, businessId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('business_config')
      .select('booking_visit_free')
      .eq('business_id', businessId)
      .maybeSingle()
    if (error) return false
    return (data as { booking_visit_free?: boolean | null } | null)?.booking_visit_free === true
  } catch {
    return false
  }
}
