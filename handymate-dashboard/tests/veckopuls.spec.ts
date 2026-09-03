/**
 * Facit: Veckopulsen i Launch Desk (tasks/plan-veckopuls.md).
 *
 * Browserlös: ren enhetstest av veckostartStockholm + källskanningar av
 * lib/launch-desk/veckopuls.ts, rutten och panelen. Ingen session, inga
 * nätanrop, inga hemligheter.
 *
 * Körs: npx playwright test tests/veckopuls.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { veckostartStockholm } from '../lib/launch-desk/veckopuls'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n')

test.describe('veckostartStockholm — måndag 00:00 svensk tid, aldrig UTC', () => {
  test('vanlig sommarvecka (CEST, +02:00): onsdag mitt i veckan ⇒ måndagen samma vecka', () => {
    // Ons 2026-07-15 14:00 Stockholm (12:00 UTC) ⇒ mån 2026-07-13 00:00 CEST = 2026-07-12T22:00:00Z
    expect(veckostartStockholm(new Date('2026-07-15T12:00:00Z')).toISOString()).toBe('2026-07-12T22:00:00.000Z')
  })

  test('söndagkväll: hör till veckan som redan gått, inte veckan som börjar dagen efter', () => {
    // Sön 2026-09-06 22:00 Stockholm (CEST) ⇒ mån 2026-08-31 00:00 CEST = 2026-08-30T22:00:00Z.
    // Ett UTC-baserat svep hade lätt gett fel svar här (kvällen ligger sent nog
    // att en naiv UTC-midnatt redan glidit in i "fel" dygn).
    expect(veckostartStockholm(new Date('2026-09-06T20:00:00Z')).toISOString()).toBe('2026-08-30T22:00:00.000Z')
  })

  test('exakt måndag 00:00 svensk tid ⇒ oförändrad instant', () => {
    expect(veckostartStockholm(new Date('2026-07-12T22:00:00Z')).toISOString()).toBe('2026-07-12T22:00:00.000Z')
  })

  test.describe('sommartidsövergången (Sverige växlar CEST→CET sista söndagen i oktober)', () => {
    // Veckan mån 2026-10-19 – sön 2026-10-25 innehåller själva växlingen på
    // sin sista dag. Måndagens 00:00 är fortfarande CEST (+02:00) =
    // 2026-10-18T22:00:00Z, även när "nu" ligger EFTER växlingen (då redan
    // CET, +01:00) — funktionen får aldrig återanvända "nu":s offset för
    // måndagens egen midnatt.
    const forvantadVeckostart = '2026-10-18T22:00:00.000Z'

    test('nu mitt i veckan, FÖRE växlingen (fortfarande CEST)', () => {
      expect(veckostartStockholm(new Date('2026-10-21T07:00:00Z')).toISOString()).toBe(forvantadVeckostart)
    })

    test('nu på söndagen, EFTER växlingen (redan CET) — måndagen ska ändå räknas i CEST', () => {
      expect(veckostartStockholm(new Date('2026-10-25T09:00:00Z')).toISOString()).toBe(forvantadVeckostart)
    })
  })
})

test.describe('källskanning — lib/launch-desk/veckopuls.ts', () => {
  const kod = read('lib/launch-desk/veckopuls.ts')

  test('importerar PAID_STATES istället för att hårdkoda betalda statusar', () => {
    expect(kod).toContain("from '@/lib/onboarding/payment-gate'")
    expect(kod).toContain('PAID_STATES')
    expect(kod).not.toContain("['active', 'comp']")
    expect(kod).not.toContain("['active','comp']")
  })

  test('återanvänder adoptionsmåttet — definierar ingen egen "aktiv"', () => {
    expect(kod).toContain("from '@/lib/admin/adoption'")
    expect(kod).toContain('hamtaAdoptionHandelser')
    expect(kod).toContain('computeAdoption')
    expect(kod).toContain('aggregateAdoption')
  })

  test('innehåller inga andra tabellnamn än de fyra verifierade', () => {
    const franTabeller = Array.from(kod.matchAll(/\.from\('([a-z_]+)'\)/g)).map(m => m[1])
    const tillatna = new Set(['gtm_activity', 'gtm_account', 'raddningsarende', 'business_config'])
    const okanda = franTabeller.filter(t => !tillatna.has(t))
    expect(okanda).toEqual([])
    // Sanity: alla fyra används faktiskt (annars testar vi ingenting)
    for (const t of Array.from(tillatna)) expect(franTabeller).toContain(t)
  })

  test('fail-soft: fångar fel istället för att kasta ut ur hamtaVeckopuls', () => {
    expect(kod).toContain('export async function hamtaVeckopuls')
    expect(kod).toContain('export function veckostartStockholm')
    expect(kod.match(/catch/g)?.length || 0).toBeGreaterThanOrEqual(3)
  })
})

test.describe('källskanning — GET /api/admin/launch/veckopuls', () => {
  const route = read('app/api/admin/launch/veckopuls/route.ts')

  test('platformsadmin-grinden + force-dynamic (samma mönster som andra Launch Desk-rutter)', () => {
    expect(route).toContain('isAdmin(')
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect(route).toContain('hamtaVeckopuls(')
  })
})

test.describe('källskanning — panelen i app/admin/launch/page.tsx', () => {
  const sida = read('app/admin/launch/page.tsx')

  test('"Kontant inne" visar aldrig en påhittad siffra', () => {
    expect(sida).toContain('Inte kopplad än')
    expect(sida).not.toMatch(/0\s*kr/i)
  })

  test('kontakter=0 markeras uttryckligen, inte bara som en tyst nolla', () => {
    expect(sida).toContain('Ingen kontakt loggad den här veckan.')
  })

  test('panelen läser den nya rutten', () => {
    expect(sida).toContain('/api/admin/launch/veckopuls')
  })
})
