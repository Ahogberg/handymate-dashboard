import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { MANUAL_LAUNCH_PROOFS } from '@/lib/launch/readiness'

export const dynamic = 'force-dynamic'

const GILTIGA_STATIONER = new Set(MANUAL_LAUNCH_PROOFS.map((p) => p.key))

/**
 * POST /api/admin/launch-readiness/bevis — bokför ett lanseringsbevis
 * (Grind B, docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md §5).
 * Body: { station, business_id?, evidence, evidence_url? }.
 */
export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const station = String(body?.station || '').trim()
  const evidence = String(body?.evidence || '').trim()
  const businessId = body?.business_id ? String(body.business_id).trim() : null
  const evidenceUrl = body?.evidence_url ? String(body.evidence_url).trim() : null

  if (!GILTIGA_STATIONER.has(station)) {
    return NextResponse.json({ error: 'Okänd station' }, { status: 400 })
  }
  if (!evidence) {
    return NextResponse.json({ error: 'evidence krävs' }, { status: 400 })
  }

  const supabase = getAdminSupabase()

  const { data: inserted, error } = await supabase
    .from('lanseringsbevis')
    .insert({
      station,
      business_id: businessId,
      evidence,
      evidence_url: evidenceUrl,
      proven_by: admin.email || 'unknown',
    })
    .select('id')
    .single()

  if (error || !inserted) {
    return NextResponse.json({ error: error?.message || 'Kunde inte spara beviset' }, { status: 500 })
  }

  await logAdminAction('lanseringsbevis_skapa', admin.userId || 'unknown', businessId, {
    bevisId: inserted.id,
    station,
    adminEmail: admin.email,
  })

  return NextResponse.json({ success: true, id: inserted.id })
}

/**
 * DELETE /api/admin/launch-readiness/bevis — { id, reason } sätter
 * revoked_at (beviset visas inte längre som pass, men raden behålls som
 * historik).
 */
export async function DELETE(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body?.id || '').trim()
  const reason = String(body?.reason || '').trim()
  if (!id || !reason) {
    return NextResponse.json({ error: 'id och reason krävs' }, { status: 400 })
  }

  const supabase = getAdminSupabase()

  const { data: updated, error } = await supabase
    .from('lanseringsbevis')
    .update({ revoked_at: new Date().toISOString(), revoke_reason: reason })
    .eq('id', id)
    .select('id, station, business_id')
    .single()

  if (error || !updated) {
    return NextResponse.json({ error: 'Beviset hittades inte' }, { status: 404 })
  }

  await logAdminAction('lanseringsbevis_aterkalla', admin.userId || 'unknown', updated.business_id, {
    bevisId: updated.id,
    station: updated.station,
    adminEmail: admin.email,
    reason,
  })

  return NextResponse.json({ success: true })
}
