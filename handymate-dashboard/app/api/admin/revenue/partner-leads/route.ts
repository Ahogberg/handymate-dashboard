import { NextRequest, NextResponse } from 'next/server'
import { requireRevenue } from '@/lib/revenue/auth'
import { AGREEMENT_VERSION } from '@/lib/partners/agreement'
import { text } from '@/lib/revenue/domain'
import { leadId, leadVersion } from '@/lib/revenue/partner-leads'
import { leadBody, leadError } from '@/lib/revenue/partner-lead-api'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRevenue(request)
    if (!ctx?.manager) return NextResponse.json({ error: 'Endast säljledare får fördela partnerleads.' }, { status: 403 })
    const accountId = leadId(request.nextUrl.searchParams.get('account_id'))
    const [partners, leads] = await Promise.all([
      ctx.db.from('partners').select('id,name,company').eq('status', 'active').eq('agreement_version', AGREEMENT_VERSION).order('name'),
      ctx.db.from('revenue_partner_leads').select('id,partner_id,snapshot,brief,status,feedback,next_action,next_action_at,version,created_at,updated_at').eq('account_id', accountId).order('created_at', { ascending: false }).limit(100),
    ])
    if (partners.error) throw partners.error
    if (leads.error) throw leads.error
    return NextResponse.json({ partners: partners.data, leads: leads.data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return leadError(e) }
}
export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRevenue(request)
    if (!ctx?.manager) return NextResponse.json({ error: 'Endast säljledare får fördela partnerleads.' }, { status: 403 })
    const body = await leadBody(request)
    const type = text(body.type, 20)
    let input: Record<string, unknown>
    if (type === 'assign') {
      input = { account_id: leadId(body.account_id), partner_id: leadId(body.partner_id), contact_id: leadId(body.contact_id), brief: text(body.brief, 4000), version: leadVersion(body.version) }
      if (!input.brief) throw new Error('Skriv ett underlag till partnern.')
    } else if (type === 'revoke') input = { lead_id: leadId(body.lead_id), version: leadVersion(body.version) }
    else throw new Error('Okänd åtgärd.')
    const { data, error } = await ctx.db.rpc('revenue_partner_lead_command', { p_actor: ctx.userId, p_manager: true, p_partner: null, p_request: leadId(body.request_id), p_command: type, p_input: input, p_agreement: AGREEMENT_VERSION })
    if (error) throw error
    return NextResponse.json(data)
  } catch (e) { return leadError(e) }
}
