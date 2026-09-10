import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { completeIntake, intakeReply, IntakeError } from '@/lib/leads/durable-intake'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function context(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return { error: NextResponse.json({ error: 'Logga in för att se förfrågningar.' }, { status: 401, headers }) }
  const user = await getCurrentUser(request, business.business_id)
  if (!user?.is_active || !isOwnerOrAdmin(user)) return { error: NextResponse.json({ error: 'Endast ägare och administratör kan hantera mottagna förfrågningar.' }, { status: 403, headers }) }
  return { businessId: business.business_id, db: getServerSupabase() }
}
export async function GET(request: NextRequest) {
  const c = await context(request)
  if (c.error) return c.error
  const { data, error } = await c.db!.from('lead_intake_request').select('id,input,state,error_code,notice_state,created_at,updated_at,lead_id,deal_id')
    .eq('business_id', c.businessId!).or('state.neq.completed,notice_state.neq.confirmed').order('created_at', { ascending: true }).limit(100)
  if (error) return NextResponse.json({ error: 'Kunde inte hämta förfrågningar som behöver kontrolleras.' }, { status: 503, headers })
  return NextResponse.json({ requests: data || [] }, { headers })
}
export async function POST(request: NextRequest) {
  const c = await context(request)
  if (c.error) return c.error
  try {
    const body = await request.json()
    if (typeof body?.receipt_id !== 'string' || body.receipt_id.length > 100) return NextResponse.json({ error: 'Välj en mottagen förfrågan.' }, { status: 400, headers })
    const receipt = await completeIntake(c.db!, c.businessId!, body.receipt_id)
    return NextResponse.json(intakeReply(receipt), { status: receipt.state === 'completed' ? 200 : 202, headers })
  } catch (e) {
    return NextResponse.json({ error: e instanceof IntakeError ? e.message : 'Förfrågan kunde inte slutföras.' }, { status: e instanceof IntakeError ? e.status : 503, headers })
  }
}
