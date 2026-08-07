/**
 * Facit för bolagskalenderns regelmotor (2026-08-07).
 *
 * ═══ VAD SOM STÅR PÅ SPEL ═══
 *
 * En felaktig deadline är värre än ingen deadline. Skatteverkets
 * förseningsavgift är 625 kr första gången och 1 250 kr vid upprepning — men
 * avgiften är inte skadan. Skadan är att en hantverkare som litat på Karin
 * en gång slutar lita på henne för allt annat också.
 *
 * Testerna nedan kontrollerar därför tre saker i tur och ordning:
 *   1. att vi INTE påstår något när profilen inte räcker,
 *   2. att varje datum kan förklaras,
 *   3. att datumen faktiskt stämmer.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/karin-obligations.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { materializeObligations, missingProfileFields } from '../lib/karin/obligations'
import { OBLIGATION_RULES, ruleApplies, type CompanyProfile } from '../lib/karin/obligation-rules'
import { ymd, isNonBusinessDay } from '../lib/karin/business-days'

/** Bee: aktiebolag, kalenderår, kvartalsmoms, en anställd, F-skatt. */
const BEE: CompanyProfile = {
  company_form: 'ab',
  fiscal_year_end_month: 12,
  vat_period: 'quarter',
  is_employer: true,
  f_skatt_registered: true,
}

const AR_2026 = { from: ymd(2026, 1, 1), to: ymd(2026, 12, 31) }

function koder(profile: CompanyProfile, from: Date, to: Date): string[] {
  return materializeObligations(profile, from, to).map(o => o.rule_code)
}

test.describe('VI PÅSTÅR INGET VI INTE VET', () => {
  test('tom profil ger noll skyldigheter', () => {
    // Inte "några med låg säkerhet" — noll. Ett datum vi inte kan räkna fram
    // är att be någon lita på ingenting.
    expect(materializeObligations({}, AR_2026.from, AR_2026.to)).toEqual([])
  })

  test('utan momsperiod skapas ingen momsdeklaration', () => {
    const utan = { ...BEE, vat_period: null }
    expect(koder(utan, AR_2026.from, AR_2026.to)).not.toContain('moms')
  })

  test('ej momsregistrerad ger ingen moms', () => {
    const ingen = { ...BEE, vat_period: 'none' as const }
    expect(koder(ingen, AR_2026.from, AR_2026.to)).not.toContain('moms')
  })

  test('utan anställda ingen arbetsgivardeklaration', () => {
    // En enmansfirma ska inte påminnas om löner hon inte betalar.
    const ensam = { ...BEE, is_employer: false }
    const k = koder(ensam, AR_2026.from, AR_2026.to)
    expect(k).not.toContain('agi')
    expect(k).not.toContain('arbetsgivaravgifter')
  })

  test('is_employer null räknas inte som ja', () => {
    // Ovetande får aldrig tolkas som bekräftat.
    expect(ruleApplies('agi', { ...BEE, is_employer: null })).toBe(false)
  })

  test('enskild firma får varken årsredovisning eller stämma', () => {
    const ef: CompanyProfile = { ...BEE, company_form: 'ef' }
    const k = koder(ef, AR_2026.from, AR_2026.to)
    expect(k).not.toContain('arsredovisning')
    expect(k).not.toContain('bolagsstamma')
  })

  test('utan F-skatt ingen preliminärskatt', () => {
    expect(koder({ ...BEE, f_skatt_registered: false }, AR_2026.from, AR_2026.to)).not.toContain('preliminarskatt')
  })

  test('saknade fält pekas ut i stället för att gissas', () => {
    // En tom kalender som betyder "vi vet inte" får aldrig se ut som en tom
    // kalender som betyder "allt är lugnt".
    const saknas = missingProfileFields({})
    expect(saknas).toContain('bolagsform')
    expect(saknas).toContain('momsperiod')
    expect(saknas).toContain('räkenskapsår')
    expect(missingProfileFields(BEE)).toEqual([])
  })
})

