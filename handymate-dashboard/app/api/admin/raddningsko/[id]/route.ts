import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'

const NASTA_STATUS: Record<string, string> = {
  ta: 'pagaende',
  los: 'last',
  avfarda: 'avfardat',
}

/**
 * POST /api/admin/raddningsko/[id] — { action: 'ta' | 'los' | 'avfarda' }
 *
 * 'ta'      → status 'pagaende' (Andreas äger ärendet nu)
 * 'los'     → status 'last', kräver åtgärdstext
 * 'avfarda' → status 'avfardat' (falskt larm)
 *
 * resolved_at/resolved_by sätts på los/avfarda — den här cronen (raddningsko)
 * rör aldrig ett ärende med resolved_by satt av en människa förrän
 * signalen försvinner (då stämplas resolved_by='system' separat).
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const action = body?.action as string | undefined
  if (!action || !NASTA_STATUS[action]) {
    return NextResponse.json({ error: "action måste vara 'ta', 'los' eller 'avfarda'" }, { status: 400 })
  }
  if (action === 'los' && !String(body?.atgard || '').trim()) {
    return NextResponse.json({ error: 'Löst kräver en åtgärdstext' }, { status: 400 })
  }

  const supabase = getAdminSupabase()
  const nu = new Date().toISOString()

  const update: Record<string, unknown> = { status: NASTA_STATUS[action] }
  if (typeof body?.owner === 'string' && body.owner.trim()) update.owner = body.owner.trim()
  if (typeof body?.atgard === 'string' && body.atgard.trim()) update.atgard = body.atgard.trim()
  if (action === 'los' || action === 'avfarda') {
    update.resolved_at = nu
    update.resolved_by = admin.email || 'unknown'
  }

  const { data: uppdaterat, error } = await supabase
    .from('raddningsarende')
    .update(update)
    .eq('id', params.id)
    .select('id, business_id')
    .single()

  if (error || !uppdaterat) {
    return NextResponse.json({ error: 'Ärendet hittades inte' }, { status: 404 })
  }

  await logAdminAction(`raddningsarende_${action}`, admin.userId || 'unknown', uppdaterat.business_id, {
    arendeId: uppdaterat.id,
    adminEmail: admin.email,
    atgard: body?.atgard,
  })

  return NextResponse.json({ success: true })
}
