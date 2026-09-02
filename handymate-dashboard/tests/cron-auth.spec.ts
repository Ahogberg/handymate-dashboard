import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { verifyCronSecret } from '../lib/cron/verify-secret'

const ROOT = path.resolve(__dirname, '..')
const CRON_DIR = path.join(ROOT, 'app', 'api', 'cron')

function requestWith(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) }
}

function routeFiles(dir: string, result: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) routeFiles(full, result)
    else if (entry.name === 'route.ts') result.push(full)
  }
  return result
}

test.describe('cron-auth failar stängt', () => {
  test('saknad serverhemlighet nekas', () => {
    expect(verifyCronSecret(requestWith(), undefined)).toBe(false)
  })

  test('Bearer undefined nekas när serverhemligheten saknas', () => {
    expect(verifyCronSecret(
      requestWith({ authorization: 'Bearer undefined' }),
      undefined,
    )).toBe(false)
  })

  test('fel hemlighet nekas', () => {
    expect(verifyCronSecret(
      requestWith({ authorization: 'Bearer wrong' }),
      'correct',
    )).toBe(false)
  })

  test('rätt hemlighet godkänns', () => {
    expect(verifyCronSecret(
      requestWith({ authorization: 'Bearer correct' }),
      'correct',
    )).toBe(true)
  })

  test('legacy-headern använder samma verifierare', () => {
    expect(verifyCronSecret(
      requestWith({ 'x-cron-secret': 'correct' }),
      'correct',
    )).toBe(true)
  })
})

test('alla cron-rutter utanför Claudes Karin-fillås använder helpern', () => {
  const files = routeFiles(CRON_DIR)
  // Talet 34 var stelt kodat och blev tyst fel när tre nya rutter tillkom
  // (meeting-reminders + meeting-worker 2026-08-11, next-best-action
  // 2026-08-13) — hittat vid en full-svit-körning 2026-08-14. Alla tre
  // använder redan helpern korrekt (verifierat nedan av samma loop som
  // skulle ha fångat dem om de INTE gjorde det) — det var bara siffran
  // som var föråldrad, ingen faktisk auth-lucka.
  // 38 (2026-08-16): expectation-drift tillkom (Expectation Drift Signal 1,
  // docs/audits/NEXT_MOAT_WAVE.md Koncept 3) och använder helpern korrekt.
  // 39 (2026-08-16 natt): playbook-pattern tillkom (Playbook Pattern
  // Confirmation V1, tasks/todo.md) och använder helpern korrekt.
  // 40 (2026-08-17): playbook-kickoff tillkom (Playbook Kickoff Copilot
  // V1, tasks/todo.md) och använder helpern korrekt.
  // 41 (2026-08-18): promise-deadlines tillkom (Etapp N, löfteskedjan,
  // f56831c0) och använder helpern korrekt — siffran uppdaterades först
  // vid full-svit-körningen i Etapp Z, samma stelt-kodade-tal-fälla som
  // 2026-08-14.
  // 42 (2026-09-01): credit-watch tillkom (kreditbevakningen,
  // lib/observability/credit-watch.ts) och använder helpern korrekt.
  // 43 (2026-09-02): push-morgon tillkom (tyst tid för push,
  // lib/notifications/tyst-tid.ts) och använder helpern korrekt.
  // 44 (2026-09-02): raddningsko tillkom (Räddningskön,
  // docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md §3,
  // tasks/plan-raddningsko.md) och använder helpern korrekt (dubbelgrind
  // med isAdmin, samma mönster som credit-watch).
  expect(files).toHaveLength(44)

  const karinRoute = path.join(CRON_DIR, 'karin-deadlines', 'route.ts')
  const ownedRoutes = files.filter(file => file !== karinRoute)
  expect(ownedRoutes).toHaveLength(43)

  const missing = ownedRoutes
    .filter(file => {
      const source = fs.readFileSync(file, 'utf8')
      return !source.includes("from '@/lib/cron/verify-secret'")
        || !source.includes('verifyCronSecret(request)')
    })
    .map(file => path.relative(ROOT, file))

  expect(missing).toEqual([])
})
