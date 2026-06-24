import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('call_recording')
    // call_recording har phone_number + direction (INTE phone_from/phone_to) —
    // den gamla selecten failade alltid → routen svarade evigt {found:false}.
    .select('recording_id, phone_number, direction, duration_seconds, created_at')
    .eq('business_id', auth.business_id)
    .gte('created_at', twoMinAgo)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    return NextResponse.json({ found: false })
  }

  const inbound = data.direction !== 'outbound'
  return NextResponse.json({
    found: true,
    call: {
      from: inbound ? data.phone_number : null,
      to: inbound ? null : data.phone_number,
      direction: data.direction,
      duration: data.duration_seconds,
      created_at: data.created_at,
    },
  })
}
