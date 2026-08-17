import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getMissionProgress, type MissionRow } from '@/lib/mission/mission-progress'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mission/active — det (högst) ena aktiva uppdraget + härledd
 * progress (Goal-to-Plan V1, Etapp A).
 *
 * Fail-soft hela vägen: mission-tabellen körs manuellt (sql/v144_mission.sql)
 * och kan saknas i produktion — då, och vid varje annat läsfel, svarar
 * rutten { mission: null } med en loggad varning. Ytan (Etapp C) renderar
 * förslagsläget; ingen användare möter ett 500 för att en tabell inte
 * hunnit skapas.
 *
 * 'expired' sätts LÄTTJEFULLT här vid läsning när deadline passerats
 * (ingen cron — Hobby-planens crongräns, och läsningen är sanningen).
 * Uppdateringen är best effort: felar den svarar vi ändå med det härledda
 * expired-läget.
 *
 * Rollgrind som value/ledger (Etapp D-härdning): pengamål + verifierat
 * betalt är samma finansiella känslighet — ägare/admin
 * (tests/permission-contract.spec.ts). Klienten degraderar tyst på 403
 * (MissionProvider sätter mission: null, ingen retry).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    let row: MissionRow | null = null
    try {
      const { data, error } = await supabase
        .from('mission')
        .select('id, business_id, goal_kr, deadline, status, plan_snapshot, portfolio_generated_at, created_at, resolved_at')
        .eq('business_id', business.business_id)
        .eq('status', 'active')
        .maybeSingle()
      if (error) {
        console.warn('[mission/active] uppslag misslyckades (svarar mission: null):', error.message)
        return NextResponse.json({ mission: null })
      }
      row = (data as MissionRow | null) ?? null
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[mission/active] uppslag kastade (svarar mission: null):', msg)
      return NextResponse.json({ mission: null })
    }

    if (!row) return NextResponse.json({ mission: null })

    const mission: MissionRow = { ...row, goal_kr: Number(row.goal_kr) }

    // Lättjefull utgång: deadline passerad → märk som expired (best effort).
    const idag = new Date().toISOString().slice(0, 10)
    if (mission.deadline.slice(0, 10) < idag) {
      const resolvedAt = new Date().toISOString()
      try {
        await supabase
          .from('mission')
          .update({ status: 'expired', resolved_at: resolvedAt })
          .eq('id', mission.id)
          .eq('business_id', business.business_id)
          .eq('status', 'active')
      } catch {
        // Best effort — det härledda läget nedan är ändå sanningen.
      }
      mission.status = 'expired'
      mission.resolved_at = resolvedAt
    }

    const progress = await getMissionProgress(supabase, mission)
    return NextResponse.json({ mission, progress })
  } catch (error: any) {
    console.error('GET /api/mission/active error:', error)
    return NextResponse.json({ mission: null })
  }
}
