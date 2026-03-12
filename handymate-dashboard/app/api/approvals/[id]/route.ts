import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

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

    const { action } = await request.json()
    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be approve or reject' }, { status: 400 })
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

    // Update status
    const { error: updateError } = await supabase
      .from('pending_approvals')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        resolved_at: new Date().toISOString(),
        resolved_by: business.business_id,
      })
      .eq('id', params.id)

    if (updateError) throw updateError

    // If approved, execute the payload action
    let executionResult: Record<string, unknown> | null = null
    if (action === 'approve') {
      executionResult = await executeApprovalPayload(approval, business.business_id)
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
