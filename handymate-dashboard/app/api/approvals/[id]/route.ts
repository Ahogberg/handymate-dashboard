import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { recordLearningEvent } from '@/lib/agent/learning-engine'

export const dynamic = 'force-dynamic'

/**
 * POST /api/approvals/[id]
 * Body: { action: 'approve' | 'reject' }
 *
 * On approve: execute the payload action (send SMS, quote, etc.)
 * On reject: mark as rejected
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action, edited_payload, reject_reason, action_overrides } = body
    if (!action || !['approve', 'reject', 'edit'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve, reject or edit' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Fetch the approval
    const { data: approval, error: fetchError } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !approval) {
      return NextResponse.json({ error: 'Approval not found' }, { status: 404 })
    }

    if (approval.status !== 'pending') {
      return NextResponse.json({ error: `Approval already ${approval.status}` }, { status: 409 })
    }

    // For edit action: merge edited_payload into original payload
    const finalPayload = action === 'edit'
      ? { ...approval.payload, ...edited_payload }
      : approval.payload

    // Update status
    const newStatus = action === 'reject' ? 'rejected' : 'approved'
    const updateData: Record<string, unknown> = {
      status: newStatus,
      resolved_at: new Date().toISOString(),
      resolved_by: business.business_id,
    }
    if (action === 'edit') {
      updateData.payload = finalPayload
    }

    const { error: updateError } = await supabase
      .from('pending_approvals')
      .update(updateData)
      .eq('id', params.id)

    if (updateError) throw updateError

    // Record learning event (non-blocking)
    try {
      const agentSuggestion = approval.payload as Record<string, unknown>

      if (action === 'approve') {
        await recordLearningEvent(
          business.business_id,
          'approval_accepted',
          params.id,
          'approval',
          agentSuggestion,
          null
        )
      } else if (action === 'edit') {
        await recordLearningEvent(
          business.business_id,
          'approval_edited',
          params.id,
          'approval',
          agentSuggestion,
          edited_payload || {}
        )
      } else if (action === 'reject') {
        await recordLearningEvent(
          business.business_id,
          'approval_rejected',
          params.id,
          'approval',
          agentSuggestion,
          reject_reason ? { reason: reject_reason } : null
        )
      }
    } catch {
      // Non-blocking — learning event failure should not break approval flow
    }

    // If approved or edited, execute the payload action
    let executionResult: Record<string, unknown> | null = null
    if (action === 'approve' || action === 'edit') {
      const approvalWithPayload = { ...approval, payload: finalPayload }
      executionResult = await executeApprovalPayload(
        approvalWithPayload,
        business.business_id,
        action_overrides as Record<string, string> | undefined
      )
    }

    return NextResponse.json({
      success: true,
      action,
      execution: executionResult,
    })
  } catch (error: any) {
    console.error('POST /api/approvals/[id] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Execute the payload action based on approval_type.
 * Returns result info (non-fatal — approval is already marked approved).
 */
