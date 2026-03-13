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
    const { action, edited_payload, reject_reason } = body
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
      executionResult = await executeApprovalPayload(approvalWithPayload, business.business_id)
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
  approval: { approval_type: string; payload: Record<string, unknown>; business_id: string },
  businessId: string
): Promise<Record<string, unknown>> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const { approval_type, payload } = approval

  try {
    switch (approval_type) {
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

      default:
        return { action: approval_type, skipped: 'no handler for this type', payload }
    }
  } catch (err: any) {
    return { action: approval_type, error: err.message }
  }
}
