import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { resolveCostCapUsd } from '@/lib/agents/shared/cost-guard'
import { getAbsenceWindow, isAbsenceActive } from '@/lib/absence/absence-window'
import { classifyAbsenceEvent } from '@/lib/absence/escalation'
import { sendApprovalPush } from '@/lib/notifications/approval-push'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/driftlarm
 *
 * Dagligt svep efter tysta fel senaste dygnet (25h fönster — överlapp mot
 * gårdagens körning är avsiktligt OK, bättre att se ett fel två gånger än
 * att missa det pga klockskillnad mellan cron-körningar).
 *
 * Mailar andreas@handymate.se EN digest — men ENDAST om något hittades eller
 * ett svep gick sönder. Noll fel + alla svep OK => helt tyst körning.
 *
 * Svep:
 *  1. sms_log            — status='failed'
 *  2. communication_log  — status='failed' AND direction='outbound' (tabellen kan saknas)
 *  3. billing_event      — event_type='payment_failed'
 *  4. automation_activity — status='failed' (tabell + kolumner verifierade i
 *     sql/automation_center.sql och lib/automations.ts:logAutomationActivity —
 *     business_id, automation_type, action, description, status, created_at)
 *  5. Användningssignal (Andreas-beslut 2026-07-31) — INTE ett fel-svep. Letar
 *     efter businesses som konsekutivt ligger nära sitt AI-kostnadstak (samma
 *     cap-resolution som lib/agents/shared/cost-guard.ts) — uppsäljningssignal,
 *     inte en driftstörning. Räknas separat från felantalet, men triggar mail
 *     på egen hand (se mailed-villkoret nedan).
 *
 * Demokontot (business_id === DEMO_BUSINESS_ID) exkluderas ur alla svep så det
 * aldrig orsakar dagliga larm.
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDriftlarm()
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDriftlarm()
}

interface SweepOutcome {
  ok: boolean
  count: number
  rows: string[] // färdigformaterade rader (redan HTML-escapade), max 5
}

const EMPTY: SweepOutcome = { ok: true, count: 0, rows: [] }

