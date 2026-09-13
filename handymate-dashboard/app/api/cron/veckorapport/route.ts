import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { hamtaKontonMedAktivtTeam } from '@/lib/billing/aktiva-konton'
import { getWeeklyValue } from '@/lib/weekly-value'
import { byggVeckorapportSms, harVeckobevis, isoVeckaNyckel } from '@/lib/rapport/veckorapport'
import { sendSmsViaElks } from '@/lib/sms-send'
import { arTystTid } from '@/lib/notifications/tyst-tid'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type VeckoClaimState = 'claimed' | 'delivered' | 'retryable' | 'unknown'

function claimId(businessId: string, vecka: string): string {
  return `veckorapport:${businessId}:${vecka}`
}

function nyttForsok(): string {
  return crypto.randomUUID()
}

const DEFINITIVA_PROVIDERAVSLAG = new Set([
  400, 401, 402, 403, 404, 405, 406, 407,
  410, 411, 412, 413, 414, 415, 416, 417,
  422, 423, 424, 426, 428, 429, 431, 451,
])

function arBevisatUteblivet(r: { success: boolean; blockedReason?: string; status?: number | null; elksId?: string }): boolean {
  if (r.success || r.elksId) return false
  return Boolean(r.blockedReason) || (r.status != null && DEFINITIVA_PROVIDERAVSLAG.has(r.status))
}

async function reserveraVeckorapport(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  vecka: string,
): Promise<{ ok: true; attempt: string } | { ok: false; reason: 'dedupe' | 'osaker' | 'fel' }> {
  const id = claimId(businessId, vecka)
  const attempt = nyttForsok()
  const metadata = { vecka, claim: true, state: 'claimed' satisfies VeckoClaimState, attempt }
  const { error: insertErr } = await supabase.from('automation_activity').insert({
    id,
    business_id: businessId,
    automation_type: 'veckorapport_claim',
    action: 'claimed',
    description: null,
    metadata,
    status: 'skipped',
  })
  if (!insertErr) return { ok: true, attempt }
  if (insertErr.code !== '23505') {
    console.error('[cron/veckorapport] kunde inte reservera utskick:', insertErr.message, { businessId })
    return { ok: false, reason: 'fel' }
  }

  const { data: befintlig, error: readErr } = await supabase
    .from('automation_activity')
    .select('metadata')
    .eq('id', id)
    .eq('business_id', businessId)
    .maybeSingle()
  if (readErr || !befintlig) {
    console.error('[cron/veckorapport] kunde inte läsa befintlig reservation:', readErr?.message || 'saknas', { businessId })
    return { ok: false, reason: 'fel' }
  }
  const old = (befintlig.metadata || {}) as { state?: VeckoClaimState; attempt?: string }
  if (old.state !== 'retryable' || !old.attempt) {
    return { ok: false, reason: old.state === 'unknown' ? 'osaker' : 'dedupe' }
  }

  // CAS: bara en samtidig retry får byta det föregående försökets token.
  const { data: claimed, error: claimErr } = await supabase
    .from('automation_activity')
    .update({ action: 'claimed', metadata })
    .eq('id', id)
    .eq('business_id', businessId)
    .contains('metadata', { state: 'retryable', attempt: old.attempt })
    .select('id')
  if (claimErr) {
    console.error('[cron/veckorapport] retry-reservation misslyckades:', claimErr.message, { businessId })
    return { ok: false, reason: 'fel' }
  }
  return (claimed || []).length === 1
    ? { ok: true, attempt }
    : { ok: false, reason: 'dedupe' }
}

async function slutforReservation(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  vecka: string,
  attempt: string,
  state: Exclude<VeckoClaimState, 'claimed'>,
  evidence: { elksId?: string; smsId?: string } = {},
): Promise<boolean> {
  const { data, error } = await supabase
    .from('automation_activity')
    .update({
      action: state,
      metadata: { vecka, claim: true, state, attempt, elks_id: evidence.elksId || null, sms_id: evidence.smsId || null },
    })
    .eq('id', claimId(businessId, vecka))
    .eq('business_id', businessId)
    .contains('metadata', { state: 'claimed', attempt })
    .select('id')
  if (error || (data || []).length !== 1) {
    console.error('[cron/veckorapport] reservationens slutstatus kunde inte sparas:', error?.message || 'stale claim', { businessId, state })
    return false
  }
  return true
}

