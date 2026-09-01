/**
 * Facit: driftsynlighet före första betalande kund (2026-09-01).
 *
 * Låser:
 *  - Sentry är inkopplat på server (instrumentation.ts), edge och klient,
 *    men PÅ bara med DSN och aldrig med default-PII eller session replay.
 *  - next.config.js har instrumentationHook och withSentryConfig utan att
 *    kräva SENTRY_AUTH_TOKEN för att bygga.
 *  - Renderfel (ErrorBoundary + app/global-error.tsx) och tysta fel
 *    (rapporteraTystFel) når Sentry.
 *  - Kreditbevakningen finns som cron, är cron-auth-grindad, står i
 *    vercel.json, och /api/health läser dess sparade utfall — utan att
 *    själv anropa leverantörer.
 *  - sql/v191 skapar de två tabellerna, RLS på, inga grants till anon.
 *
 * Körs: npx playwright test tests/facit-driftsynlighet.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')
const finns = (p: string) => fs.existsSync(path.join(ROOT, p))

test.describe('Sentry — på med DSN, av utan, aldrig PII', () => {
  for (const f of ['sentry.client.config.ts', 'sentry.server.config.ts', 'sentry.edge.config.ts']) {
    test(`${f} initierar bara med DSN och utan PII`, () => {
      expect(finns(f), `${f} saknas`).toBe(true)
      const src = read(f)
      expect(src).toContain('enabled: Boolean(dsn)')
      expect(src).toContain('sendDefaultPii: false')
      expect(src).not.toMatch(/replaysSessionSampleRate:\s*[1-9]/)
    })
  }

  test('klienten läser NEXT_PUBLIC_SENTRY_DSN, servern SENTRY_DSN', () => {
    expect(read('sentry.client.config.ts')).toContain('process.env.NEXT_PUBLIC_SENTRY_DSN')
    expect(read('sentry.server.config.ts')).toContain('process.env.SENTRY_DSN')
    expect(read('sentry.edge.config.ts')).toContain('process.env.SENTRY_DSN')
  })

  test('instrumentation.ts laddar server- och edge-init per runtime', () => {
    const src = read('instrumentation.ts')
    expect(src).toContain("process.env.NEXT_RUNTIME === 'nodejs'")
    expect(src).toContain("./sentry.server.config")
    expect(src).toContain("process.env.NEXT_RUNTIME === 'edge'")
    expect(src).toContain("./sentry.edge.config")
  })

  test('next.config.js: instrumentationHook + withSentryConfig, bygger utan auth-token', () => {
    const src = read('next.config.js')
    expect(src).toContain('instrumentationHook: true')
    expect(src).toContain('withSentryConfig(')
    expect(src).toContain('disable: !process.env.SENTRY_AUTH_TOKEN')
    expect(src).toContain('telemetry: false')
    // Den ursprungliga PDF-regeln får inte försvinna i omskrivningen.
    expect(src).toContain("serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium']")
  })

  test('@sentry/nextjs är en beroende i package.json', () => {
    const pkg = JSON.parse(read('package.json'))
    expect(pkg.dependencies['@sentry/nextjs']).toBeTruthy()
  })

  test('adaptern kastar aldrig och är enda importen av @sentry i lib/', () => {
    const src = read('lib/observability/sentry.ts')
    expect(src).toContain('export function rapporteraTillSentry')
    expect(src).toMatch(/try \{[\s\S]*Sentry\.capture[\s\S]*\} catch/)
    // Övrig kod går via adaptern — så vi kan byta leverantör på EN plats.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
      }
      return out
    }
    const direkta = walk(path.join(ROOT, 'lib'))
      .filter(f => fs.readFileSync(f, 'utf8').includes("from '@sentry/nextjs'"))
      .map(f => path.relative(ROOT, f).replace(/\\/g, '/'))
    expect(direkta).toEqual(['lib/observability/sentry.ts'])
  })
})

test.describe('Fel når Sentry', () => {
  test('ErrorBoundary rapporterar via adaptern (inte "replace with Sentry later")', () => {
    const src = read('components/ErrorBoundary.tsx')
    expect(src).toContain("from '@/lib/observability/sentry'")
    expect(src).toContain('rapporteraTillSentry(')
    expect(src).not.toContain('replace with Sentry later')
  })

  test('app/global-error.tsx finns, är klient, fångar root-layout-fel', () => {
    expect(finns('app/global-error.tsx')).toBe(true)
    const src = read('app/global-error.tsx')
    expect(src.startsWith("'use client'")).toBe(true)
    expect(src).toContain('Sentry.captureException(error)')
    expect(src).toContain('<html lang="sv">')
  })

  test('rapporteraTystFel skickar tysta fel även till Sentry', () => {
    const src = read('lib/observability/driftlarm.ts')
    expect(src).toContain("from '@/lib/observability/sentry'")
    expect(src).toMatch(/rapporteraTillSentry\(\{[\s\S]*meddelande: `tyst_fel\/\$\{kalla\}`/)
  })
})

test.describe('Kreditbevakningen', () => {
  test('cronen finns, är cron-auth-grindad och står i vercel.json', () => {
    const src = read('app/api/cron/credit-watch/route.ts')
    expect(src).toContain("from '@/lib/cron/verify-secret'")
    expect(src).toContain('verifyCronSecret(request)')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    const vercel = JSON.parse(read('vercel.json'))
    const cron = vercel.crons.find((c: { path: string }) => c.path === '/api/cron/credit-watch')
    expect(cron, 'credit-watch saknas i vercel.json').toBeTruthy()
    expect(cron.schedule).toMatch(/^\d+ \d+ \* \* \*$/)
  })

  test('cronen larmar via mejl vid warn/error och SMS vid error', () => {
    const src = read('app/api/cron/credit-watch/route.ts')
    expect(src).toContain('sendEmail(')
    expect(src).toContain('notifyHandymateSupportTeam(')
    expect(src).toContain("overall !== 'ok'")
    expect(src).toContain("overall === 'error'")
  })

  test('/api/health läser sparat kreditläge och anropar aldrig leverantörer själv', () => {
    const src = read('app/api/health/route.ts')
    expect(src).toContain('lasKreditlage(')
    expect(src).toContain('credit_watch')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).not.toContain('api.46elks.com')
    expect(src).not.toContain('api.anthropic.com')
    expect(src).not.toContain('api.stripe.com')
    expect(src).not.toContain('korKreditbevakning')
  })

  test('/api/health: error → 503, warn → 200 med varningar', () => {
    const src = read('app/api/health/route.ts')
    expect(src).toContain("some(v => v === 'error')")
    expect(src).toContain('status: hasError ? 503 : 200')
    expect(src).toContain('warnings')
  })

  test('sql/v191 skapar båda tabellerna service_role-only', () => {
    const sql = read('sql/v191_platform_health_and_push_dispatch.sql')
    for (const t of ['platform_health_check', 'push_dispatch_log']) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS public\\.${t}`))
      expect(sql).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON public\\.${t} FROM anon, authenticated, PUBLIC`))
    }
    expect(sql).not.toMatch(/CREATE POLICY/i)
  })

  test('miljövariablerna är dokumenterade i .env.local.example', () => {
    const env = read('.env.local.example')
    for (const v of ['NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN', 'SENTRY_AUTH_TOKEN', 'OPS_ALERT_EMAIL', 'HANDYMATE_SUPPORT_ALERT_PHONES', 'CREDIT_WATCH_ELKS_MIN_SEK']) {
      expect(env, `${v} saknas i .env.local.example`).toMatch(new RegExp(`^${v}=`, 'm'))
    }
  })
})
