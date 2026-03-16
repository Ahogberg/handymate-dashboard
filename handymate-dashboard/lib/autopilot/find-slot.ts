import { getServerSupabase } from '@/lib/supabase'

interface SlotResult {
  start: string
  end: string
}

/**
 * Hitta nästa lediga bokningsslot för ett företag.
 * Itererar vardagar framåt, kollar booking + schedule_entry för konflikter.
 */
export async function findNextAvailableSlot(
  businessId: string,
  bufferDays: number,
  durationHours: number
): Promise<SlotResult | null> {
  const supabase = getServerSupabase()

  // Hämta arbetstider
  const { data: config } = await supabase
    .from('business_config')
    .select('working_hours')
    .eq('business_id', businessId)
    .single()

  const workingHours = config?.working_hours as Record<string, { enabled: boolean; start: string; end: string }> | null
  const defaultStart = '08:00'
  const defaultEnd = '17:00'

  // Startpunkt: idag + buffertdagar
  const now = new Date()
  const candidate = new Date(now)
  candidate.setDate(candidate.getDate() + bufferDays)
  candidate.setHours(0, 0, 0, 0)

  // Sök max 14 dagar framåt
  for (let i = 0; i < 14; i++) {
    const dayOfWeek = candidate.getDay()
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
    const dayKey = dayNames[dayOfWeek]

    // Kolla om dagen är en arbetsdag
    const dayConfig = workingHours?.[dayKey]
    const isWorkDay = dayConfig ? dayConfig.enabled : (dayOfWeek >= 1 && dayOfWeek <= 5)

    if (!isWorkDay) {
      candidate.setDate(candidate.getDate() + 1)
      continue
    }

    const workStart = dayConfig?.start || defaultStart
    const workEnd = dayConfig?.end || defaultEnd

    const [startH, startM] = workStart.split(':').map(Number)
    const [endH, endM] = workEnd.split(':').map(Number)

    // Sätt kandidatens start till arbetsstart
    const slotStart = new Date(candidate)
    slotStart.setHours(startH, startM, 0, 0)

    const slotEnd = new Date(slotStart)
    slotEnd.setHours(slotStart.getHours() + durationHours)

    // Kontrollera att sloten inte överskrider arbetstid
    const dayEnd = new Date(candidate)
    dayEnd.setHours(endH, endM, 0, 0)

    if (slotEnd > dayEnd) {
      candidate.setDate(candidate.getDate() + 1)
      continue
    }

    // Kolla befintliga bokningar
    const dayStart = new Date(candidate)
    dayStart.setHours(0, 0, 0, 0)
    const dayEndFull = new Date(candidate)
    dayEndFull.setHours(23, 59, 59, 999)

    const { data: bookings } = await supabase
      .from('booking')
      .select('scheduled_start, scheduled_end')
      .eq('business_id', businessId)
      .gte('scheduled_start', dayStart.toISOString())
      .lte('scheduled_start', dayEndFull.toISOString())

    const { data: scheduleEntries } = await supabase
      .from('schedule_entry')
      .select('start_datetime, end_datetime')
      .eq('business_id', businessId)
      .gte('start_datetime', dayStart.toISOString())
      .lte('start_datetime', dayEndFull.toISOString())

    // Samla alla upptagna perioder
    const busyPeriods: { start: Date; end: Date }[] = []

    for (const b of bookings || []) {
      if (b.scheduled_start && b.scheduled_end) {
        busyPeriods.push({
          start: new Date(b.scheduled_start),
          end: new Date(b.scheduled_end),
        })
      }
    }

    for (const s of scheduleEntries || []) {
      if (s.start_datetime && s.end_datetime) {
        busyPeriods.push({
          start: new Date(s.start_datetime),
          end: new Date(s.end_datetime),
        })
      }
    }

    // Kolla om föreslagen slot krockar
    const hasConflict = busyPeriods.some(period =>
      slotStart < period.end && slotEnd > period.start
    )

    if (!hasConflict) {
      return {
        start: slotStart.toISOString(),
        end: slotEnd.toISOString(),
      }
    }

    candidate.setDate(candidate.getDate() + 1)
  }

  return null
}
