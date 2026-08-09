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
import fs from 'fs'
import path from 'path'
import {
  findUninvoicedAta,
  findUninvoicedMaterial,
  findCompletedWithoutInvoice,
  sweepMissedRevenue,
  isPastGrace,
  findingTitle,
  legacyPendingCardsToExpire,
  partitionPriorRevenueCards,
  MIN_AMOUNT_KR,
  GRACE_DAYS,
  type ProjectRow,
} from '../lib/value/missed-revenue'

const NOW = new Date('2026-08-06T09:00:00.000Z')
const LÄNGE_SEDAN = '2026-07-01T09:00:00.000Z'   // ~5 veckor
const IGÅR = '2026-08-05T09:00:00.000Z'          // inom nådatiden

const projekt = (over: Partial<ProjectRow> = {}): ProjectRow => ({
  project_id: 'p1', name: 'Badrum Ekbacken', project_type: 'hourly',
  status: 'completed', completed_at: LÄNGE_SEDAN, ...over,
})
const karta = (...ps: ProjectRow[]) => new Map(ps.map(p => [p.project_id, p]))
const INGA_FAKTUROR: { project_id: string | null }[] = []
const ROOT = path.resolve(__dirname, '..')
const cronSource = fs.readFileSync(path.join(ROOT, 'app/api/cron/missed-revenue/route.ts'), 'utf8')
const pengarRouteSource = fs.readFileSync(path.join(ROOT, 'app/api/dashboard/pengar/route.ts'), 'utf8')

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
    id: 'a1', project_id: 'p1', change_type: 'addition', description: 'Flytt av golvbrunn',
    amount: 18400, signed_at: LÄNGE_SEDAN, invoice_id: null, invoiced_at: null, ...over,
  })

  test('avslutad, påskriven ÄTA utan kopplad faktura är LIKELY — aldrig confirmed', () => {
    const f = findUninvoicedAta([ata()], karta(projekt()), INGA_FAKTUROR, NOW)
    expect(f).toHaveLength(1)
    expect(f[0].amountKr).toBe(18400)
    expect(f[0].sourceAmountKr).toBe(18400)
    expect(f[0].confidence).toBe('LIKELY_UNBILLED')
    expect(f[0].action).toBe('DRAFT_AFTER_REVIEW')
    expect(f[0].sourceIds).toEqual(['a1'])
    expect(f[0].evidence).toContain('Flytt av golvbrunn')
  })

  test('redan fakturerad är inget fynd', () => {
    expect(findUninvoicedAta([ata({ invoiced_at: LÄNGE_SEDAN })], karta(projekt()), INGA_FAKTUROR, NOW)).toEqual([])
    expect(findUninvoicedAta([ata({ invoice_id: 'inv_1' })], karta(projekt()), INGA_FAKTUROR, NOW)).toEqual([])
  })

  test('inte påskriven är inget fynd — kunden har inte godkänt', () => {
    expect(findUninvoicedAta([ata({ signed_at: null })], karta(projekt()), INGA_FAKTUROR, NOW)).toEqual([])
  })

  test('pågående projekt larmar inte — signaturen bevisar inte utfört arbete', () => {
    const f = findUninvoicedAta(
      [ata()], karta(projekt({ status: 'active', completed_at: null })), INGA_FAKTUROR, NOW,
    )
    expect(f).toEqual([])
  })

  test('nyss avslutat projekt får nådatid', () => {
    expect(findUninvoicedAta([ata()], karta(projekt({ completed_at: IGÅR })), INGA_FAKTUROR, NOW)).toEqual([])
  })

  test('befintlig projektfaktura gör ÄTA:n review-only och tar bort beloppet ur potentialen', () => {
    const f = findUninvoicedAta([ata()], karta(projekt()), [{ project_id: 'p1' }], NOW)
    expect(f[0].confidence).toBe('NEEDS_REVIEW')
    expect(f[0].action).toBe('REVIEW_ONLY')
    expect(f[0].amountKr).toBe(0)
    expect(f[0].sourceAmountKr).toBe(18400)
  })

  test('avgående och okänd ÄTA räknas aldrig som missad intäkt', () => {
    expect(findUninvoicedAta([ata({ change_type: 'removal' })], karta(projekt()), INGA_FAKTUROR, NOW)).toEqual([])
    expect(findUninvoicedAta([ata({ change_type: null })], karta(projekt()), INGA_FAKTUROR, NOW)).toEqual([])
  })
})

