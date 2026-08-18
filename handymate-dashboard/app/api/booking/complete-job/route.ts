import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { computeBookingDayProgress, fetchProjectBookings } from '@/lib/bookings/day-progress'
import { completeProject, type CompleteProjectResult } from '@/lib/projects/complete-project'

// completeProject → autoInvoiceOnComplete kan nu (Etapp Q, TD-86) skicka
// fakturan på riktigt inline (sendInvoice, Chromium-PDF via
// buildInvoicePdfBuffer) på sista dagens booking — samma anledning som
// invoices/send/route.ts behöver 30s.
export const runtime = 'nodejs'
export const maxDuration = 30

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

    const { data: existing, error: existingError } = await supabase
      .from('booking')
      .select('booking_id, project_id, agreement_id, scheduled_start')
      .eq('booking_id', booking_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (existingError) {
      console.error('[booking/complete-job] booking lookup error:', existingError)
      return NextResponse.json({ error: existingError.message }, { status: 500 })
    }
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

    // ── Final-day-detection — sista bokningen använder exakt samma
    // projektkommando som desktop och fyra-ögon-godkännandet.
    let closeoutResult: CompleteProjectResult | null = null
    let closeoutMessage: string | null = null
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
        closeoutResult = await completeProject({
          supabase,
          businessId: business.business_id,
          projectId: existing.project_id,
          authorization: { kind: 'direct' },
        })
        invoiceCreated = closeoutResult.invoice_created ?? null

        if (closeoutResult.requires_approval) {
          closeoutMessage = 'Sista bokningen är klar. Projektstängningen väntar på admin-godkännande.'
        } else if (!closeoutResult.ok) {
          closeoutMessage = closeoutResult.error
            || 'Bokningen är klar, men projektet kunde inte stängas. Försök igen från projektet.'
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
      project_completed: closeoutResult?.completed ?? false,
      invoice_created: !!invoiceCreated,
    })
    return NextResponse.json({
      success: true,
      booking: updated,
      booking_completed: true,
      project_completed: closeoutResult?.completed ?? false,
      requires_approval: closeoutResult?.requires_approval ?? false,
      invoice_created: invoiceCreated,
      closeout: closeoutResult,
      message: closeoutMessage,
    })
  } catch (error: any) {
    console.error('[booking/complete-job] exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
