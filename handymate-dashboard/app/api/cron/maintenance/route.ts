import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * GET /api/cron/maintenance
 * Daglig underhållskörning — konsoliderar expire-approvals + sync-phone-webhooks.
 * Körs 03:00 UTC via vercel.json cron.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const results: Record<string, any> = {}

  // Off until legal review and provider disposal have been verified. No new cron.
  try {
    const { sweepCallRetention } = await import('@/lib/voice/retention')
    results.call_retention = await sweepCallRetention(supabase)
  } catch {
    results.call_retention = { error: 'Gallringen kunde inte slutföras' }
  }

  // ── 1. Expire old approvals ────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      // scheduled_review_request ingår: ett obesvarat kort är ett nej,
      // aldrig ett samtycke (punkt 8, 2026-09-02 — se steg 3 nedan).
      .lt('expires_at', new Date().toISOString())
      .select('id')

    if (error) throw error
    results.expired_approvals = data?.length || 0
    console.log(`[maintenance] Expired ${results.expired_approvals} approvals`)
  } catch (err: any) {
    console.error('[maintenance] expire-approvals error:', err.message)
    results.expired_approvals_error = err.message
  }

  // ── 2. Sync 46elks phone webhooks ─────────────────────────
  try {
    const { data: numbers, error } = await supabase
      .from('business_config')
      .select('business_id, business_name, elks_number_id, assigned_phone_number')
      .not('elks_number_id', 'is', null)

    if (error) throw error

    if (!numbers || numbers.length === 0) {
      results.phone_sync = { synced: 0, message: 'No provisioned numbers' }
    } else {
      const elksAuth = 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64')
      const targetSmsUrl = `${APP_URL}/api/sms/incoming`
      const targetVoiceUrl = `${APP_URL}/api/voice/incoming`

      let synced = 0
      for (const biz of numbers) {
        try {
          const res = await fetch(`https://api.46elks.com/a1/numbers/${biz.elks_number_id}`, {
            method: 'POST',
            headers: {
              Authorization: elksAuth,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              sms_url: targetSmsUrl,
              voice_start: targetVoiceUrl,
            }).toString(),
          })
          if (res.ok) synced++
          else console.error(`[maintenance] phone sync FAIL: ${biz.assigned_phone_number}:`, await res.text())
        } catch (err: any) {
          console.error(`[maintenance] phone sync ERROR: ${biz.assigned_phone_number}:`, err.message)
        }
      }

      results.phone_sync = { synced, total: numbers.length }
      console.log(`[maintenance] Phone webhooks: ${synced}/${numbers.length} synced to ${APP_URL}`)
    }
  } catch (err: any) {
    console.error('[maintenance] sync-phone-webhooks error:', err.message)
    results.phone_sync_error = err.message
  }

  // ── 3. Recensionsförfrågningar via tidsutgång — BORTTAGET ────
  //
  // Launch Truth Gate punkt 8 (2026-09-02): det här steget auto-godkände
  // ett OBESVARAT scheduled_review_request-kort när expires_at passerats
  // och skickade SMS + portalmejl till kunden — det enda stället i huset
  // där ett obesvarat kort blev ett kundutskick, utan att
  // review_request_enabled eller agents_globally_paused lästes. Ett
  // obesvarat kort är ett nej: det expirerar i steg 1 som alla andra.
  // Ägaren kan fortfarande godkänna kortet manuellt innan det går ut
  // (app/api/approvals/[id]/route.ts, scheduled_review_request-casen).
  results.reviews_sent = 0

  // ── 4. Jobb igång-svepet (2026-08-10) ──────────────────────────────
  //
  // JOB_STARTED hade ingen händelseproducent: ett offertfött projekt
  // hoppade från Avtal/Möte direkt till Slutbesiktning, och steppern stod
  // stilla mitt i jobbet. Två deterministiska signaler säger att arbetet
  // börjat: en registrerad tidrapport, eller en bekräftad bokning vars
  // starttid passerat. Svepet fångar ALLA tidrapportsvägar (sex insert-
  // ställen) på ett ställe, plus gamla projekt från motorns döda period.
  // Framåt-vakten (advanceProjectStageForward) backar aldrig ett projekt.
  try {
    const { advanceProjectStageForward, SYSTEM_STAGES } = await import('@/lib/project-stages/automation-engine')
    const tidigaSteg = [SYSTEM_STAGES.CONTRACT_SIGNED, SYSTEM_STAGES.MEETING_BOOKED]

    const { data: kandidater, error: kandErr } = await supabase
      .from('project')
      .select('project_id, business_id, current_workflow_stage_id')
      .in('status', ['planning', 'active'])
      .limit(500)
    if (kandErr) throw kandErr

    const tidiga = (kandidater || []).filter(p =>
      p.current_workflow_stage_id === null || tidigaSteg.includes(p.current_workflow_stage_id),
    )

    let jobbIgang = 0
    if (tidiga.length > 0) {
      const ids = tidiga.map(p => p.project_id)
      const nuIso = new Date().toISOString()
      const [teRes, bokRes] = await Promise.all([
        supabase.from('time_entry').select('project_id').in('project_id', ids).limit(2000),
        supabase.from('booking').select('project_id')
          .in('project_id', ids)
          .in('status', ['confirmed', 'completed'])
          .lte('scheduled_start', nuIso)
          .limit(2000),
      ])
      // Fel läses — ett tyst misslyckat uppslag får inte se ut som "inget
      // arbete finns" (lärdomen 2026-08-05).
      if (teRes.error) throw teRes.error
      if (bokRes.error) throw bokRes.error

      const harArbete = new Set([
        ...(teRes.data || []).map(r => r.project_id),
        ...(bokRes.data || []).map(r => r.project_id),
      ])

      for (const p of tidiga) {
        if (!harArbete.has(p.project_id)) continue
        const flytt = await advanceProjectStageForward(p.project_id, SYSTEM_STAGES.JOB_STARTED, p.business_id)
        if (flytt.moved) jobbIgang++
        else if (!flytt.skipped) console.error('[maintenance] Jobb igång-flytt misslyckades:', flytt.error, { projectId: p.project_id })
      }
    }
    results.job_started_moved = jobbIgang
    if (jobbIgang > 0) console.log(`[maintenance] Jobb igång: ${jobbIgang} projekt flyttade`)
  } catch (err: any) {
    console.error('[maintenance] jobb-igång-svepet failade:', err.message)
    results.job_started_error = err.message
  }

  // ── 4b. Startmöte bokat-svepet (Del B, 2026-08-26) ────────────────────
  //
  // Bokningar skapas på tio ställen (rutt, agent-tool, portal, publik
  // bokningssida, godkännandekort …). Bokningsrutten flyttar i realtid via
  // bryggan; det här svepet är skyddsnätet för resten: projekt på null/ps-01
  // med en bekräftad bokning kopplad via booking.project_id → ps-02.
  // Forward-only, non-blocking.
  try {
    const { bumpProjectStage } = await import('@/lib/project-stages/event-bridge')
    const { data: kandidater2, error: kandErr2 } = await supabase
      .from('project')
      .select('project_id, business_id, current_workflow_stage_id')
      .in('status', ['planning', 'active'])
      .limit(500)
    if (kandErr2) throw kandErr2
    const utanMote = (kandidater2 || []).filter(p =>
      p.current_workflow_stage_id === null || p.current_workflow_stage_id === 'ps-01',
    )
    let moteBokat = 0
    if (utanMote.length > 0) {
      const ids = utanMote.map(p => p.project_id)
      const { data: bokningar, error: bokErr2 } = await supabase
        .from('booking')
        .select('project_id, scheduled_start')
        .in('project_id', ids)
        .in('status', ['confirmed', 'completed'])
        .order('scheduled_start', { ascending: true })
        .limit(2000)
      if (bokErr2) throw bokErr2
      const forstaBokning = new Map<string, string>()
      for (const b of bokningar || []) if (b.project_id && !forstaBokning.has(b.project_id)) forstaBokning.set(b.project_id, b.scheduled_start)
      for (const p of utanMote) {
        const start = forstaBokning.get(p.project_id)
        if (!start) continue
        const r = await bumpProjectStage(p.business_id, { projectId: p.project_id }, 'booking_created', { startDateHint: start })
        if (r.moved) moteBokat++
      }
    }
    results.meeting_booked_moved = moteBokat
    if (moteBokat > 0) console.log(`[maintenance] Startmöte bokat: ${moteBokat} projekt flyttade`)
  } catch (err: any) {
    console.error('[maintenance] startmöte-svepet failade:', err.message)
    results.meeting_booked_error = err.message
  }

  // ── 5. OperatingExperiment-redovisning (Etapp 2, 2026-08-19) ───────
  //
  // Rider på den här BEFINTLIGA dagliga cronen — ingen ny vercel.json-rad
  // (den kända fallgropen, se CLAUDE.md). Fail-soft mot v157 (42P01, ej
  // körd ännu): sweepExperimentReadouts degraderar internt till en no-op,
  // ingen särskild grind behövs här. Pausade agenter hoppas över, samma
  // spärr som playbook-cronen.
  try {
    const { sweepExperimentReadouts } = await import('@/lib/experiment/report')
    const { data: expBizRows, error: expBizErr } = await supabase
      .from('business_config')
      .select('business_id, agents_globally_paused')
    if (expBizErr) throw expBizErr

    let readoutsCreated = 0
    for (const biz of expBizRows || []) {
      if (biz.agents_globally_paused) continue
      try {
        const r = await sweepExperimentReadouts(supabase, biz.business_id as string)
        readoutsCreated += r.created
      } catch (err: any) {
        console.error(`[maintenance] experiment-redovisning ${biz.business_id}:`, err?.message || err)
      }
    }
    results.experiment_readouts_created = readoutsCreated
    if (readoutsCreated > 0) console.log(`[maintenance] Försöksredovisningar: ${readoutsCreated} skapade`)
  } catch (err: any) {
    console.error('[maintenance] experiment-redovisningssvepet failade:', err.message)
    results.experiment_readouts_error = err.message
  }

  return NextResponse.json({ ok: true, ...results })
}