test.describe('regel 2 — material summeras PER PROJEKT', () => {
  const mat = (id: string, sell: number, over: any = {}) => ({
    id, project_id: 'p1', total_sell: sell, invoiced: false, invoice_id: null, ...over,
  })

  test('femton ofakturerade rader ger ETT kort, inte femton', () => {
    const rows = Array.from({ length: 15 }, (_, i) => mat(`m${i}`, 200))
    const f = findUninvoicedMaterial(rows, karta(projekt()), INGA_FAKTUROR, NOW)
    expect(f).toHaveLength(1)
    expect(f[0].amountKr).toBe(3000)
  })

  test('fakturerade rader räknas inte in', () => {
    const f = findUninvoicedMaterial(
      [
        mat('m1', 5000),
        mat('m2', 9000, { invoiced: true }),
        mat('m3', 7000, { invoice_id: 'inv_1' }),
      ],
      karta(projekt()),
      INGA_FAKTUROR,
      NOW,
    )
    expect(f[0].amountKr).toBe(5000)
  })

  test('bara avslutade projekt — pågående material är normalt', () => {
    const f = findUninvoicedMaterial([mat('m1', 9000)], karta(projekt({ status: 'active' })), INGA_FAKTUROR, NOW)
    expect(f).toEqual([])
  })

  test('material på okänt projekt tappas tyst i stället för att krascha', () => {
    expect(findUninvoicedMaterial([mat('m1', 9000, { project_id: 'saknas' })], karta(projekt()), INGA_FAKTUROR, NOW)).toEqual([])
  })

  test('fastpris räknas aldrig som ofakturerad potential', () => {
    const [f] = findUninvoicedMaterial(
      [mat('m1', 9000)], karta(projekt({ project_type: 'fixed_price' })), INGA_FAKTUROR, NOW,
    )
    expect(f.confidence).toBe('NEEDS_REVIEW')
    expect(f.amountKr).toBe(0)
    expect(f.sourceAmountKr).toBe(9000)
    expect(f.evidence).toContain('fastpris')
  })

  test('blandat projekt utan faktura är likely men aldrig utkastbart automatiskt', () => {
    const [f] = findUninvoicedMaterial(
      [mat('m1', 9000)], karta(projekt({ project_type: 'mixed' })), INGA_FAKTUROR, NOW,
    )
    expect(f.confidence).toBe('LIKELY_UNBILLED')
    expect(f.action).toBe('REVIEW_ONLY')
  })

  test('befintlig projektfaktura nedgraderar material till review-only utan potentialbelopp', () => {
    const [f] = findUninvoicedMaterial(
      [mat('m1', 9000)], karta(projekt()), [{ project_id: 'p1' }], NOW,
    )
    expect(f.confidence).toBe('NEEDS_REVIEW')
    expect(f.amountKr).toBe(0)
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
    const liten = { id: 'a1', project_id: 'p1', change_type: 'addition', description: null, amount: MIN_AMOUNT_KR - 1, signed_at: LÄNGE_SEDAN, invoice_id: null, invoiced_at: null }
    expect(findUninvoicedAta([liten], karta(projekt()), INGA_FAKTUROR, NOW)).toEqual([])
  })

  test('precis på gränsen skapas ett', () => {
    const jämn = { id: 'a1', project_id: 'p1', change_type: 'addition', description: null, amount: MIN_AMOUNT_KR, signed_at: LÄNGE_SEDAN, invoice_id: null, invoiced_at: null }
    expect(findUninvoicedAta([jämn], karta(projekt()), INGA_FAKTUROR, NOW)).toHaveLength(1)
  })
})

