import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/notifications/handymate-team-alert.ts'),
  'utf8',
)

test.describe('notifyHandymateSupportTeam', () => {
  test('exporterar funktionen', () => {
    expect(FILE).toMatch(/export async function notifyHandymateSupportTeam/)
  })

  test('anvander ELKS_API_USER/ELKS_API_PASSWORD, samma env-var som lib/sms-send.ts', () => {
    expect(FILE).toContain('ELKS_API_USER')
    expect(FILE).toContain('ELKS_API_PASSWORD')
  })

  test('POST:ar mot 46elks sms-endpointen direkt, ingen kvotkoll', () => {
    expect(FILE).toContain('https://api.46elks.com/a1/sms')
    expect(FILE).not.toMatch(/checkSmsAllowance|resolveSmsQuotaPlan/)
  })

  test('mottagarna ar en fast, hardkodad lista (v1 — inte en @handymate.se-katalogsokning)', () => {
    expect(FILE).toMatch(/HANDYMATE_SUPPORT_ALERT_PHONES/)
  })

  test('ett fel vid sandning kastar aldrig — fire-and-forget, loggas bara', () => {
    // 2026-08-25: fast 1500-teckensfönster ersatt med hela funktionsresten —
    // summary-trunkeringen (v166) växte funktionen förbi fönstret och
    // facitet blev rött trots att catch:en (som är poängen) fanns kvar.
    const idx = FILE.indexOf('export async function notifyHandymateSupportTeam')
    expect(idx).toBeGreaterThan(-1)
    const block = FILE.slice(idx)
    expect(block).toMatch(/catch/)
    expect(block).toContain('non-blocking')
  })
})