async function executeApprovalPayload(
  approval: { approval_type: string; payload: Record<string, unknown>; business_id: string; package_data?: any },
  businessId: string,
  actionOverrides?: Record<string, string>
): Promise<Record<string, unknown>> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const { approval_type, payload } = approval

  try {
    switch (approval_type) {
      case 'quote_nudge':
      case 'send_sms': {
        const res = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            to: payload.to,
            message: payload.message,
          }),
        })
        return { action: 'send_sms', ok: res.ok }
      }

      case 'send_quote': {
        if (!payload.quote_id) return { action: 'send_quote', skipped: 'no quote_id' }
        const res = await fetch(`${appUrl}/api/quotes/${payload.quote_id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        return { action: 'send_quote', ok: res.ok }
      }

      case 'send_invoice': {
        if (!payload.invoice_id) return { action: 'send_invoice', skipped: 'no invoice_id' }
        const res = await fetch(`${appUrl}/api/invoices/${payload.invoice_id}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId }),
        })
        return { action: 'send_invoice', ok: res.ok }
      }

      case 'create_booking': {
        const res = await fetch(`${appUrl}/api/bookings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payload, business_id: businessId }),
        })
        return { action: 'create_booking', ok: res.ok }
      }

      case 'autopilot_package': {
        const packageData = approval.package_data
        if (!packageData?.actions) return { action: 'autopilot_package', skipped: 'no package_data' }

        const results: Record<string, unknown>[] = []
        const supabase = (await import('@/lib/supabase')).getServerSupabase()

        for (const act of packageData.actions as any[]) {
          // Kolla individuella overrides
          const override = actionOverrides?.[act.id]
          if (override === 'rejected') {
            results.push({ id: act.id, type: act.type, skipped: 'rejected' })
            continue
          }

          switch (act.type) {
            case 'project_info':
              results.push({ id: act.id, type: 'project_info', ok: true, info: true })
              break

            case 'booking_suggestion': {
              const bookRes = await fetch(`${appUrl}/api/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  business_id: businessId,
                  customer_id: act.data.customer_id,
                  scheduled_start: act.data.scheduled_start,
                  scheduled_end: act.data.scheduled_end,
                  notes: act.data.notes || '',
                }),
              })
              results.push({ id: act.id, type: 'booking', ok: bookRes.ok })
              break
            }

            case 'customer_sms': {
              const smsRes = await fetch(`${appUrl}/api/sms/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  business_id: businessId,
                  to: act.data.to,
                  message: act.data.message,
                }),
              })
              results.push({ id: act.id, type: 'sms', ok: smsRes.ok })
              break
            }

            case 'material_list': {
              const materials = act.data.materials as any[]
              if (materials?.length > 0 && act.data.project_id) {
                for (const mat of materials) {
                  await supabase.from('project_material').insert({
                    material_id: 'mat_' + Math.random().toString(36).substr(2, 9),
                    project_id: act.data.project_id,
                    business_id: businessId,
                    name: mat.name,
                    quantity: mat.quantity,
                    unit: mat.unit,
                    purchase_price: mat.unit_price || 0,
                  })
                }
              }
              results.push({ id: act.id, type: 'materials', ok: true, count: materials?.length || 0 })
              break
            }

            default:
              results.push({ id: act.id, type: act.type, skipped: 'unknown action type' })
          }
        }

        return { action: 'autopilot_package', results }
      }

      case 'dispatch_suggestion': {
        const supabaseDispatch = (await import('@/lib/supabase')).getServerSupabase()
        const plDispatch = payload as any
        const memberId = plDispatch.member_id
        const memberName = plDispatch.member_name
        const ctxType = plDispatch.context_type
        const ctxId = plDispatch.context_id

        if (ctxType === 'booking' && ctxId) {
          await supabaseDispatch.from('booking').update({
            assigned_to: memberName,
            assigned_user_id: memberId,
          }).eq('booking_id', ctxId)
        } else if (ctxType === 'work_order' && ctxId) {
          await supabaseDispatch.from('work_order').update({
            assigned_to: memberName,
          }).eq('id', ctxId)
        }

        return { action: 'dispatch_suggestion', assigned: memberName, context_type: ctxType }
      }

      case 'time_attestation': {
        const supabaseTime = (await import('@/lib/supabase')).getServerSupabase()
        const plTime = payload as any
        if (!plTime.checkin_id) return { action: 'time_attestation', skipped: 'no checkin_id' }

        // Approve the checkin via the approve API logic
        const minutes = plTime.duration_minutes || 0
        await supabaseTime.from('time_checkins').update({
          status: 'approved',
          approved_by: 'via godkännanden',
          approved_at: new Date().toISOString(),
          duration_minutes: minutes,
        }).eq('id', plTime.checkin_id)

        // Create time_entry
        const entryId = 'te_' + Math.random().toString(36).substr(2, 9)
        await supabaseTime.from('time_entry').insert({
          time_entry_id: entryId,
          business_id: businessId,
          project_id: plTime.project_id || null,
          description: `Incheckning ${plTime.checked_in_at ? new Date(plTime.checked_in_at).toLocaleDateString('sv-SE') : ''}${plTime.project_name ? ' · ' + plTime.project_name : ''}`,
          duration_minutes: minutes,
          work_date: plTime.checked_in_at?.split('T')[0] || new Date().toISOString().split('T')[0],
          is_billable: true,
        })

        return { action: 'time_attestation', time_entry_id: entryId, minutes }
      }

      case 'seasonal_campaign': {
        const supabase = (await import('@/lib/supabase')).getServerSupabase()
        const pl = payload as any
        const smsText = pl.sms_text || ''
        const customers = pl.customers || []

        if (customers.length === 0 || !smsText) {
          return { action: 'seasonal_campaign', skipped: 'no customers or sms text' }
        }

        // Skapa sms_campaign
        const campaignId = 'camp_' + Math.random().toString(36).substr(2, 9)
        await supabase.from('sms_campaign').insert({
          campaign_id: campaignId,
          business_id: businessId,
          name: `Säsong: ${pl.theme || pl.month_name}`,
          message: smsText,
          status: 'scheduled',
          scheduled_at: new Date().toISOString(),
          recipient_count: customers.length,
          campaign_type: 'broadcast',
        })

        // Skapa mottagare
        const recipients = customers.map((c: any) => ({
          campaign_id: campaignId,
          customer_id: c.customer_id,
          phone_number: c.phone_number,
          status: 'pending',
        }))
        await supabase.from('sms_campaign_recipient').insert(recipients)

        // Uppdatera seasonal_campaigns status
        if (pl.month && pl.year) {
          await supabase
            .from('seasonal_campaigns')
            .update({ status: 'approved' })
            .eq('business_id', businessId)
            .eq('year', pl.year)
            .eq('month', pl.month)
        }

        return { action: 'seasonal_campaign', campaign_id: campaignId, recipients: customers.length }
      }

      case 'proactive_care': {
        const pl = payload as any
        if (!pl.customer_phone || !pl.suggested_sms) {
          return { action: 'proactive_care', skipped: 'no phone or message' }
        }
        const smsRes = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            to: pl.customer_phone,
            message: pl.suggested_sms,
          }),
        })

        // Logga i v3_automation_logs
        const supabasePC = (await import('@/lib/supabase')).getServerSupabase()
        await supabasePC.from('v3_automation_logs').insert({
          business_id: businessId,
          rule_name: 'proactive_customer_care',
          trigger_type: 'approval_executed',
          action_type: 'send_sms',
          status: smsRes.ok ? 'success' : 'failed',
          context: {
            customer_id: pl.customer_id,
            customer_name: pl.customer_name,
            project_id: pl.project_id,
            job_type: pl.job_type,
            suggested_service: pl.suggested_service,
          },
        })

        return {
          action: 'proactive_care',
          sms_sent: smsRes.ok,
          customer: pl.customer_name,
          suggested_service: pl.suggested_service,
        }
      }

      case 'warranty_followup': {
        const pl = payload as any
        if (!pl.customer_phone || !pl.suggested_sms) {
          return { action: 'warranty_followup', skipped: 'no phone or message' }
        }
        const smsRes = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            to: pl.customer_phone,
            message: pl.suggested_sms,
          }),
        })

        // Logga i automation_logs
        const supabaseW = (await import('@/lib/supabase')).getServerSupabase()
        await supabaseW.from('automation_logs').insert({
          business_id: businessId,
          rule_name: 'warranty_followup',
          trigger_type: 'approval_executed',
          status: smsRes.ok ? 'completed' : 'failed',
          input: { project_id: pl.project_id, customer_name: pl.customer_name },
          output: { sms_sent: smsRes.ok },
        })

        return { action: 'warranty_followup', sms_sent: smsRes.ok, customer: pl.customer_name }
      }

      case 'job_report': {
        const { approveJobReport } = await import('@/lib/job-report')
        const reportPayload = payload as any
        const result = await approveJobReport(businessId, reportPayload.projectId || '', reportPayload)
        return { action: 'job_report', ...result }
      }

      // ── V33 Matte approval types ──────────────────────────

      case 'propose_booking_times':
      case 'reschedule_request':
      case 'new_booking_request': {
        const pl = payload as any
        const message = pl.customer_reply_pending
          || (pl.available_slots?.length
            ? `Hej! Vi kan komma:\n${(pl.available_slots as any[]).map((s: any, i: number) => `${i + 1}. ${s.label}`).join('\n')}\nVilket passar bäst?`
            : null)

        if (!message || !pl.entity?.phone) {
          return { action: 'propose_booking_times', skipped: 'no message or phone' }
        }

        const smsRes = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            to: pl.entity.phone,
            message,
          }),
        })
        return { action: 'propose_booking_times', sms_sent: smsRes.ok, slots_count: pl.available_slots?.length || 0 }
      }

      case 'create_quote_draft':
      case 'quote_request':
      case 'quote_addition': {
        const pl = payload as any
        const res = await fetch(`${appUrl}/api/quotes/ai-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            textDescription: pl.description || pl.job_description || pl.customer_reply_pending,
            customerId: pl.entity?.customerId,
            businessId,
          }),
        })
        return { action: 'create_quote_draft', ok: res.ok }
      }

      case 'create_ata_draft': {
        const pl = payload as any
        const res = await fetch(`${appUrl}/api/quotes/ai-generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            textDescription: `ÄTA-tillägg: ${pl.description || ''}`,
            customerId: pl.entity?.customerId,
            businessId,
          }),
        })
        return { action: 'create_ata_draft', ok: res.ok }
      }

      case 'send_matte_customer_reply': {
        const pl = payload as any
        const msg = pl.customer_reply_pending || pl.message
        if (!msg || !pl.entity?.phone) {
          return { action: 'send_matte_customer_reply', skipped: 'no message or phone' }
        }
        const smsRes = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId, to: pl.entity.phone, message: msg }),
        })
        return { action: 'send_matte_customer_reply', sms_sent: smsRes.ok }
      }

      case 'low_stock_alert': {
        return { action: 'low_stock_alert', acknowledged: true }
      }

      case 'four_eyes_quote': {
        const pl = payload as any
        if (!pl.quote_id) return { action: 'four_eyes_quote', skipped: 'no quote_id' }

        const supabase4e = (await import('@/lib/supabase')).getServerSupabase()

        // Återställ till draft — skaparen kan nu skicka
        await supabase4e
          .from('quotes')
          .update({ status: 'draft' })
          .eq('quote_id', pl.quote_id)

        // Push-notis till skaparen
        fetch(`${appUrl}/api/push/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            business_id: businessId,
            title: 'Offert godkänd',
            body: `Din offert på ${(pl.quote_total || 0).toLocaleString('sv-SE')} kr har godkänts — du kan nu skicka den`,
            url: `/dashboard/quotes/${pl.quote_id}`,
          }),
        }).catch(() => {})

        return { action: 'four_eyes_quote', ok: true, quote_id: pl.quote_id }
      }

      case 'propose_site_visit': {
        const pl = payload as any
        if (!pl.entity?.phone) return { action: 'propose_site_visit', skipped: 'no phone' }

        // Hämta lediga tider
        let slotsText = ''
        try {
          const { getAvailableSlots } = await import('@/lib/matte/calendar-slots')
          const slots = await getAvailableSlots(businessId, 1)
          if (slots.length > 0) {
            slotsText = slots.map((s: any, i: number) => `${i + 1}) ${s.label}`).join('\n')
          }
        } catch { /* no calendar */ }

        const message = slotsText
          ? `Hej ${pl.entity?.customerName || ''}! Vi skulle gärna komma och titta på jobbet. Passar någon av dessa tider?\n${slotsText}\nSvara med 1, 2 eller 3. //${pl.businessName || ''}`
          : pl.customer_reply_pending || `Hej! Vi vill gärna boka in ett platsbesök. Vilken tid passar dig? //${pl.businessName || ''}`

        const smsRes = await fetch(`${appUrl}/api/sms/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ business_id: businessId, to: pl.entity.phone, message }),
        })
        return { action: 'propose_site_visit', sms_sent: smsRes.ok }
      }

      case 'four_eyes_project_close': {
        const pl = payload as any
        if (!pl.project_id) return { action: 'four_eyes_project_close', skipped: 'no project_id' }

        const supabase4p = (await import('@/lib/supabase')).getServerSupabase()

        await supabase4p
          .from('project')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('project_id', pl.project_id)

        // Fire job_completed
        try {
          const { fireEvent } = await import('@/lib/automation-engine')
          const { data: proj } = await supabase4p
            .from('project')
            .select('customer_id, name')
            .eq('project_id', pl.project_id)
            .single()

          if (proj) {
            await fireEvent(supabase4p, 'job_completed', businessId, {
              project_id: pl.project_id,
              customer_id: proj.customer_id,
              project_name: proj.name,
            })
          }
        } catch { /* non-blocking */ }

        return { action: 'four_eyes_project_close', ok: true, project_id: pl.project_id }
      }

      case 'price_adjustment': {
        // Uppdatera pris i prislista
        const pl = payload as any
        if (pl.item_id && pl.suggested_price) {
          const supabasePa = (await import('@/lib/supabase')).getServerSupabase()
          await supabasePa.from('price_list').update({
            unit_price: pl.suggested_price,
          }).eq('id', pl.item_id).eq('business_id', businessId)
        }
        return { action: 'price_adjustment', ok: true }
      }

      case 'profitability_warning': {
        // Godkänn = bekräfta att hantverkaren är medveten
        return { action: 'profitability_warning', acknowledged: true }
      }

      case 'customer_reactivation': {
        const pl = payload as any
        if (pl.customer_phone && pl.suggested_sms) {
          const smsRes = await fetch(`${appUrl}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: businessId,
              to: pl.customer_phone,
              message: pl.suggested_sms,
            }),
          })
          return { action: 'customer_reactivation', sms_sent: smsRes.ok }
        }
        return { action: 'customer_reactivation', skipped: 'no phone or message' }
      }

      case 'create_invoice_from_report': {
        // Navigerar — returnerar bara bekräftelse
        return { action: 'create_invoice_from_report', acknowledged: true, navigate_to: `/dashboard/invoices` }
      }

      default: {
        // Smart fallback: om payload har SMS-data → skicka SMS
        const pl = payload as any
        const smsMessage = pl.message || pl.suggested_sms || pl.sms_text
        const smsTo = pl.to || pl.customer_phone || pl.entity?.phone

        if (smsMessage && smsTo) {
          const smsRes = await fetch(`${appUrl}/api/sms/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              business_id: businessId,
              to: smsTo,
              message: smsMessage,
            }),
          })
          return { action: approval_type, sms_sent: smsRes.ok, fallback: true }
        }

        // Om inget SMS-data → bara bekräfta (acknowledgement)
        return { action: approval_type, acknowledged: true, note: 'Godkänt utan specifik åtgärd' }
      }
    }
  } catch (err: any) {
    return { action: approval_type, error: err.message }
  }
}
