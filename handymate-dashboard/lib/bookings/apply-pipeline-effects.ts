import type { SupabaseClient } from '@supabase/supabase-js'
import { markCustomerContacted } from '@/lib/pipeline/contacted'

/**
 * Pipeline-sidoeffekterna en bokning ska ge, oavsett vilken väg som skapade
 * den — dashboardens POST /api/bookings, agentens create_booking-verktyg
 * (Matte/Lisa), eller ett godkänt godkännandekort (samma POST /api/bookings
 * under huven). Extraherad hit 2026-09-02: en granskning av
 * godkännandegrinden för create_booking visade att agentverktygets
 * direktinsert-väg redan gjorde Google-kalendersynk + dispatch-förslag men
 * ALDRIG "Kontaktad"-markeringen eller projekt-kopplingen som
 * dashboard-vägen alltid gjort — två kodvägar som skulle göra samma sak hade
 * redan glidit isär en gång. Nu finns bara EN väg att glida ur.
 *
 * Icke-blockerande: ett fel i en sidoeffekt stoppar aldrig bokningen själv,
 * precis som innan extraheringen (varje anrop var redan sitt eget try/catch).
 */
export async function applyBookingPipelineEffects(
  supabase: SupabaseClient,
  businessId: string,
  params: {
    bookingId: string
    customerId: string | null
    serviceType: string | null
    scheduledStart: string | null
  }
): Promise<{ projectId: string | null }> {
  const { bookingId, customerId, serviceType, scheduledStart } = params
  if (!customerId) return { projectId: null }

  // Kontaktad (2026-08-28): ett bokat besök är en kontakt — kundens öppna
  // affärer flyttas till Kontaktad (framåt-only, aldrig tillbaka).
  try {
    await markCustomerContacted(supabase, businessId, customerId, 'besök bokat')
  } catch (err) {
    console.error('[applyBookingPipelineEffects] markCustomerContacted failed (non-blocking):', err)
  }

  // Project workflow stage: 'Startmöte bokat' — genom händelsebryggan,
  // kundens EXAKT ett aktiva projekt (aldrig "senaste"). Forward-only.
  try {
    const { bumpProjectStage } = await import('@/lib/project-stages/event-bridge')
    const flytt = await bumpProjectStage(
      businessId,
      { projectId: null, customerId },
      'booking_created',
      { startDateHint: scheduledStart || null },
    )
    if (!flytt.moved && !flytt.skipped) {
      console.error('[applyBookingPipelineEffects] stegflytten misslyckades (non-blocking):', flytt.error, { projectId: flytt.projectId })
    }
  } catch (err) {
    console.error('[applyBookingPipelineEffects] bumpProjectStage failed (non-blocking):', err)
  }

  // Auto-skapa projekt för OFFERT-LÖSA jobb: bokningen = åtagandet. Guarden
  // (kund utan aktivt projekt + ingen öppen offert) ligger i helpern, så vi
  // föregår aldrig accept-flödet. Skriver själv tillbaka booking.project_id.
  try {
    const { maybeCreateProjectFromBooking } = await import('@/lib/projects/maybe-create-from-booking')
    const result = await maybeCreateProjectFromBooking(supabase, businessId, {
      customerId,
      bookingId,
      serviceType,
      scheduledStart,
    })
    if (result.created && result.project_id) {
      console.log(`[applyBookingPipelineEffects] Auto-skapade projekt ${result.project_id} från bokning ${bookingId} (${result.reason})`)
      return { projectId: result.project_id }
    }
  } catch (err) {
    console.error('[applyBookingPipelineEffects] maybeCreateProjectFromBooking failed (non-blocking):', err)
  }

  return { projectId: null }
}
