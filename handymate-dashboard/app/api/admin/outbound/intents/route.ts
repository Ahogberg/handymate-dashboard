import { NextRequest, NextResponse } from 'next/server'
import { financialKernelAdmin, requiredText, adminFailure } from '@/lib/financial-kernel/admin'
import { getServerSupabase } from '@/lib/supabase'
import { listUnresolvedOutboundIntents, resolveOutboundIntent } from '@/lib/outbound/intents'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  if (!await financialKernelAdmin(request)) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const businessId = requiredText(request.nextUrl.searchParams.get('business_id'), 'företag', 100)
    return NextResponse.json({ intents: await listUnresolvedOutboundIntents(getServerSupabase(), businessId) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) { return adminFailure(error) }
}
export async function POST(request: NextRequest) {
  const actor = await financialKernelAdmin(request)
  if (!actor) return NextResponse.json({ error: 'Behörighet saknas' }, { status: 403 })
  try {
    const body = await request.json()
    const businessId = requiredText(body.business_id, 'företag', 100)
    const id = requiredText(body.id, 'utskick', 100)
    const reason = requiredText(body.reason, 'skäl')
    if (!['delivered', 'abandon', 'retry'].includes(body.resolution)) throw new TypeError('Ogiltig åtgärd')
    const result = await resolveOutboundIntent(getServerSupabase(), businessId, id, body.resolution, actor, reason)
    return NextResponse.json({ result })
  } catch (error) { return adminFailure(error) }
}
