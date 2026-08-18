import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

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

  // ── 1. Expire old approvals ────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .neq('approval_type', 'scheduled_review_request') // Hanteras i steg 3
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

  // ── 3. Skicka schemalagda recensionsförfrågningar ────────────
  try {
    const { data: dueReviews } = await supabase
      .from('pending_approvals')
      .select('id, business_id, payload')
      .eq('approval_type', 'scheduled_review_request')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    // Pre-fetch assigned_phone_number för alla berörda företag
    const reviewBizIds = Array.from(new Set((dueReviews || []).map((r: any) => r.business_id as string)))
    const reviewPhoneMap = new Map<string, string | null>()
    if (reviewBizIds.length > 0) {
      const { data: bizPhones } = await supabase
        .from('business_config')
        .select('business_id, assigned_phone_number')
        .in('business_id', reviewBizIds)
      for (const b of bizPhones || []) {
        reviewPhoneMap.set(b.business_id, b.assigned_phone_number)
      }
    }

    let reviewsSent = 0
    for (const review of dueReviews || []) {
      const p = review.payload as any
      if (!p?.customer_phone || !p?.google_review_url) {
        await supabase.from('pending_approvals').update({ status: 'expired' }).eq('id', review.id)
        continue
      }

      try {
        const firstName = (p.customer_name || '').split(' ')[0]
        const bizName = p.business_name || 'Handymate'
        const suffix = buildSmsSuffix(bizName, reviewPhoneMap.get(review.business_id))

        // Portal-länk istället för extern Google-URL — kunden landar i sin kundportal
        const { getOrCreatePortalLink } = await import('@/lib/portal-link')
        const portalUrl = p.customer_id
          ? await getOrCreatePortalLink(supabase, p.customer_id, 'review')
          : null
        const reviewLink = portalUrl || p.google_review_url

        // ═══ GENOM STRYPUNKTEN (etapp 0 batch 3, 2026-08-08) ═══
        //
        // Den ENDA av de tre cron-vägarna som går till en KUND — alltså den
        // enda där opt-out ska gälla, och den gällde inte. En kund som svarat
        // STOPP fick ändå en förfrågan om att lämna recension.
        //
        // Meddelandet innehåller dessutom ett långt tankstreck ("recension —
        // det hjälper"), vilket tvingade hela SMS:et till UCS-2 och dubblade
        // kostnaden. Typografitvätten rättar det.
        //
        // Den lokala sms_log-insert:en tas bort: helpern skriver den nu, med
        // delantal och kostnad. message_type och related_id går med som
        // parametrar i stället.
        const { sendSmsViaElks } = await import('@/lib/sms-send')
        const smsRes = await sendSmsViaElks({
          supabase,
          businessId: review.business_id,
          businessName: bizName,
          to: p.customer_phone,
          message: `Hej${firstName ? ' ' + firstName : ''}! Tack igen för att du valde oss. Om du är nöjd skulle vi uppskatta en recension — det hjälper oss enormt! ${reviewLink}\n${suffix}`,
          customerId: p.customer_id || null,
          relatedId: p.invoice_id || null,
          messageType: 'review_request',
          recipient: 'customer',
          purpose: 'proactive',
        })

        if (smsRes.success) {
          reviewsSent++
          await supabase.from('pending_approvals').update({ status: 'approved' }).eq('id', review.id)
          // Komplettera SMS:et med ett portal-mail (kunden får båda kanalerna)
          if (p.customer_id) {
            try {
              const { sendPortalNotification } = await import('@/lib/portal/notification-emails')
              await sendPortalNotification(review.business_id, p.customer_id, 'review_request', {
                context: { project_name: p.project_name || null },
              })
            } catch (notifErr) {
              console.error('[maintenance] review portal-notif failed:', notifErr)
            }
          }
        } else {
          await supabase.from('pending_approvals').update({ status: 'expired' }).eq('id', review.id)
        }
      } catch {
        await supabase.from('pending_approvals').update({ status: 'expired' }).eq('id', review.id)
      }
    }

    results.reviews_sent = reviewsSent
    if (reviewsSent > 0) console.log(`[maintenance] Sent ${reviewsSent} review requests`)
  } catch (err: any) {
    console.error('[maintenance] review-request error:', err.message)
    results.reviews_error = err.message
  }

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
        if (flytt.moved && p.current_workflow_stage_id !== SYSTEM_STAGES.JOB_STARTED) jobbIgang++
        else if (!flytt.moved) console.error('[maintenance] Jobb igång-flytt misslyckades:', flytt.error, { projectId: p.project_id })
      }
    }
    results.job_started_moved = jobbIgang
    if (jobbIgang > 0) console.log(`[maintenance] Jobb igång: ${jobbIgang} projekt flyttade`)
  } catch (err: any) {
    console.error('[maintenance] jobb-igång-svepet failade:', err.message)
    results.job_started_error = err.message
  }

  // ── 5. Släpp fastnade agent_runs-claims (idempotenshårdningen, etapp 1) ──
  //
  // app/api/agent/trigger/route.ts och lib/agent/orchestrator.ts INSERT:ar
  // numera en agent_runs-rad med status='running' INNAN modellen kallas — ett
  // lås, inte en kvittens (se claim-before-run-kommentaren i route.ts). Om
  // processen kraschar mellan claim och slutskrivning (Vercel-timeout,
  // deploy-omstart) försöker båda ställena redan släppa raden i sitt eget
  // catch-block, men det är best effort — en riktig krasch (OOM, kill -9)
  // hinner aldrig dit. En sådan rad blockerar annars en legitim retry med
  // samma idempotency_key för alltid. 90 sekunder är gott om marginal över
  // routens egen maxDuration (60s).
  try {
    const stale = new Date(Date.now() - 90 * 1000).toISOString()
    const { data, error } = await supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        error_message: 'Claimet fastnade (>90s) — städat av underhållssvepet, kan köras igen.',
      })
      .eq('status', 'running')
      .lt('created_at', stale)
      .select('run_id')

    if (error) throw error
    results.stale_agent_claims_released = data?.length || 0
    if (results.stale_agent_claims_released > 0) {
      console.log(`[maintenance] Släppte ${results.stale_agent_claims_released} fastnade agent_runs-claims`)
    }
  } catch (err: any) {
    console.error('[maintenance] stale-agent-claims error:', err.message)
    results.stale_agent_claims_error = err.message
  }

  return NextResponse.json({ ok: true, ...results })
}
