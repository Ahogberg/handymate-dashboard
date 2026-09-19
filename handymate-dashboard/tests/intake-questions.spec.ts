import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  applyIntakeAnswers, bindIntakeQuestions, buildIntakeAnswerSet, equivalentUnit, intakeAnswersText, intakeRowTakesQuantity, intakeTargetsFromRows,
  intakeChoiceRowId, missingIntakeTargets, readIntakeAnswerSet, readIntakeQuestions, seedIntakeQuestions, validateIntakeQuestions, INTAKE_SEED_MAX, type IntakeQuestion,
} from '../lib/quotes/intake-questions'
import { fetchIntakeQuestions } from '../lib/quotes/intake-flow'

// Frågeflöde per jobbtyp (2026-09-17, Andreas: "frågeflöden per jobbtyp byggs
// först … seedade per bransch som kan redigeras, bytas ut och fyllas på").
//
// Andra versionen samma dag: en fråga pekar på RADER (mallradens id), inte
// på en enhet eller en text. Första versionen gav "hur stor yta?" till både
// golv- och väggraden — samma enhet, olika betydelse. Facit här låser att
// det är omöjligt: golvfrågan sätter golvraden och bara den.
//
// Facit: rena funktioner (form, bindning, seedning, svar→rader, svar→text),
// transporten (läsfel är aldrig tomma frågor) och källskanning av kopplingen:
// frågorna öppnas FÖRE upplägget läggs in, hoppa över ger upplägget orört,
// svaren sparas validerade på offerten, remsan QuoteJobTypeStart rörs inte.
// Kör: npx playwright test tests/intake-questions.spec.ts --no-deps

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

/** Upplägget: golv och vägg har SAMMA enhet men olika betydelse. */
const rader = () => [
  { id: 'qi_rubrik', item_type: 'heading', description: 'Badrum', unit: '', quantity: 1 },
  { id: 'qi_golv', item_type: 'item', description: 'Klinker golv', unit: 'm2', quantity: 1, linked_product_id: 'prod_klinker' },
  { id: 'qi_vagg', item_type: 'item', description: 'Kakel vägg', unit: 'M²', quantity: 1, linked_product_id: 'prod_kakel' },
  { id: 'qi_rivning', item_type: 'item', description: 'Rivning', unit: 'tim', quantity: 8, linked_product_id: 'prod_arbete' },
  { id: 'qi_blandare', item_type: 'item', description: 'Blandare', unit: 'st', quantity: 1, linked_product_id: 'prod_blandare' },
  // Fri rad utan artikelkoppling: går inte att peka på, och rörs inte ens om någon pekar.
  { id: 'qi_fri', item_type: 'item', description: 'Egen rad', unit: 'm2', quantity: 3 },
  { id: 'qi_golvvarme', item_type: 'option', description: 'Golvvärme elektrisk', unit: 'm²', quantity: 1, option_selected: false, option_default: false },
  { id: 'qi_tork', item_type: 'option', description: 'Handdukstork', unit: 'st', quantity: 1, option_selected: true, option_default: true },
]

const fragor: IntakeQuestion[] = [
  { id: 'golv_m2', label: 'Klinker golv: hur många m²?', kind: 'number', unit: 'm2', targets: ['qi_golv'] },
  { id: 'vagg_m2', label: 'Kakel vägg: hur många m²?', kind: 'number', unit: 'M²', targets: ['qi_vagg'] },
  { id: 'antal_st', label: 'Hur många blandare?', kind: 'number', unit: 'st', targets: ['qi_blandare'] },
  { id: 'golvvarme', label: 'Ska det vara golvvärme?', kind: 'yesno', targets: ['qi_golvvarme'] },
  { id: 'ytskikt', label: 'Vilket ytskikt?', kind: 'choice', choices: [{ label: 'Kakel' }, { label: 'Klinker' }] },
  { id: 'ovrigt', label: 'Något som påverkar tiden?', kind: 'text' },
]

/** Bee Services faktiska badrumsmall i produktion (2026-09-17): mallen används
    som miniräknare — beloppet ligger i antalet, á-priset är 1, allt är "st",
    ingen rad är kopplad till en artikel. Frågeflödet får aldrig röra den. */
const miniraknarmall = () => [
  { id: 'qi_b1', item_type: 'heading', description: 'Rivning till tätskigt', unit: 'st', quantity: 0 },
  { id: 'qi_b2', item_type: 'item', description: 'Arbete', unit: 'st', quantity: 160 },
  { id: 'qi_b3', item_type: 'item', description: 'Material> färdigt Tätskigt', unit: 'st', quantity: 25348 },
  { id: 'qi_b4', item_type: 'item', description: 'Standard paketet Kakel/ klinker & möbler', unit: 'st', quantity: 55211 },
]

