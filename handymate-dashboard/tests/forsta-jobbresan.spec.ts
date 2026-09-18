import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { getStarterProducts } from '../lib/product-defaults'
import { getDefaultQuoteTemplates } from '../lib/quote-template-defaults'
import { SPECIALTIES_BY_TRADE } from '../app/onboarding/constants'
import { slugifyJobType } from '../lib/job-types'
import {
  deriveTemplateArticles, derivesArticle, jobTypeStarters, linkTemplateRowsToArticles,
  templateArticleId, templateArticleKey,
} from '../lib/onboarding/template-articles'
import { resolveTemplateItemPrices } from '../lib/quotes/resolve-template-item-prices'
import { applyIntakeAnswers, intakeTargetsFromRows, seedIntakeQuestions } from '../lib/quotes/intake-questions'
import { mapQuoteItemsToInvoiceItems } from '../lib/invoices/quote-to-invoice-items'

/**
 * FÖRSTA JOBBRESAN — en ny firma, noll artikeladministration.
 *
 * Granskningen utifrån (2026-09-17) satte acceptanskravet: "ingen tvingande
 * artikeladministration före första värdet". Mätningen samma dag visade att
 * Handymate hade TRE listor som aldrig mött varandra:
 *
 *   onboardingens jobbtyper   15–17 per bransch, kundens språk
 *   mallbanken                3–7 mallar, två grova jobbtyper
 *   artikelregistret          4 prislösa startartiklar
 *
 *   jobbtyper som matchade en mall:      0 av 15–17  (alla fyra branscher)
 *   mallrader som matchade en artikel:   0 av 22–35  (alla fyra branscher)
 *
 * Följden i produktionen: 11 av 14 jobbtyper utan upplägg, 4 av 221 mallrader
 * med artikelkoppling — och därmed ett frågeflöde som aldrig kunde sätta en
 * mängd, eftersom `intakeRowTakesQuantity` kräver en koppling.
 *
 * Facit kör HELA kedjan med de riktiga funktionerna, inga attrapper, i den
 * ordning produktionen kör dem: seedning → upplägg → priser → frågor → svar →
 * faktura. Miljön saknar inloggning, så klickprovet görs separat; det här är
 * beviset som går att köra på varje commit.
 *
 *   npx playwright test tests/forsta-jobbresan.spec.ts --no-deps
 */

const BRANSCHER = ['construction', 'electrician', 'plumber', 'painter'] as const
const FIRMA = 'biz_resan'
const TIMPRIS = 850

/** Exakt det seedningen skriver för en ny firma i branschen. */
function nyFirma(bransch: string) {
  const startartiklar = getStarterProducts(bransch)
  const branschmallar = getDefaultQuoteTemplates(bransch)
  const jobbtyper = ((SPECIALTIES_BY_TRADE as Record<string, string[]>)[bransch] || [])
    .map(name => ({ slug: slugifyJobType(name), name }))
  const slugsMedUpplagg = new Set(branschmallar.map(t => t.job_type_slug).filter((s): s is string => Boolean(s)))
  const startare = jobTypeStarters(branschmallar, jobbtyper, slugsMedUpplagg)
  const allaMallar = [...branschmallar, ...startare]

  const harledda = deriveTemplateArticles(allaMallar, startartiklar)
  const idPerNyckel = new Map<string, string>()
  startartiklar.forEach((p, i) => idPerNyckel.set(templateArticleKey(p.name, p.unit), `prod_${FIRMA}_${i}`))
  for (const a of harledda) idPerNyckel.set(templateArticleKey(a.name, a.unit), templateArticleId(FIRMA, templateArticleKey(a.name, a.unit)))

  const mallar = linkTemplateRowsToArticles(allaMallar, idPerNyckel)
  // Artikelregistret som prisupplösningen ser det. Startbanken OCH de härledda
  // är prislösa (0 = "pris saknas", lib/products/pricing-state.ts).
  const artiklar = [
    ...startartiklar.map((p, i) => ({ id: `prod_${FIRMA}_${i}`, name: p.name, unit: p.unit, sales_price: 0 })),
    ...harledda.map(a => ({ id: templateArticleId(FIRMA, templateArticleKey(a.name, a.unit)), name: a.name, unit: a.unit, sales_price: 0 })),
  ]
  return { startartiklar, harledda, jobbtyper, mallar, artiklar }
}

