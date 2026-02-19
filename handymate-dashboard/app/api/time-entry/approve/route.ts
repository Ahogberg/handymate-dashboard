import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST /api/time-entry/approve - Godkänn eller avslå tidrapporter
 * Body: { entry_ids: string[], action: 'approve' | 'reject', rejection_reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { entry_ids, action, rejection_reason } = body

    if (!entry_ids || !Array.isArray(entry_ids) || entry_ids.length === 0) {
      return NextResponse.json({ error: 'entry_ids krävs' }, { status: 400 })
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action måste vara approve eller reject' }, { status: 400 })
    }

    if (action === 'reject' && !rejection_reason) {
      return NextResponse.json({ error: 'rejection_reason krävs vid avslag' }, { status: 400 })
    }

    // Verify all entries belong to this business and are pending
    const { data: entries, error: fetchError } = await supabase
      .from('time_entry')
      .select('time_entry_id, approval_status, invoiced')
      .in('time_entry_id', entry_ids)
      .eq('business_id', business.business_id)

    if (fetchError) throw fetchError

    if (!entries || entries.length !== entry_ids.length) {
      return NextResponse.json({ error: 'Vissa tidposter hittades inte' }, { status: 404 })
    }

    const alreadyInvoiced = entries.filter((e: any) => e.invoiced)
    if (alreadyInvoiced.length > 0) {
      return NextResponse.json({ error: 'Kan inte ändra godkännande för fakturerade poster' }, { status: 400 })
    }

    const now = new Date().toISOString()

    if (action === 'approve') {
      const { error: updateError } = await supabase
        .from('time_entry')
        .update({
          approval_status: 'approved',
          approved_by: business.business_id,
          approved_at: now,
          rejection_reason: null,
        })
        .in('time_entry_id', entry_ids)
        .eq('business_id', business.business_id)

      if (updateError) throw updateError
    } else {
      const { error: updateError } = await supabase
        .from('time_entry')
        .update({
          approval_status: 'rejected',
          approved_by: business.business_id,
          approved_at: now,
          rejection_reason: rejection_reason,
        })
        .in('time_entry_id', entry_ids)
        .eq('business_id', business.business_id)

      if (updateError) throw updateError
    }

    return NextResponse.json({
      success: true,
      action,
      count: entry_ids.length,
    })
  } catch (error: any) {
    console.error('Approve time entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * GET /api/time-entry/approve - Hämta väntande tidrapporter
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: entries, error } = await supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (customer_id, name),
        work_type:work_type_id (work_type_id, name)
      `)
      .eq('business_id', business.business_id)
      .eq('approval_status', 'pending')
      .order('work_date', { ascending: false })

    if (error) throw error

    return NextResponse.json({
      entries: entries || [],
      count: entries?.length || 0,
    })
  } catch (error: any) {
    console.error('Get pending approvals error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