test.describe('formen — validateIntakeQuestions / readIntakeQuestions', () => {
  test('giltig lista går igenom oförändrad i innehåll', () => {
    expect(validateIntakeQuestions(fragor)).toEqual(fragor)
  })
  test('null är "aldrig redigerade", skräp är "inga frågor"', () => {
    expect(readIntakeQuestions(null)).toBeNull()
    expect(readIntakeQuestions(undefined)).toBeNull()
    expect(readIntakeQuestions('nej')).toEqual([])
    expect(readIntakeQuestions([{ id: 'x', label: 'Y', kind: 'raket' }])).toEqual([])
  })
  test('fel som avvisas: för många, dubbla nycklar, okända fält, enhet/rader/alternativ på fel typ', () => {
    expect(() => validateIntakeQuestions(Array.from({ length: 21 }, (_, i) => ({ id: `q${i}`, label: 'x', kind: 'text' })))).toThrow(/Högst 20/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text' }, { id: 'a', label: 'y', kind: 'text' }])).toThrow(/nyckeln/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text', price: 1 }])).toThrow(/okända fält/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'yesno', optionMatch: 'golv' }])).toThrow(/okända fält/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text', unit: 'm²' }])).toThrow(/Bara mått/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'choice', choices: ['1', '2'], targets: ['qi_1'] }])).toThrow(/peka på rader/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text', targets: ['qi_1'] }])).toThrow(/peka på rader/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'number', targets: ['bad id!'] }])).toThrow(/ogiltigt id/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'number', targets: 'qi_1' }])).toThrow(/fel form/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'number', targets: Array.from({ length: 51 }, (_, i) => `qi_${i}`) }])).toThrow(/för många rader/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'text', choices: ['1', '2'] }])).toThrow(/Bara valfrågor/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'choice', choices: ['1'] }])).toThrow(/2–12/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'choice', choices: ['1', '1'] }])).toThrow(/dubbla/)
    expect(() => validateIntakeQuestions([{ id: 'Stor Nyckel', label: 'x', kind: 'text' }])).toThrow(/nyckel/)
    expect(() => validateIntakeQuestions([{ id: 'a', label: 'x'.repeat(201), kind: 'text' }])).toThrow(/200/)
  })
  test('tom radlista och tom enhet sparas inte som fält; dubbla rad-id slås ihop', () => {
    expect(validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'yesno', targets: [] }])).toEqual([{ id: 'a', label: 'x', kind: 'yesno' }])
    expect(validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'number', unit: '', targets: null }])).toEqual([{ id: 'a', label: 'x', kind: 'number' }])
    expect(validateIntakeQuestions([{ id: 'a', label: 'x', kind: 'number', targets: ['qi_1', 'qi_1'] }])).toEqual([{ id: 'a', label: 'x', kind: 'number', targets: ['qi_1'] }])
  })
})

test.describe('raderna att peka på — intakeTargetsFromRows / bindIntakeQuestions', () => {
  test('kopplade artikelrader blir mängdmål, tillval blir kryssmål, resten utelämnas', () => {
    expect(intakeTargetsFromRows(rader())).toEqual([
      { id: 'qi_golv', description: 'Klinker golv', unit: 'm2', kind: 'quantity' },
      { id: 'qi_vagg', description: 'Kakel vägg', unit: 'M²', kind: 'quantity' },
      { id: 'qi_rivning', description: 'Rivning', unit: 'tim', kind: 'quantity' },
      { id: 'qi_blandare', description: 'Blandare', unit: 'st', kind: 'quantity' },
      { id: 'qi_golvvarme', description: 'Golvvärme elektrisk', unit: 'm²', kind: 'option' },
      { id: 'qi_tork', description: 'Handdukstork', unit: 'st', kind: 'option' },
    ])
    // Utan id går raden inte att peka på — och miniräknarmallen ger inga mängdmål alls.
    expect(intakeTargetsFromRows([{ item_type: 'item', unit: 'm2', linked_product_id: 'p1' }])).toEqual([])
    expect(intakeTargetsFromRows(miniraknarmall())).toEqual([])
  })
  test('bindningen mot upplägget: rad som saknas, fel slag och blandade enheter avvisas; enheten härleds ur raderna', () => {
    const mal = intakeTargetsFromRows(rader())
    expect(bindIntakeQuestions([{ id: 'a', label: 'Yta', kind: 'number', targets: ['qi_golv', 'qi_vagg'] }], mal))
      .toEqual([{ id: 'a', label: 'Yta', kind: 'number', targets: ['qi_golv', 'qi_vagg'], unit: 'm2' }])
    expect(() => bindIntakeQuestions([{ id: 'a', label: 'Yta', kind: 'number', targets: ['qi_finns_inte'] }], mal)).toThrow(/inte finns i upplägget/)
    expect(() => bindIntakeQuestions([{ id: 'a', label: 'Yta', kind: 'number', targets: ['qi_golvvarme'] }], mal)).toThrow(/kopplade till en artikel/)
    expect(() => bindIntakeQuestions([{ id: 'a', label: 'Yta', kind: 'number', targets: ['qi_golv', 'qi_rivning'] }], mal)).toThrow(/olika enheter.*dela upp/)
    expect(() => bindIntakeQuestions([{ id: 'a', label: 'Värme', kind: 'yesno', targets: ['qi_golv'] }], mal)).toThrow(/bara kryssa tillvalsrader/)
    // Utan rader: enheten på en mängdfråga får stå kvar (visning), på annat tas den bort.
    expect(bindIntakeQuestions([{ id: 'a', label: 'x', kind: 'number', unit: 'm²' }, { id: 'b', label: 'y', kind: 'yesno', unit: 'x' } as IntakeQuestion], mal))
      .toEqual([{ id: 'a', label: 'x', kind: 'number', unit: 'm²' }, { id: 'b', label: 'y', kind: 'yesno' }])
    expect(equivalentUnit('m2', 'KVM')).toBe(true); expect(equivalentUnit('m', 'm2')).toBe(false); expect(equivalentUnit('st', 'paket')).toBe(false)
  })
  test('en sparad fråga vars rad försvunnit ur upplägget syns som saknad — utan att kasta', () => {
    const mal = intakeTargetsFromRows(rader())
    expect(missingIntakeTargets({ id: 'a', label: 'x', kind: 'number', targets: ['qi_golv', 'qi_borta'] }, mal)).toEqual(['qi_borta'])
    expect(missingIntakeTargets({ id: 'a', label: 'x', kind: 'text' }, mal)).toEqual([])
  })
})