test.describe('svepet i sin helhet', () => {
  const input = {
    atas: [{ id: 'a1', project_id: 'p1', change_type: 'addition', description: 'ÄTA', amount: 18400, signed_at: LÄNGE_SEDAN, invoice_id: null, invoiced_at: null }],
    materials: [{ id: 'm1', project_id: 'p1', total_sell: 3000, invoiced: false, invoice_id: null }],
    projects: [projekt()],
    invoices: [],
    alreadyReported: new Set<string>(),
    now: NOW,
  }

  test('hittar alla tre reglerna', () => {
    const f = sweepMissedRevenue(input)
    expect(f.map(x => x.kind).sort()).toEqual(
      ['ata_ej_fakturerad', 'material_ej_fakturerat', 'projekt_utan_faktura'],
    )
  })

  test('ingen nuvarande regel påstår CONFIRMED_UNBILLED utan källradslänkning', () => {
    const f = sweepMissedRevenue(input)
    expect(f.every(finding => finding.confidence !== 'CONFIRMED_UNBILLED')).toBe(true)
  })

  test('största beloppet först — inte äldsta posten', () => {
    const f = sweepMissedRevenue(input)
    expect(f[0].amountKr).toBe(18400)
    expect(f[0].amountKr).toBeGreaterThanOrEqual(f[1].amountKr)
  })

  test('DEDUPE: även ett avfärdat/hanterat fynd rapporteras bara en gång', () => {
    // Cronen laddar alla tidigare missad_intakt-kort, inte bara pending.
    const f = sweepMissedRevenue({ ...input, alreadyReported: new Set(['ata:a1', 'material:p1']) })
    expect(f.map(x => x.kind)).toEqual(['projekt_utan_faktura'])
  })

  test('tom indata ger tom lista, aldrig en krasch', () => {
    expect(sweepMissedRevenue({
      atas: [], materials: [], projects: [], invoices: [], alreadyReported: new Set(), now: NOW,
    })).toEqual([])
  })

  test('dedupe-nycklarna är stabila mellan körningar', () => {
    const a = sweepMissedRevenue(input).map(f => f.dedupeKey)
    const b = sweepMissedRevenue(input).map(f => f.dedupeKey)
    expect(a).toEqual(b)
  })
})

test.describe('versionsdedupe för befintliga kort', () => {
  test('gammalt pendingkort klassas om på plats', () => {
    const result = partitionPriorRevenueCards([{
      id: 'appr_old', status: 'pending', payload: { dedupe_key: 'ata:a1' },
    }])
    expect(result.legacyPendingByDedupe.get('ata:a1')).toBe('appr_old')
    expect(result.alreadyReported.has('ata:a1')).toBe(false)
  })

  test('hanterat legacykort återuppstår inte', () => {
    const result = partitionPriorRevenueCards([{
      id: 'appr_old', status: 'rejected', payload: { dedupe_key: 'ata:a1' },
    }])
    expect(result.alreadyReported.has('ata:a1')).toBe(true)
    expect(result.legacyPendingByDedupe.size).toBe(0)
  })

  test('pendingkort på aktuell version dedupas utan omskrivning', () => {
    const result = partitionPriorRevenueCards([{
      id: 'appr_current',
      status: 'pending',
      payload: { dedupe_key: 'ata:a1', classification_version: 1 },
    }])
    expect(result.alreadyReported.has('ata:a1')).toBe(true)
    expect(result.legacyPendingByDedupe.size).toBe(0)
  })

  test('legacykort som inte längre kvalificerar avförs, giltiga behålls', () => {
    const legacy = new Map([
      ['ata:aktiv', 'appr_active'],
      ['ata:giltig', 'appr_valid'],
      ['ata:removal', 'appr_removal'],
    ])
    expect(legacyPendingCardsToExpire(legacy, new Set(['ata:giltig']))).toEqual([
      'appr_active',
      'appr_removal',
    ])
  })
})

