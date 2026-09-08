import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { canActOnApproval } from '@/lib/approvals/routing'
import { prepareJobReport } from '@/lib/approvals/job-report-review'
import { renderReviewedPdf } from '@/lib/approvals/pdf-preview'

export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
  try {
    const business = await getAuthenticatedBusiness(request)
    const user = await getCurrentUser(request)
    if (!business || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })
    const db = getServerSupabase()
    const { data: approval, error } = await db.from('pending_approvals').select('*').eq('id', params.id).eq('business_id', business.business_id).single()
    if (error || !approval || approval.approval_type !== 'job_report') return NextResponse.json({ error: 'Dokumentet hittades inte' }, { status: 404, headers })
    if (!await canActOnApproval(db, user, approval)) return NextResponse.json({ error: 'Åtkomst nekad' }, { status: 403, headers })
    const { document } = await prepareJobReport(db, business.business_id, approval.id, approval.payload || {})
    if (request.nextUrl.searchParams.get('version') !== document.version) return NextResponse.json({ error: 'Underlaget har ändrats. Öppna en ny granskning.' }, { status: 409, headers })
    const html = await renderReviewedPdf(document.pdf)
    return new NextResponse(html, { headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; img-src data:; style-src 'unsafe-inline'; frame-ancestors 'self'" } })
  } catch {
    return NextResponse.json({ error: 'Dokumentet kunde inte förberedas. Öppna en ny granskning.' }, { status: 422, headers })
  }
}