test.describe('varje jobbtyp kunden kan välja får ett upplägg', () => {
  for (const bransch of BRANSCHER) {
    test(`${bransch}: inga jobbtyper utan rader`, () => {
      const { jobbtyper, mallar } = nyFirma(bransch)
      expect(jobbtyper.length, 'onboardingen erbjuder jobbtyper för branschen').toBeGreaterThan(10)
      for (const job of jobbtyper) {
        const upplagg = mallar.filter(t => t.job_type_slug === job.slug)
        expect(upplagg.length, `${job.name} ska ha minst ett upplägg`).toBeGreaterThan(0)
        expect(upplagg[0].default_items.length, `${job.name}s upplägg ska ha rader`).toBeGreaterThan(0)
      }
    })
  }

  test('startarna rör aldrig ett upplägg som redan finns', () => {
    const mallar = getDefaultQuoteTemplates('construction')
    const egna = new Set(mallar.map(t => t.job_type_slug).filter((s): s is string => Boolean(s)))
    // "Renovera badrum" HAR ett upplägg sedan mains JOBBTYP_FOR_MALL (2026-09-17);
    // "Bygga garage" står i onboardingens katalog men har ingen mall.
    const jobb = [{ slug: 'renovera_badrum', name: 'Renovera badrum' }, { slug: 'bygga_garage', name: 'Bygga garage' }]
    const startare = jobTypeStarters(mallar, jobb, egna)
    expect(startare.map(t => t.job_type_slug), 'bara jobbtypen utan upplägg får en startare').toEqual(['bygga_garage'])
    // Idempotent: körs den igen med startaren inräknad blir det ingen till.
    expect(jobTypeStarters(mallar, jobb, new Set(Array.from(egna).concat(["bygga_garage"])))).toEqual([])
  })
})

test.describe('artiklarna härleds ur raderna — utan att ett pris uppstår', () => {
  for (const bransch of BRANSCHER) {
    test(`${bransch}: varje härledbar rad får en koppling, ingen ärver mallens kronor`, () => {
      const { harledda, mallar, artiklar } = nyFirma(bransch)
      expect(harledda.length, 'mallraderna ger artiklar').toBeGreaterThan(0)
      expect(harledda.every(a => a.unit_price === 0), 'INGEN härledd artikel bär ett pris').toBe(true)
      expect(artiklar.every(a => a.sales_price === 0), 'hela registret är prislöst för en ny firma').toBe(true)

      const rader = mallar.flatMap(t => t.default_items)
      const utan = rader.filter(r => derivesArticle(r) && !r.linked_product_id)
      expect(utan, 'ingen härledbar rad lämnas utan koppling').toEqual([])
      // Timrader kopplas ALDRIG — firmans timpris måste fortsätta styra dem.
      expect(rader.filter(r => r.unit === 'tim' && r.linked_product_id), 'timrader lämnas okopplade').toEqual([])
    })
  }

  test('samma rad i två mallar ger EN artikel, och nyckeln är stabil', () => {
    const mallar = [
      { default_items: [{ item_type: 'item', description: 'Material', unit: 'st', unit_price: 3000 }] },
      { default_items: [{ item_type: 'item', description: '  material  ', unit: 'ST', unit_price: 500 }] },
    ]
    expect(deriveTemplateArticles(mallar, [])).toHaveLength(1)
    expect(templateArticleId('b1', 'x')).toBe(templateArticleId('b1', 'x'))
    expect(templateArticleId('b1', 'x')).not.toBe(templateArticleId('b2', 'x'))
  })

  test('de tre undantagen: tim, avsiktlig nollrad och redan kopplad rad', () => {
    expect(derivesArticle({ item_type: 'item', description: 'Arbete', unit: 'tim', unit_price: 650 })).toBe(false)
    expect(derivesArticle({ item_type: 'item', description: 'Material löpande', unit: 'st', unit_price: 0 })).toBe(false)
    expect(derivesArticle({ item_type: 'item', description: 'Kakel', unit: 'm2', unit_price: 400, linked_product_id: 'p1' })).toBe(false)
    expect(derivesArticle({ item_type: 'heading', description: 'Badrum', unit: 'st', unit_price: 5 })).toBe(false)
    expect(derivesArticle({ item_type: 'item', description: 'Kakel', unit: 'm2', unit_price: 400 })).toBe(true)
    expect(derivesArticle({ item_type: 'option', description: 'Golvvärme', unit: 'm2', unit_price: 900 })).toBe(true)
  })
})

