/**
 * Facit för driftlarm-rapportering (2026-08-12).
 *
 * Flera nya fail-safe-vägar (margin-snapshot, debrief-kortet, customer_fact-
 * supersede, morning-brief, ai-quote-generatorns lärdoms-/kundfakta-läsning)
 * degraderade tidigare TYST vid fel — bara console.warn/console.error, aldrig
 * synligt för driftlarm-cronen (app/api/cron/driftlarm/route.ts), som sveper
 * automation_activity där status='failed'. lib/observability/driftlarm.ts
 * ger dem en delad, garanterat icke-kastande väg dit.
 *
 * Testar dels helperns EGET beteende (mot en enkel Supabase-mock, eftersom
 * rapporteraTystFel tar emot klienten som parameter — till skillnad från de
 * flesta andra I/O-funktionerna i repot som skapar sin egen via
 * getServerSupabase()), dels att de fem anropsställena FAKTISKT ropar in
 * helpern i sina tysta felgrenar (källkodsskanning, samma stil som
 * tests/customer-facts.spec.ts och tests/project-debrief.spec.ts).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/driftlarm-rapportering.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { rapporteraTystFel, arSchemaSaknas } from '../lib/observability/driftlarm'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

/** Minimal Supabase-mock: bara .from(table).insert(row) behövs av helpern. */
function makeSupabaseMock(opts: { insertError?: { message: string } | null; throwOnInsert?: boolean } = {}) {
  const calls: Array<{ table: string; row: any }> = []
  const client = {
    from(table: string) {
      return {
        async insert(row: any) {
          calls.push({ table, row })
          if (opts.throwOnInsert) throw new Error('nätverksfel (simulerat)')
          return { error: opts.insertError ?? null }
        },
      }
    },
  }
  return { client: client as any, calls }
}

test.describe('rapporteraTystFel — skriver automation_activity i samma form som driftlarmet sveper', () => {
  test('skriver en rad med status=failed, rätt business_id och kalla som action', async () => {
    const { client, calls } = makeSupabaseMock()
    await rapporteraTystFel(client, 'biz_1', 'margin-snapshot:update', 'kolumnen finns inte', { quoteId: 'q_1' })

    expect(calls).toHaveLength(1)
    expect(calls[0].table).toBe('automation_activity')
    expect(calls[0].row.business_id).toBe('biz_1')
    expect(calls[0].row.status).toBe('failed')
    expect(calls[0].row.action).toBe('margin-snapshot:update')
    expect(calls[0].row.description).toBe('kolumnen finns inte')
    expect(calls[0].row.metadata).toEqual({ quoteId: 'q_1' })
  })

  test('metadata defaultar till tomt objekt när context utelämnas', async () => {
    const { client, calls } = makeSupabaseMock()
    await rapporteraTystFel(client, 'biz_1', 'debrief-card:insert', 'fel')
    expect(calls[0].row.metadata).toEqual({})
  })

  test('kastar ALDRIG när insert-anropet returnerar ett fel — loggar bara', async () => {
    const { client } = makeSupabaseMock({ insertError: { message: 'automation_activity finns inte' } })
    await expect(rapporteraTystFel(client, 'biz_1', 'kalla', 'fel')).resolves.toBeUndefined()
  })

  test('kastar ALDRIG när själva insert-anropet kastar (t.ex. nätverksfel)', async () => {
    const { client } = makeSupabaseMock({ throwOnInsert: true })
    await expect(rapporteraTystFel(client, 'biz_1', 'kalla', 'fel')).resolves.toBeUndefined()
  })
})

test.describe('arSchemaSaknas — 42P01/42703 är väntat, allt annat är ett riktigt fel', () => {
  test('42P01 (tabell saknas) räknas som schema-saknas', () => {
    expect(arSchemaSaknas({ code: '42P01' })).toBe(true)
  })
  test('42703 (kolumn saknas) räknas som schema-saknas', () => {
    expect(arSchemaSaknas({ code: '42703' })).toBe(true)
  })
  test('andra felkoder räknas INTE som schema-saknas', () => {
    expect(arSchemaSaknas({ code: '23505' })).toBe(false)
  })
  test('null/undefined/fel utan .code räknas INTE som schema-saknas', () => {
    expect(arSchemaSaknas(null)).toBe(false)
    expect(arSchemaSaknas(undefined)).toBe(false)
    expect(arSchemaSaknas(new Error('nätverksfel'))).toBe(false)
  })
})