test.describe('seedningen — en fråga per kopplad rad och per tillval, sedan bransch, sist öppen', () => {
  test('golv och vägg blir TVÅ frågor med varsin rad — aldrig en per enhet', () => {
    const seeded = seedIntakeQuestions('construction', 'Renovera badrum', intakeTargetsFromRows(rader()))
    const numbers = seeded.filter(q => q.kind === 'number')
    expect(numbers.map(q => q.targets)).toEqual([['qi_golv'], ['qi_vagg'], ['qi_rivning'], ['qi_blandare']])
    expect(numbers.map(q => q.unit)).toEqual(['m2', 'M²', 'tim', 'st'])
    expect(numbers[0].label).toBe('Klinker golv: hur många m2?')
    const yesno = seeded.filter(q => q.kind === 'yesno')
    expect(yesno.map(q => q.targets)).toEqual([['qi_golvvarme'], ['qi_tork']])
    expect(yesno[0].label).toBe('Ska Golvvärme elektrisk ingå?')
    expect(seeded[seeded.length - 1].id).toBe('paverkar_tiden')
  })
  test('nycklarna är unika även när två rader heter likadant', () => {
    const seeded = seedIntakeQuestions('other', 'Två badrum', [
      { id: 'qi_1', description: 'Kakel', unit: 'm2', kind: 'quantity' }, { id: 'qi_2', description: 'Kakel', unit: 'm2', kind: 'quantity' },
    ])
    expect(seeded.slice(0, 2).map(q => q.id)).toEqual(['rad_kakel', 'rad_kakel_2'])
    expect(() => validateIntakeQuestions(seeded)).not.toThrow()
  })
  test('branschpaketets frågor följer med när namnet matchar, sist en öppen fråga, taket är INTAKE_SEED_MAX', () => {
    const seeded = seedIntakeQuestions('electrician', 'Laddbox', [{ id: 'qi_1', description: 'Laddbox', unit: 'st', kind: 'quantity' }])
    expect(seeded.filter(q => q.id.startsWith('paket_')).map(q => q.label)).toEqual(['Vilken modell och placering?', 'Vilken kabelväg och vilket markarbete behövs?'])
    expect(seeded[seeded.length - 1].id).toBe('paverkar_tiden')
    const manga = Array.from({ length: 15 }, (_, i) => ({ id: `qi_${i}`, description: `Rad ${i}`, unit: 'st', kind: 'quantity' as const }))
    expect(seedIntakeQuestions('electrician', 'Laddbox', manga)).toHaveLength(INTAKE_SEED_MAX)
    expect(INTAKE_SEED_MAX).toBe(12)
  })
  test('närliggande bransch lånar paketen; okänd bransch ger ändå rad-, besöks- och öppen fråga', () => {
    expect(seedIntakeQuestions('carpenter', 'Fönster och dörrar', []).some(q => q.id === 'paket_1')).toBe(true)
    const other = seedIntakeQuestions('other', 'Servicebesök', [{ id: 'qi_t', description: 'Arbete', unit: 'tim', kind: 'quantity' }])
    expect(other.map(q => q.id)).toEqual(['rad_arbete', 'planerade_besok', 'paverkar_tiden'])
  })
  // RIVNING PAKET C (2026-09-17, rad 2.14): ersätter VisitRuleEditor +
  // /api/quotes/visit-rule — en fritextfråga i stället för en egen editor
  // med sparad regel per jobbtyp.
  test('besöksfrågan seedas efter branschpaketet och före den öppna frågan', () => {
    const seeded = seedIntakeQuestions('electrician', 'Laddbox', [{ id: 'qi_1', description: 'Laddbox', unit: 'st', kind: 'quantity' }])
    const ids = seeded.map(q => q.id)
    const besokIndex = ids.indexOf('planerade_besok')
    expect(besokIndex).toBeGreaterThan(-1)
    expect(seeded[besokIndex].kind).toBe('text')
    expect(seeded[besokIndex].label).toBe('Hur många besök räknar du med?')
    expect(besokIndex).toBeGreaterThan(ids.lastIndexOf('paket_2'))
    expect(besokIndex).toBeLessThan(ids.indexOf('paverkar_tiden'))
  })
  test('seedade frågor är giltiga enligt formen och binder mot samma upplägg', () => {
    const mal = intakeTargetsFromRows(rader())
    const seeded = seedIntakeQuestions('plumber', 'Avlopp', mal)
    expect(() => bindIntakeQuestions(validateIntakeQuestions(seeded), mal)).not.toThrow()
  })
  test('okopplade rader ger inga mängdfrågor — en fråga som inte kan sätta något föreslås aldrig', () => {
    const seeded = seedIntakeQuestions('construction', 'Badrum', intakeTargetsFromRows(miniraknarmall()))
    expect(seeded.every(q => q.kind !== 'number')).toBe(true)
    expect(seeded.some(q => q.id === 'paverkar_tiden')).toBe(true)
  })
})

