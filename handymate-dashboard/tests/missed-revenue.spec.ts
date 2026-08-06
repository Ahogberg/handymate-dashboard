/**
 * Facit för svepet efter missad intäkt (spår 1.3, 2026-08-06).
 *
 * Det som testas hårdast är TYSTNADEN. Ett svep som larmar för mycket blir ett
 * svep hantverkaren slutar öppna — och då missar han de stora beloppen också.
 * Nådatiden, minimibeloppet och dedupen är därför viktigare än att fynden
 * hittas.
 *
 * Fast tidsankare, aldrig Date.now(): ett rörligt facit är inget facit.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/missed-revenue.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  findUninvoicedAta,
  findUninvoicedMaterial,
  findCompletedWithoutInvoice,
  sweepMissedRevenue,
  isPastGrace,
  findingTitle,
  MIN_AMOUNT_KR,
  GRACE_DAYS,
  type ProjectRow,
} from '../lib/value/missed-revenue'

const NOW = new Date('2026-08-06T09:00:00.000Z')
const LÄNGE_SEDAN = '2026-07-01T09:00:00.000Z'   // ~5 veckor
const IGÅR = '2026-08-05T09:00:00.000Z'          // inom nådatiden

const projekt = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  project_id: 'p1', name: 'Badrum Ekbacken', status: 'completed', completed_at: LÄNGE_SEDAN, ...over,
})
const karta = (...ps: ProjectRow[]) => new Map(ps.map(p => [p.project_id, p]))

test.describe('nådatiden — vi lägger oss inte i', () => {
  test('ett projekt som stängdes nyss larmar inte', () => {
    // autoInvoiceOnComplete kan fortfarande köra, eller så sitter hantverkaren
    // med fakturan just nu. Att larma då är att lägga sig i.
    expect(isPastGrace(IGÅR, NOW)).toBe(false)
  })

  test('men efter nådatiden gör det', () => {
    expect(isPastGrace(LÄNGE_SEDAN, NOW)).toBe(true)
  })

  test('saknat datum larmar aldrig', () => {
    expect(isPastGrace(null, NOW)).toBe(false)
  })

  test('skräpdatum larmar aldrig', () => {
    expect(isPastGrace('inte-ett-datum', NOW)).toBe(false)
  })

  test('gränsen ligger där konstanten säger', () => {
    const precis = new Date(NOW.getTime() - GRACE_DAYS * 24 * 3600 * 1000).toISOString()
    expect(isPastGrace(precis, NOW)).toBe(true)
  })
})

test.describe('regel 1 — godkänd ÄTA utan faktura', () => {
  const ata = (over: any = {}) => ({
    id: 'a1', project_id: 'p1', description: 'Flytt av golvbrunn',
    amount: 18400, signed_at: LÄNGE_SEDAN, invoiced_at: null, ...over,
  })

  test('påskriven och ofakturerad är ett fynd', () => {
    const f = findUninvoicedAta([ata()], karta(projekt()), NOW)
    expect(f).toHaveLength(1)
    expect(f[0].amountKr).toBe(18400)
    expect(f[0].evidence).toContain('Flytt av golvbrunn')
  })

  test('redan fakturerad är inget fynd', () => {
    expect(findUninvoicedAta([ata({ invoiced_at: LÄNGE_SEDAN })], karta(projekt()), NOW)).toEqual([])
  })

  test('inte påskriven är inget fynd — kunden har inte godkänt', () => {
    expect(findUninvoicedAta([ata({ signed_at: null })], karta(projekt()), NOW)).toEqual([])
  })

  test('kräver INTE att projektet är avslutat', () => {
    // En påskriven ÄTA mitt i ett långt projekt är lika mycket förtjänade
    // pengar — och det är just de som glöms.
    const f = findUninvoicedAta([ata()], karta(projekt({ status: 'active', completed_at: null })), NOW)
    expect(f).toHaveLength(1)
  })

  test('nyss påskriven får nådatid', () => {
    expect(findUninvoicedAta([ata({ signed_at: IGÅR })], karta(projekt()), NOW)).toEqual([])
  })
})

test.describe('regel 2 — material summeras PER PROJEKT', () => {
  const mat = (id: string, sell: number, over: any = {}) => ({
    id, project_id: 'p1', total_sell: sell, invoiced: false, ...over,
  })

  test('femton ofakturerade rader ger ETT kort, inte femton', () => {
    const rows = Array.from({ length: 15 }, (_, i) => mat(`m${i}`, 200))
    const f = findUninvoicedMaterial(rows, karta(projekt()), NOW)
    expect(f).toHaveLength(1)
    expect(f[0].amountKr).toBe(3000)
  })

  test('fakturerade rader räknas inte in', () => {
    const f = findUninvoicedMaterial(
      [mat('m1', 5000), mat('m2', 9000, { invoiced: true })], karta(projekt()), NOW,
    )
    expect(f[0].amountKr).toBe(5000)
  })

  test('bara avslutade projekt — pågående material är normalt', () => {
    const f = findUninvoicedMaterial([mat('m1', 9000)], karta(projekt({ status: 'active' })), NOW)
    expect(f).toEqual([])
  })

  test('material på okänt projekt tappas tyst i stället för att krascha', () => {
    expect(findUninvoicedMaterial([mat('m1', 9000, { project_id: 'saknas' })], karta(projekt()), NOW)).toEqual([])
  })
})

test.describe('regel 3 — avslutat projekt utan faktura', () => {
  test('inget fakturerat på projektet är ett fynd', () => {
    const f = findCompletedWithoutInvoice([projekt()], [], NOW)
    expect(f).toHaveLength(1)
    expect(f[0].kind).toBe('projekt_utan_faktura')
  })

  test('finns en faktura är det inget fynd', () => {
    expect(findCompletedWithoutInvoice([projekt()], [{ project_id: 'p1' }], NOW)).toEqual([])
  })

  test('fakturor utan projektkoppling räknas inte som täckning', () => {
    // invoice.project_id är nullable och NULL på merparten historiska rader.
    // Att tolka en sådan som "projektet är fakturerat" hade dolt verkliga fynd.
    expect(findCompletedWithoutInvoice([projekt()], [{ project_id: null }], NOW)).toHaveLength(1)
  })

  test('beloppet är 0 — det finns ingen faktura att läsa summan ur', () => {
    // Hellre ärligt noll än en gissad siffra i ett kort som ska skapa
    // förtroende.
    expect(findCompletedWithoutInvoice([projekt()], [], NOW)[0].amountKr).toBe(0)
  })

  test('pågående projekt rörs aldrig', () => {
    expect(findCompletedWithoutInvoice([projekt({ status: 'active' })], [], NOW)).toEqual([])
  })
})

test.describe('SPARSAMHETEN — småbelopp får inte dränka kön', () => {
  test('under minimibeloppet skapas inget kort', () => {
    const liten = { id: 'a1', project_id: 'p1', description: null, amount: MIN_AMOUNT_KR - 1, signed_at: LÄNGE_SEDAN, invoiced_at: null }
    expect(findUninvoicedAta([liten], karta(projekt()), NOW)).toEqual([])
  })

  test('precis på gränsen skapas ett', () => {
    const jämn = { id: 'a1', project_id: 'p1', description: null, amount: MIN_AMOUNT_KR, signed_at: LÄNGE_SEDAN, invoiced_at: null }
    expect(findUninvoicedAta([jämn], karta(projekt()), NOW)).toHaveLength(1)
  })
})

test.describe('svepet i sin helhet', () => {
  const input = {
    atas: [{ id: 'a1', project_id: 'p1', description: 'ÄTA', amount: 18400, signed_at: LÄNGE_SEDAN, invoiced_at: null }],
    materials: [{ id: 'm1', project_id: 'p1', total_sell: 3000, invoiced: false }],
    projects: [projekt()],
    invoices: [],
    alreadyOpen: new Set<string>(),
    now: NOW,
  }

  test('hittar alla tre reglerna', () => {
    const f = sweepMissedRevenue(input)
    expect(f.map(x => x.kind).sort()).toEqual(
      ['ata_ej_fakturerad', 'material_ej_fakturerat', 'projekt_utan_faktura'],
    )
  })

  test('största beloppet först — inte äldsta posten', () => {
    const f = sweepMissedRevenue(input)
    expect(f[0].amountKr).toBe(18400)
    expect(f[0].amountKr).toBeGreaterThanOrEqual(f[1].amountKr)
  })

  test('DEDUPE: fynd som redan har ett öppet kort skapas inte igen', () => {
    // Utan detta hade svepet skapat samma kort varje natt tills någon
    // fakturerade — och kön blivit obrukbar på en vecka.
    const f = sweepMissedRevenue({ ...input, alreadyOpen: new Set(['ata:a1', 'material:p1']) })
    expect(f.map(x => x.kind)).toEqual(['projekt_utan_faktura'])
  })

  test('tom indata ger tom lista, aldrig en krasch', () => {
    expect(sweepMissedRevenue({
      atas: [], materials: [], projects: [], invoices: [], alreadyOpen: new Set(), now: NOW,
    })).toEqual([])
  })

  test('dedupe-nycklarna är stabila mellan körningar', () => {
    const a = sweepMissedRevenue(input).map(f => f.dedupeKey)
    const b = sweepMissedRevenue(input).map(f => f.dedupeKey)
    expect(a).toEqual(b)
  })
})

test.describe('rubrikerna är på svenska och säger beloppet', () => {
  test('belopp finns med när det är känt', () => {
    const f = sweepMissedRevenue({
      atas: [{ id: 'a1', project_id: 'p1', description: null, amount: 18400, signed_at: LÄNGE_SEDAN, invoiced_at: null }],
      materials: [], projects: [projekt()], invoices: [{ project_id: 'p1' }], alreadyOpen: new Set(), now: NOW,
    })
    expect(findingTitle(f[0])).toContain('18')
    expect(findingTitle(f[0])).toContain('kr')
  })

  test('inget påhittat belopp när det är okänt', () => {
    const f = findCompletedWithoutInvoice([projekt()], [], NOW)
    expect(findingTitle(f[0])).not.toContain('kr')
  })

  test('inga tekniska termer i rubriken', () => {
    // CLAUDE.md: inga tekniska termer synliga för slutanvändaren.
    for (const kind of ['ata_ej_fakturerad', 'material_ej_fakturerat', 'projekt_utan_faktura'] as const) {
      const titel = findingTitle({ kind, projectId: 'p', projectName: 'P', amountKr: 100, evidence: '', dedupeKey: '' })
      expect(titel).not.toMatch(/payload|invoice|project_|null|undefined|_/)
    }
  })
})
