/**
 * Adoptionsmåttet — "aktiv på ≥4 ytor inom 30 dagar" (lib/admin/adoption.ts).
 *
 *   npx playwright test tests/adoption.spec.ts --project=chromium
 *
 * Rena funktioner + källskanning — ingen webbläsare, ingen databas.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  YTA_NYCKLAR,
  ADOPTION_TROSKEL,
  ADOPTION_FONSTER_DAGAR,
  computeAdoption,
  formatAdoption,
  aggregateAdoption,
  type AdoptionHandelse,
  type Yta,
} from '../lib/admin/adoption'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const START = '2026-08-01T10:00:00Z'
const biz = { business_id: 'biz_1', onboarding_completed_at: START }
const h = (yta: Yta, ts: string): AdoptionHandelse => ({ business_id: 'biz_1', yta, ts })

test.describe('computeAdoption — fönstret och tröskeln', () => {
  test('fyra ytor inom fönstret ⇒ aktiv; tre ⇒ inte', () => {
    const tre = [h('kund', '2026-08-02T09:00:00Z'), h('offert', '2026-08-03T09:00:00Z'), h('faktura', '2026-08-04T09:00:00Z')]
    expect(computeAdoption(tre, biz, '2026-08-10T10:00:00Z').aktiv).toBe(false)
    expect(computeAdoption([...tre, h('samtal', '2026-08-05T09:00:00Z')], biz, '2026-08-10T10:00:00Z')).toMatchObject({
      antal: 4,
      aktiv: true,
    })
    expect(ADOPTION_TROSKEL).toBe(4)
    expect(YTA_NYCKLAR.length).toBe(8)
  })

  test('händelser före starten räknas inte — importen i steg 4 sker före finalize', () => {
    const a = computeAdoption(
      [
        h('kund', '2026-07-25T09:00:00Z'), // importerade kunder
        h('faktura', '2026-07-26T09:00:00Z'), // importerad fakturahistorik
        h('offert', '2026-08-02T09:00:00Z'),
      ],
      biz,
      '2026-08-10T10:00:00Z',
    )
    expect(a.ytor).toEqual(['offert'])
    expect(a.antal).toBe(1)
  })

  test('händelser efter dag 30 räknas inte, och gränsen är exklusiv', () => {
    const precisInnan = '2026-08-31T09:59:59Z' // start + 30 d − 1 s
    const precisPa = '2026-08-31T10:00:00Z' // start + 30 d exakt
    expect(computeAdoption([h('kund', precisInnan)], biz, '2026-10-01T10:00:00Z').antal).toBe(1)
    expect(computeAdoption([h('kund', precisPa)], biz, '2026-10-01T10:00:00Z').antal).toBe(0)
    expect(ADOPTION_FONSTER_DAGAR).toBe(30)
  })

  test('samma yta flera gånger räknas en gång', () => {
    const a = computeAdoption(
      [h('matte', '2026-08-02T09:00:00Z'), h('matte', '2026-08-03T09:00:00Z'), h('matte', '2026-08-04T09:00:00Z')],
      biz,
      '2026-08-10T10:00:00Z',
    )
    expect(a.antal).toBe(1)
    expect(a.ytor).toEqual(['matte'])
  })

  test('fältet är EN yta även om händelserna kommer från tid, ÄTA och dagbok', () => {
    // Källorna är tre tabeller men mappas alla till yta 'falt' i hämtningen
    const a = computeAdoption([h('falt', '2026-08-02T09:00:00Z'), h('falt', '2026-08-03T09:00:00Z')], biz, '2026-08-10T10:00:00Z')
    expect(a.antal).toBe(1)
  })

  test('utan slutförd onboarding: dag null, aldrig aktiv', () => {
    expect(computeAdoption([h('kund', '2026-08-02T09:00:00Z')], { business_id: 'biz_1', onboarding_completed_at: null }, '2026-08-10T10:00:00Z')).toEqual({
      ytor: [],
      antal: 0,
      dag: null,
      fonsterKlart: false,
      aktiv: false,
    })
  })

  test('dag räknas från starten, 1 = första dygnet; fönstret stängs på dag 30', () => {
    expect(computeAdoption([], biz, '2026-08-01T11:00:00Z').dag).toBe(1)
    expect(computeAdoption([], biz, '2026-08-12T22:00:00Z').dag).toBe(12)
    expect(computeAdoption([], biz, '2026-08-30T10:00:00Z').fonsterKlart).toBe(false)
    expect(computeAdoption([], biz, '2026-08-31T10:00:00Z').fonsterKlart).toBe(true)
  })

  test('skräptidsstämplar ignoreras i stället för att fälla räkningen', () => {
    const a = computeAdoption([h('kund', 'inte-ett-datum'), h('offert', '2026-08-02T09:00:00Z')], biz, '2026-08-10T10:00:00Z')
    expect(a.antal).toBe(1)
  })
})

test.describe('formatAdoption', () => {
  test('etiketten', () => {
    expect(formatAdoption({ ytor: [], antal: 3, dag: 12, fonsterKlart: false, aktiv: false })).toBe('3/8 ytor · dag 12')
    expect(formatAdoption({ ytor: [], antal: 5, dag: 40, fonsterKlart: true, aktiv: true })).toBe('5/8 ytor · aktiv')
    expect(formatAdoption({ ytor: [], antal: 0, dag: null, fonsterKlart: false, aktiv: false })).toBe('—')
  })
})

test.describe('aggregateAdoption — GTM-tavlans KPI', () => {
  const rad = (over: Partial<ReturnType<typeof computeAdoption>>) => ({
    ytor: [] as Yta[],
    antal: 0,
    dag: 5 as number | null,
    fonsterKlart: false,
    aktiv: false,
    ...over,
  })

  test('andelen räknas bara på konton vars fönster stängt', () => {
    const agg = aggregateAdoption([
      rad({ fonsterKlart: true, aktiv: true }),
      rad({ fonsterKlart: true, aktiv: false }),
      rad({ fonsterKlart: false, aktiv: true }),
      rad({ dag: null }), // onboarding inte klar
    ])
    expect(agg).toEqual({ klara: 2, aktivaKlara: 1, andel: 0.5, pagaende: 1, aktivaPagaende: 1 })
  })

  test('inget stängt fönster ⇒ andel null, inte 0 (annars ser tavlan ut som ett misslyckande)', () => {
    expect(aggregateAdoption([rad({ fonsterKlart: false })]).andel).toBeNull()
    expect(aggregateAdoption([]).andel).toBeNull()
  })
})

test.describe('källskanning — hämtningen frågar rätt tabeller med rätt filter', () => {
  const src = kod('lib/admin/adoption.ts')

  test('varje yta har sin källa och sina filter', () => {
    expect(src).toContain("tabell: 'call_recording'")
    expect(src).toContain("q.eq('direction', 'inbound')")
    expect(src).toContain("tabell: 'pending_approvals'")
    expect(src).toContain("q.in('status', ['approved', 'rejected']).neq('approval_type', 'team_intro')")
    expect(src).toContain("tabell: 'quotes'")
    expect(src).toContain("tabell: 'invoice'")
    expect(src).toContain("tabell: 'customer'")
    expect(src).toContain("tabell: 'project'")
    expect(src).toContain("tabell: 'thread_message'")
    expect(src).toContain("q.eq('role', 'user')")
    // Matte-chatten ligger i thread_message — matte_messages är ett äldre parallellspår
    expect(src).not.toContain("'matte_messages'")
    expect(src).toContain("tabell: 'time_entry'")
    expect(src).toContain("tabell: 'project_change'")
    expect(src).toContain("tabell: 'field_reports'")
  })

  test('offert och faktura räknas på sent_at, inte created_at — skapad ≠ skickad', () => {
    expect(src).toMatch(/tabell: 'quotes', ts: 'sent_at'/)
    expect(src).toMatch(/tabell: 'invoice', ts: 'sent_at'/)
    expect(src).toMatch(/tabell: 'pending_approvals',\s*ts: 'resolved_at'/)
  })

  test('läsfel per källa utelämnar bara den ytan', () => {
    expect(src).toContain('ytan utelämnas')
    expect(src).toContain('.in(\'business_id\', ids)')
  })
})

test.describe('källskanning — adminvyn', () => {
  test('pilots-rutten räknar adoptionen och tål läsfel', () => {
    const s = kod('app/api/admin/pilots/route.ts')
    expect(s).toContain('hamtaAdoptionHandelser(')
    expect(s).toContain('adoptionen utelämnas')
    expect(s).toContain('adoption: aggregateAdoption(')
    expect(s).toContain('adoptionLabel: formatAdoption(adoption)')
    // Demokontot är seedat och skulle ljuga uppåt
    expect(s).toContain('process.env.DEMO_BUSINESS_ID')
  })

  test('admin-tabellen visar kolumnen och KPI-kortet', () => {
    const s = kod('app/admin/onboard/page.tsx')
    expect(s).toContain('>Adoption</th>')
    expect(s).toContain('pilot.adoptionLabel')
    expect(s).toContain('Aktiva inom 30 d')
    expect(s).toContain('ADOPTIONSYTOR')
  })
})
