/**
 * Facit: hantverkarens instruktion om avdrag + arbete-mot-material-klassning
 * (2026-09-06). Två fynd vid Codex driftprov på Nordström El:
 *
 *  1. Underlaget sa "Ingen ROT eller RUT i detta prov" — offerten fick ROT
 *     ändå, eftersom bedomAvdrag() bara läser jobbtypen.
 *  2. När avdraget slogs av klassades arbetsraden (enhet "st", arbetsandel
 *     1 190 kr) som material — klassningen läste bara ROT-flaggan och enheten.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { tolkaAvdragsinstruktion, INSTRUKTIONSMONSTER, AVDRAGS_KALLA_INSTRUKTION } from '../lib/rot/instruktion'
import { getQuoteBudgetDerivation } from '../lib/quotes/get-quote-budget-derivation'

const ROOT = path.join(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test.describe('tolkaAvdragsinstruktion — ett uttryckligt nej gäller', () => {
  const nej = [
    'Funktionsprov: byt två vägguttag. Ingen ROT eller RUT i detta prov.',
    'Inget rotavdrag på den här.',
    'Kunden är ett företag, utan avdrag.',
    'ej rot',
    'ROT ska inte användas här',
    'Avdrag: nej',
    'inte ROT-berättigat, kontorslokal',
    'Ingen skattereduktion.',
  ]
  for (const text of nej) test(`"${text}" ⇒ belagt nej med grund och källa`, () => {
    const besked = tolkaAvdragsinstruktion(text)
    expect(besked?.utfall).toBe('nej')
    expect(besked?.grund.length).toBeGreaterThan(10)
    expect(besked?.kalla).toBe(AVDRAGS_KALLA_INSTRUKTION)
  })

  const ingenAsikt = [
    '',
    '   ',
    'Byt två vägguttag i köket, 2 timmar.',
    'ROT-avdrag önskas, kunden äger villan.',
    'Kunden vill ha ROT.',
    'rotavdrag 30 %',
    'Ingen kabeldragning behövs, ROT som vanligt.',
  ]
  for (const text of ingenAsikt) test(`"${text}" ⇒ null (tabellen avgör)`, () => {
    expect(tolkaAvdragsinstruktion(text)).toBeNull()
  })

  test('tolkar aldrig ett ja — bara nej-utfall kan komma ur funktionen', () => {
    const src = utanKommentarer(read('lib/rot/instruktion.ts'))
    expect(src).not.toContain("utfall: 'ja'")
    expect(INSTRUKTIONSMONSTER.length).toBeGreaterThanOrEqual(3)
  })
})

test.describe('Inkoppling i AI-generatorn', () => {
  const src = utanKommentarer(read('lib/ai-quote-generator.ts'))

  test('instruktionen läses ur BÅDA textkällorna och går före bedomAvdrag', () => {
    expect(src).toMatch(/from ['"]@\/lib\/rot\/instruktion['"]/)
    expect(src).toMatch(/tolkaAvdragsinstruktion\(\s*\[input\.textDescription, input\.voiceTranscript\]/)
    expect(src).toMatch(/const rotBesked = avdragsinstruktion \?\? bedomAvdrag\(/)
  })

  test('instruktionen slår även modellens suggestedDeductionType', () => {
    expect(src).toMatch(/suggestedDeductionType: avdragsinstruktion \? 'none' :/)
  })

  test('skälet syns i reasoning så hantverkaren ser varför avdraget saknas', () => {
    expect(src).toContain("`Inget ROT-/RUT-avdrag: ${avdragsinstruktion.grund}`")
  })
})

test.describe('Arbete mot material — arbetsandelen går före avdragsflaggan', () => {
  test('källskanning: båda klassningarna läser labor_amount och selectarna hämtar kolumnen', () => {
    for (const f of ['lib/quotes/get-quote-budget-derivation.ts', 'lib/projects/get-quote-context.ts']) {
      const src = utanKommentarer(read(f))
      expect(src, f).toMatch(/Number\((r|row|j)\.labor_amount \?\? 0\) > 0\) return true/)
      expect(src, f).toMatch(/is_rut_eligible, labor_amount/)
    }
  })

  test('beteende: en arbetsrad med enheten st och ROT avslaget räknas som arbete', async () => {
    const rows = [
      { id: 'a', item_type: 'item', description: 'Elinstallation – byte av två vägguttag', quantity: 2, unit: 'st', unit_price: 850, total: 1700, is_rot_eligible: false, is_rut_eligible: false, labor_amount: 1190, sort_order: 0 },
      { id: 'b', item_type: 'item', description: 'Eluttag (dubbelt) – material', quantity: 2, unit: 'st', unit_price: 220, total: 440, is_rot_eligible: false, is_rut_eligible: false, labor_amount: 0, sort_order: 1 },
      { id: 'c', item_type: 'item', description: 'Småmaterial', quantity: 1, unit: 'st', unit_price: 0, total: 0, is_rot_eligible: false, is_rut_eligible: false, labor_amount: null, sort_order: 2 },
    ]
    const fake: any = { from: () => { const q: any = { select: () => q, eq: () => q, order: () => q, maybeSingle: () => q, then: (ok: any) => Promise.resolve({ data: rows, error: null }).then(ok) }; return q } }
    const res = await getQuoteBudgetDerivation(fake, 'q', 'b')
    expect(res.source).toBe('quote_items_table')
    expect(res.project_type).toBe('mixed')
    expect(res.labor_items.map(i => i.description)).toEqual(['Elinstallation – byte av två vägguttag'])
    // "2 st" är inte två timmar — tidsbudgeten lämnas tom.
    expect(res.budget_hours).toBeNull()
  })
})
