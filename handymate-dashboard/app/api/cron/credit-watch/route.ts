import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { sendEmail } from '@/lib/email'
import { notifyHandymateSupportTeam } from '@/lib/notifications/handymate-team-alert'
import { rapporteraTillSentry } from '@/lib/observability/sentry'
import {
  korKreditbevakning,
  sammanfattaKreditlage,
  sparaKreditlage,
  type KontrollResultat,
} from '@/lib/observability/credit-watch'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/credit-watch — daglig kreditbevakning (05:05 UTC,
 * före driftlarmet 05:15) av 46elks-saldo, Anthropic-kredit, Stripe-nyckel
 * och databasen. Se lib/observability/credit-watch.ts för bakgrunden.
 *
 * Utfallet sparas i platform_health_check (sql/v191) så /api/health kan
 * visa det. Vid warn/error: ett mejl till OPS_ALERT_EMAIL (default samma
 * adress som driftlarmet). Vid error dessutom SMS till Handymates egna
 * nummer via samma interna larmväg som Anthropic-kreditstoppet redan
 * använder (lib/notifications/handymate-team-alert.ts) — om det är 46elks
 * som är nere kommer SMS:et inte fram, men mejlet gör det.
 *
 * Auth: cron-hemligheten (fail-closed, lib/cron/verify-secret.ts) ELLER en
 * inloggad plattformsadmin (manuell körning från admin, samma isAdmin-idiom
 * som admin/mandate-maturity).
 */
export async function GET(request: NextRequest) {
  return korOmBehorig(request)
}

export async function POST(request: NextRequest) {
  return korOmBehorig(request)
}

async function korOmBehorig(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    const admin = await isAdmin(request)
    if (!admin.isAdmin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }
  return korKreditbevakningOchLarma()
}

async function korKreditbevakningOchLarma() {
  const results = await korKreditbevakning()
  const { overall, errors, warnings } = sammanfattaKreditlage(results)
  const supabase = getServerSupabase()
  const saved = await sparaKreditlage(supabase, results)

  let mailed = false
  let smsAttempted = false
  if (overall !== 'ok') {
    try {
      const result = await sendEmail({
        to: process.env.OPS_ALERT_EMAIL || 'andreas@handymate.se',
        subject: overall === 'error'
          ? `🔴 Handymate kreditbevakning: ${errors.length} kritiskt`
          : `🟡 Handymate kreditbevakning: ${warnings.length} varning${warnings.length === 1 ? '' : 'ar'}`,
        html: byggMail(results, saved.saved),
      })
      mailed = result.success
      if (!result.success) console.error('[credit-watch] mejlet misslyckades:', result.error)
    } catch (err) {
      console.error('[credit-watch] kunde inte skicka mejl:', err)
    }

    if (overall === 'error') {
      smsAttempted = true
      await notifyHandymateSupportTeam({
        businessName: 'DRIFT',
        category: 'credit_watch',
        ticketId: 'credit-watch',
        summary: errors.map(e => e.summary).join(' | '),
      })
      rapporteraTillSentry({
        meddelande: 'Kreditbevakning: kritiskt läge hos leverantör',
        niva: 'error',
        tags: { integration: errors.map(e => e.key).join(',') },
        extra: { errors: errors.map(e => ({ key: e.key, summary: e.summary })) },
      })
    }
  }

  return NextResponse.json({
    success: true,
    overall,
    checks: results.map(r => ({ key: r.key, status: r.status, summary: r.summary, detail: r.detail })),
    saved,
    mailed,
    sms_attempted: smsAttempted,
  })
}

function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function byggMail(results: KontrollResultat[], sparat: boolean): string {
  const farg: Record<string, string> = { ok: '#047857', warn: '#B45309', error: '#B91C1C' }
  const rader = results
    .map(r => `<li style="margin-bottom:6px;"><b style="color:${farg[r.status]}">${r.status.toUpperCase()}</b> — ${escapeHtml(r.summary)}</li>`)
    .join('\n')
  const sparatText = sparat
    ? ''
    : '<p style="font-size:12px;color:#92400E;">Utfallet kunde inte sparas — kör sql/v191_platform_health_and_push_dispatch.sql så /api/health visar kreditläget.</p>'
  return `
<!DOCTYPE html>
<html lang="sv">
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1F2937;">
  <div style="background: #0F766E; padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
    <span style="color: white; font-size: 18px; font-weight: 700;">Handymate kreditbevakning</span>
  </div>
  <div style="background: #ffffff; border: 1px solid #E5E7EB; border-top: none; border-radius: 0 0 12px 12px; padding: 24px;">
    <p style="font-size: 15px; line-height: 1.6; color: #374151;">Dagens kontroll av leverantörskrediter och nycklar:</p>
    <ul style="font-size: 14px; line-height: 1.6; color: #374151; padding-left: 20px;">${rader}</ul>
    ${sparatText}
    <p style="font-size: 12px; color: #6B7280;">Gränsvärden: lib/observability/credit-watch.ts · Körs 05:05 UTC av /api/cron/credit-watch.</p>
  </div>
</body>
</html>`
}
