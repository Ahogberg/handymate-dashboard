/**
 * Facit för Playbook Pattern Confirmation V1 — visningshalvan
 * (app/api/playbook/patterns/route.ts + PlaybookPatternsSection i
 * app/dashboard/settings/page.tsx).
 *
 * Skrivsidan (godkännandeflödet, lib/playbook/*, cron) skeppades redan i
 * commit 73f887ec och är låst av tests/playbook-pattern.spec.ts. Den här
 * filen låser bara det som lades till här: en läs-only yta som gör
 * redan-skriven data synlig för ägaren.
 *
 * Låst här:
 *   - GET-rutten: queryformen (knowledge_type=pattern, status=active,
 *     job_type IS NOT NULL, rätt kolumner) — källkodsskanning, samma
 *     teknik som playbook-pattern.spec.ts använder för icke-exporterade
 *     I/O-funktioner.
 *   - arSchemaSaknas-failsafe återanvänds ordagrant (inte en egen
 *     detektion uppfunnen för den här rutten).
 *   - Ingen owner/admin-gate på GET (till skillnad från business-rules
 *     POST/DELETE) — vem som helst i företaget får titta.
 *   - Ingen POST/DELETE alls i den här rutten (medveten scope-cut,
 *     bekräftade mönster ändras bara via godkännandeflödet).
 *   - settings/page.tsx: PlaybookPatternsSection finns, är read-only
 *     (ingen ta-bort-knapp/handleDelete för mönster), och döljs helt när
 *     listan är tom (ingen "inga mönster än"-platshållare).
 *
 * Körs: npx playwright test tests/playbook-pattern-ui.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const ROUTE = 'app/api/playbook/patterns/route.ts'

// ─────────────────────────────────────────────────────────────────
// GET-rutten — queryform
// ─────────────────────────────────────────────────────────────────

test.describe('app/api/playbook/patterns — GET-queryn', () => {
  const kalla = read(ROUTE)

  test('läser rätt kolumner ur business_knowledge', () => {
    expect(kalla).toContain(".from('business_knowledge')")
    expect(kalla).toContain(".select('id, job_type, observation, confidence, created_at, data_basis')")
  })

  test('filtrerar på business_id, knowledge_type=pattern och status=active', () => {
    expect(kalla).toContain('.eq(\'business_id\', business.business_id)')
    expect(kalla).toContain(".eq('knowledge_type', 'pattern')")
    expect(kalla).toContain(".eq('status', 'active')")
  })

  test('utesluter job_type IS NULL — annars läcker den nattliga observations-pipens rader (utan job_type) in i vyn', () => {
    expect(kalla).toContain(".not('job_type', 'is', null)")
  })

  test('sorterar nyast först', () => {
    expect(kalla).toContain(".order('created_at', { ascending: false })")
  })
})

// ─────────────────────────────────────────────────────────────────
// Fail-safe — arSchemaSaknas återanvänds, ingen ny detektion uppfunnen
// ─────────────────────────────────────────────────────────────────

test.describe('app/api/playbook/patterns — schema-saknas-failsafe', () => {
  const kalla = read(ROUTE)

  test('importerar den delade arSchemaSaknas-helpern, samma som fetchConfirmedPatterns använder', () => {
    expect(kalla).toContain("import { arSchemaSaknas } from '@/lib/observability/driftlarm'")
  })

  test('degraderar till tom lista ({ patterns: [] }), inte 500, när schemat saknas — både i error-grenen och catch-grenen', () => {
    const errIdx = kalla.indexOf('if (error) {')
    expect(errIdx).toBeGreaterThan(-1)
    const errGren = kalla.slice(errIdx, errIdx + 400)
    expect(errGren).toContain('arSchemaSaknas(error)')
    expect(errGren).toContain("NextResponse.json({ patterns: [] })")

    const catchIdx = kalla.indexOf('} catch (err) {')
    expect(catchIdx).toBeGreaterThan(-1)
    const catchGren = kalla.slice(catchIdx, catchIdx + 400)
    expect(catchGren).toContain('arSchemaSaknas(err)')
    expect(catchGren).toContain("NextResponse.json({ patterns: [] })")
  })

  test('en verklig (icke-schema) läsfel ger fortfarande 500, sväljs inte tyst', () => {
    const errIdx = kalla.indexOf('if (error) {')
    const errGren = kalla.slice(errIdx, errIdx + 400)
    expect(errGren).toContain('{ status: 500 }')
  })
})

// ─────────────────────────────────────────────────────────────────
// Ingen owner/admin-gate på GET
// ─────────────────────────────────────────────────────────────────

test.describe('app/api/playbook/patterns — ingen owner/admin-gate', () => {
  const kalla = read(ROUTE)

  test('rutten autentiserar via getAuthenticatedBusiness men kräver aldrig isOwnerOrAdmin', () => {
    expect(kalla).toContain('getAuthenticatedBusiness(request)')
    expect(kalla).not.toContain('isOwnerOrAdmin')
    expect(kalla).not.toContain('getCurrentUser')
  })

  test('rutten exporterar bara GET — ingen POST/DELETE (skrivning sker uteslutande via godkännandeflödet)', () => {
    expect(kalla).toContain('export async function GET')
    expect(kalla).not.toContain('export async function POST')
    expect(kalla).not.toContain('export async function DELETE')
  })
})

// ─────────────────────────────────────────────────────────────────
// settings/page.tsx — PlaybookPatternsSection
// ─────────────────────────────────────────────────────────────────

test.describe('settings/page.tsx — PlaybookPatternsSection', () => {
  const kalla = read('app/dashboard/settings/page.tsx')

  test('komponenten finns och är monterad i inställningssidan', () => {
    expect(kalla).toContain('function PlaybookPatternsSection')
    expect(kalla).toContain('<PlaybookPatternsSection businessId={business.business_id} />')
  })

  test('hämtar från den nya rutten', () => {
    const start = kalla.indexOf('function PlaybookPatternsSection')
    const slice = kalla.slice(start, start + 3000)
    expect(slice).toContain("fetch('/api/playbook/patterns')")
  })

  test('döljer sig helt när listan är tom — ingen platshållartext, bara ett tidigt return null', () => {
    const start = kalla.indexOf('function PlaybookPatternsSection')
    const slice = kalla.slice(start, start + 3000)
    expect(slice).toContain('if (loading || patterns.length === 0) return null')
  })

  test('read-only: ingen ta-bort/redigera-knapp eller DELETE-anrop för mönster', () => {
    const start = kalla.indexOf('function PlaybookPatternsSection')
    const end = kalla.indexOf('\nfunction ', start + 10)
    const slice = kalla.slice(start, end > -1 ? end : start + 4000)
    expect(slice).not.toContain('/api/playbook/patterns?id=')
    expect(slice).not.toContain("method: 'DELETE'")
    expect(slice).not.toContain('handleDelete')
  })

  test('rader visar job_type, observation och ett bekräftelsedatum i svenskt format', () => {
    const start = kalla.indexOf('function PlaybookPatternsSection')
    const slice = kalla.slice(start, start + 3000)
    expect(slice).toContain('pattern.job_type')
    expect(slice).toContain('pattern.observation')
    expect(slice).toContain("toLocaleDateString('sv-SE')")
  })

  test('varje rad har en synlig AI-proveniens-tagg, skild från BusinessRulesSection\'s egna manuella rader', () => {
    const start = kalla.indexOf('function PlaybookPatternsSection')
    const slice = kalla.slice(start, start + 3000)
    expect(slice).toMatch(/AI-föreslaget/)
  })
})