test.describe('svar → rader — applyIntakeAnswers', () => {
  test('golvfrågan sätter golvraden och BARA den — väggen med samma enhet rörs inte', () => {
    const before = rader()
    const after = applyIntakeAnswers(before, fragor, { golv_m2: '6,5', antal_st: 3 })
    //                                     rubrik golv vägg riv  st  fri  opt opt
    expect(after.map(r => r.quantity)).toEqual([1, 6.5, 1, 8, 3, 3, 1, 1])
    // Orörda rader är samma objekt — inget kopieras i onödan.
    expect(after[0]).toBe(before[0]); expect(after[2]).toBe(before[2]); expect(after[3]).toBe(before[3]); expect(after[5]).toBe(before[5])
    expect(after[1]).not.toBe(before[1])
    // Väggfrågan sätter väggen, stavningen på enheten spelar ingen roll.
    expect(applyIntakeAnswers(before, fragor, { vagg_m2: 12 }).map(r => r.quantity)).toEqual([1, 1, 12, 8, 1, 3, 1, 1])
  })
  test('en fråga som pekar på två rader sätter båda — det är hantverkarens uttalade val', () => {
    const yta: IntakeQuestion = { id: 'yta', label: 'Yta', kind: 'number', unit: 'm2', targets: ['qi_golv', 'qi_vagg'] }
    expect(applyIntakeAnswers(rader(), [yta], { yta: 6.5 }).map(r => r.quantity)).toEqual([1, 6.5, 6.5, 8, 1, 3, 1, 1])
  })
  test('att peka på en okopplad rad, en rad som inte finns eller en rad av fel slag ändrar ingenting', () => {
    const before = rader()
    const fel: IntakeQuestion[] = [
      { id: 'fri', label: 'x', kind: 'number', unit: 'm2', targets: ['qi_fri'] },
      { id: 'borta', label: 'x', kind: 'number', unit: 'm2', targets: ['qi_borta'] },
      { id: 'opt', label: 'x', kind: 'number', unit: 'm²', targets: ['qi_golvvarme'] },
      { id: 'jn', label: 'x', kind: 'yesno', targets: ['qi_golv'] },
    ]
    const after = applyIntakeAnswers(before, fel, { fri: 99, borta: 99, opt: 99, jn: true })
    expect(after).toEqual(before)
    after.forEach((row, i) => expect(row).toBe(before[i]))
  })
  test('tomt, noll eller hoppat svar rör ingen rad', () => {
    const before = rader()
    expect(applyIntakeAnswers(before, fragor, { golv_m2: '', antal_st: 0 })).toEqual(before)
    expect(applyIntakeAnswers(before, fragor, {})).toEqual(before)
  })
  test('ja/nej kryssar exakt den pekade tillvalsraden — på id, inte text', () => {
    const ja = applyIntakeAnswers(rader(), fragor, { golvvarme: true })
    expect(ja[6].option_selected).toBe(true); expect(ja[6].option_default).toBe(true); expect(ja[7].option_selected).toBe(true)
    const nej = applyIntakeAnswers(rader(), fragor, { golvvarme: false })
    expect(nej[6].option_selected).toBe(false); expect(nej[7].option_selected).toBe(true)
    // Omdöpt rad kryssas ändå; rad med samma ord men annat id kryssas inte.
    const omdopta = rader().map(r => r.id === 'qi_golvvarme' ? { ...r, description: 'Värmeslinga i golvet' } : r)
    expect(applyIntakeAnswers(omdopta, fragor, { golvvarme: true })[6].option_selected).toBe(true)
    const kopia = [...rader(), { id: 'qi_annan', item_type: 'option', description: 'Golvvärme elektrisk', unit: 'm²', quantity: 1, option_selected: false, option_default: false }]
    expect(applyIntakeAnswers(kopia, fragor, { golvvarme: true })[8].option_selected).toBe(false)
    const utan = applyIntakeAnswers(rader(), [{ id: 'q', label: 'x', kind: 'yesno' }], { q: true })
    expect(utan).toEqual(rader())
  })
  test('val och fritext rör aldrig rader utan en radbyggare', () => {
    // Utan buildRow kan en valfråga inte skapa något — modulen kan mappa T
    // till T men inte hitta på ett T. Anroparen äger radens form.
    expect(applyIntakeAnswers(rader(), fragor, { ytskikt: 'Kakel', ovrigt: '12 m² extra' })).toEqual(rader())
  })

  test.describe('valfrågan lägger in artikelns rad', () => {
    type Rad = ReturnType<typeof rader>[number]
    const medArtikel: IntakeQuestion[] = [{
      id: 'ytskikt', label: 'Vilket ytskikt?', kind: 'choice',
      choices: [{ label: 'Kakel', productId: 'p_kakel' }, { label: 'Klinker', productId: 'p_klinker' }, { label: 'Vet ej' }],
    }]
    const priser: Record<string, { name: string; unit: string; price: number }> = {
      p_kakel: { name: 'Kakel 20x20', unit: 'm²', price: 349 },
      p_klinker: { name: 'Klinker 30x30', unit: 'm²', price: 429 },
    }
    const byggare = ({ choice, rowId }: { choice: { productId?: string }; rowId: string }) => {
      const a = choice.productId ? priser[choice.productId] : undefined
      if (!a) return null
      return { id: rowId, item_type: 'item', description: a.name, unit: a.unit, quantity: 1, unit_price: a.price, linked_product_id: choice.productId } as unknown as Rad
    }

    test('valt alternativ med artikel ger en ny rad, kopplad till artikeln', () => {
      const ut = applyIntakeAnswers(rader(), medArtikel, { ytskikt: 'Kakel' }, { buildRow: byggare })
      expect(ut).toHaveLength(rader().length + 1)
      const ny = ut[ut.length - 1] as any
      expect(ny.description).toBe('Kakel 20x20')
      expect(ny.linked_product_id).toBe('p_kakel')
      expect(ny.unit_price).toBe(349)
    })

    test('omtaget svar ERSÄTTER raden — id:t härleds ur frågan, inte ur alternativet', () => {
      const forst = applyIntakeAnswers(rader(), medArtikel, { ytskikt: 'Kakel' }, { buildRow: byggare })
      const sedan = applyIntakeAnswers(forst, medArtikel, { ytskikt: 'Klinker' }, { buildRow: byggare })
      expect(sedan).toHaveLength(rader().length + 1)
      expect((sedan[sedan.length - 1] as any).description).toBe('Klinker 30x30')
      expect(sedan.filter(r => r.id === intakeChoiceRowId('ytskikt'))).toHaveLength(1)
    })

    test('ett alternativ utan artikel tar bort raden ett tidigare val lade in', () => {
      const forst = applyIntakeAnswers(rader(), medArtikel, { ytskikt: 'Kakel' }, { buildRow: byggare })
      const sedan = applyIntakeAnswers(forst, medArtikel, { ytskikt: 'Vet ej' }, { buildRow: byggare })
      expect(sedan).toEqual(rader())
    })

    test('ett rensat svar tar bort raden — inget spöke från förra svaret blir kvar', () => {
      const forst = applyIntakeAnswers(rader(), medArtikel, { ytskikt: 'Kakel' }, { buildRow: byggare })
      expect(applyIntakeAnswers(forst, medArtikel, {}, { buildRow: byggare })).toEqual(rader())
    })

    test('TVÅ PASS: en mängdfråga kan peka på raden som valfrågan just skapade', () => {
      // Hela skälet till att strukturen körs före mängderna. Körs de i fel
      // ordning finns raden ännu inte när mängden ska sättas, och talet tappas.
      const fragorna: IntakeQuestion[] = [
        { id: 'ytan', label: 'Hur många m²?', kind: 'number', unit: 'm²', targets: [intakeChoiceRowId('ytskikt')] },
        ...medArtikel,
      ]
      const ut = applyIntakeAnswers(rader(), fragorna, { ytskikt: 'Kakel', ytan: 12 }, { buildRow: byggare })
      const ny = ut.find(r => r.id === intakeChoiceRowId('ytskikt')) as any
      expect(ny).toBeTruthy()
      expect(ny.quantity).toBe(12)
    })
  })
  test('miniräknarmallen (belopp i antalet, allt "st", inga artiklar) lämnas helt orörd — även om någon pekar på raderna', () => {
    const before = miniraknarmall()
    const pekar: IntakeQuestion[] = [{ id: 'st', label: 'Hur många?', kind: 'number', unit: 'st', targets: ['qi_b2', 'qi_b3', 'qi_b4'] }]
    const after = applyIntakeAnswers(before, pekar, { st: 3 })
    expect(after).toEqual(before)
    after.forEach((row, index) => expect(row).toBe(before[index]))
    // Regressionen som vakten finns för: utan kopplingskravet hade 25 348 blivit 3.
    expect(after[2].quantity).toBe(25348)
  })
  test('intakeRowTakesQuantity kräver artikelrad OCH koppling', () => {
    expect(intakeRowTakesQuantity({ item_type: 'item', linked_product_id: 'p1' })).toBe(true)
    expect(intakeRowTakesQuantity({ linked_product_id: 'p1' })).toBe(true)
    expect(intakeRowTakesQuantity({ item_type: 'item' })).toBe(false)
    expect(intakeRowTakesQuantity({ item_type: 'item', linked_product_id: '' })).toBe(false)
    expect(intakeRowTakesQuantity({ item_type: 'item', linked_product_id: null })).toBe(false)
    expect(intakeRowTakesQuantity({ item_type: 'option', linked_product_id: 'p1' })).toBe(false)
    expect(intakeRowTakesQuantity({ item_type: 'heading', linked_product_id: 'p1' })).toBe(false)
  })
})