test.describe('VARJE SKYLDIGHET KAN FÖRKLARA SIG', () => {
  test('ingen skyldighet utan why, källa och regelversion', () => {
    // Kan Karin inte säga varför, får hon inte påstå det.
    const alla = materializeObligations(BEE, AR_2026.from, AR_2026.to)
    expect(alla.length).toBeGreaterThan(0)
    for (const o of alla) {
      expect(o.why.length, `${o.rule_code} saknar förklaring`).toBeGreaterThan(30)
      expect(o.source_url, `${o.rule_code} saknar källa`).toMatch(/^https:\/\//)
      expect(o.legal_basis.length, `${o.rule_code} saknar rättslig grund`).toBeGreaterThan(30)
      expect(o.rule_version, `${o.rule_code} saknar regelversion`).toBeGreaterThanOrEqual(1)
      expect(o.period_label.length, `${o.rule_code} saknar period`).toBeGreaterThan(2)
    }
  })

  test('förklaringen nämner det som faktiskt styrde datumet', () => {
    const moms = materializeObligations(BEE, AR_2026.from, AR_2026.to).find(o => o.rule_code === 'moms')!
    expect(moms.why).toContain('kvartal')
  })

  test('varje regel i biblioteket har källa och rättslig grund', () => {
    for (const [kod, r] of Object.entries(OBLIGATION_RULES)) {
      expect(r.source_url, `${kod}`).toMatch(/^https:\/\//)
      expect(r.legal_basis.length, `${kod}`).toBeGreaterThan(30)
      expect(r.version).toBeGreaterThanOrEqual(1)
    }
  })

  test('säkerhetsgraden sänks där den ska', () => {
    // Preliminärskatten beror på beskedet, inte på profilen.
    const prel = materializeObligations(BEE, AR_2026.from, AR_2026.to).find(o => o.rule_code === 'preliminarskatt')!
    expect(prel.confidence).toBe('medel')
    // Momsen för ett kvartalsbolag är däremot entydig.
    const moms = materializeObligations(BEE, AR_2026.from, AR_2026.to).find(o => o.rule_code === 'moms')!
    expect(moms.confidence).toBe('hog')
  })

  test('helårsmoms får lägre säkerhet — EU-handel flyttar datumet', () => {
    const helar = materializeObligations({ ...BEE, vat_period: 'year' }, AR_2026.from, AR_2026.to)
      .find(o => o.rule_code === 'moms')!
    expect(helar.confidence).toBe('medel')
  })
})

test.describe('DATUMEN — kvartalsmoms', () => {
  test('fyra gånger om året, den 12:e i andra månaden efter kvartalet', () => {
    const moms = materializeObligations(BEE, AR_2026.from, AR_2026.to).filter(o => o.rule_code === 'moms')
    expect(moms).toHaveLength(4)
    // Q4 2025 → 12 feb · Q1 → 12 maj · Q2 → 12 aug · Q3 → 12 nov.
    // 2026: 12 feb (tors), 12 maj (tis), 12 aug (ons), 12 nov (tors).
    expect(moms.map(o => o.due_date)).toEqual(['2026-02-12', '2026-05-12', '2026-08-12', '2026-11-12'])
  })

  test('perioden namnges rätt', () => {
    const maj = materializeObligations(BEE, ymd(2026, 5, 1), ymd(2026, 5, 31))
      .find(o => o.rule_code === 'moms')!
    expect(maj.period_label).toBe('kvartal 1 2026')
  })
})

test.describe('DATUMEN — månadsmoms', () => {
  test('tolv gånger om året', () => {
    const m = { ...BEE, vat_period: 'month' as const }
    expect(materializeObligations(m, AR_2026.from, AR_2026.to).filter(o => o.rule_code === 'moms')).toHaveLength(12)
  })

  test('perioden ligger två månader tillbaka', () => {
    const m = { ...BEE, vat_period: 'month' as const }
    const aug = materializeObligations(m, ymd(2026, 8, 1), ymd(2026, 8, 31)).find(o => o.rule_code === 'moms')!
    expect(aug.period_label).toBe('juni 2026')
    expect(aug.due_date).toBe('2026-08-12')
  })
})

test.describe('DATUMEN — helårsmoms', () => {
  test('den 26:e i andra månaden efter räkenskapsårets slut', () => {
    // Kalenderår 2025 → 26 februari 2026 (en torsdag).
    const helar = materializeObligations({ ...BEE, vat_period: 'year' }, AR_2026.from, AR_2026.to)
      .filter(o => o.rule_code === 'moms')
    expect(helar).toHaveLength(1)
    expect(helar[0].due_date).toBe('2026-02-26')
    expect(helar[0].period_label).toBe('räkenskapsåret 2025')
  })

  test('brutet räkenskapsår flyttar datumet', () => {
    // Bokslut i april → 26 juni.
    const brutet = { ...BEE, vat_period: 'year' as const, fiscal_year_end_month: 4 }
    const m = materializeObligations(brutet, AR_2026.from, AR_2026.to).find(o => o.rule_code === 'moms')!
    expect(m.due_date.startsWith('2026-06-26')).toBe(true)
  })
})

test.describe('DATUMEN — arbetsgivare och skattekonto', () => {
  test('tolv arbetsgivardeklarationer om året', () => {
    expect(materializeObligations(BEE, AR_2026.from, AR_2026.to).filter(o => o.rule_code === 'agi')).toHaveLength(12)
  })

  test('januari och augusti har den 17:e, övriga den 12:e', () => {
    const agi = materializeObligations(BEE, AR_2026.from, AR_2026.to).filter(o => o.rule_code === 'agi')
    // 17 jan 2026 är en lördag → flyttas till måndag 19 jan.
    expect(agi[0].due_date).toBe('2026-01-19')
    // 17 aug 2026 är en måndag.
    expect(agi.find(o => o.due_date.startsWith('2026-08'))!.due_date).toBe('2026-08-17')
    // Mars: den 12:e, en torsdag.
    expect(agi.find(o => o.due_date.startsWith('2026-03'))!.due_date).toBe('2026-03-12')
  })

  test('avgifterna förfaller samma dag som deklarationen', () => {
    // Pengarna ska finnas på skattekontot när deklarationen lämnas.
    const alla = materializeObligations(BEE, AR_2026.from, AR_2026.to)
    const agi = alla.filter(o => o.rule_code === 'agi').map(o => o.due_date)
    const avg = alla.filter(o => o.rule_code === 'arbetsgivaravgifter').map(o => o.due_date)
    expect(avg).toEqual(agi)
  })

  test('AGI avser föregående månads löner', () => {
    const mars = materializeObligations(BEE, ymd(2026, 3, 1), ymd(2026, 3, 31)).find(o => o.rule_code === 'agi')!
    expect(mars.period_label).toBe('februari 2026')
  })
})

test.describe('DATUMEN — årsbundna för aktiebolag', () => {
  test('årsredovisning sju månader efter bokslut', () => {
    // Kalenderår 2025 → juli 2026, sista dagen. 31 juli 2026 är en fredag.
    const ar = materializeObligations(BEE, AR_2026.from, AR_2026.to).find(o => o.rule_code === 'arsredovisning')!
    expect(ar.due_date).toBe('2026-07-31')
    expect(ar.period_label).toBe('räkenskapsåret 2025')
  })

  test('brutet räkenskapsår flyttar årsredovisningen', () => {
    // Bokslut sista april 2025 → sju månader senare = sista november.
    // 30 november 2025 är en SÖNDAG, så förskjutningen ska ge måndag 1
    // december. Testet skrevs först mot '2025-11' och avslöjade därmed sig
    // självt, inte koden — förskjutningen ska gälla även årsbundna datum.
    const brutet = { ...BEE, fiscal_year_end_month: 4 }
    const ar = materializeObligations(brutet, ymd(2025, 1, 1), ymd(2025, 12, 31))
      .filter(o => o.rule_code === 'arsredovisning')
    expect(ar).toHaveLength(1)
    expect(ar[0].due_date).toBe('2025-12-01')
    expect(ar[0].period_label).toBe('räkenskapsåret 2025')
  })

  test('stämman ligger sex månader efter bokslut, före årsredovisningen', () => {
    const alla = materializeObligations(BEE, AR_2026.from, AR_2026.to)
    const stamma = alla.find(o => o.rule_code === 'bolagsstamma')!
    const arsred = alla.find(o => o.rule_code === 'arsredovisning')!
    expect(stamma.due_date < arsred.due_date, 'stämman måste ligga före inlämningen').toBe(true)
  })

  test('aktiebolagets deklarationsdatum styrs av bokslutsmånaden', () => {
    // Kalenderår → 1 augusti året efter (digital inlämning).
    const dec = materializeObligations(BEE, AR_2026.from, AR_2026.to).find(o => o.rule_code === 'inkomstdeklaration')!
    expect(dec.due_date.startsWith('2026-08')).toBe(true)
    expect(dec.why).toContain('december')
  })

  test('enskild firma deklarerar i maj', () => {
    const ef = materializeObligations({ ...BEE, company_form: 'ef' }, AR_2026.from, AR_2026.to)
      .find(o => o.rule_code === 'inkomstdeklaration')!
    expect(ef.due_date.startsWith('2026-05')).toBe(true)
  })
})

test.describe('FÖRSKJUTNINGEN GÄLLER ALLT', () => {
  test('inget förfallodatum hamnar på helg eller helgdag', () => {
    // Den enskilt viktigaste invarianten — och den gäller varje profilvariant.
    const profiler: CompanyProfile[] = [
      BEE,
      { ...BEE, vat_period: 'month' },
      { ...BEE, vat_period: 'year' },
      { ...BEE, company_form: 'ef' },
      { ...BEE, fiscal_year_end_month: 4 },
      { ...BEE, fiscal_year_end_month: 6, vat_period: 'month' },
    ]
    for (const p of profiler) {
      for (let ar = 2026; ar <= 2029; ar++) {
        for (const o of materializeObligations(p, ymd(ar, 1, 1), ymd(ar, 12, 31))) {
          const d = new Date(o.due_date + 'T12:00:00')
          expect(isNonBusinessDay(d), `${o.rule_code} ${o.due_date} är inte en vardag`).toBe(false)
        }
      }
    }
  })

  test('12 september 2026 är en lördag och flyttas', () => {
    const m = { ...BEE, vat_period: 'month' as const }
    const sep = materializeObligations(m, ymd(2026, 9, 1), ymd(2026, 9, 30)).find(o => o.rule_code === 'moms')!
    expect(sep.due_date).toBe('2026-09-14')
  })
})

test.describe('fönstret och ordningen', () => {
  test('bara skyldigheter inom fönstret returneras', () => {
    const alla = materializeObligations(BEE, ymd(2026, 8, 1), ymd(2026, 8, 31))
    expect(alla.length).toBeGreaterThan(0)
    for (const o of alla) {
      expect(o.due_date >= '2026-08-01' && o.due_date <= '2026-08-31', o.due_date).toBe(true)
    }
  })

  test('sorterat på datum', () => {
    const datum = materializeObligations(BEE, AR_2026.from, AR_2026.to).map(o => o.due_date)
    expect([...datum].sort()).toEqual(datum)
  })

  test('förberedelsedatum ligger före förfallodatum', () => {
    for (const o of materializeObligations(BEE, AR_2026.from, AR_2026.to)) {
      expect(o.prepare_from < o.due_date, `${o.rule_code}`).toBe(true)
    }
  })

  test('ett tomt fönster ger tom lista, inte en krasch', () => {
    expect(materializeObligations(BEE, ymd(2026, 8, 20), ymd(2026, 8, 21))).toEqual([])
  })

  test('inga dubbletter av samma regel samma dag', () => {
    const alla = materializeObligations(BEE, ymd(2026, 1, 1), ymd(2028, 12, 31))
    const nycklar = alla.map(o => `${o.rule_code}:${o.due_date}`)
    expect(new Set(nycklar).size, 'samma skyldighet materialiserades två gånger').toBe(nycklar.length)
  })
})