test.describe('källskanning — de fem fail-safe-vägarna ropar in rapporteraTystFel', () => {
  test('margin-snapshot.ts: importerar helpern och anropar den i alla tre fail-safe-grenarna', () => {
    const s = read('lib/quotes/margin-snapshot.ts')
    expect(s).toContain("from '@/lib/observability/driftlarm'")
    expect(s).toContain('rapporteraTystFel')
    expect(s).toContain('arSchemaSaknas')
    // Tre distinkta anropsställen: read-existing, read-items, update — plus
    // det oväntade catch-blocket. Minst 4 anrop totalt.
    const count = (s.match(/rapporteraTystFel\(/g) || []).length
    expect(count, 'förväntar minst ett anrop per fail-safe-gren').toBeGreaterThanOrEqual(4)
  })

  test('create-debrief-card.ts: skapaDebriefKort rapporterar i dedupe-, insert- och catch-grenen', () => {
    const s = read('lib/debrief/create-debrief-card.ts')
    expect(s).toContain("from '@/lib/observability/driftlarm'")
    const count = (s.match(/rapporteraTystFel\(/g) || []).length
    expect(count).toBeGreaterThanOrEqual(3)
  })

  test('app/api/approvals/[id]/route.ts: customer_fact-supersedens tysta felgrenar rapporterar', () => {
    const s = read('app/api/approvals/[id]/route.ts')
    expect(s).toContain("from '@/lib/observability/driftlarm'")
    const caseStart = s.indexOf("case 'customer_fact':")
    expect(caseStart).toBeGreaterThan(-1)
    const supersedeIdx = s.indexOf('superseded_by: fact.id', caseStart)
    expect(supersedeIdx).toBeGreaterThan(caseStart)
    const gren = s.slice(supersedeIdx, supersedeIdx + 1200)
    // Både if(supersedeErr)-grenen och catch(supersedeCatchErr)-grenen.
    const count = (gren.match(/rapporteraTystFel\(/g) || []).length
    expect(count, 'både supersedeErr- och catch-grenen ska rapportera').toBeGreaterThanOrEqual(2)
  })

  test('morning-brief.ts: både cash-radar- och möteskontext-fallbacken rapporterar', () => {
    const s = read('lib/matte/morning-brief.ts')
    expect(s).toContain("from '@/lib/observability/driftlarm'")
    const cashIdx = s.indexOf('cash-radar hoppades över')
    const moteIdx = s.indexOf('möteskontext hoppades över')
    expect(cashIdx).toBeGreaterThan(-1)
    expect(moteIdx).toBeGreaterThan(-1)
    expect(s.slice(cashIdx, cashIdx + 300)).toContain('rapporteraTystFel')
    expect(s.slice(moteIdx, moteIdx + 300)).toContain('rapporteraTystFel')
  })

  test('ai-quote-generator.ts: fetchRecentLessons och fetchCustomerFactsForQuote rapporterar, men skippar 42P01/42703', () => {
    const s = read('lib/ai-quote-generator.ts')
    expect(s).toContain("from '@/lib/observability/driftlarm'")

    const lessonsStart = s.indexOf('async function fetchRecentLessons')
    const lessonsSlice = s.slice(lessonsStart, lessonsStart + 1200)
    expect(lessonsSlice).toContain('rapporteraTystFel')
    expect(lessonsSlice).toContain('arSchemaSaknas')

    const factsStart = s.indexOf('async function fetchCustomerFactsForQuote')
    const factsSlice = s.slice(factsStart, factsStart + 1900)
    expect(factsSlice).toContain('rapporteraTystFel')
    expect(factsSlice).toContain('arSchemaSaknas')
  })

  test('freeze-outcome.ts: freezeProjectOutcome rapporterar i alla tysta felgrenar utom den kända schema-saknas-grenen', () => {
    const s = read('lib/efterkalkyl/freeze-outcome.ts')
    expect(s).toContain("from '@/lib/observability/driftlarm'")
    expect(s).toContain('rapporteraTystFel')

    const helperStart = s.indexOf('async function freezeFailure')
    const fnStart = s.indexOf('export async function freezeProjectOutcome')
    expect(helperStart).toBeGreaterThan(-1)
    expect(fnStart).toBeGreaterThan(-1)
    const helperBody = s.slice(helperStart, fnStart)
    const fnBody = s.slice(fnStart)

    // Felrapporteringen är centraliserad: varje icke-schema-fel går genom
    // freezeFailure, som i sin tur anropar rapporteraTystFel exakt en gång.
    expect(helperBody).toContain('rapporteraTystFel(')
    const count = (fnBody.match(/freezeFailure\(/g) || []).length
    expect(count, 'förväntar central felväg för samtliga fail-safe-grenar').toBeGreaterThanOrEqual(6)

    // Den kända "tabellen saknas ännu" (v73 ej körd) grenen ska INTE larma —
    // samma konvention som arSchemaSaknas skippar 42P01/42703 på andra håll.
    const missingTableIdx = fnBody.indexOf('isMissingQualitySchemaError(upsertErr)')
    expect(missingTableIdx).toBeGreaterThan(-1)
    const missingTableGren = fnBody.slice(missingTableIdx, fnBody.indexOf('return', missingTableIdx))
    expect(missingTableGren).not.toContain('rapporteraTystFel')

    // Top-level catch ska gå genom samma rapporterande helper.
    const catchIdx = fnBody.indexOf('} catch (err) {')
    expect(catchIdx).toBeGreaterThan(-1)
    expect(fnBody.slice(catchIdx)).toContain('freezeFailure(')
  })
})
