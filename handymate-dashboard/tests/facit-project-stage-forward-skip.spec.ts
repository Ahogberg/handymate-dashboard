/**
 * Facit: framåt-vakten säger sanningen om no-ops (2026-08-26).
 *
 * advanceProjectStageForward returnerade { moved: true } både när den
 * FLYTTADE och när den medvetet AVSTOD (projektet redan där/längre, eller
 * på ett eget steg). Anropare kunde inte skilja fallen — cronen fick jämföra
 * steg-id själv, och framtida producenter (Del B i projektöversikts-planen)
 * hade räknat no-ops som flyttar.
 *
 *   npx playwright test tests/facit-project-stage-forward-skip.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('advanceProjectStageForward — no-op ≠ flytt', () => {
  const s = read('lib/project-stages/automation-engine.ts')
  const fn = s.slice(s.indexOf('export async function advanceProjectStageForward'), s.indexOf('interface StageHistoryEntry'))

  test('resultattypen bär skipped + reason', () => {
    const typ = s.slice(s.indexOf('export interface AdvanceStageResult'), s.indexOf('export interface AdvanceStageResult') + 500)
    expect(typ).toContain('skipped?: boolean')
    expect(typ).toContain("reason?: 'custom_stage' | 'already_at_or_past'")
  })

  test('båda no-op-grenarna returnerar moved:false + skipped:true', () => {
    expect(fn).toContain("return { moved: false, skipped: true, reason: 'custom_stage' }")
    expect(fn).toContain("return { moved: false, skipped: true, reason: 'already_at_or_past' }")
    expect(fn, 'ingen no-op får längre påstå moved:true').not.toContain('return { moved: true }')
  })

  test('anroparna räknar bara riktiga flyttar och loggar bara riktiga fel', () => {
    const cron = read('app/api/cron/maintenance/route.ts')
    expect(cron).toContain('if (flytt.moved) jobbIgang++')
    expect(cron).toContain('else if (!flytt.skipped) console.error')
    const checkin = read('app/api/time-entry/check-in/route.ts')
    expect(checkin).toContain('if (!flytt.moved && !flytt.skipped)')
  })
})

test.describe('en projektskapare per signerad offert', () => {
  test('create-from-quote äger insert + stegstart; onQuoteAccepted delegerar utan SMS', () => {
    const cfq = read('lib/projects/create-from-quote.ts')
    expect(cfq).toContain('sendSms?: boolean')
    expect(cfq).toContain('if (sendSms) try {')
    const engine = read('lib/project-ai-engine.ts')
    expect(engine).toContain("await import('@/lib/projects/create-from-quote')")
    expect(engine).toContain('createProjectFromQuote(businessId, quoteId, { sendSms: false })')
  })
})
