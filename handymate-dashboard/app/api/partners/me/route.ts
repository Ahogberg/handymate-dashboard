import { NextRequest, NextResponse } from 'next/server'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'

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

  return NextResponse.json({ partner })
}
