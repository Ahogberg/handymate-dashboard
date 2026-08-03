import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { computeBookingDayProgress, fetchProjectBookings } from '@/lib/bookings/day-progress'

/**
 * POST /api/booking/complete-job
 *
 * Markerar en booking som `completed`. Används från mobile när
 * hantverkaren trycker "Markera som klart"-knappen i Verksamhet-vyn.
 *
 * Body: { booking_id: string }
 *
 * Response 200:
 *   {
 *     success: true,
 *     booking: <updated row>,
 *     project_completed?: boolean,    // true om sista bokningen → projektet stängdes
 *     invoice_created?: { invoice_id, invoice_number?, total?, status? } | null
 *   }
 *
 * Response 400/401/404/500: standard error.
 *
 * Setter både job_status='completed' och completed_at=NOW(). Om bookingen
 * är sista i projektets sekvens (is_final_day === true) sätts även
 * project.status='completed' + project.completed_at och autoInvoiceOnComplete
 * körs för att skapa en draft-faktura.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { booking_id } = body
    if (!booking_id) {
      return NextResponse.json({ error: 'booking_id krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data: existing } = await supabase
      .from('booking')
      .select('booking_id, project_id, agreement_id, scheduled_start')
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json({ error: 'Bokning hittades inte' }, { status: 404 })
    }

    const now = new Date().toISOString()
    const { data: updated, error } = await supabase
      .from('booking')
      .update({
        job_status: 'completed',
        completed_at: now,
        updated_at: now,
      })
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .select('*')
      .single()

    if (error) {
      console.error('[booking/complete-job] update error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // ── Final-day-detection — om denna booking är sista i projektets
    // sekvens, slutför projektet + skapa faktura. Non-blocking varje steg
    // så booking-completion lyckas även om sidoeffekter failar.
    let projectCompleted = false
    let invoiceCreated: {
      invoice_id?: string
      invoice_number?: string
      total?: number
      status?: 'draft' | 'sent'
    } | null = null

    if (existing.project_id) {
      const projectBookings = await fetchProjectBookings(supabase, business.business_id, [
        existing.project_id,
      ])
      const bookingsForThisProject = projectBookings.get(existing.project_id) || []
      const dayProgress = computeBookingDayProgress(existing.booking_id, bookingsForThisProject)

      if (dayProgress.is_final_day) {
        console.log('[booking/complete-job] final day — completing project:', {
          booking_id,
          project_id: existing.project_id,
          day: `${dayProgress.current_day}/${dayProgress.total_days}`,
        })

        // 1. Markera projektet som slutfört
        try {
          await supabase
            .from('project')
            .update({
              status: 'completed',
              completed_at: now,
              updated_at: now,
            })
            .eq('project_id', existing.project_id)
            .eq('business_id', business.business_id)
          projectCompleted = true
        } catch (projErr) {
          console.error('[booking/complete-job] project completion failed:', projErr)
        }

        // 2. Trigga auto-faktura (samma helper som PUT /api/projects status='completed')
        try {
          const { autoInvoiceOnComplete } = await import('@/lib/projects/auto-invoice-on-complete')
          const result = await autoInvoiceOnComplete(business.business_id, existing.project_id)
          if (result.success && result.invoice_id) {
            invoiceCreated = {
              invoice_id: result.invoice_id,
              invoice_number: result.invoice_number,
              total: result.total,
              status: result.status,
            }
            console.log('[booking/complete-job] invoice created:', invoiceCreated)
          } else if (!result.success) {
            console.warn('[booking/complete-job] auto-invoice skipped:', result.error)
          }
        } catch (invErr) {
          console.error('[booking/complete-job] auto-invoice failed:', invErr)
        }

        // 2.5. Motor 1: frys utfall-vs-offert (efterkalkyl). Fail-safe —
        // kastar aldrig, får inte fälla booking-completion. Körs bara här
        // eftersom projektet faktiskt precis stängdes (is_final_day).
        let outcomeForTrigger: {
          job_type: string | null
          hours_diff_pct: number | null
          amount_diff_pct: number | null
          margin_pct: number | null
        } | null = null
        try {
          const { freezeProjectOutcome } = await import('@/lib/efterkalkyl/freeze-outcome')
          await freezeProjectOutcome(supabase, business.business_id, existing.project_id)

          const { getProjectOutcome } = await import('@/lib/efterkalkyl/get-project-outcome')
          const outcome = await getProjectOutcome(supabase, business.business_id, existing.project_id)
          outcomeForTrigger = {
            job_type: outcome.job_type,
            hours_diff_pct: outcome.hours_diff_pct,
            amount_diff_pct: outcome.amount_diff_pct,
            margin_pct: outcome.margin_pct,
          }
        } catch (outcomeErr) {
          console.error('[booking/complete-job] freezeProjectOutcome failed:', outcomeErr)
        }

        // 2.6. Våg 2d (tasks/value-chain-plan.md) — väck Lars (job_completed-
        // trigger, matchAgentByPrefix routar 'job_*' till honom). Fire-and-
        // forget, fail-safe, får aldrig fälla booking-completion.
        try {
          const { triggerAgentFireAndForget, makeIdempotencyKey } = await import('@/lib/agent-trigger')
          triggerAgentFireAndForget(
            business.business_id,
            'job_completed',
            {
              project_id: existing.project_id,
              job_type: outcomeForTrigger?.job_type ?? null,
              hours_diff_pct: outcomeForTrigger?.hours_diff_pct ?? null,
              amount_diff_pct: outcomeForTrigger?.amount_diff_pct ?? null,
              margin_pct: outcomeForTrigger?.margin_pct ?? null,
              instruction: `Projektet (project_id: ${existing.project_id}) avslutades just. Bedöm om det gick enligt plan utifrån avvikelsen i tid/belopp mot offert och föreslå åtgärd om något sticker ut — annars räcker en kort notering. Använd get_project_outcome om du behöver fler detaljer.`,
            },
            makeIdempotencyKey('job_completed', business.business_id, existing.project_id)
          )
        } catch (triggerErr) {
          console.error('[booking/complete-job] job_completed agent trigger failed:', triggerErr)
        }

        // 3. Avancera workflow-stage till slutbesiktning (ps-05). Mobile
        // visar progress-bar baserat på detta. Non-blocking.
        try {
          const { advanceProjectStage, SYSTEM_STAGES } = await import(
            '@/lib/project-stages/automation-engine'
          )
          await advanceProjectStage(
            existing.project_id,
            SYSTEM_STAGES.FINAL_INSPECTION,
            business.business_id,
          )
        } catch (stageErr) {
          console.error('[booking/complete-job] stage advance failed:', stageErr)
        }
      }
    }

    // ── Motor 2: serviceavtal — parallellt med projekt-grenen ovan (en
    // booking har antingen project_id eller agreement_id, aldrig båda i
    // praktiken, men grenarna är oberoende så det spelar ingen roll).
    // Karin bygger en utkastfaktura från avtalets frusna price_items +
    // ett review_auto_invoice-kort. Non-blocking — booking-completion ska
    // alltid lyckas även om detta steg failar (t.ex. v74 ej körd).
    if (existing.agreement_id) {
      try {
        const { invoiceAgreementVisit } = await import('@/lib/agreements/invoice-visit')
        const result = await invoiceAgreementVisit(supabase, business.business_id, existing.booking_id)
        if (result.success && result.invoice_id) {
          invoiceCreated = {
            invoice_id: result.invoice_id,
            invoice_number: result.invoice_number,
            total: result.total,
            status: 'draft',
          }
          console.log('[booking/complete-job] agreement invoice created:', invoiceCreated)
        } else if (!result.success) {
          console.warn('[booking/complete-job] agreement invoice skipped:', result.error)
        }
      } catch (invErr) {
        console.error('[booking/complete-job] agreement invoice failed:', invErr)
      }
    }

    console.log('[booking/complete-job] ok:', {
      booking_id,
      project_completed: projectCompleted,
      invoice_created: !!invoiceCreated,
    })
    return NextResponse.json({
      success: true,
      booking: updated,
      project_completed: projectCompleted,
      invoice_created: invoiceCreated,
    })
  } catch (error: any) {
    console.error('[booking/complete-job] exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