test.describe('svar → offert och Matte — buildIntakeAnswerSet / readIntakeAnswerSet / intakeAnswersText', () => {
  test('bara besvarade frågor sparas, i frågeordning, med enhet, rader och normaliserat värde', () => {
    const set = buildIntakeAnswerSet('badrum', fragor, { golv_m2: '6,5', golvvarme: false, ytskikt: 'Kakel', ovrigt: '  trång trappa ' }, '2026-09-17T10:00:00.000Z')
    expect(set).toEqual({ version: 1, jobType: 'badrum', source: 'hantverkare', answeredAt: '2026-09-17T10:00:00.000Z', answers: [
      { id: 'golv_m2', label: 'Klinker golv: hur många m²?', kind: 'number', unit: 'm2', targets: ['qi_golv'], value: 6.5 },
      { id: 'golvvarme', label: 'Ska det vara golvvärme?', kind: 'yesno', targets: ['qi_golvvarme'], value: false },
      { id: 'ytskikt', label: 'Vilket ytskikt?', kind: 'choice', value: 'Kakel' },
      { id: 'ovrigt', label: 'Något som påverkar tiden?', kind: 'text', value: 'trång trappa' },
    ] })
    expect(buildIntakeAnswerSet('badrum', fragor, {})).toBeNull()
    expect(buildIntakeAnswerSet('badrum', fragor, { ytskikt: 'Marmor' })).toBeNull()
  })
  test('serverns läsning: rundtur bevarar, skräp och fel version blir null', () => {
    const set = buildIntakeAnswerSet('badrum', fragor, { golv_m2: 6, golvvarme: true, ovrigt: 'x' })
    expect(readIntakeAnswerSet(JSON.parse(JSON.stringify(set)))).toEqual(set)
    expect(readIntakeAnswerSet(null)).toBeNull()
    expect(readIntakeAnswerSet({ ...set, version: 2 })).toBeNull()
    expect(readIntakeAnswerSet({ ...set, source: 'kund' })).toBeNull()
    expect(readIntakeAnswerSet({ ...set, answers: [{ id: 'a', label: 'b', kind: 'number', value: 'sex' }] })).toBeNull()
    expect(readIntakeAnswerSet({ ...set, answers: [{ id: 'a', label: 'b', kind: 'number', value: 6, targets: ['bad id!'] }] })).toBeNull()
    expect(readIntakeAnswerSet({ ...set, answers: [] })).toBeNull()
  })
  test('texten till Matte är läsbar svenska med enhet och Ja/Nej', () => {
    const set = buildIntakeAnswerSet('badrum', fragor, { golv_m2: 6.5, golvvarme: true, ovrigt: 'trång trappa' })
    expect(intakeAnswersText(set)).toBe('Uppgifter från platsbesöket:\n- Klinker golv: hur många m²? 6,5 m2\n- Ska det vara golvvärme? Ja\n- Något som påverkar tiden? trång trappa')
    expect(intakeAnswersText(null)).toBe('')
  })
})

