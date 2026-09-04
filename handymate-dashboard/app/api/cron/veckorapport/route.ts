import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { hamtaKontonMedAktivtTeam } from '@/lib/billing/aktiva-konton'
import { getWeeklyValue } from '@/lib/weekly-value'
import { byggVeckorapportSms, harVeckobevis, isoVeckaNyckel } from '@/lib/rapport/veckorapport'
import { sendSmsViaElks } from '@/lib/sms-send'
import { arTystTid } from '@/lib/notifications/tyst-tid'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

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
  if (bizErr) console.error('[cron/veckorapport] business_config-uppslag misslyckades (fortsätter utan telefon/pausflagga):', bizErr.message)
  const bizById = new Map((bizRows || []).map(r => [r.business_id as string, r]))

  // Väntande kort per konto — en enda batch-fråga, samma mönster som
  // kort-gar-ut grupperar utgående kort.
  const { data: pendingRows, error: pendingErr } = await supabase
    .from('pending_approvals')
    .select('business_id')
    .eq('status', 'pending')
    .in('business_id', ids)
  if (pendingErr) console.error('[cron/veckorapport] pending_approvals-uppslag misslyckades (räknar 0 väntande):', pendingErr.message)
  const vantandePerKonto = new Map<string, number>()
  for (const rad of pendingRows || []) {
    vantandePerKonto.set(rad.business_id, (vantandePerKonto.get(rad.business_id) || 0) + 1)
  }

  const resultat: Array<{ business_id: string; utfall: string }> = []

  for (const businessId of ids) {
    const biz = bizById.get(businessId)

    if (biz?.agents_globally_paused === true) {
      resultat.push({ business_id: businessId, utfall: 'pausad' })
      continue
    }

    // Dedupe: EN rad per konto och ISO-vecka i automation_activity. Fail-
    // open (samma kontrakt som push-dispatch-log/nyligenSkickad) — en trasig
    // dedupe-fråga får aldrig blockera rapporten, bara riskera en dubblett.
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
        .select('id')
        .eq('business_id', businessId)
        .eq('automation_type', 'veckorapport')
        .contains('metadata', { vecka: veckaNyckel })
        .limit(1)
      if (dedupeErr && !arSchemaSaknas(dedupeErr)) {
        console.warn('[cron/veckorapport] dedupe-uppslag misslyckades (fortsätter ändå):', dedupeErr.message, { businessId })
      }
      if ((befintlig || []).length > 0) {
        resultat.push({ business_id: businessId, utfall: 'dedupe' })
        continue
      }
    } catch (err) {
      console.warn('[cron/veckorapport] dedupe-uppslaget kastade (fortsätter ändå):', err, { businessId })
    }

    const vantandeKort = vantandePerKonto.get(businessId) || 0

    let v
    try {
      v = await getWeeklyValue(supabase, businessId, 7)
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

    const { error: actErr } = await supabase.from('automation_activity').insert({
      business_id: businessId,
      automation_type: 'veckorapport',
      action: r.success ? 'sent' : 'failed',
      description: r.success ? text : `Veckorapportens SMS misslyckades: ${r.error || 'okänt fel'}`,
      metadata: { vecka: veckaNyckel, confirmed_kr: v.confirmed_kr, vantande_kort: vantandeKort },
      // automation_activity.status har en CHECK-kolumn (sql/
      // automation_center.sql): 'success' | 'failed' | 'skipped'. Ett
      // misslyckat SMS ska synas som 'failed' — det är precis det
      // driftlarm-svepet letar efter, aldrig tystas ner till 'success'.
      status: r.success ? 'success' : 'failed',
    })
    if (actErr) {
      console.error('[cron/veckorapport] automation_activity-insert misslyckades:', actErr.message, { businessId })
    }
    if (!r.success) {
      console.error('[cron/veckorapport] SMS misslyckades:', r.error, { businessId })
    }

    resultat.push({ business_id: businessId, utfall: r.success ? 'skickad' : 'misslyckad' })
  }

  return NextResponse.json({ ok: true, konton: ids.length, vecka: veckaNyckel, resultat })
}
