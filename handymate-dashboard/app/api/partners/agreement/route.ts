import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { verifyAgreementToken } from '@/lib/partners/approve-token'
import {
  AGREEMENT_VERSION,
  captureRequestIp,
  hasAcceptedCurrentAgreement,
  recordAgreementAcceptance,
} from '@/lib/partners/agreement'

export const dynamic = 'force-dynamic'

/**
 * Avtalsacceptans för BEFINTLIGA partners (P0-9, 2026-09-01).
 *
 * Nya partners accepterar i registreringen. De två partners som fanns före
 * Partneravtal v1 (v189 flyttade deras villkor till 20 %/36 mån) saknar
 * loggad acceptans och når hit på ett av två sätt:
 *
 *  - Aktiv partner: portalgrinden (AgreementGate) POST:ar med partner-cookien.
 *  - Partner som väntar på godkännande kan inte logga in: admin mejlar en
 *    signerad engångslänk (/partners/avtal/acceptera?partner=&token=) och
 *    POST:en bär partnerId + token istället för cookie.
 *
 * Idempotent: redan loggad acceptans skrivs aldrig över.
 */

type Identity = { partnerId: string } | null

async function resolveIdentity(request: NextRequest, body: Record<string, unknown>): Promise<Identity> {
  const cookieToken = getPartnerTokenFromRequest(request)
  if (cookieToken) {
    const partner = await getPartnerFromToken(cookieToken)
    if (partner) return { partnerId: partner.id }
  }

  const partnerId = typeof body.partnerId === 'string' ? body.partnerId : null
  const token = typeof body.token === 'string' ? body.token : null
  if (partnerId && verifyAgreementToken(partnerId, token)) {
    // Engångslänken gäller inte för inaktiverade partners.
    const { data } = await getServerSupabase()
      .from('partners')
      .select('id, status')
      .eq('id', partnerId)
      .maybeSingle()
    if (data && data.status !== 'suspended') return { partnerId: data.id }
  }

  return null
}

/** GET — status för engångslänken (namn + om acceptans redan finns). */
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const partnerId = url.searchParams.get('partner')
  const token = url.searchParams.get('token')

  if (!partnerId || !verifyAgreementToken(partnerId, token)) {
    return NextResponse.json({ error: 'Länken är ogiltig' }, { status: 403 })
  }

  const { data } = await getServerSupabase()
    .from('partners')
    .select('id, name, company, status, agreement_version')
    .eq('id', partnerId)
    .maybeSingle()

  if (!data || data.status === 'suspended') {
    return NextResponse.json({ error: 'Länken är ogiltig' }, { status: 403 })
  }

  return NextResponse.json({
    name: data.name,
    company: data.company,
    status: data.status,
    agreement_version: AGREEMENT_VERSION,
    already_accepted: hasAcceptedCurrentAgreement(data),
  })
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return NextResponse.json({ error: 'Ogiltig request' }, { status: 400 })
  }

  const identity = await resolveIdentity(request, body)
  if (!identity) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (body.agreementAccepted !== true) {
    return NextResponse.json({ error: 'Du måste godkänna partneravtalet' }, { status: 400 })
  }

  const result = await recordAgreementAcceptance(identity.partnerId, captureRequestIp(request))
  if (result.error) {
    console.error('[partner-agreement] Acceptans misslyckades:', result.error)
    return NextResponse.json({ error: 'Acceptansen kunde inte sparas' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    agreement_version: AGREEMENT_VERSION,
    already_accepted: result.alreadyAccepted,
  })
}
