import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/observations/[id]
 * Body: { action: 'dismiss' | 'resolve' }
 *
 * Markerar observation som dismissed (Christoffer tryckte bort) eller
 * resolved (problemet löst). Båda tar bort observationen från active-
 * listan i TeamObservationsCard.
 *
 * "Agera" på observation med suggestion görs INTE här — cron skapade
 * redan pending_approval-rad vid observation-skapande, så frontend
 * länkar till /approvals?filter=agent_observation istället.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const action = body?.action

    if (!action || !['dismiss', 'resolve'].includes(action)) {
      return NextResponse.json(
        { error: 'action must be "dismiss" or "resolve"' },
        { status: 400 },
      )
    }

    const supabase = getServerSupabase()

    const updateData: Record<string, unknown> = {
      status: action === 'resolve' ? 'resolved' : 'dismissed',
    }
    if (action === 'dismiss') {
      updateData.dismissed_at = new Date().toISOString()
      updateData.dismissed_by = business.business_id
    } else {
      updateData.resolved_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('business_knowledge')
      .update(updateData)
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .select('id, status')
      .maybeSingle()

    if (error) {
      console.error('[observations/POST] update error:', error)
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          stage: 'update',
        },
        { status: 500 },
      )
    }

    if (!data) {
      return NextResponse.json({ error: 'Observation hittades inte' }, { status: 404 })
    }

    return NextResponse.json({ ok: true, observation: data })
  } catch (err: any) {
    console.error('[observations/POST] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Serverfel', stage: 'unexpected' },
      { status: 500 },
    )
  }
}
