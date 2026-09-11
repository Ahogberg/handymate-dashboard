import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export async function PATCH(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || !['import', 'export', 'both'].includes(body.syncDirection)) {
    return NextResponse.json({ error: 'Ogiltig synkriktning' }, { status: 400 })
  }
  const { data, error } = await getServerSupabase().from('calendar_connection')
    .update({ sync_direction: body.syncDirection })
    .eq('business_id', business.business_id).eq('business_user_id', user.id)
    .eq('provider', 'google').select('id').maybeSingle()
  if (error) return NextResponse.json({ error: 'Kunde inte spara synkriktningen' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Google-koppling saknas' }, { status: 404 })
  return NextResponse.json({ syncDirection: body.syncDirection })
}
