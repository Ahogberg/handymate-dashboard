import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { canActOnApproval } from '@/lib/approvals/routing'
import { deriveCallOutcome, type CallApproval } from '@/lib/voice/call-outcome'

export const dynamic = 'force-dynamic'

async function authorized(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return { response: NextResponse.json({ error: 'Inte inloggad' }, { status: 401 }) } as const
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user)) return { response: NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 }) } as const
  return { business, user } as const
}

export async function GET(request: NextRequest) {
  const auth = await authorized(request)
  if (auth.response) return auth.response
  const db = getServerSupabase()
  const id = request.nextUrl.searchParams.get('recording_id')
  try {
    let query = db.from('call_recording').select('*').eq('business_id', auth.business.business_id).eq('source', 'phone')
    if (id) query = query.eq('recording_id', id)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(id ? 1 : 50)
    if (error) throw error
    // Explicit DTO: never leak provider URL, cached extraction or the worker token.
    const calls = (data || []).map(r => ({ recording_id: r.recording_id, customer_id: r.customer_id,
      project_id: r.project_id || null, phone_number: r.phone_number, duration_seconds: r.duration_seconds,
      created_at: r.created_at, summary: r.transcript_summary, transcribed: !!r.transcript,
      raw_deleted: !!r.raw_deleted_at, phase: r.call_processing?.phase || null }))
    if (!id) return NextResponse.json({ calls })
    if (!calls[0]) return NextResponse.json({ error: 'Samtalet hittades inte' }, { status: 404 })
    const { data: rows, error: approvalError } = await db.from('pending_approvals').select('*')
      .eq('business_id', auth.business.business_id).contains('payload', { recording_id: id }).order('created_at').limit(100)
    if (approvalError) throw approvalError
    const allowed = await Promise.all((rows || []).map(row => canActOnApproval(db, auth.user, row)))
    const visible = (rows || []).filter((_, i) => allowed[i]) as CallApproval[]
    let projects: { project_id: string; name: string }[] = []
    if (calls[0].customer_id) {
      const result = await db.from('project').select('project_id, name').eq('business_id', auth.business.business_id)
        .eq('customer_id', calls[0].customer_id).order('name').limit(100)
      if (result.error) throw result.error
      projects = result.data || []
    }
    return NextResponse.json({ call: calls[0], projects, outcome: deriveCallOutcome(data![0].call_processing || {}, visible) })
  } catch {
    return NextResponse.json({ error: 'Samtalsutfallet kunde inte hämtas. Försök igen.' }, { status: 503 })
  }
}

/** Human explicitly picks a project. Never pick newest/first or trust a caller-supplied tenant. */
export async function PATCH(request: NextRequest) {
  const auth = await authorized(request)
  if (auth.response) return auth.response
  if (auth.business._impersonation) return NextResponse.json({ error: 'Endast läsning' }, { status: 403 })
  const body = await request.json().catch(() => null)
  if (typeof body?.recording_id !== 'string' || !(body.project_id === null || typeof body.project_id === 'string')) {
    return NextResponse.json({ error: 'Välj ett samtal och projekt.' }, { status: 400 })
  }
  const db = getServerSupabase()
  try {
    const { data: call, error } = await db.from('call_recording').select('recording_id, customer_id')
      .eq('business_id', auth.business.business_id).eq('recording_id', body.recording_id).eq('source', 'phone').maybeSingle()
    if (error) throw error
    if (!call) return NextResponse.json({ error: 'Samtalet hittades inte' }, { status: 404 })
    if (body.project_id !== null) {
      if (!call.customer_id) return NextResponse.json({ error: 'Samtalet behöver först en verifierad kundkoppling.' }, { status: 409 })
      const project = await db.from('project').select('project_id').eq('business_id', auth.business.business_id)
        .eq('customer_id', call.customer_id).eq('project_id', body.project_id).maybeSingle()
      if (project.error) throw project.error
      if (!project.data) return NextResponse.json({ error: 'Projektet hör inte till samtalets kund.' }, { status: 404 })
    }
    let update = db.from('call_recording').update({ project_id: body.project_id })
      .eq('business_id', auth.business.business_id).eq('recording_id', body.recording_id)
    update = call.customer_id ? update.eq('customer_id', call.customer_id) : update.is('customer_id', null)
    const result = await update.select('recording_id').maybeSingle()
    if (result.error) throw result.error
    if (!result.data) return NextResponse.json({ error: 'Samtalet ändrades. Ladda om och försök igen.' }, { status: 409 })
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Projektkopplingen kunde inte sparas.' }, { status: 503 })
  }
}