test.describe('transporten — fetchIntakeQuestions', () => {
  function transport(status: number, body: unknown) {
    const calls: { url: string; method: string }[] = []
    const fetcher = (async (url: string, options?: RequestInit) => {
      calls.push({ url, method: options?.method || 'GET' })
      return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
    }) as typeof fetch
    return { calls, fetcher }
  }
  test('läsfel är ett fel — aldrig en tom lista som hoppar förbi frågorna', async () => {
    const t = transport(503, { error: 'Kunde inte läsa frågorna. Försök igen.' })
    await expect(fetchIntakeQuestions('badrum', undefined, t.fetcher)).rejects.toThrow(/Kunde inte läsa/)
    await expect(fetchIntakeQuestions('badrum', undefined, transport(200, { questions: 'nej' }).fetcher)).rejects.toThrow()
  })
  test('läser med GET, no-store och url-kodad jobbtyp', async () => {
    const t = transport(200, { jobType: { slug: 'el & vvs', name: 'El' }, questions: [], seeded: true, targets: [], canManage: false })
    const view = await fetchIntakeQuestions('el & vvs', undefined, t.fetcher)
    expect(view.questions).toEqual([])
    expect(t.calls).toEqual([{ url: '/api/job-types/intake-questions?jobType=el%20%26%20vvs', method: 'GET' }])
  })
})