/**
 * GET /api/cron/veckorapport
 *
 * Pass C, del 1 (docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 6 —
 * "en anställd som rapporterar"): fredag eftermiddag, ett SMS per aktivt
 * konto med veckans bevis ur `getWeeklyValue` — innehållet finns redan, det
 * här är bara utskicket. Samma dedupe/paus-mönster som Pass B
 * (app/api/cron/kort-gar-ut/route.ts): en rad per konto och ISO-vecka i
 * automation_activity, `agents_globally_paused` gör kontot tyst.
 *
 * automation_activity-raden är BÅDE dedupe-nyckeln och den rad som gör
 * veckorapporten synlig i "Skött utan dig" — samma tabell digest-typerna i
 * lib/approvals/kortkanal.ts redan skriver till (Pass B, del 3).
 *
 * Ett misslyckat 46elks-utskick skrivs som status='failed' — det tabellen
 * driftlarm-cronen redan sveper (app/api/cron/driftlarm/route.ts, svepet
 * "4. automation_activity") — så ett tomt 46elks-saldo eller en trasig
 * sändning syns i driftlarmet, aldrig som "skickat". sendSmsViaElks
 * rapporterar dessutom LEVERANTÖRSFEL som är vår sak (klassaElksFel) till
 * samma driftlarm redan innan den här raden ens skrivs (lib/sms-send.ts).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = new Date()

  // Fredag 16:00 svensk tid är dagtid, men filens egen regel gäller ändå:
  // hellre tyst än att väcka någon 21:00–07:00 om cronen någon gång körs om.
  if (arTystTid(now)) {
    return NextResponse.json({ ok: true, skipped: 'tyst_tid' })
  }

  const konton = await hamtaKontonMedAktivtTeam(supabase)
  if (konton.length === 0) {
    return NextResponse.json({ ok: true, konton: 0, resultat: [] })
  }
  const ids = konton.map(k => k.business_id)
  const veckaNyckel = isoVeckaNyckel(now)

  const { data: bizRows, error: bizErr } = await supabase
    .from('business_config')
    .select('business_id, business_name, phone_number, agents_globally_paused')
    .in('business_id', ids)
  if (bizErr) {
    console.error('[cron/veckorapport] business_config-uppslag misslyckades:', bizErr.message)
    return NextResponse.json({ error: 'Kunde inte verifiera företagsinställningar' }, { status: 500 })
  }
  const bizById = new Map((bizRows || []).map(r => [r.business_id as string, r]))

  // Väntande kort per konto — en enda batch-fråga, samma mönster som
  // kort-gar-ut grupperar utgående kort.
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('pending_approvals')
    .select('business_id')
    .eq('status', 'pending')
    .in('business_id', ids)
  if (pendingErr) {
    console.error('[cron/veckorapport] pending_approvals-uppslag misslyckades:', pendingErr.message)
    return NextResponse.json({ error: 'Kunde inte läsa väntande beslut' }, { status: 500 })
  }
  const vantandePerKonto = new Map<string, number>()
  for (const rad of pendingRows || []) {
    vantandePerKonto.set(rad.business_id, (vantandePerKonto.get(rad.business_id) || 0) + 1)
  }

  const resultat: Array<{ business_id: string; utfall: string }> = []

  for (const businessId of ids) {
    const biz = bizById.get(businessId)

    if (!biz) {
      resultat.push({ business_id: businessId, utfall: 'konfiguration_saknas' })
      continue
    }

    if (biz?.agents_globally_paused === true) {
      resultat.push({ business_id: businessId, utfall: 'pausad' })
      continue
    }

    // Legacy-dedupe för levererade rader från före den atomiska reservationen.
    // Läsfel blockerar: ett ägarutskick får inte dubbelskickas när state är okänd.
    //
    // `.contains('metadata', { vecka: … })` i stället för
    // `.eq('metadata->>vecka', …)` — samma JSONB-innehållsfråga (@>) som
    // getWeeklyValue redan använder på `context` i lib/weekly-value.ts,
    // och den håller sig till en riktig kolumn (`metadata`) i stället för
    // ett `->>`-uttryck som tests/column-contract.spec.ts kolumnparser inte
    // känner igen för filtermetoder (bara i select-strängar).
    try {
      const { data: befintlig, error: dedupeErr } = await supabase
        .from('automation_activity')
        .select('id, status, description, metadata')
        .eq('business_id', businessId)
        .eq('automation_type', 'veckorapport')
        .contains('metadata', { vecka: veckaNyckel })
        .limit(20)
      if (dedupeErr) {
        console.error('[cron/veckorapport] dedupe-uppslag misslyckades:', dedupeErr.message, { businessId })
        resultat.push({ business_id: businessId, utfall: 'dedupe_fel' })
        continue
      }
      const legacy = befintlig || []
      if (legacy.length >= 20) {
        resultat.push({ business_id: businessId, utfall: 'legacy_fel_kraver_avstamning' })
        continue
      }
      if (legacy.some(rad => rad.status === 'success')) {
        resultat.push({ business_id: businessId, utfall: 'dedupe' })
        continue
      }
      // Äldre failed-rader saknar claim-/providerstate. De kan vara timeout
      // eller förlorat svar och får därför inte implicit omsändas.
      if (legacy.some(rad => rad.status === 'failed' && !(rad.metadata as { attempt?: string } | null)?.attempt)) {
        resultat.push({ business_id: businessId, utfall: 'legacy_fel_kraver_avstamning' })
        continue
      }
    } catch (err) {
      console.error('[cron/veckorapport] dedupe-uppslaget kastade:', err, { businessId })
      resultat.push({ business_id: businessId, utfall: 'dedupe_fel' })
      continue
    }

    const vantandeKort = vantandePerKonto.get(businessId) || 0

    let v
    try {
      v = await getWeeklyValue(supabase, businessId, 7, { failOnReadError: true })
    } catch (err: any) {
      console.error('[cron/veckorapport] getWeeklyValue kastade:', err?.message || err, { businessId })
      resultat.push({ business_id: businessId, utfall: 'fel' })
      continue
    }

    // Noll bevisrader OCH noll väntande kort ⇒ skicka inget. Tystnad är
    // ärligare än "inget hände" — och ingen rad i automation_activity heller,
    // en tom vecka ska inte se ut som en registrerad händelse.
    if (!harVeckobevis(v) && vantandeKort === 0) {
      resultat.push({ business_id: businessId, utfall: 'inget_att_rapportera' })
      continue
    }

    // Ägarens eget nummer — ALDRIG en kund. Samma fält och samma
    // recipient/purpose-par som app/api/cron/monthly-review/route.ts.
    const smsTo = biz?.phone_number
    if (!smsTo) {
      resultat.push({ business_id: businessId, utfall: 'ingen_telefon' })
      continue
    }

    const text = byggVeckorapportSms(v, vantandeKort)
    const reservation = await reserveraVeckorapport(supabase, businessId, veckaNyckel)
    if (!reservation.ok) {
      resultat.push({ business_id: businessId, utfall: reservation.reason === 'osaker' ? 'leverans_osaker' : reservation.reason === 'fel' ? 'reservationsfel' : 'dedupe' })
      continue
    }
    const r = await sendSmsViaElks({
      supabase,
      businessId,
      businessName: biz?.business_name,
      to: smsTo,
      message: text,
      messageType: 'veckorapport',
      recipient: 'internal',
      purpose: 'internal',
    })

    // Bara ett bevisat uteblivet utskick får öppnas för retry. Nätverksfel,
    // timeout eller förlorat providersvar lämnas `unknown` och spärrar omsändning.
    const verifieradLeverans = r.success && Boolean(r.elksId)
    const leveransState: Exclude<VeckoClaimState, 'claimed'> = verifieradLeverans
      ? 'delivered'
      : arBevisatUteblivet(r)
        ? 'retryable'
        : 'unknown'
    await slutforReservation(supabase, businessId, veckaNyckel, reservation.attempt, leveransState, {
      elksId: r.elksId,
      smsId: r.smsId,
    })

    const { error: actErr } = await supabase.from('automation_activity').insert({
      business_id: businessId,
      automation_type: 'veckorapport',
      action: verifieradLeverans ? 'sent' : leveransState === 'unknown' ? 'unknown' : 'failed',
      description: verifieradLeverans ? text : leveransState === 'unknown'
        ? `Veckorapportens leverans är osäker och får inte skickas om utan avstämning: ${r.error || 'providersvar utan leverans-id'}`
        : `Veckorapportens SMS misslyckades: ${r.error || 'okänt fel'}`,
      metadata: {
        vecka: veckaNyckel,
        confirmed_kr: v.confirmed_kr,
        vantande_kort: vantandeKort,
        attempt: reservation.attempt,
        elks_id: r.elksId || null,
        sms_id: r.smsId || null,
      },
      // automation_activity.status har en CHECK-kolumn (sql/
      // automation_center.sql): 'success' | 'failed' | 'skipped'. Ett
      // misslyckat SMS ska synas som 'failed' — det är precis det
      // driftlarm-svepet letar efter, aldrig tystas ner till 'success'.
      status: verifieradLeverans ? 'success' : 'failed',
    })
    if (actErr) {
      console.error('[cron/veckorapport] automation_activity-insert misslyckades:', actErr.message, { businessId })
    }
    if (!verifieradLeverans) {
      console.error('[cron/veckorapport] SMS misslyckades:', r.error, { businessId })
    }

    resultat.push({ business_id: businessId, utfall: verifieradLeverans ? 'skickad' : leveransState === 'unknown' ? 'leverans_osaker' : 'misslyckad' })
  }

  return NextResponse.json({ ok: true, konton: ids.length, vecka: veckaNyckel, resultat })
}
