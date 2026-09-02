/**
 * Facit för lib/onboarding/funnel.ts + inkopplingen (2026-09-01).
 *
 * Låser:
 *  - _funnel stämplas FÖRSTA gången ett steg nås, aldrig om
 *  - klientens eko av _funnel skrivs aldrig tillbaka
 *  - finalize stämplas en gång
 *  - sammanställningen: nådde/bortfall/median per steg, legacy-fallback på
 *    onboarding_step, testkonton exkluderas ur summeringen men listas,
 *    per variant
 *  - PUT /api/onboarding stämplar via servern och tar emot variant; POST
 *    finalize stämplar finalized_at; onboardingsidan skickar variant;
 *    admin-rutten är isAdmin-grindad; ingen migration behövs
 *
 * Körs: npx playwright test tests/onboarding-funnel.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  FUNNEL_KEY,
  FUNNEL_FINAL_STEP,
  harledMaxSteg,
  markFinalized,
  markStepReached,
  readFunnel,
  sammanstallTratt,
  stripFunnelFromClientData,
  type FunnelRow,
} from '../lib/onboarding/funnel'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const T0 = '2026-09-02T08:00:00.000Z'
const min = (m: number) => new Date(Date.parse(T0) + m * 60_000).toISOString()

test.describe('stämpling', () => {
  test('första gången vinner, senare besök ändrar inget, varianten följer senaste', () => {
    let f = markStepReached(null, 1, min(1), 'studio')
    f = markStepReached(f, 2, min(5), 'studio')
    f = markStepReached(f, 1, min(9), 'classic') // tillbaka till steg 1
    expect(f.reached).toEqual({ '1': min(1), '2': min(5) })
    expect(f.variant).toBe('classic')
  })

  test('steg utanför 1–8 stämplas inte (0 och 9); steg 8 stämplas; finalize är en egen stämpel som inte skrivs om', () => {
    const f = markStepReached(null, 0, min(1))
    expect(f.reached).toEqual({})
    const g = markStepReached(f, 9, min(2))
    expect(g.reached).toEqual({})
    const g2 = markStepReached(g, 8, min(2.5))
    expect(g2.reached).toEqual({ '8': min(2.5) })
    const h = markFinalized(g2, min(3))
    expect(h.finalized_at).toBe(min(3))
    expect(markFinalized(h, min(9)).finalized_at).toBe(min(3))
  })

  test('readFunnel tål skräp och klientens eko strippas', () => {
    expect(readFunnel(null)).toBeNull()
    expect(readFunnel({ foo: 1 })).toBeNull()
    expect(readFunnel({ [FUNNEL_KEY]: { reached: { '1': min(1), x: 'nej', '2': 5 }, variant: 'fel' } })).toEqual({ v: 1, reached: { '1': min(1) }, variant: undefined, finalized_at: undefined })
    const client = { businessName: 'AB', [FUNNEL_KEY]: { reached: { '7': min(0) } } }
    expect(stripFunnelFromClientData(client)).toEqual({ businessName: 'AB' })
  })
})

function rad(over: Partial<FunnelRow> & { business_id: string }): FunnelRow {
  return {
    business_name: over.business_id,
    created_at: T0,
    onboarding_step: null,
    onboarding_completed_at: null,
    subscription_status: 'trial',
    stripe_subscription_id: null,
    onboarding_data: null,
    ...over,
  }
}

test.describe('sammanställning', () => {
  test('nådde/bortfall/median per steg + legacy-fallback + klar', () => {
    const rows: FunnelRow[] = [
      // Full resa med tidsstämplar, betalande — reached 1–8 (FUNNEL_FINAL_STEP
      // är nu 9, så det finns ett steg 8 (rundturen) innan finalize).
      rad({ business_id: 'a', stripe_subscription_id: 'sub_1', onboarding_completed_at: min(60), onboarding_data: { [FUNNEL_KEY]: { reached: { '1': min(2), '2': min(6), '3': min(10), '4': min(20), '5': min(30), '6': min(40), '7': min(50), '8': min(55) }, finalized_at: min(60), variant: 'studio' } } }),
      // Fastnade på steg 6 (Aktivera/betalning, den nya ordningen) med
      // tidsstämplar — hann alltså genom import (4) och genomgången (5)
      // innan den övergav betalsteget.
      rad({ business_id: 'b', onboarding_data: { [FUNNEL_KEY]: { reached: { '1': min(4), '2': min(8), '3': min(14), '4': min(20), '5': min(25), '6': min(30) }, variant: 'classic' } } }),
      // Legacy utan tidsstämplar — onboarding_step 4 sparades FÖRE 2026-09-02
      // enligt DÅVARANDE ordning (4 = Aktivera), men tolkas nu (medveten
      // oskärpa) som steg 4 i den NYA ordningen ('Importera data').
      rad({ business_id: 'c', onboarding_step: 4 }),
      // Testkonto — räknas inte
      rad({ business_id: 'd', business_name: 'Testkund E2E', onboarding_step: 7 }),
    ]
    const { summering, foretag } = sammanstallTratt(rows, Date.parse(min(120)))

    expect(summering.foretag).toBe(3)
    expect(summering.exkluderade_test).toBe(1)
    expect(summering.klara).toBe(1)
    expect(summering.betalande).toBe(1)

    const s = Object.fromEntries(summering.steg.map(r => [r.steg, r]))
    expect(s[1].nadde).toBe(3)
    expect(s[4].nadde).toBe(3)
    expect(s[5].nadde).toBe(2)
    expect(s[5].bortfall_pct).toBe(33)
    expect(s[9].nadde).toBe(1)
    // Median steg 1 (från kontoskapande): a=2, b=4 → 3
    expect(s[1].median_minuter).toBe(3)
    expect(s[1].med_tid).toBe(2)
    // Steg 4 från steg 3 ('Importera data'): a=10, b=6 → 8
    expect(s[4].median_minuter).toBe(8)
    expect(summering.median_minuter_till_klar).toBe(60)

    // b (fastnade på Aktivera, nytt steg 6) och c (legacy, tolkas nu som
    // 'Importera data', steg 4) är INTE samma trattsteg längre — den
    // avsiktliga oskärpan för legacy-konton syns direkt här.
    expect(summering.fastnade_pa).toEqual([
      { steg: 6, etikett: 'Aktivera (betalning)', antal: 1 },
      { steg: 4, etikett: 'Importera data', antal: 1 },
    ])
    expect(summering.per_variant.map(v => [v.variant, v.foretag, v.klara])).toEqual([['studio', 1, 1], ['classic', 1, 0], ['okand', 1, 0]])

    const c = foretag.find(f => f.business_id === 'c')!
    expect(c.max_steg).toBe(4)
    expect(c.har_tidsstamplar).toBe(false)
    expect(c.variant).toBe('okand')
    const d = foretag.find(f => f.business_id === 'd')!
    expect(d.is_test).toBe(true)
  })

  test('harledMaxSteg: klar vinner, sedan tidsstämplar, sedan legacy', () => {
    expect(harledMaxSteg(rad({ business_id: 'x', onboarding_completed_at: T0 }), null)).toBe(FUNNEL_FINAL_STEP)
    expect(harledMaxSteg(rad({ business_id: 'x', onboarding_step: 2 }), { v: 1, reached: { '5': T0 } })).toBe(5)
    expect(harledMaxSteg(rad({ business_id: 'x', onboarding_step: 10 }), null)).toBe(FUNNEL_FINAL_STEP)
    expect(harledMaxSteg(rad({ business_id: 'x', onboarding_step: null }), null)).toBe(0)
  })

  test('tom lista ger nollor, inte krasch', () => {
    const { summering } = sammanstallTratt([])
    expect(summering.foretag).toBe(0)
    expect(summering.steg.every(r => r.nadde === 0 && r.median_minuter === null)).toBe(true)
  })
})

test.describe('inkoppling', () => {
  test('PUT /api/onboarding stämplar via servern, strippar klientens eko och läser variant', () => {
    const src = read('app/api/onboarding/route.ts')
    expect(src).toContain("from '@/lib/onboarding/funnel'")
    expect(src).toContain('normaliseraVariant(body.variant)')
    expect(src).toContain('stripFunnelFromClientData(stepData')
    expect(src).toContain('markStepReached(readFunnel(existing), step')
    expect(src).toContain('[FUNNEL_KEY]: funnel')
  })

  test('POST finalize stämplar finalized_at utan att kunna fälla finalize', () => {
    const src = read('app/api/onboarding/route.ts')
    expect(src).toMatch(/try \{[\s\S]*markFinalized\(readFunnel\(existing\)[\s\S]*\} catch/)
  })

  test('onboardingsidan skickar variant med varje saveProgress', () => {
    const src = read('app/onboarding/page.tsx')
    expect(src).toContain("variant: studioMode ? 'studio' : 'classic'")
    expect(src).toMatch(/\[data\.businessId, studioMode\],/)
  })

  test('admin-rutten och sidan finns, isAdmin-grindade, länkade från /admin', () => {
    const route = read('app/api/admin/onboarding-funnel/route.ts')
    expect(route).toContain('isAdmin(request)')
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('sammanstallTratt(')
    expect(fs.existsSync(path.join(ROOT, 'app/admin/onboarding-funnel/page.tsx'))).toBe(true)
    expect(read('app/admin/page.tsx')).toContain('href="/admin/onboarding-funnel"')
  })

  test('ingen migration: tratten bor i onboarding_data', () => {
    const lib = read('lib/onboarding/funnel.ts')
    expect(lib).toContain("FUNNEL_KEY = '_funnel'")
    expect(lib).not.toMatch(/\.from\('/)
    expect(fs.readdirSync(path.join(ROOT, 'sql')).some(f => /funnel|tratt/i.test(f))).toBe(false)
  })
})
