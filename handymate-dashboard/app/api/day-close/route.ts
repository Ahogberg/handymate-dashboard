import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { loadDaySummary } from '@/lib/relief/day-summary'
import { WorkReportError } from '@/lib/matte/work-report'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Logga in för att kontrollera din rapport.' }, { status: 401, headers })
    const user = await getCurrentUser(request, business.business_id)
    const summary = await loadDaySummary(getServerSupabase(), business.business_id, user, request.nextUrl.searchParams.get('projectId'), request.nextUrl.searchParams.get('date'))
    return NextResponse.json({ summary }, { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorkReportError ? error.message : 'Rapportens sparade uppgifter kunde inte kontrolleras.' }, { status: error instanceof WorkReportError ? error.status : 503, headers })
  }
}
