import { attachMissionFollowups } from '@/lib/followup/mission'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getMissionProgressWithDecisions, type MissionRow } from '@/lib/mission/mission-progress'
import { svDateStr } from '@/lib/dates'
import { resolveGoalType } from '@/lib/mission/goal-type'
import { loadActiveMandateForMission } from '@/lib/mandates/mission-mandate'
import { loadMandateFacit } from '@/lib/mandates/load-mandate-facit'

export const dynamic = 'force-dynamic'

/** Läsande uppdragsbild. Tomt svar betyder verifierat tomt; läsfel är 503.
 * Deadline härleds i svensk tid utan att GET skriver eller gömmer uppdraget.
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
      // select('*') — INTE en explicit kolumnlista: goal_type/goal_hours
      // (sql/v145_mission_capacity_goal.sql) kan saknas som kolumner i
      // miljöer där v145 inte körts, och en explicit lista med dem hade
      // gjort HELA frågan fela (42703) där — vilket hade dolt ett legitimt
      // aktivt PENGAuppdrag bakom fail-softet nedan (regression för Etapp
      // A). '*' returnerar bara de kolumner som faktiskt finns;
      // normaliseringen nedan defaultar resten via resolveGoalType().
      const { data, error } = await supabase
        .from('mission')
        .select('*')
        .eq('business_id', business.business_id)
        .eq('status', 'active')
        .maybeSingle()
      if (error) {
        console.warn('[mission/active] uppslag misslyckades (läsfel):', error.message)
        return NextResponse.json({ error: 'Uppdraget kunde inte läsas. Försök igen.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
      }
      row = (data as MissionRow | null) ?? null
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[mission/active] uppslag kastade (läsfel):', msg)
      return NextResponse.json({ error: 'Uppdraget kunde inte läsas. Försök igen.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
    }

    if (!row) return NextResponse.json({ mission: null }, { headers: { 'Cache-Control': 'no-store' } })

    const mission: MissionRow = {
      ...row,
      goal_kr: row.goal_kr == null ? null : Number(row.goal_kr),
      // Etapp F: fail-soft-normalisering vid läsning — se lib/mission/
      // goal-type.ts. Gäller lika mycket i miljöer där v145 inte körts
      // (kolumnerna saknas helt i raden) som i migrerade miljöer.
      goal_type: resolveGoalType(row.goal_type),
      goal_hours: row.goal_hours == null ? null : Number(row.goal_hours),
    }

    if (mission.deadline.slice(0, 10) < svDateStr()) mission.status = 'expired'

    // Etapp G (expansionspanelen): samma läsning som förut, bara med
    // uppdragets öppna beslut med i svaret — panelen slipper en andra fråga.
    const { progress, decisions, handover } = await getMissionProgressWithDecisions(supabase, mission)

    // Etapp X (Mission Mandates V1, ägarens upplevelse): mandatet kopplat
    // till uppdraget — OAVSETT status (panelen behöver visa pausade/
    // återkallade mandat med rätt orsak, inte bara aktiva) — plus dess
    // mätning (bara beräknad när ett mandat finns). Samma en-fetch-delas-
    // princip som decisions ovan fick i Etapp G; ingen ny lazy-rutt (till
    // skillnad från Etapp H:s historik/lärande, som INTE är knutna till
    // just det aktiva uppdraget på samma sätt).
    const mandate = await loadActiveMandateForMission(supabase, business.business_id, mission.id)
    const mandateFacit = mandate ? await loadMandateFacit(supabase, business.business_id, mandate) : null

    return NextResponse.json({ mission, progress, decisions, mandate, mandateFacit, handover: await attachMissionFollowups(supabase,business.business_id,mission.id,handover) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    console.error('GET /api/mission/active error:', error)
    return NextResponse.json({ error: 'Uppdraget kunde inte läsas. Försök igen.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
