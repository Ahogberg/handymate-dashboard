import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}min`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv-SE')
}

/**
 * POST /api/checkin/checkout — Checka ut + skapa attesterings-förfrågan
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { checkin_id, lat, lng, note } = body

  if (!checkin_id) {
    return NextResponse.json({ error: 'checkin_id krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Hämta aktiv incheckning
  const { data: checkin } = await supabase
    .from('time_checkins')
    .select('*')
    .eq('id', checkin_id)
    .eq('business_id', business.business_id)
    .eq('status', 'active')
    .single()

  if (!checkin) {
    return NextResponse.json({ error: 'Ingen aktiv incheckning hittad' }, { status: 404 })
  }

  const checkedOutAt = new Date()
  const checkedInAt = new Date(checkin.checked_in_at)
  const durationMinutes = Math.round(
    (checkedOutAt.getTime() - checkedInAt.getTime()) / 60000
  )

  // Uppdatera incheckning
  const { data: updated, error } = await supabase
    .from('time_checkins')
    .update({
      checked_out_at: checkedOutAt.toISOString(),
      duration_minutes: durationMinutes,
      lat_out: lat || null,
      lng_out: lng || null,
      note: note || null,
      status: 'completed',
    })
    .eq('id', checkin_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Skapa pending_approval för attestering
  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
  await supabase.from('pending_approvals').insert({
    id: approvalId,
    business_id: business.business_id,
    approval_type: 'time_attestation',
    title: `Attestera: ${checkin.user_name || 'Anställd'}`,
    description: `${formatDuration(durationMinutes)} · ${checkin.project_name || 'Inget projekt'} · ${formatDate(checkin.checked_in_at)}`,
    risk_level: 'low',
    status: 'pending',
    payload: {
      checkin_id,
      user_id: checkin.user_id,
      user_name: checkin.user_name,
      project_id: checkin.project_id,
      project_name: checkin.project_name,
      checked_in_at: checkin.checked_in_at,
      checked_out_at: checkedOutAt.toISOString(),
      duration_minutes: durationMinutes,
      lat_in: checkin.lat_in,
      lng_in: checkin.lng_in,
      lat_out: lat || null,
      lng_out: lng || null,
    },
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  })

  return NextResponse.json({ checkin: updated, duration_minutes: durationMinutes })
}