function escapeHtml(input: unknown): string {
  const s = input === null || input === undefined ? '' : String(input)
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatWhen(iso: string): string {
  try {
    return new Date(iso).toLocaleString('sv-SE', {
      timeZone: 'Europe/Stockholm',
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

async function runDriftlarm() {
  const supabase = getServerSupabase()
  const since = new Date(Date.now() - 25 * 3600_000).toISOString()
  const demoBusinessId = process.env.DEMO_BUSINESS_ID || null
  const brokenSweeps: string[] = []

  // 1. SMS-loggen
  let sms: SweepOutcome = EMPTY
  try {
    let q = supabase
      .from('sms_log')
      .select('business_id, phone_to, error_message, message_type, created_at')
      .eq('status', 'failed')
      .gte('created_at', since)
    if (demoBusinessId) q = q.neq('business_id', demoBusinessId)
    const { data, error } = await q
    if (error) throw error
    const list = data || []
    sms = {
      ok: true,
      count: list.length,
      rows: list.slice(0, 5).map((r: any) =>
        `${escapeHtml(r.business_id)} — ${formatWhen(r.created_at)} — ${escapeHtml(
          r.error_message || r.message_type || 'okänt fel'
        )}${r.phone_to ? ` (till ${escapeHtml(r.phone_to)})` : ''}`
      ),
    }
  } catch (err) {
    console.error('[driftlarm] sms_log-svepet kraschade:', err)
    brokenSweeps.push('SMS-loggen')
  }

  // 2. communication_log (kan saknas i vissa miljöer — svälj tyst, notera i mailet)
  let email: SweepOutcome = EMPTY
  try {
    let q = supabase
      .from('communication_log')
      .select('business_id, channel, subject, created_at')
      .eq('status', 'failed')
      .eq('direction', 'outbound')
      .gte('created_at', since)
    if (demoBusinessId) q = q.neq('business_id', demoBusinessId)
    const { data, error } = await q
    if (error) throw error
    const list = data || []
    email = {
      ok: true,
      count: list.length,
      rows: list.slice(0, 5).map((r: any) =>
        `${escapeHtml(r.business_id)} — ${formatWhen(r.created_at)} — ${escapeHtml(
          r.subject || r.channel || 'okänt ämne'
        )}`
      ),
    }
  } catch (err) {
    console.error('[driftlarm] communication_log-svepet kraschade (tabellen kan saknas):', err)
    brokenSweeps.push('E-post/kommunikationsloggen')
  }

  // 3. billing_event
  let billing: SweepOutcome = EMPTY
  let billingRows: Array<{ business_id: string; data: any; created_at: string }> = []
  try {
    let q = supabase
      .from('billing_event')
      .select('business_id, data, created_at')
      .eq('event_type', 'payment_failed')
      .gte('created_at', since)
    if (demoBusinessId) q = q.neq('business_id', demoBusinessId)
    const { data, error } = await q
    if (error) throw error
    const list = data || []
    billingRows = list
    billing = {
      ok: true,
      count: list.length,
      rows: list.slice(0, 5).map((r: any) => {
        const amountDue = r.data?.amount_due
        const amountText = typeof amountDue === 'number' ? ` (${(amountDue / 100).toLocaleString('sv-SE')} kr)` : ''
        return `${escapeHtml(r.business_id)} — ${formatWhen(r.created_at)} — betalning misslyckades${amountText}`
      }),
    }
  } catch (err) {
    console.error('[driftlarm] billing_event-svepet kraschade:', err)
    brokenSweeps.push('Betalningar')
  }

  // 4. automation_activity
  let automation: SweepOutcome = EMPTY
  let automationRows: Array<{ business_id: string; automation_type: string; action: string; description: string | null; created_at: string }> = []
  try {
    let q = supabase
      .from('automation_activity')
      .select('business_id, automation_type, action, description, created_at')
      .eq('status', 'failed')
      .gte('created_at', since)
    if (demoBusinessId) q = q.neq('business_id', demoBusinessId)
    const { data, error } = await q
    if (error) throw error
    const list = data || []
    automationRows = list
    automation = {
      ok: true,
      count: list.length,
      rows: list.slice(0, 5).map((r: any) =>
        `${escapeHtml(r.business_id)} — ${formatWhen(r.created_at)} — ${escapeHtml(r.automation_type)}/${escapeHtml(
          r.action
        )}: ${escapeHtml(r.description || 'inget felmeddelande')}`
      ),
    }
  } catch (err) {
    console.error('[driftlarm] automation_activity-svepet kraschade:', err)
    brokenSweeps.push('Automationer')
  }

  // 6. Owner Absence V1 (Etapp Å) — driftlarmet mejlar historiskt BARA ops.
  // Under ett AKTIVT frånvarofönster (lib/absence/absence-window.ts) ska
  // eskaleringsklassade fel även pusha ägaren, via BEFINTLIGA push-vägen
  // (sendApprovalPush → /api/push/send) — ingen ny kanal. Ops-mejlet ovan
  // fortsätter helt oförändrat. Utanför ett aktivt fönster (normalfallet)
  // görs INGA extra anrop här — beteendet är byte-för-byte som innan detta
  // steg lades till. Klassningen (classifyAbsenceEvent) är samma auktoritet
  // push-strypunkten själv använder — driftlarmet gissar inte, det taggar
  // bara resultatet av samma klassare i det syntetiska kortets payload
  // (sendApprovalPush verifierar taggen mot samma slutna lista igen).
  try {
    const checkedBusinessIds = new Map<string, boolean>()
    const absenceActiveFor = async (businessId: string): Promise<boolean> => {
      if (checkedBusinessIds.has(businessId)) return checkedBusinessIds.get(businessId)!
      let active = false
      try {
        const window = await getAbsenceWindow(businessId)
        active = isAbsenceActive(window, new Date())
      } catch (err) {
        console.error('[driftlarm] frånvarokontroll kraschade för', businessId, '(fail-closed, ingen extra push):', err)
      }
      checkedBusinessIds.set(businessId, active)
      return active
    }

    for (const row of billingRows) {
      if (!(await absenceActiveFor(row.business_id))) continue
      const cls = classifyAbsenceEvent({ kind: 'billing_event', eventType: 'payment_failed' })
      if (cls === 'samlas') continue
      const amountDue = row.data?.amount_due
      void sendApprovalPush({
        business_id: row.business_id,
        approval_type: 'payment_failed_signal',
        risk_level: 'high',
        payload: {
          escalation_class: cls,
          amount_due: typeof amountDue === 'number' ? amountDue : null,
        },
      })
    }

    for (const row of automationRows) {
      if (!(await absenceActiveFor(row.business_id))) continue
      const cls = classifyAbsenceEvent({ kind: 'automation_activity', status: 'failed' })
      if (cls === 'samlas') continue
      void sendApprovalPush({
        business_id: row.business_id,
        approval_type: 'external_delivery_failure_signal',
        risk_level: 'high',
        payload: {
          escalation_class: cls,
          automation_type: row.automation_type,
          action: row.action,
          description: row.description,
        },
      })
    }
  } catch (err) {
    // Fail-safe: ägar-pushen under frånvaro är ett TILLÄGG — en trasig
    // väg här får aldrig hindra ops-mejlet nedan från att skickas.
    console.error('[driftlarm] frånvaro-ägarpush-steget kraschade (fail-safe, ops-mejlet skickas ändå):', err)
  }

  // 5. Användningssignal — INTE ett fel-svep (se filhuvudet). Summerar
  // agent_runs.estimated_cost per business per rullande 24h-dygn de senaste
  // 7 dygnen (dygn 0 = senaste 24h, ..., dygn 6 = 7 dygn sedan). Om ≥3 av de
  // 7 dygnen ligger ≥80 % av businessens tak (samma resolveCostCapUsd som
  // cost-guard.ts: explicit agent_cost_cap_usd_daily → PLAN_COST_CAPS_USD →
  // 5.0-fallback) räknas businessen som en uppgraderingskandidat.
  let usageSignal: SweepOutcome = EMPTY
  try {
    const now = Date.now()
    const sevenDaysAgoIso = new Date(now - 7 * 24 * 3600_000).toISOString()

    let bizQ = supabase
      .from('business_config')
      .select('business_id, subscription_plan, agent_cost_cap_usd_daily')
    if (demoBusinessId) bizQ = bizQ.neq('business_id', demoBusinessId)
    const { data: bizRows, error: bizErr } = await bizQ
    if (bizErr) throw bizErr

    let runsQ = supabase
      .from('agent_runs')
      .select('business_id, estimated_cost, created_at')
      .gte('created_at', sevenDaysAgoIso)
    if (demoBusinessId) runsQ = runsQ.neq('business_id', demoBusinessId)
    const { data: runRows, error: runErr } = await runsQ
    if (runErr) throw runErr

    // business_id → 7 dygns-slots (index 0 = senaste 24h)
    const dayBuckets = new Map<string, number[]>()
    for (const r of (runRows || []) as Array<{ business_id: string; estimated_cost: number | string | null; created_at: string }>) {
      const ageMs = now - new Date(r.created_at).getTime()
      const dayIdx = Math.min(6, Math.max(0, Math.floor(ageMs / 86_400_000)))
      if (!dayBuckets.has(r.business_id)) dayBuckets.set(r.business_id, [0, 0, 0, 0, 0, 0, 0])
      dayBuckets.get(r.business_id)![dayIdx] += Number(r.estimated_cost || 0)
    }

    const candidates: Array<{ business_id: string; plan: string; avgDailyCostUsd: number; capUsd: number }> = []
    for (const biz of (bizRows || []) as Array<{ business_id: string; subscription_plan: string | null; agent_cost_cap_usd_daily: number | string | null }>) {
      const dayCosts = dayBuckets.get(biz.business_id)
      if (!dayCosts) continue
      const capUsd = resolveCostCapUsd(biz)
      const threshold = capUsd * 0.8
      const daysNearCap = dayCosts.filter((c) => c >= threshold).length
      if (daysNearCap >= 3) {
        const avgDailyCostUsd = dayCosts.reduce((s, c) => s + c, 0) / 7
        candidates.push({
          business_id: biz.business_id,
          plan: biz.subscription_plan || 'starter',
          avgDailyCostUsd,
          capUsd,
        })
      }
    }

    usageSignal = {
      ok: true,
      count: candidates.length,
      rows: candidates.slice(0, 5).map(
        (c) =>
          `${escapeHtml(c.business_id)} — plan ${escapeHtml(c.plan)} — snitt ${c.avgDailyCostUsd.toFixed(2)} USD/dag (tak ${c.capUsd.toFixed(2)} USD)`
      ),
    }
  } catch (err) {
    console.error('[driftlarm] användningssignal-svepet kraschade:', err)
    brokenSweeps.push('Användningssignal')
  }

  const totals = {
    sms: sms.count,
    email: email.count,
    billing: billing.count,
    automation: automation.count,
  }
  // usageSignal räknas medvetet INTE in i totalErrors — det är en
  // uppsäljningssignal, inte ett fel (se filhuvudet + Del 3-beslutet).
  const totalErrors = totals.sms + totals.email + totals.billing + totals.automation

  let mailed = false
  // Mailar om något faktiskt hittades, ett svep gick sönder, ELLER
  // användningssignalen ensam har träffar (en trasig kontroll är i sig en
  // driftrisk Andreas ska känna till — tystnad ska aldrig betyda "vi vet
  // inte" utan "vi kollade och det var rent").
  if (totalErrors > 0 || brokenSweeps.length > 0 || usageSignal.count > 0) {
    try {
      const html = buildDriftlarmHtml({ sms, email, billing, automation, usageSignal, brokenSweeps })
      // Om enbart signalen utlöser mailet (inga fel, inga trasiga svep) får
      // det en egen ämnesrad — signalen ska aldrig se ut som ett driftlarm.
      const onlySignal = totalErrors === 0 && brokenSweeps.length === 0 && usageSignal.count > 0
      const subject = onlySignal
        ? `💡 Handymate användningssignal: ${usageSignal.count} kunder nära taket`
        : `⚠️ Handymate driftlarm: ${totalErrors} fel senaste dygnet`
      const result = await sendEmail({
        to: 'andreas@handymate.se',
        subject,
        html,
      })
      mailed = result.success
      if (!result.success) {
        console.error('[driftlarm] sendEmail misslyckades:', result.error)
      }
    } catch (err) {
      console.error('[driftlarm] kunde inte bygga/skicka digest-mail:', err)
    }
  }

  return NextResponse.json({ success: true, totals, usage_signal_count: usageSignal.count, mailed })
}

function categorySection(title: string, sweep: SweepOutcome, broken: boolean): string {
  if (broken) {
    return `
      <div style="margin-bottom: 20px;">
        <p style="font-size: 15px; color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 10px 14px; margin: 0;">
          <b>${escapeHtml(title)}:</b> kunde inte kontrolleras (svepet kraschade — se serverloggen)
        </p>
      </div>`
  }
  if (sweep.count === 0) return ''
  const rowsHtml = sweep.rows.map((r) => `<li style="margin-bottom: 6px;">${r}</li>`).join('\n')
  const more = sweep.count > sweep.rows.length ? `<p style="font-size: 12px; color: #6B7280; margin: 4px 0 0;">+ ${sweep.count - sweep.rows.length} till</p>` : ''
  return `
    <div style="margin-bottom: 20px;">
      <p style="font-size: 15px; color: #374151; margin: 0 0 8px;"><b>${escapeHtml(title)}: ${sweep.count} fel</b></p>
      <ul style="font-size: 13px; line-height: 1.6; color: #4B5563; padding-left: 20px; margin: 0;">
        ${rowsHtml}
      </ul>
      ${more}
    </div>`
}

/**
 * Egen rendering (inte categorySection) — usageSignal är medvetet inte ett
 * fel-svep. "N fel"-formatet och den röda/gula färgskalan i categorySection
 * skulle felaktigt signalera driftstörning; detta ska läsas som en
 * affärssignal i stället.
 */
function usageSignalSection(sweep: SweepOutcome, broken: boolean): string {
  if (broken) {
    return `
      <div style="margin-bottom: 20px;">
        <p style="font-size: 15px; color: #92400E; background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 10px 14px; margin: 0;">
          <b>💡 Användningssignal:</b> kunde inte kontrolleras (svepet kraschade — se serverloggen)
        </p>
      </div>`
  }
  if (sweep.count === 0) return ''
  const rowsHtml = sweep.rows.map((r) => `<li style="margin-bottom: 6px;">${r}</li>`).join('\n')
  const more =
    sweep.count > sweep.rows.length
      ? `<p style="font-size: 12px; color: #1E40AF; margin: 4px 0 0;">+ ${sweep.count - sweep.rows.length} till</p>`
      : ''
  return `
    <div style="margin-bottom: 20px; padding: 14px; background: #EFF6FF; border: 1px solid #BFDBFE; border-radius: 8px;">
      <p style="font-size: 15px; color: #1E3A8A; margin: 0 0 6px;"><b>💡 Användningssignal: ${sweep.count} kund${sweep.count === 1 ? '' : 'er'} nära taket</b></p>
      <p style="font-size: 12px; color: #1E40AF; margin: 0 0 10px;">Kunder som konsekvent ligger nära sitt användningsutrymme — kandidater för uppgraderingssamtal, INTE för spärr.</p>
      <ul style="font-size: 13px; line-height: 1.6; color: #1E3A8A; padding-left: 20px; margin: 0;">
        ${rowsHtml}
      </ul>
      ${more}
    </div>`
}

function buildDriftlarmHtml(params: {
  sms: SweepOutcome
  email: SweepOutcome
  billing: SweepOutcome
  automation: SweepOutcome
  usageSignal: SweepOutcome
  brokenSweeps: string[]
}): string {
  const { sms, email, billing, automation, usageSignal, brokenSweeps } = params

  const sections = [
    categorySection('SMS', sms, brokenSweeps.includes('SMS-loggen')),
    categorySection('E-post', email, brokenSweeps.includes('E-post/kommunikationsloggen')),
    categorySection('Betalningar', billing, brokenSweeps.includes('Betalningar')),
    categorySection('Automationer', automation, brokenSweeps.includes('Automationer')),
    usageSignalSection(usageSignal, brokenSweeps.includes('Användningssignal')),
  ]
    .filter(Boolean)
    .join('\n')

  return `
<!DOCTYPE html>
<html lang="sv">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1F2937;">
  <div style="background: #0F766E; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <span style="color: white; font-size: 18px; font-weight: 700;">Handymate driftlarm</span>
  </div>
  <div style="background: #ffffff; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.6; color: #374151;">
      Svep av senaste 25 timmarna hittade fel som ingen annanstans syns i UI:t.
    </p>
    ${sections}
    <div style="text-align: center; margin: 28px 0 12px;">
      <a href="https://app.handymate.se/admin" style="display: inline-block; background: #0F766E; color: white; padding: 12px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Öppna admin →
      </a>
    </div>
  </div>
</body>
</html>`
}
