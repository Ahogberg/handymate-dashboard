import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getAllLearnedPatterns } from '@/lib/auto-approve-learning'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/auto-approve/patterns
 * Returnerar alla inlärda godkännandemönster för företaget.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const patterns = await getAllLearnedPatterns(business.business_id)
    return NextResponse.json({ patterns })
  } catch (error: any) {
    console.error('Failed to get learned patterns:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
