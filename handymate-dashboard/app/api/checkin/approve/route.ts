import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST /api/checkin/approve — Attestera eller avvisa en incheckning
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { checkin_id, approval_id, action, adjusted_minutes } = body

  if (!checkin_id || !action) {
    return NextResponse.json({ error: 'checkin_id och action krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  if (action === 'approve') {
    // Hämta incheckning
    const { data: checkin } = await supabase
      .from('time_checkins')
      .select('*')
      .eq('id', checkin_id)
      .eq('business_id', business.business_id)
      .single()

    if (!checkin) {
      return NextResponse.json({ error: 'Incheckning hittades inte' }, { status: 404 })
    }

    const minutes = adjusted_minutes ?? checkin.duration_minutes ?? 0

    // Markera som godkänd
    await supabase
      .from('time_checkins')
      .update({
        status: 'approved',
        approved_by: business.contact_name || 'Chef',
        approved_at: new Date().toISOString(),
        duration_minutes: minutes,
      })
      .eq('id', checkin_id)

    // Skapa time_entry automatiskt
    const entryId = 'te_' + Math.random().toString(36).substr(2, 9)
    await supabase.from('time_entry').insert({
      time_entry_id: entryId,
      business_id: business.business_id,
      project_id: checkin.project_id || null,
      description: `Incheckning ${new Date(checkin.checked_in_at).toLocaleDateString('sv-SE')}${checkin.project_name ? ' · ' + checkin.project_name : ''}`,
      duration_minutes: minutes,
      work_date: checkin.checked_in_at.split('T')[0],
      is_billable: true,
    })

    // Godkänn approval om ID finns
    if (approval_id) {
      await supabase
        .from('pending_approvals')
        .update({ status: 'approved', resolved_at: new Date().toISOString() })
        .eq('id', approval_id)
    }

    return NextResponse.json({ success: true, time_entry_id: entryId })
  }

  if (action === 'reject') {
    await supabase
      .from('time_checkins')
      .update({ status: 'rejected' })
      .eq('id', checkin_id)
      .eq('business_id', business.business_id)

    if (approval_id) {
      await supabase
        .from('pending_approvals')
        .update({ status: 'rejected', resolved_at: new Date().toISOString() })
        .eq('id', approval_id)
    }

    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Ogiltig action' }, { status: 400 })
}
