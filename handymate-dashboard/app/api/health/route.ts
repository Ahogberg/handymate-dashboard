import { NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { lasKreditlage } from '@/lib/observability/credit-watch'

// En health-check måste beskriva nuvarande leverans, inte en tidigare
// statiskt byggd/cachad respons. 2026-08-30 svarade produktion med gårdagens
// timestamp trots ett nytt anrop.
export const dynamic = 'force-dynamic'

type CheckStatus = 'ok' | 'warn' | 'error'

/**
 * GET /api/health — publik, oautentiserad.
 *
 * Kollar databasen och att miljövariablerna FINNS. Sedan 2026-09-01 visar
 * den även kreditläget hos 46elks, Anthropic och Stripe — men läser det ur
 * platform_health_check (sql/v190), skrivet av /api/cron/credit-watch en
 * gång per dygn. Den anropar ALDRIG leverantörerna själv: en publik rutt
 * som gör riktiga Anthropic-anrop per träff vore en gratis kostnadsattack.
 *
 * Statusregel: 'error' på någon kontroll → 503 degraded. 'warn' (lågt
 * saldo, inaktuellt kreditläge, migrationen ej körd) → 200 healthy med
 * varningarna listade. "Vi vet inte" ska synas, men inte fälla rökprovet.
 */
export async function GET() {
  const checks: Record<string, CheckStatus> = {}
  const warnings: string[] = []

  // Check database connectivity
  let supabaseOk = false
  try {
    const supabase = getServerSupabase()
    const { error } = await supabase.from('business_config').select('business_id').limit(1)
    supabaseOk = !error
    checks.database = error ? 'error' : 'ok'
  } catch {
    checks.database = 'error'
  }

  // Check env vars
  checks.supabase_url = process.env.NEXT_PUBLIC_SUPABASE_URL ? 'ok' : 'error'
  checks.anthropic_key = process.env.ANTHROPIC_API_KEY ? 'ok' : 'error'
  checks.elks_credentials = (process.env.ELKS_API_USER && process.env.ELKS_API_PASSWORD) ? 'ok' : 'error'
  checks.stripe_key = process.env.STRIPE_SECRET_KEY ? 'ok' : 'error'

  // Kreditläget — senaste sparade utfall från credit-watch-cronen.
  let creditWatch: Awaited<ReturnType<typeof lasKreditlage>> | null = null
  if (supabaseOk) {
    creditWatch = await lasKreditlage(getServerSupabase())
    if (!creditWatch.available) {
      checks.credit_watch = 'warn'
      warnings.push(
        creditWatch.reason === 'schema_saknas'
          ? 'Kreditläget kan inte visas: sql/v190_platform_health_and_push_dispatch.sql är inte körd'
          : creditWatch.reason === 'aldrig_kord'
            ? 'Kreditbevakningen har inte körts ännu (/api/cron/credit-watch)'
            : 'Kreditläget kunde inte läsas',
      )
    } else if (creditWatch.stale) {
      checks.credit_watch = 'warn'
      warnings.push(`Kreditläget är inaktuellt (senast kontrollerat ${creditWatch.checked_at})`)
    } else if (creditWatch.overall === 'error') {
      checks.credit_watch = 'error'
    } else {
      checks.credit_watch = creditWatch.overall === 'warn' ? 'warn' : 'ok'
    }
    if (creditWatch.available) {
      for (const c of creditWatch.checks) {
        if (c.status !== 'ok') warnings.push(`${c.key}: ${c.summary}`)
      }
    }
  } else {
    checks.credit_watch = 'warn'
    warnings.push('Kreditläget kunde inte läsas eftersom databasen inte svarar')
  }

  const hasError = Object.values(checks).some(v => v === 'error')

  return NextResponse.json({
    status: hasError ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.substring(0, 7) || 'dev',
    checks,
    warnings,
    credit_watch: creditWatch
      ? {
          available: creditWatch.available,
          stale: creditWatch.stale,
          checked_at: creditWatch.checked_at,
          overall: creditWatch.overall,
          checks: creditWatch.checks,
        }
      : null,
  }, {
    status: hasError ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store',
    },
  })
}
