import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * POST /api/checkin/approve — Attestera eller avvisa en incheckning
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Permission check: kräver approve_time (samma mönster som /api/time-entry/approve)
  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasPermission(currentUser, 'approve_time')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

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

    // Pre-check (idempotens): redan attesterad? Returnera tidigt så vi inte
    // skapar en andra time_entry = dubbel fakturerad tid. Den atomiska guarden
    // på UPDATE nedan är det egentliga race-skyddet vid samtidiga requests;
    // detta ger ett tydligt svar i det vanliga dubbel-submit-fallet.
    if (checkin.status === 'approved') {
      return NextResponse.json({ error: 'Incheckning redan attesterad' }, { status: 409 })
    }

    const minutes = adjusted_minutes ?? checkin.duration_minutes ?? 0

    // Resolve hourly_rate: per-user-rate → business-default → 0.
    // checkin.user_id är auth-UUID (TD-1) — matchar mot business_users.user_id.
    const { data: businessUser } = await supabase
      .from('business_users')
      .select('hourly_rate')
      .eq('user_id', checkin.user_id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('default_hourly_rate')
      .eq('business_id', business.business_id)
      .maybeSingle()

    const hourlyRate =
      businessUser?.hourly_rate ?? businessConfig?.default_hourly_rate ?? 0

    // Ärv customer från projektet — annars blir time_entry.customer_id NULL
    // och raden hoppar över i fakturera-flödet (Christoffer kan inte fakturera).
    let customerId: string | null = null
    if (checkin.project_id) {
      const { data: project } = await supabase
        .from('project')
        .select('customer_id')
        .eq('project_id', checkin.project_id)
        .eq('business_id', business.business_id)
        .maybeSingle()
      customerId = project?.customer_id ?? null
    }

    const approvedAt = new Date().toISOString()

    // Markera som godkänd — ATOMISK guard: flippa bara om raden inte redan
    // är 'approved'. Utan .neq + count-check skapar vilken om-körning som
    // helst (retry, dubbelklick, web+mobil) en till time_entry nedan.
    const { data: flippedCheckin } = await supabase
      .from('time_checkins')
      .update({
        status: 'approved',
        approved_by: business.contact_name || 'Chef',
        approved_at: approvedAt,
        duration_minutes: minutes,
      })
      .eq('id', checkin_id)
      .eq('business_id', business.business_id)
      .neq('status', 'approved')
      .select('id')

    // Gate:a time_entry-INSERT på att UPDATE faktiskt flippade statusen.
    // 0 rader = en parallell request hann före → skapa INGEN andra time_entry.
    if (!flippedCheckin || flippedCheckin.length === 0) {
      return NextResponse.json({ error: 'Incheckning redan attesterad' }, { status: 409 })
    }

    // Skapa time_entry automatiskt — incheckningen just attesterades, så
    // raden ska skapas med approval_status='approved' direkt (annars
    // hamnar den i "Att attestera"-vyn igen pga DB-default 'pending').
    // approved_by speglar mönstret i /api/time-entry/approve (business_id).
    const entryId = 'te_' + Math.random().toString(36).substr(2, 9)
    await supabase.from('time_entry').insert({
      time_entry_id: entryId,
      business_id: business.business_id,
      project_id: checkin.project_id || null,
      customer_id: customerId,
      description: `Incheckning ${new Date(checkin.checked_in_at).toLocaleDateString('sv-SE')}${checkin.project_name ? ' · ' + checkin.project_name : ''}`,
      duration_minutes: minutes,
      work_date: checkin.checked_in_at.split('T')[0],
      is_billable: true,
      hourly_rate: hourlyRate,
      approval_status: 'approved',
      approved_by: business.business_id,
      approved_at: approvedAt,
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
