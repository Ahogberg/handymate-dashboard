import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { shouldMuteAfterDecision } from '@/lib/reservations/match'

/**
 * POST /api/reservations/decisions
 * Body: { decisions: [{ reservation_id, decision: 'accepted' | 'rejected' }] }
 *
 * Inlärningen: en reservation som avvisats tre gånger i rad slutar föreslås.
 * Accept nollställer räknaren — en reservation som används ibland ska aldrig
 * försvinna för att den avvisats tre gånger utspritt över ett år.
 *
 * Anropas fire-and-forget från granskningsvyn. Svaret säger vilka som tystades
 * så editorn kan visa "Okej — jag slutar föreslå …" med en Ångra-knapp.
 *
 * Räknare i stället för en händelselogg: ingen ny tabell, ingen fråga om hur
 * länge vi sparar hantverkarens beteendedata.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const decisions: Array<{ reservation_id: string; decision: 'accepted' | 'rejected' }> =
      Array.isArray(body.decisions) ? body.decisions : []
    if (decisions.length === 0) return NextResponse.json({ success: true, muted: [] })

    const supabase = getServerSupabase()
    const ids = decisions.map(d => d.reservation_id).filter(Boolean)

    const { data: rows, error } = await supabase
      .from('reservation_texts')
      .select('id, times_suggested, times_accepted, consecutive_rejects')
      .eq('business_id', business.business_id)
      .in('id', ids)

    if (error) {
      // Inlärningen är en bekvämlighet — den får aldrig fälla flödet som
      // faktiskt lägger reservationer på offerten.
      console.warn('[reservations/decisions] uppslag misslyckades:', error.message)
      return NextResponse.json({ success: true, muted: [] })
    }

    const byId = new Map((rows || []).map(r => [r.id, r]))
    const muted: string[] = []

    for (const decision of decisions) {
      const row = byId.get(decision.reservation_id)
      if (!row) continue

      const accepted = decision.decision === 'accepted'
      const willMute = shouldMuteAfterDecision(row.consecutive_rejects || 0, decision.decision)

      const updates: Record<string, unknown> = {
        times_suggested: (row.times_suggested || 0) + 1,
        times_accepted: (row.times_accepted || 0) + (accepted ? 1 : 0),
        consecutive_rejects: accepted ? 0 : (row.consecutive_rejects || 0) + 1,
        updated_at: new Date().toISOString(),
      }
      if (willMute) updates.suggest_enabled = false

      const { error: updErr } = await supabase
        .from('reservation_texts')
        .update(updates)
        .eq('id', decision.reservation_id)
        .eq('business_id', business.business_id)

      if (updErr) {
        console.warn('[reservations/decisions] uppdatering misslyckades:', decision.reservation_id, updErr.message)
        continue
      }
      if (willMute) muted.push(decision.reservation_id)
    }

    return NextResponse.json({ success: true, muted })
  } catch (error: any) {
    console.error('POST reservations/decisions error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
