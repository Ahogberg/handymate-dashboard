import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { findMatchingAssignees } from '@/lib/job-types'

/**
 * GET /api/job-types/matching-assignees?slug=elarbete
 * Returnerar teammedlemmar som har specialtypen i sina specialiteter.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slug = request.nextUrl.searchParams.get('slug')
  if (!slug) {
    return NextResponse.json({ assignees: [] })
  }

  const supabase = getServerSupabase()
  const assignees = await findMatchingAssignees(supabase, business.business_id, slug)

  return NextResponse.json({ assignees })
}
