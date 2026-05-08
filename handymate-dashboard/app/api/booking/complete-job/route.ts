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
      .select('booking_id, project_id, scheduled_start')
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
