/**
 * Livscykelmailen efter onboardingen — dag 2, 7 och 14.
 *
 * Dag 7 bär ett riktigt nästa steg (Lager 3 / B9, 2026-08-27); dag 2 och 14
 * tillkom i Etapp B4 (2026-09-02) och härleds ur kontots verkliga luckor
 * respektive dess adoption.
 *
 *   npx playwright test tests/onboarding-lifecycle.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { chooseDay7Candidate, day7Href, type Day7CandidateRow } from '../lib/onboarding/day7-next-action'
import {
  LIVSCYKEL_DAGAR,
  FONSTER_DYGN,
  flaggaFor,
  amneFor,
  fonsterFor,
  skaSkickaDag14,
} from '../lib/onboarding/lifecycle-emails'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const rad = (over: Partial<Day7CandidateRow>): Day7CandidateRow => ({
  id: 'a1',
  approval_type: 'invoice_reminder',
  title: 'Skicka påminnelse för faktura 2026-001',
  status: 'pending',
  created_at: '2026-08-20T08:00:00Z',
  payload: {},
  ...over,
})

test.describe('chooseDay7Candidate — ren väljare', () => {
  test('Mattes rankade topp-kort vinner när det fortfarande väntar', () => {
    const rows = [rad({ id: 'gammal', created_at: '2026-08-18T08:00:00Z' }), rad({ id: 'nba', created_at: '2026-08-21T08:00:00Z' })]
    expect(chooseDay7Candidate(rows, 'nba')?.approvalId).toBe('nba')
  })

  test('utan rankning: äldsta väntande, exekverbara typer före review-kort', () => {
    const rows = [
      rad({ id: 'review_gammal', approval_type: 'missad_intakt', title: 'Missad intäkt', created_at: '2026-08-15T08:00:00Z' }),
      rad({ id: 'exec_ny', created_at: '2026-08-21T08:00:00Z' }),
      rad({ id: 'exec_gammal', created_at: '2026-08-19T08:00:00Z' }),
    ]
    expect(chooseDay7Candidate(rows, null)?.approvalId).toBe('exec_gammal')
  })

  test('startkort, lösta kort, testdata och tomma titlar räknas aldrig', () => {
    const rows = [
      rad({ id: 'intro', approval_type: 'team_intro', title: 'Jag vaktar din telefon nu' }),
      rad({ id: 'lost', status: 'approved' }),
      rad({ id: 'test', title: 'E2E Testkund påminnelse' }),
      rad({ id: 'testid', payload: { invoice_id: 'e2e_inv_1' } }),
      rad({ id: 'tom', title: '  ' }),
    ]
    expect(chooseDay7Candidate(rows, null)).toBeNull()
    // Ett rankat id som inte längre väntar faller tillbaka på kön
    expect(chooseDay7Candidate([rad({ id: 'kvar' })], 'lost')?.approvalId).toBe('kvar')
  })

  test('länken går rakt till kortet på godkännandesidan (ankaret finns)', () => {
    expect(day7Href('appr_1')).toBe('/dashboard/approvals#approval-appr_1')
    expect(kod('app/dashboard/approvals/page.tsx')).toContain('id={`approval-${approval.id}`}')
  })
})

test.describe('cronen', () => {
  const cron = kod('app/api/cron/onboarding-followup/route.ts')

  test('fönstret räknas från onboarding_completed_at med created_at som fallback', () => {
    expect(cron).toContain('and(onboarding_completed_at.gte.${fran},onboarding_completed_at.lt.${till})')
    expect(cron).toContain('and(onboarding_completed_at.is.null,created_at.gte.${fran},created_at.lt.${till})')
  })

  test('nästa steg hämtas per konto, utelämnas vid null/fel, och mailet går ändå', () => {
    expect(cron).toContain('const nextAction = await pickDay7NextAction(supabase, biz.business_id).catch(() => null)')
    expect(cron).toContain('buildDay7EmailHtml(firstName, value, nextAction)')
    const start = cron.indexOf('const nextStepHtml = nextAction')
    const block = cron.slice(start, cron.indexOf("    : ''", start))
    expect(block).toContain('Nästa bästa steg')
    expect(block).toContain('${appUrl()}${nextAction.href}')
    expect(block).toContain('escapeHtml(nextAction.title)')
    expect(cron).toContain('${nextStepHtml}')
  })

  test('claim-first behålls för varje dag — hellre uteblivet än dagligen upprepat', () => {
    expect(cron).toContain("const claimed = await setBusinessPreference(biz.business_id, flagga, '1', 'onboarding')")
    expect(cron).toContain('if (!claimed)')
    // Misslyckat skick rullar tillbaka claimen så nästa körning kan försöka igen
    expect(cron).toContain('await deleteBusinessPreference(biz.business_id, flagga)')
    // Demokontot får aldrig kundlivscykelmail
    expect(cron).toContain('b.business_id !== demoBusinessId')
  })

  test('alla tre dagarna körs i samma svep', () => {
    expect(cron).toContain('for (const dag of LIVSCYKEL_DAGAR)')
    expect(cron).toContain('await korDag(supabase, dag, now)')
  })

  test('dag 14 går bara till den som inte kommit igång — och tiger vid läsfel', () => {
    expect(cron).toContain('skaSkickaDag14(adoption.antal, ADOPTION_TROSKEL)')
    // Aktivt konto: inget mail, men flaggan sätts så vi inte frågar varje dag
    expect(cron).toContain("setBusinessPreference(biz.business_id, flagga, 'skipped_active', 'onboarding')")
    // Kan adoptionen inte läsas skickas inget alls
    expect(cron).toContain('if (!adoptionPerBusiness)')
    expect(cron).toContain('dag 14 hoppas över')
  })

  test('dag 2 och 14 talar om kontots verkliga luckor, inte generisk drip', () => {
    expect(cron).toContain('hamtaKomIgangSignals(supabase, businessId)')
    expect(cron).toContain('deriveKomIgangTasks(signals).filter(t => !t.klar)')
    expect(cron).toContain('buildDay2EmailHtml(firstName, value, luckor)')
    expect(cron).toContain('buildDay14EmailHtml(firstName, luckor)')
    // Läsfel på luckorna får aldrig fälla mailet
    expect(cron).toContain('return []')
  })

  test('startsidan och mailen läser samma luckor', () => {
    const route = kod('app/api/onboarding/kom-igang/route.ts')
    expect(route).toContain("import { hamtaKomIgangSignals } from '@/lib/onboarding/kom-igang-signals'")
    expect(route).toContain('hamtaKomIgangSignals(supabase, businessId)')
  })
})

test.describe('livscykelschemat — ren logik', () => {
  test('dagarna och flaggorna; dag 7 behåller sitt gamla nyckelnamn', () => {
    expect([...LIVSCYKEL_DAGAR]).toEqual([2, 7, 14])
    expect(flaggaFor(7)).toBe('onboarding_day7_email')
    expect(flaggaFor(2)).toBe('onboarding_day2_email')
    expect(flaggaFor(14)).toBe('onboarding_day14_email')
  })

  test('varje dag har ett eget ämne', () => {
    const amnen = LIVSCYKEL_DAGAR.map(amneFor)
    expect(new Set(amnen).size).toBe(amnen.length)
    expect(amneFor(7)).toBe('Din första vecka med Handymate')
  })

  test('fönstret är tre dygn brett så en missad körning läker nästa dag', () => {
    const now = Date.parse('2026-09-20T06:00:00Z')
    const f = fonsterFor(7, now)
    expect(f.till).toBe('2026-09-13T06:00:00.000Z')
    expect(f.fran).toBe('2026-09-10T06:00:00.000Z')
    expect(FONSTER_DYGN).toBe(3)
    // Fönstren överlappar inte varandra
    const dag2 = fonsterFor(2, now)
    expect(dag2.fran >= f.till).toBe(true)
  })

  test('dag 14 skickas bara under tröskeln', () => {
    expect(skaSkickaDag14(3, 4)).toBe(true)
    expect(skaSkickaDag14(4, 4)).toBe(false)
    expect(skaSkickaDag14(8, 4)).toBe(false)
  })
})
