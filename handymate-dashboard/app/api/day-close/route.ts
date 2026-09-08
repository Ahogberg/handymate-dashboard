import { reportContinuityEnabled, listReportSessions, resumeReportSession, discardReportSession } from '@/lib/matte/report-session'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { loadDaySummary } from '@/lib/relief/day-summary'
import { loadMyDay } from '@/lib/relief/my-day'
import { WorkReportError } from '@/lib/matte/work-report'
export const dynamic = 'force-dynamic'
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'no-store' }
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Logga in för att kontrollera din rapport.' }, { status: 401, headers })
    const user = await getCurrentUser(request, business.business_id)
    if (request.nextUrl.searchParams.get('view') === 'reports') {
      if (!reportContinuityEnabled()) return NextResponse.json({enabled:false,reports:[]}, {headers})
      const reports = await listReportSessions(getServerSupabase(),business.business_id,user,request.nextUrl.searchParams.get('projectId'),request.nextUrl.searchParams.get('date'))
      return NextResponse.json({enabled:true,...reports},{headers})
    }
    if (request.nextUrl.searchParams.get('view') === 'day') {
      const overview = await loadMyDay(getServerSupabase(), business.business_id, user, request.nextUrl.searchParams.get('date'))
      return NextResponse.json({ overview }, { headers })
    }
    const summary = await loadDaySummary(getServerSupabase(), business.business_id, user, request.nextUrl.searchParams.get('projectId'), request.nextUrl.searchParams.get('date'))
    return NextResponse.json({ summary }, { headers })
  } catch (error) {
    return NextResponse.json({ error: error instanceof WorkReportError ? error.message : 'Rapportens sparade uppgifter kunde inte kontrolleras.' }, { status: error instanceof WorkReportError ? error.status : 503, headers })
  }
}

export async function POST(request: NextRequest) {
  const headers = {'Cache-Control':'no-store'}
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({error:'Logga in.'},{status:401,headers})
    if (!reportContinuityEnabled()) return NextResponse.json({error:'Återupptagning är inte aktiverad.'},{status:503,headers})
    const user = await getCurrentUser(request,business.business_id)
    const body = await request.json()
    if (!['resume','discard'].includes(body.action)) return NextResponse.json({error:'Välj rapport och handling.'},{status:400,headers})
    const result = body.action === 'resume'
      ? await resumeReportSession(getServerSupabase(),business.business_id,user,body.id)
      : await discardReportSession(getServerSupabase(),business.business_id,user,body.id)
    return NextResponse.json(result,{headers})
  } catch(error) {
    return NextResponse.json({error:error instanceof WorkReportError?error.message:'Rapporten kunde inte kontrolleras.'},{status:error instanceof WorkReportError?error.status:503,headers})
  }
}
