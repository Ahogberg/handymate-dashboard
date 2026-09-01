/**
 * Facit: Block A — en installationsväg, sann widgetstatus och Golden Path
 * för samtliga strukturerade webbinflöden (2026-08-28).
 *
 *   npx playwright test tests/facit-webbinflode-block-a.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

function sourceFiles(dir: string): string[] {
  const full = path.join(ROOT, dir)
  return fs.readdirSync(full, { withFileTypes: true }).flatMap(entry => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(rel)
    return /\.(ts|tsx|js|jsx)$/.test(entry.name) ? [rel] : []
  })
}

test('UI:t visar bara loader.js-kontraktet; legacy embed.js finns bara kvar i public', () => {
  for (const rel of [...sourceFiles('app'), ...sourceFiles('components')]) {
    const source = kod(rel)
    expect(source, `${rel} refererar legacy embed.js`).not.toContain('embed.js')
    expect(source, `${rel} refererar legacy data-key`).not.toContain('data-key=')
  }

  expect(kod('public/embed.js')).toContain("getAttribute('data-key')")
  expect(kod('app/dashboard/settings/website-widget/page.tsx')).toContain('/widget/loader.js')
  expect(kod('app/dashboard/settings/website-widget/page.tsx')).toContain("data-business-id")
  expect(kod('app/site/[slug]/StorefrontClient.tsx')).toContain('/widget/loader.js')
})

test('alla strukturerade webbinflöden använder samma Golden Path', () => {
  const routes = [
    'app/api/storefront/contact/route.ts',
    'app/api/widget/chat/route.ts',
    'app/api/leads/intake/route.ts',
    'app/api/public/book/[slug]/route.ts',
  ]
  for (const rel of routes) {
    const source = kod(rel)
    expect(source, `${rel} importerar inte Golden Path`).toContain("from '@/lib/leads/golden-path'")
    expect(source, `${rel} anropar inte Golden Path`).toContain('createLeadAndDeal(')
  }
})

test('statusen har fem bevisnivåer och kan aldrig kalla en flagga Kopplad', () => {
  const route = kod('app/api/widget/status/route.ts')
  expect(route).toContain("export const dynamic = 'force-dynamic'")
  expect(route).toContain('getAuthenticatedBusiness(request)')
  for (const label of [
    'Inte aktiverad',
    'Aktiverad, ännu inte verifierad',
    'Installerad',
    'Testad',
    'Lead verifierad',
  ]) {
    expect(route).toContain(label)
  }
  expect(route).toContain(".eq('lead_created', true)")
  expect(route).toContain(".not('deal_id', 'is', null)")
  expect(route).not.toContain('Kopplad')

  const integrations = kod('app/dashboard/settings/integrations/page.tsx')
  expect(integrations).toContain("fetch('/api/widget/status')")
  expect(integrations).not.toContain('setWidgetEnabled(false)')
  expect(integrations).not.toContain('widgetEnabled')
  const widgetCard = integrations.slice(
    integrations.indexOf('{/* Hemsida-widget */}'),
    integrations.indexOf('{/* Google Calendar.'),
  )
  expect(widgetCard).not.toContain('Kopplad')
})

test('loaderns installationssignal är minimal, host-baserad och throttlad', () => {
  const migration = kod('sql/v178_widget_installation_truth.sql')
  expect(migration).toContain('widget_last_seen_at TIMESTAMPTZ')
  expect(migration).toContain('widget_last_seen_host TEXT')
  expect(migration).toContain('KÖRS MANUELLT')

  const config = kod('app/api/widget/config/route.ts')
  expect(config).toContain('WIDGET_SEEN_THROTTLE_MS = 60 * 60 * 1000')
  expect(config).toContain("request.headers.get('origin') || request.headers.get('referer')")
  expect(config).toContain('.hostname.toLowerCase()')
  expect(config).toContain('widget_last_seen_at: new Date().toISOString()')
  expect(config).toContain('widget_last_seen_at.is.null,widget_last_seen_at.lt.')
  expect(config).not.toMatch(/widget_last_seen_(ip|url|path|query)/)
})

test('storefront har honeypot och persistent rate limit men inga egna kund- eller affärsinserts', () => {
  const route = kod('app/api/storefront/contact/route.ts')
  expect(route).toContain('const { business_id, name, phone, email, message, _hp } = body')
  expect(route).toContain('if (_hp)')
  // Fail-closed-varianten sedan tenant-svepet 2026-09-01 (lib/rate-limit-db.ts).
  expect(route).toContain('checkPublicRateLimitDb(')
  expect(route).toContain("source: 'website_form'")
  expect(route).not.toContain("from('pipeline_stage')")
  expect(route).not.toContain("from('pipeline_stages')")
  expect(route).not.toMatch(/from\(['"](?:customer|leads|deal)['"]\)[\s\S]{0,120}\.insert/)
  expect(route).toContain('result.dealError || !result.dealId')
})