test.describe('resan: upplägg → priser → frågor → svar → faktura', () => {
  for (const bransch of BRANSCHER) {
    test(`${bransch}: en ny firma når en offert och en faktura utan att koppla en artikel`, () => {
      const { mallar, artiklar, jobbtyper } = nyFirma(bransch)
      const upplagg = mallar.find(t => t.job_type_slug === jobbtyper[0].slug)!

      // 1. Priserna. Timpriset är firmans; allt annat är prislöst och markerat.
      const offertrader = resolveTemplateItemPrices(upplagg.default_items, artiklar, TIMPRIS)
      const timrader = offertrader.filter(r => r.unit === 'tim')
      expect(timrader.length, 'upplägget har arbete').toBeGreaterThan(0)
      expect(timrader.every(r => r.unit_price === TIMPRIS), 'arbetet prissätts av FIRMANS timpris').toBe(true)
      const prissatta = offertrader.filter(r => r.item_type === 'item' && r.unit !== 'tim' && r.unit_price > 0)
      expect(prissatta, 'ingen krona uppstår ur mallen').toEqual([])

      // 2. Frågeflödet har mål — det som var omöjligt före 2026-09-17.
      const mal = intakeTargetsFromRows(offertrader)
      expect(mal.length, 'frågeflödet har rader att peka på').toBeGreaterThan(0)
      const fragor = seedIntakeQuestions(bransch, jobbtyper[0].name, mal)
      expect(fragor.filter(q => q.kind === 'number').length, 'minst en mängdfråga föreslås').toBeGreaterThan(0)

      // 3. Svaret landar på RÄTT rad och bara den.
      const mangdfraga = fragor.find(q => q.kind === 'number')!
      const malrad = mangdfraga.targets![0]
      const fore = upplagg.default_items.find(r => r.id === malrad)!
      const efter = applyIntakeAnswers(offertrader, fragor, { [mangdfraga.id]: 7 })
      expect(efter.find(r => r.id === malrad)!.quantity, 'svaret sätter mängden').toBe(7)
      for (const rad of efter) {
        if (rad.id === malrad) continue
        const original = offertrader.find(r => r.id === rad.id)!
        expect(rad.quantity, `${rad.description} ska vara orörd`).toBe(original.quantity)
      }
      expect(fore.quantity, 'indata muteras aldrig').not.toBe(undefined)

      // 4. Fakturan speglar offerten.
      const fakturarader = mapQuoteItemsToInvoiceItems(efter)
      expect(fakturarader.length, 'fakturan får rader').toBeGreaterThan(0)
      const summaOffert = efter.filter(r => r.item_type === 'item').reduce((s, r) => s + (r.quantity * r.unit_price), 0)
      const summaFaktura = fakturarader.filter(r => r.item_type === 'item').reduce((s, r) => s + r.total, 0)
      expect(summaFaktura, 'inga kronor tillkommer eller försvinner på vägen').toBeCloseTo(summaOffert, 2)
    })
  }

  test('ovalda tillval följer aldrig med till fakturan, valda gör det', () => {
    const rader = [
      { id: 'r1', item_type: 'item', description: 'Arbete', unit: 'tim', quantity: 2, unit_price: 850, labor_amount: 1700 },
      { id: 'r2', item_type: 'option', description: 'Golvvärme', unit: 'm2', quantity: 5, unit_price: 100, option_selected: false },
      { id: 'r3', item_type: 'option', description: 'Handdukstork', unit: 'st', quantity: 1, unit_price: 2000, option_selected: true },
    ]
    const faktura = mapQuoteItemsToInvoiceItems(rader)
    expect(faktura.map(r => r.description)).toEqual(['Arbete', 'Handdukstork'])
    expect(faktura[1].item_type, 'valt tillval blir en vanlig rad').toBe('item')
    // ROT-basen: labor_amount är 0-giltig och får aldrig falla tillbaka på totalen.
    expect(faktura[0].labor_amount).toBe(1700)
    expect(faktura[1].labor_amount).toBeNull()
  })
})

