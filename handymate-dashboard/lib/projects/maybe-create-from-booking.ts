/**
 * Auto-skapa projekt från en bokning — för OFFERT-LÖSA jobb.
 *
 * Pilotfeedback: när hantverkaren bokar in ett jobb utan att skicka offert
 * skapas inget projekt (projekt skapas annars vid offert-accept eller manuell
 * flytt till "Aktivt jobb"). Bokningen = åtagandet → skapa projektet då.
 *
 * GUARD mot projekt-spam (båda måste gälla):
 *   1. Kunden har INGET aktivt projekt (annars hör bokningen till det).
 *   2. Kunden har INGEN öppen offert (draft/sent) — finns en offert sköter
 *      accept-flödet projektet, vi vill inte föregå det.
 *
 * Återbruk: hittas en lead för kunden används createProjectFromLead (budget
 * från ev. offert, milstolpar, notiser, dedup). Saknas lead skapas ett
 * minimalt projekt direkt från kunden.
 *
 * Icke-blockerande: anroparen (bokningsrouten) kör detta i try/catch så ett
 * fel aldrig stoppar själva bokningen.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { suggestChecklistForProject } from '@/lib/egenkontroll/suggest-checklist'
import { SYSTEM_STAGES } from '@/lib/project-stages/automation-engine'

interface MaybeCreateResult {
  created: boolean
  project_id?: string
  reason?: 'project_exists' | 'open_quote' | 'created_from_lead' | 'created_minimal' | string
}

export async function maybeCreateProjectFromBooking(
  supabase: SupabaseClient,
  businessId: string,
  opts: { customerId: string; bookingId: string; serviceType?: string | null; scheduledStart?: string | null },
): Promise<MaybeCreateResult> {
  const { customerId, bookingId, serviceType, scheduledStart } = opts
  // Bokningens dag ÄR en känd start (Del A, 2026-08-26) — det enda
  // skapandeflöde som faktiskt vet ett datum. Aldrig gissat: saknas
  // scheduledStart förblir start_date null.
  const startDate = scheduledStart && /^\d{4}-\d{2}-\d{2}/.test(scheduledStart) ? scheduledStart.slice(0, 10) : null

  // Guard 1 — finns redan ett aktivt projekt för kunden? Då hör bokningen dit.
  const { data: existingProject } = await supabase
    .from('project')
    .select('project_id')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (existingProject) {
    return { created: false, reason: 'project_exists' }
  }

  // Guard 2 — öppen offert (draft/sent)? Låt accept-flödet skapa projektet.
  const { data: openQuote } = await supabase
    .from('quotes')
    .select('quote_id')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .in('status', ['draft', 'sent'])
    .limit(1)
    .maybeSingle()
  if (openQuote) {
    return { created: false, reason: 'open_quote' }
  }

  // Hitta kundens senaste lead → återbruka full createProjectFromLead.
  const { data: lead } = await supabase
    .from('leads')
    .select('lead_id')
    .eq('business_id', businessId)
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let projectId: string | undefined
  let reason: MaybeCreateResult['reason']

  if (lead?.lead_id) {
    const { createProjectFromLead } = await import('./create-from-lead')
    const r = await createProjectFromLead(businessId, lead.lead_id)
    if (!r.success || !r.project_id) {
      return { created: false, reason: r.error || 'create_from_lead_failed' }
    }
    projectId = r.project_id
    reason = 'created_from_lead'
  } else {
    // Ingen lead (t.ex. manuellt upplagd kund) → minimalt projekt från kunden.
    // customer.address finns inte längre (uppdelad i address_line/postal_code/
    // city, jfr REALITY-WEEK #9) — och project har ingen address-kolumn alls.
    // Båda fantomerna gjorde att bokning→projekt ALDRIG lyckades i prod
    // (live-verifierat 2026-08-26).
    const { data: cust } = await supabase
      .from('customer')
      .select('name, address_line')
      .eq('customer_id', customerId)
      .maybeSingle()

    const projectName = serviceType || (cust?.name ? `Jobb – ${cust.name}` : 'Nytt projekt')
    // Stegkedjan startar VID FÖDSELN (OperatingExperiment-fångstskydd,
    // 2026-08-19 — samma princip som create-from-quote.ts). Inline i
    // insert:en, INTE via advanceProjectStage: den här grenen är just
    // "offert-lös" (se filhuvudet) — inget kontrakt är signerat, bara en
    // bokning gjord — så ps-01:s default-automation (SMS "Vi har mottagit
    // er signerade offert...") skulle vara felaktig att trigga här.
    const nuIso = new Date().toISOString()
    const { data: project, error } = await supabase
      .from('project')
      .insert({
        business_id: businessId,
        name: projectName,
        customer_id: customerId,
        project_type: 'hourly',
        status: 'active',
        start_date: startDate,
        current_workflow_stage_id: SYSTEM_STAGES.CONTRACT_SIGNED,
        workflow_stage_entered_at: nuIso,
        workflow_stage_history: [
          { stage_id: SYSTEM_STAGES.CONTRACT_SIGNED, entered_at: nuIso, previous_stage_id: null },
        ],
        source_lead_data: {
          created_from: 'booking',
          booking_id: bookingId,
          customer_address: cust?.address_line || null,
          created_at: new Date().toISOString(),
        },
      })
      .select('project_id')
      .single()

    if (error || !project) {
      return { created: false, reason: error?.message || 'insert_failed' }
    }
    projectId = project.project_id
    reason = 'created_minimal'

    // Fire project_created (fire-and-forget) så automationer hänger med.
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'project_created', businessId, {
        project_id: projectId,
        source: 'booking',
      })
    } catch {
      /* non-blocking */
    }

    // Egenkontroll-agenten (etapp 1d, tasks/easoft-gap-plan.md). Bara
    // denna gren — lead-grenen ovan går via createProjectFromLead som
    // redan hänger på hooken själv. Fire-and-forget, fail-safe.
    suggestChecklistForProject({ businessId, projectId: project.project_id }).catch(err => {
      console.error('[maybe-create-from-booking] suggestChecklistForProject error (non-blocking):', err)
    })
  }

  // Länka bokningen till projektet (booking.project_id finns sedan v51).
  if (projectId) {
    await supabase.from('booking').update({ project_id: projectId }).eq('booking_id', bookingId)
  }

  return { created: true, project_id: projectId, reason }
}
