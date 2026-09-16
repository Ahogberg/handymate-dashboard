import { NextRequest, NextResponse } from 'next/server'
import { AGREEMENT_VERSION, hasAcceptedCurrentAgreement } from '@/lib/partners/agreement'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/me
 * Returns current partner from JWT cookie. Used by client-side auth check.
 */
export async function GET(request: NextRequest) {
  const token = getPartnerTokenFromRequest(request)
  if (!token) {
    return NextResponse.json({ partner: null }, { status: 401 })
  }

  const partner = await getPartnerFromToken(token)
  if (!partner) {
    return NextResponse.json({ partner: null }, { status: 401 })
  }

  // Avtalsgrinden behöver samma två härledda fält som portalens
  // dashboardrutt räknar fram (app/api/partners/dashboard/route.ts) — samma
  // namn och samma härledning, så de två vägarna aldrig kan säga olika sak
  // om samma partner. Säljmaterialsidorna läser bara den här rutten.
  return NextResponse.json({
    partner: {
      ...partner,
      agreement_required: !hasAcceptedCurrentAgreement(partner),
      current_agreement_version: AGREEMENT_VERSION,
    },
  })
}