test.describe('rubrikerna är på svenska och säger beloppet', () => {
  test('belopp finns med när det är känt', () => {
    const f = sweepMissedRevenue({
      atas: [{ id: 'a1', project_id: 'p1', change_type: 'addition', description: null, amount: 18400, signed_at: LÄNGE_SEDAN, invoice_id: null, invoiced_at: null }],
      materials: [], projects: [projekt()], invoices: [], alreadyReported: new Set(), now: NOW,
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
      const titel = findingTitle({
        kind,
        projectId: 'p',
        projectName: 'P',
        amountKr: 100,
        sourceAmountKr: 100,
        confidence: 'LIKELY_UNBILLED',
        action: 'REVIEW_ONLY',
        sourceIds: ['source'],
        evidence: '',
        dedupeKey: '',
      })
      expect(titel).not.toMatch(/payload|invoice|project_|null|undefined|_/)
    }
  })
})

test.describe('produktionsvägarnas klassningskontrakt', () => {
  test('båda vägarna läser faktureringsformen som klassningen kräver', () => {
    const select = ".select('project_id, name, project_type, status, completed_at')"
    expect(cronSource).toContain(select)
    expect(pengarRouteSource).toContain(select)
    expect(cronSource).toContain('project_id, change_type, description')
    expect(pengarRouteSource).toContain('project_id, change_type, description')
    expect(cronSource).toContain('total_sell, invoiced, invoice_id')
    expect(pengarRouteSource).toContain('total_sell, invoiced, invoice_id')
  })

  test('kortpayloaden bär bevisstyrka, åtgärdsgräns, källor och version', () => {
    for (const field of [
      'source_amount_kr', 'confidence', 'recommended_action', 'source_ids', 'classification_version',
    ]) {
      expect(cronSource).toContain(field)
    }
  })

  test('dedupen läser även hanterade kort, inte bara pending', () => {
    const start = cronSource.indexOf("supabase.from('pending_approvals')")
    const end = cronSource.indexOf('])', start)
    const query = cronSource.slice(start, end)
    expect(query).toContain(".eq('approval_type', 'missad_intakt')")
    expect(query).not.toContain(".eq('status', 'pending')")
    expect(cronSource).toContain('legacyPendingByDedupe.get(f.dedupeKey)')
    expect(cronSource).toContain('legacyPendingCardsToExpire(legacyPendingByDedupe, currentFindingKeys)')
    expect(cronSource).toContain('.update(fields)')
  })

  test('felaktiga legacykort avförs fail-closed och tenant-scopat', () => {
    const start = cronSource.indexOf('async function expireLegacyCard')
    const end = cronSource.indexOf('async function persistCard', start)
    const helper = cronSource.slice(start, end)
    expect(helper).toContain("status: 'expired'")
    expect(helper).toContain(".eq('business_id', businessId)")
    expect(helper).toContain(".eq('approval_type', 'missad_intakt')")
    expect(helper).toContain(".eq('status', 'pending')")
    expect(helper).toContain('if (error || !data)')
  })

  test('företagsfel ger en misslyckad cron, aldrig HTTP 200 med dold fellista', () => {
    expect(cronSource).toContain('if (errors.length > 0)')
    expect(cronSource).toContain('{ status: 500 }')
    expect(cronSource).toContain('success: false')
  })
})

test.describe('saknad arbetskostnad — null-belopp i källraderna (X1-fixturkravet)', () => {
  // Roadmapens testlista kräver fallet uttryckligen: rader där beloppet
  // aldrig registrerades. Regeln: ett okänt belopp är NOLL i potentialen —
  // aldrig NaN, aldrig en krasch, aldrig ett kort som påstår en summa.
  const ataUtanBelopp = {
    id: 'a_null', project_id: 'p1', change_type: 'addition' as const,
    description: 'Tillägg utan registrerat belopp',
    amount: null, signed_at: LÄNGE_SEDAN, invoice_id: null, invoiced_at: null,
  }

  test('ÄTA utan belopp blir inget kort — under minimigränsen, inte NaN', () => {
    const fynd = findUninvoicedAta([ataUtanBelopp], karta(projekt()), INGA_FAKTUROR, NOW)
    expect(fynd).toHaveLength(0)
  })

  test('material utan belopp kraschar inte och blåser inte upp summan', () => {
    const rader = [
      { id: 'm1', project_id: 'p1', total_sell: null, invoiced: false, invoice_id: null },
      { id: 'm2', project_id: 'p1', total_sell: 900, invoiced: false, invoice_id: null },
    ]
    const fynd = findUninvoicedMaterial(rader, karta(projekt()), INGA_FAKTUROR, NOW)
    expect(fynd).toHaveLength(1)
    expect(Number.isFinite(fynd[0].amountKr)).toBe(true)
    expect(fynd[0].sourceAmountKr).toBe(900)
  })

  test('enbart null-rader når aldrig minimibeloppet', () => {
    const rader = [
      { id: 'm1', project_id: 'p1', total_sell: null, invoiced: false, invoice_id: null },
      { id: 'm2', project_id: 'p1', total_sell: null, invoiced: false, invoice_id: null },
    ]
    expect(findUninvoicedMaterial(rader, karta(projekt()), INGA_FAKTUROR, NOW)).toHaveLength(0)
  })
})
