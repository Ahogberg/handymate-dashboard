import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { computePlanHash } from '@/lib/mandates/mission-mandate'
import { deriveMandateCandidates, validateMandateCreateInput, type MandateCreateInput } from '@/lib/mandates/create'
import type { ValidatedMissionStep } from '@/lib/mission/plan-validation'

export const dynamic = 'force-dynamic'

/**
 * POST /api/mission/[id]/mandate — mandatskapande ÄR en ägar-UI-handling,
 * ALDRIG ett chattverktyg (Mission Mandates V1, Etapp X, tasks/jaunty-
 * pondering-hummingbird.md; källskanning: tests/mission-mandate-route.spec.ts).
 * Matte kan aldrig skapa ett mandat — ingen tool-definition/router-case
 * finns eller får läggas till för detta.
 *
 * Body: { allowed_action_types, targets, daily_cap, total_cap,
 * amount_cap_kr?, expires_at }. `targets` är ägarens VAL bland planens redan
 * namngivna mål (lib/mandates/create.ts:deriveMandateCandidates) — aldrig
 * fritext, aldrig en ny mottagare.
 *
 * ═══ SERVERN RÄKNAR OM, LITAR ALDRIG PÅ KLIENTEN ═══
 *
 * plan_hash beräknas här ur uppdragets AKTUELLA plan_snapshot (samma
 * fingerprint-prejudikat som lib/mandates/mission-mandate.ts:computePlanHash)
 * — inte ur något klienten skickar. Kandidatlistan (vilka typer/mål som ens
 * KAN väljas) härleds likaså här om, och validateMandateCreateInput vägrar
 * varje typ/mål utanför den. created_by kommer ALLTID från
 * getCurrentUser(request)-kontexten.
 *
 * ═══ ETT MANDAT PER UPPDRAG (upsert-refuse) ═══
 *
 * id = mnd_<missionId> (deterministiskt, invmf-mönstret — mandate_one_per_
 * mission i sql/v150). Ett befintligt mandat som fortfarande GÄLLER (active,
 * eller paused av annan orsak än plan_changed) blockerar med 409 — ägaren
 * återkallar det gamla explicit innan ett nytt kan ges. Ett mandat som är
 * revoked, eller paused MED orsaken plan_changed (den gamla planen är död,
 * ett nytt mandat är den enda vägen framåt), ersätts av upserten.
 *
 * ═══ FAIL-SOFT PÅ SAKNAT SCHEMA ═══
 *
 * sql/v150 körs manuellt och kan saknas i vissa miljöer — 42P01 ⇒ 503 med
 * ett svenskt meddelande, aldrig ett 500 eller ett kastat fel.
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    const { data: missionRow, error: missionErr } = await supabase
      .from('mission')
      .select('id, deadline, plan_snapshot')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .eq('status', 'active')
      .maybeSingle()
    if (missionErr) {
      console.warn('[mission/mandate] mission-uppslag misslyckades:', missionErr.message)
      return NextResponse.json({ error: 'Uppdraget hittades inte' }, { status: 404 })
    }
    if (!missionRow) {
      return NextResponse.json({ error: 'Uppdraget hittades inte eller är inte aktivt' }, { status: 404 })
    }

    const steps: ValidatedMissionStep[] = Array.isArray((missionRow as any).plan_snapshot?.steps)
      ? ((missionRow as any).plan_snapshot.steps as ValidatedMissionStep[])
      : []
    const candidates = deriveMandateCandidates(steps)

    const body = (await request.json().catch(() => null)) as MandateCreateInput | null
    if (!body) return NextResponse.json({ error: 'Ogiltig förfrågan' }, { status: 400 })

    const validated = validateMandateCreateInput(body, candidates, (missionRow as any).deadline)
    if (!validated.ok) {
      return NextResponse.json({ error: validated.detail, reason: validated.reason }, { status: 400 })
    }

    const mandateId = `mnd_${missionRow.id}`
    const { data: existing, error: existingErr } = await supabase
      .from('mission_mandate')
      .select('id, status, pause_reason')
      .eq('id', mandateId)
      .maybeSingle()
    if (existingErr) {
      if ((existingErr as { code?: string }).code === '42P01') {
        return NextResponse.json({ error: 'Mandatfunktionen är inte påslagen ännu' }, { status: 503 })
      }
      console.warn('[mission/mandate] kunde inte kontrollera befintligt mandat:', existingErr.message)
      return NextResponse.json({ error: 'Kunde inte kontrollera befintligt mandat' }, { status: 500 })
    }

    const blocking =
      !!existing &&
      (existing.status === 'active' || (existing.status === 'paused' && existing.pause_reason !== 'plan_changed'))
    if (blocking) {
      return NextResponse.json({ error: 'Ett mandat finns redan' }, { status: 409 })
    }

    const planHash = computePlanHash(steps)
    const row = {
      id: mandateId,
      business_id: business.business_id,
      mission_id: missionRow.id,
      plan_hash: planHash,
      allowed_action_types: validated.row.allowed_action_types,
      targets: validated.row.targets,
      daily_cap: validated.row.daily_cap,
      total_cap: validated.row.total_cap,
      amount_cap_kr: validated.row.amount_cap_kr,
      expires_at: validated.row.expires_at,
      status: 'active',
      pause_reason: null,
      created_by: currentUser.id,
      revoked_at: null,
      paused_at: null,
    }

    const { data: mandate, error: upsertErr } = await supabase
      .from('mission_mandate')
      .upsert(row, { onConflict: 'id' })
      .select('*')
      .single()

    if (upsertErr) {
      if ((upsertErr as { code?: string }).code === '42P01') {
        return NextResponse.json({ error: 'Mandatfunktionen är inte påslagen ännu' }, { status: 503 })
      }
      console.error('[mission/mandate] kunde inte skapa mandatet:', upsertErr.message)
      return NextResponse.json({ error: 'Kunde inte skapa mandatet' }, { status: 500 })
    }

    return NextResponse.json({ mandate })
  } catch (error: any) {
    console.error('POST /api/mission/[id]/mandate error:', error)
    return NextResponse.json({ error: 'Kunde inte skapa mandatet' }, { status: 500 })
  }
}

/**
 * PATCH /api/mission/[id]/mandate — { action: 'revoke' | 'resume' }.
 *
 * `revoke`: alltid tillåtet från active/paused (Codex-regeln: "kan alltid
 * återkallas"). `resume`: bara från paused, och ALDRIG när
 * pause_reason==='plan_changed' — den gamla planens gränser gäller inte
 * längre, ägaren måste ge ett NYTT mandat (POST ovan, som accepterar en
 * upsert över just den här kombinationen).
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const action = body?.action
    if (action !== 'revoke' && action !== 'resume') {
      return NextResponse.json({ error: 'Ogiltig åtgärd — ange revoke eller resume' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const mandateId = `mnd_${params.id}`

    if (action === 'revoke') {
      const { data, error } = await supabase
        .from('mission_mandate')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), paused_at: null })
        .eq('id', mandateId)
        .eq('business_id', business.business_id)
        .in('status', ['active', 'paused'])
        .select('id, status, revoked_at')
        .maybeSingle()
      if (error) {
        if ((error as { code?: string }).code === '42P01') {
          return NextResponse.json({ error: 'Mandatfunktionen är inte påslagen ännu' }, { status: 503 })
        }
        console.warn('[mission/mandate] kunde inte återkalla mandatet:', error.message)
        return NextResponse.json({ error: 'Kunde inte återkalla mandatet' }, { status: 500 })
      }
      if (!data) return NextResponse.json({ error: 'Inget aktivt eller pausat mandat att återkalla' }, { status: 404 })
      return NextResponse.json({ mandate: data })
    }

    // action === 'resume'
    const { data: current, error: readErr } = await supabase
      .from('mission_mandate')
      .select('id, status, pause_reason')
      .eq('id', mandateId)
      .eq('business_id', business.business_id)
      .maybeSingle()
    if (readErr) {
      if ((readErr as { code?: string }).code === '42P01') {
        return NextResponse.json({ error: 'Mandatfunktionen är inte påslagen ännu' }, { status: 503 })
      }
      console.warn('[mission/mandate] kunde inte läsa mandatet:', readErr.message)
      return NextResponse.json({ error: 'Kunde inte läsa mandatet' }, { status: 500 })
    }
    if (!current || current.status !== 'paused') {
      return NextResponse.json({ error: 'Inget pausat mandat att starta om' }, { status: 404 })
    }
    if (current.pause_reason === 'plan_changed') {
      return NextResponse.json(
        { error: 'Planen ändrades sedan mandatet gavs — skapa ett nytt mandat i stället för att starta om det gamla' },
        { status: 409 },
      )
    }

    const { data, error } = await supabase
      .from('mission_mandate')
      .update({ status: 'active', pause_reason: null, paused_at: null })
      .eq('id', mandateId)
      .eq('business_id', business.business_id)
      .eq('status', 'paused')
      .select('id, status')
      .maybeSingle()
    if (error) {
      console.warn('[mission/mandate] kunde inte starta om mandatet:', error.message)
      return NextResponse.json({ error: 'Kunde inte starta om mandatet' }, { status: 500 })
    }
    if (!data) return NextResponse.json({ error: 'Inget pausat mandat att starta om' }, { status: 404 })
    return NextResponse.json({ mandate: data })
  } catch (error: any) {
    console.error('PATCH /api/mission/[id]/mandate error:', error)
    return NextResponse.json({ error: 'Kunde inte uppdatera mandatet' }, { status: 500 })
  }
}
