import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { AGREEMENT_VERSION, hasAcceptedCurrentAgreement } from '@/lib/partners/agreement'
import { getServerSupabase } from '@/lib/supabase'
import { text } from '@/lib/revenue/domain'
import { leadDate, leadId, leadVersion } from '@/lib/revenue/partner-leads'
import { leadBody, leadError } from '@/lib/revenue/partner-lead-api'
export const dynamic = 'force-dynamic'
async function identity(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  const partner = token ? await getPartnerFromToken(token) : null
  return partner && hasAcceptedCurrentAgreement(partner) ? partner : null
}
export async function GET(request: NextRequest) {
  try {
    const partner = await identity(request)
    if (!partner) return NextResponse.json({ error: 'Logga in med ett aktivt partnerkonto och godkänt avtal.' }, { status: 401 })
    const offset = Number(request.nextUrl.searchParams.get('offset') || 0)
    if (!Number.isInteger(offset) || offset < 0) throw new Error('Ogiltig sida.')
    const { data, error } = await getServerSupabase().rpc('revenue_partner_lead_inbox', { p_partner: partner.id, p_agreement: AGREEMENT_VERSION, p_offset: offset })
    if (error) throw error
    return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return leadError(e) }
}
export async function POST(request: NextRequest) {
  try {
    const partner = await identity(request)
    if (!partner) return NextResponse.json({ error: 'Partneråtkomst saknas.' }, { status: 401 })
    const body = await leadBody(request)
    const input = { lead_id: leadId(body.lead_id), version: leadVersion(body.version), status: text(body.status, 30), feedback: text(body.feedback, 4000), next_action: text(body.next_action, 1000), next_action_at: leadDate(body.next_action_at) }
    const { data, error } = await getServerSupabase().rpc('revenue_partner_lead_command', { p_actor: null, p_manager: false, p_partner: partner.id, p_request: leadId(body.request_id), p_command: 'update', p_input: input, p_agreement: AGREEMENT_VERSION })
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) { return leadError(e) }
}
