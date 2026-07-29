import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'

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
 *
 * Demokontot (business_id === DEMO_BUSINESS_ID) exkluderas ur alla svep så det
 * aldrig orsakar dagliga larm.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return runDriftlarm()
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  const totals = {
    sms: sms.count,
    email: email.count,
    billing: billing.count,
    automation: automation.count,
  }
  const totalErrors = totals.sms + totals.email + totals.billing + totals.automation

  let mailed = false
  // Mailar om något faktiskt hittades ELLER ett svep gick sönder (en trasig
  // kontroll är i sig en driftrisk Andreas ska känna till — tystnad ska
  // aldrig betyda "vi vet inte" utan "vi kollade och det var rent").
  if (totalErrors > 0 || brokenSweeps.length > 0) {
    try {
      const html = buildDriftlarmHtml({ sms, email, billing, automation, brokenSweeps })
      const result = await sendEmail({
        to: 'andreas@handymate.se',
        subject: `⚠️ Handymate driftlarm: ${totalErrors} fel senaste dygnet`,
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

  return NextResponse.json({ success: true, totals, mailed })
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

function buildDriftlarmHtml(params: {
  sms: SweepOutcome
  email: SweepOutcome
  billing: SweepOutcome
  automation: SweepOutcome
  brokenSweeps: string[]
}): string {
  const { sms, email, billing, automation, brokenSweeps } = params

  const sections = [
    categorySection('SMS', sms, brokenSweeps.includes('SMS-loggen')),
    categorySection('E-post', email, brokenSweeps.includes('E-post/kommunikationsloggen')),
    categorySection('Betalningar', billing, brokenSweeps.includes('Betalningar')),
    categorySection('Automationer', automation, brokenSweeps.includes('Automationer')),
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
