/**
 * Facit för "Att hämta" (Tur 4 etapp 5).
 *
 * Kortet ersätter Fakturor-kortet OCH Pengar på bordet i högerspalten —
 * samma pengar ska aldrig synas som två saker. Det som testas hårdast är
 * ärligheten: totalen är EXAKT summan av raderna, prognoskategorier
 * (marginalrisk, möjliga ÄTA) räknas aldrig in, och utan pengar-data finns
 * inget kort alls — aldrig ett halvt.
 *
 *   npx playwright test tests/att-hamta.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggAttHamta } from '../lib/jarvis/att-hamta'
import type { PengarSummary } from '../lib/value/pengar-pa-bordet'

const ROOT = path.resolve(__dirname, '..')

const kategori = (key: string, over: Record<string, unknown> = {}) => ({
  key: key as any,
  titel: 'x', beskrivning: 'x', summaKr: 0, antal: 0, href: '/x', ...over,
})

const pengar = (kategorier: any[] = [], totalKr = 0): PengarSummary => ({ totalKr, kategorier })

test.describe('mappningen — tre rader, varsin väg', () => {
  test('obetalda, ofakturerat och utan svar med sv-SE-belopp', () => {
    const vy = byggAttHamta({
      obetalda: { antal: 2, summaKr: 7626 },
      pengar: pengar([
        kategori('ofakturerat', { antal: 1, summaKr: 8900 }),
        kategori('offerter', { antal: 3, summaKr: 45000 }),
      ]),
      harFaktureringskort: false,
    })!
    expect(vy.rader.map(r => r.key)).toEqual(['obetalda', 'ofakturerat', 'utan_svar'])
    expect(vy.rader[0].text).toBe(`2 obetalda fakturor · ${(7626).toLocaleString('sv-SE')} kr`)
    expect(vy.rader[1].text).toBe(`1 ofakturerat jobb · ${(8900).toLocaleString('sv-SE')} kr`)
    expect(vy.rader[2].text).toBe(`3 offerter utan svar · ${(45000).toLocaleString('sv-SE')} kr`)
  })

  test('poster utan belopp räknas i antalet men blåser inte upp summan', () => {
    const vy = byggAttHamta({
      obetalda: null,
      pengar: pengar([kategori('ofakturerat', { antal: 1, summaKr: 8900, antalUtanBelopp: 2 })]),
      harFaktureringskort: false,
    })!
    expect(vy.rader[0].text).toBe(`3 ofakturerade jobb · ${(8900).toLocaleString('sv-SE')} kr`)
    expect(vy.totalKr).toBe(8900)
  })
})

test.describe('totalen är summan av raderna — aldrig pengar-sidans total', () => {
  test('marginalrisk och möjliga ÄTA droppas', () => {
    const vy = byggAttHamta({
      obetalda: { antal: 1, summaKr: 1000 },
      pengar: pengar([
        kategori('ofakturerat', { antal: 1, summaKr: 2000 }),
        kategori('offerter', { antal: 1, summaKr: 3000 }),
        kategori('marginalrisk', { antal: 2, summaKr: 99000 }),
        kategori('ata', { antal: 1, summaKr: 50000 }),
      ], 155000),
      harFaktureringskort: false,
    })!
    expect(vy.totalKr).toBe(6000)
    expect(vy.rader).toHaveLength(3)
    expect(vy.rader.every(r => r.key !== ('marginalrisk' as any))).toBe(true)
  })

  test('rader med antal 0 utelämnas', () => {
    const vy = byggAttHamta({
      obetalda: { antal: 0, summaKr: 0 },
      pengar: pengar([kategori('offerter', { antal: 2, summaKr: 12000 })]),
      harFaktureringskort: false,
    })!
    expect(vy.rader.map(r => r.key)).toEqual(['utan_svar'])
    expect(vy.totalKr).toBe(12000)
  })
})

test.describe('väntar ovan', () => {
  test('flaggan sätts på ofakturerat-raden när ett faktureringskort ligger i kön', () => {
    const bygg = (kort: boolean) => byggAttHamta({
      obetalda: null,
      pengar: pengar([kategori('ofakturerat', { antal: 1, summaKr: 8900 })]),
      harFaktureringskort: kort,
    })!
    expect(bygg(true).rader[0].vantarOvan).toBe(true)
    expect(bygg(false).rader[0].vantarOvan).toBeUndefined()
  })
})

test.describe('lugnt läge och tystnad', () => {
  test('allt noll är ett BESKED, inte null — ersätter Fakturor-kortets Inga obetalda', () => {
    const vy = byggAttHamta({ obetalda: { antal: 0, summaKr: 0 }, pengar: pengar(), harFaktureringskort: false })!
    expect(vy).not.toBeNull()
    expect(vy.lugn).toBe(true)
    expect(vy.rader).toEqual([])
    expect(vy.totalKr).toBe(0)
  })

  test('utan pengar-data (403/fel) finns inget kort alls — anställda ser aldrig ett halvt', () => {
    expect(byggAttHamta({ obetalda: { antal: 5, summaKr: 50000 }, pengar: null, harFaktureringskort: false }))
      .toBeNull()
  })
})

test.describe('ytan', () => {
  const home = fs.readFileSync(path.join(ROOT, 'components/jarvis/JarvisHome.tsx'), 'utf8')

  test('de två gamla korten är borta, det nya är där', () => {
    expect(home).not.toContain('PengarRailCard')
    expect(home).not.toContain('title="Fakturor"')
    expect(home).toContain('<AttHamtaRailCard')
  })

  test('beslutskorten bär ankar-id och väntar-ovan scrollar dit', () => {
    expect(home).toContain('id={`beslut-${approval.id}`}')
    expect(home).toContain('scrollIntoView')
  })

  test('lugna beskedet finns i kortet', () => {
    const kort = fs.readFileSync(path.join(ROOT, 'components/jarvis/AttHamtaRailCard.tsx'), 'utf8')
    expect(kort).toContain('Inget att hämta')
    expect(kort).toContain('Karin bevakar fakturor och offerter')
  })
})