test.describe('kopplingen i koden — källskanning', () => {
  test('migrationen deklarerar båda kolumnerna', () => {
    const sql = read('sql/v260_intake_questions.sql')
    expect(sql).toContain('ALTER TABLE public.job_types ADD COLUMN IF NOT EXISTS intake_questions JSONB')
    expect(sql).toContain('ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS intake_answers JSONB')
  })
  test('rutten är dynamisk, auth:ar och låser PUT till ägare/admin', () => {
    const route = utanKommentarer(read('app/api/job-types/intake-questions/route.ts'))
    expect(route).toContain("export const dynamic = 'force-dynamic'")
    expect((route.match(/getAuthenticatedBusiness\(request\)/g) || []).length).toBe(2)
    expect(route).toContain("hasPermission(user, 'see_financials')")
    expect(route).toContain('isOwnerOrAdmin(user)) return NextResponse.json')
    expect(route).toContain("'Cache-Control': 'no-store'")
  })
  test('kopplingskravet står i koden, inte bara i facit', () => {
    const lib = utanKommentarer(read('lib/quotes/intake-questions.ts'))
    expect(lib).toContain('export function intakeRowTakesQuantity')
    expect(lib).toContain("typeof row.linked_product_id === 'string' && row.linked_product_id.length > 0")
    // Mängdsättningen går genom bindningen OCH vakten — aldrig via enhet eller text.
    expect(lib).toContain('pointsAt(row) && intakeRowTakesQuantity(row) ? { ...row, quantity: value }')
    expect(lib).toContain("pointsAt(row) && row.item_type === 'option' ? { ...row, option_selected: value, option_default: value }")
    const apply = lib.slice(lib.indexOf('export function applyIntakeAnswers'), lib.indexOf('export function intakeAnswersText'))
    expect(apply).not.toContain('equivalentUnit')
    expect(apply).not.toContain('includes(needle)')
    expect(apply).not.toContain('description')
    expect(lib).not.toContain('optionMatch')
    // Editorn förklarar varför en mängdfråga inte gör något utan koppling.
    expect(utanKommentarer(read('components/onboarding/JobTypeQuestionsEditor.tsx')))
      .toContain('Inga rader är kopplade till en artikel ännu')
  })
  test('servern: frågor utan sparad lista seedas, skrivning validerar och null återställer', () => {
    const server = utanKommentarer(read('lib/quotes/intake-questions-server.ts'))
    expect(server).toContain('stored ?? seedIntakeQuestions(trade, job.name, targets)')
    // Sparning binder mot upplägget — en fråga som pekar fel når aldrig databasen.
    expect(server).toContain('bindIntakeQuestions(validateIntakeQuestions(body.questions), await readRowTargets(db, businessId, job.slug))')
    // Nya kopplade rader får id: annars går de inte att peka på.
    const standard = utanKommentarer(read('lib/quotes/job-standard-server.ts'))
    expect(standard).toContain("return { id: generateItemId(), standard_product: true, item_type: 'item'")
    expect(fs.existsSync(path.join(ROOT, 'sql/v261_template_row_ids.sql'))).toBe(true)
    expect(server).toContain('seeded: stored === null')
    expect(server).toContain("body.questions === null ? null")
    expect(server).toContain(".eq('is_active', true)")
  })
  test('offertstarten: frågorna hämtas EFTER verifieringen och FÖRE upplägget läggs in; hoppa över ger upplägget orört', () => {
    const builder = utanKommentarer(read('app/dashboard/quotes/_shared/QuoteBuilder.tsx'))
    const start = builder.indexOf('async function applyJobTypeStart(')
    const block = builder.slice(start, builder.indexOf('function leaveIntakeFlow'))
    const verify = block.indexOf('canApplyJobTypeStart(before, jobStartSnapshot.current)')
    const fetch = block.indexOf('await fetchIntakeQuestions(start.selection.jobTypeSlug, signal)')
    const open = block.indexOf("setQuickMode('fragor')")
    const apply = block.indexOf('handleNewTemplateSelect(start.template, start.products)')
    expect(verify).toBeGreaterThan(-1); expect(fetch).toBeGreaterThan(verify); expect(open).toBeGreaterThan(fetch); expect(apply).toBeGreaterThan(open)
    expect(block).toContain('if (intake.questions.length > 0) {')
    // Radbyggaren måste följa med, annars kan en valfråga inte lägga in sin
    // artikel — modulen skapar aldrig en rad på egen hand.
    expect(block).toContain('applyIntakeAnswers(verified.template.default_items ?? [], answered.questions, answered.answers, { buildRow })')
    // Priset i raden kommer från artikeln som lästes när flödet öppnades,
    // aldrig ur frågans egen lagring — annars ruttnar priserna.
    expect(block).toContain('const artikel = choiceArticles.find(a => a.id === input.choice.productId)')
    expect(block).toContain('unit_price: artikel.salesPrice')
    expect(block).toContain('linked_product_id: artikel.id')
    expect(block).toContain('setIntakeAnswers(set)')
    expect(block).toContain('intakeAnswersText(set)')
    // Fullskärmsläget: hoppa över = null-svar, tillbaka = lämna flödet.
    expect(builder).toContain("if (quickMode === 'fragor' && pendingIntake)")
    expect(builder).toContain('onSkip={() => applyVerifiedJobTypeStart(pendingIntake.start, null)}')
    expect(builder).toContain('onBack={leaveIntakeFlow}')
    // Flödet får raderna så det kan visa "Sätter: …" under varje fråga.
    expect(builder).toContain('targets={intakeTargetsFromRows(pendingIntake.start.template.default_items ?? [])}')
    const flow = utanKommentarer(read('components/quotes/IntakeQuestionFlow.tsx'))
    expect(flow).toContain("{q.kind === 'number' ? 'Sätter:' : 'Kryssar:'}")
    // Svaren följer med i sparning och återställning.
    expect(builder).toContain('intakeAnswers,\n            dealId: dealIdFromQuery')
    expect(builder).toContain('setIntakeAnswers(c.intakeAnswers ?? null)')
  })
  test('svaren sparas validerade på offerten, bara i create-läge', () => {
    const payload = utanKommentarer(read('app/dashboard/quotes/_shared/buildQuotePayload.ts'))
    const create = payload.indexOf("if (input.mode === 'create')")
    expect(payload.indexOf('intake_answers: input.intakeAnswers ?? null')).toBeGreaterThan(create)
    expect(utanKommentarer(read('app/api/quotes/route.ts'))).toContain('intake_answers: readIntakeAnswerSet(body.intake_answers)')
  })
  test('remsan QuoteJobTypeStart (testlåst) och fritextintaget rörs inte av flödet', () => {
    expect(read('components/onboarding/QuoteJobTypeStart.tsx')).not.toMatch(/intake-questions|intake-flow|IntakeQuestionFlow/)
    expect(read('app/dashboard/quotes/new/components/quick/QuickIntake.tsx')).not.toMatch(/intake-questions|intake-flow|IntakeQuestionFlow/)
  })
  test('editorn bor i uppsättningsytan (onboarding + Inställningar → Jobbtyper) och kan återställa till förslagen', () => {
    const setup = utanKommentarer(read('components/onboarding/JobTypeQuoteSetup.tsx'))
    expect(setup).toContain('<JobTypeQuestionsEditor jobTypeSlug={job.slug} jobTypeName={job.name} canManage={data.canManage}')
    const editor = utanKommentarer(read('components/onboarding/JobTypeQuestionsEditor.tsx'))
    expect(editor).toContain('void persist(null)')
    expect(editor).toContain('validateIntakeQuestions(drafts.map(fromDraft))')
    // Bindningen är synlig och vald i redigeraren, per rad, inte per enhet.
    expect(editor).toContain("{q.kind === 'number' ? 'Sätter mängden på' : 'Kryssar tillvalet'}")
    expect(editor).toContain('onChange={() => toggleTarget(index, q, t)}')
    expect(editor).toContain('finns inte längre i upplägget')
  })
  test('kontraktsgrinden kör facit lokalt och i CI', () => {
    expect(JSON.parse(read('package.json')).scripts['test:contracts']).toContain('tests/intake-questions.spec.ts')
    expect(fs.readFileSync(path.join(ROOT, '..', '.github/workflows/contracts.yml'), 'utf8')).toContain('tests/intake-questions.spec.ts')
  })
})