test.describe('kopplingen i koden — källskanning', () => {
  const ROOT = path.resolve(__dirname, '..')
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
  const utanKommentarer = (s: string) =>
    s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  test('seedningen härleder artiklar, ger jobbtyper utan upplägg en start och kopplar raderna', () => {
    const seed = utanKommentarer(read('lib/seed-defaults.ts'))
    expect(seed).toContain('deriveTemplateArticles(allaNya, kandaArtiklar as never)')
    // Villkoret och användningen, inte bara att anropet står någonstans: en
    // startarlista som byggs men aldrig läggs till är ingen startare.
    expect(seed).toContain('const startare = jobTypesReady')
    expect(seed).toContain('jobTypeStarters(getDefaultQuoteTemplates(normalizedBranch),')
    expect(seed).toContain('const allaNya = [...nya, ...startare]')
    // Mains relänkning av gamla seedade rader får inte försvinna i mergen.
    expect(seed, 'mains relänkning står kvar').toContain('relinked++')
    expect(seed).toContain('linkTemplateRowsToArticles(allaNya, idPerNyckel)')
    // Priset får ALDRIG följa med mallen in i artikelregistret.
    expect(seed).toContain('sales_price: 0,')
    expect(seed).not.toMatch(/sales_price:\s*a\.unit_price/)
  })

  test('härledningen skriver aldrig ett pris', () => {
    const lib = utanKommentarer(read('lib/onboarding/template-articles.ts'))
    expect(lib).toContain('unit_price: 0,')
    expect(lib).not.toMatch(/unit_price:\s*(row|item)\./)
  })

  test('båda projektskaparna tar jobbtypen från OFFERTEN först', () => {
    // Knappen "Skapa projekt" läste bara affärens jobbtyp, medan den väg en
    // accepterad offert går (lib/projects/create-from-quote.ts) alltid tagit
    // offertens. Samma offert gav olika projekt beroende på väg.
    const rutt = utanKommentarer(read('app/api/projects/route.ts'))
    expect(rutt).toContain('if (!projectData.job_type && quote.job_type) {')
    const franOffert = rutt.indexOf('if (!projectData.job_type && quote.job_type) {')
    const franAffar = rutt.indexOf('if (!projectData.job_type && deal.job_type) {')
    expect(franOffert, 'offertens jobbtyp prövas').toBeGreaterThan(-1)
    expect(franAffar, 'affären står kvar som fallback EFTER offerten').toBeGreaterThan(franOffert)
    expect(utanKommentarer(read('lib/projects/create-from-quote.ts'))).toContain('job_type: quote.job_type || null,')
  })

  test('svaren från frågeflödet är låsta när kunden sagt ja', () => {
    // De är underlaget för mängderna kunden accepterade.
    expect(utanKommentarer(read('lib/quotes/lifecycle.ts'))).toContain("'intake_answers',")
    // Resekostnaden skrevs av PUT utan lås — hittad av ett facit som stod
    // utanför grinden. Både låset och grinden ska finnas kvar.
    expect(utanKommentarer(read('lib/quotes/lifecycle.ts'))).toContain("'travel_total',")
    expect(JSON.parse(read('package.json')).scripts['test:contracts']).toContain('tests/quote-content-lock.spec.ts')
  })

  test('kontraktsgrinden kör facit lokalt och i CI', () => {
    expect(JSON.parse(read('package.json')).scripts['test:contracts']).toContain('tests/forsta-jobbresan.spec.ts')
    expect(fs.readFileSync(path.join(ROOT, '..', '.github/workflows/contracts.yml'), 'utf8')).toContain('tests/forsta-jobbresan.spec.ts')
  })
})
