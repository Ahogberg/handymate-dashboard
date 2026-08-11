/**
 * Facit för Customer Facts V1 — säg-det-en-gång-minnet (2026-08-12).
 *
 * Mötesanalysen extraherar EXPLICIT sagda kundfakta som granskningsbara kort
 * med ordagrant citat. Godkännande skriver EN rad i customer_fact. Ingen
 * ambient extraktion — allt går genom ett kort en människa godkänner.
 *
 *   npx playwright test tests/customer-facts.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { classify, mayExecute, ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { ANALYS_TILLATNA_TYPER } from '../lib/voice/analysis-scope'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('godkännande-kontraktet', () => {
  test('customer_fact är klassad som utförande', () => {
    expect(classify('customer_fact')).toBe('EXECUTABLE_ACTION')
    expect(mayExecute('customer_fact')).toBe(true)
    expect(ACTION_CONTRACT.customer_fact).toBe('EXECUTABLE_ACTION')
  })

  test('exekveraren har en egen gren för customer_fact', () => {
    const s = read('app/api/approvals/[id]/route.ts')
    const i = s.indexOf("case 'customer_fact':")
    expect(i, 'hanteraren saknas i executeApprovalPayload').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 1500)
    expect(gren).toContain("from('customer_fact')")
    expect(gren).toContain('.insert(')
    // Misslyckad insert ska ge det svenska felet, aldrig en tyst krasch.
    expect(gren).toContain('Kunde inte spara — försök igen om en stund')
  })
})

test.describe('analysmotorns område', () => {
  test('ANALYS_TILLATNA_TYPER innehåller customer_fact', () => {
    expect(ANALYS_TILLATNA_TYPER).toContain('customer_fact')
  })
})

test.describe('mötesgrenen bygger korrekt kort', () => {
  const ANALYZE = 'app/api/voice/analyze/route.ts'

  test('kortbygget läser fact_type, evidence_quote och confidence ur fyndet', () => {
    const s = read(ANALYZE)
    const i = s.indexOf("s.type === 'customer_fact'")
    expect(i, 'grenen för customer_fact saknas i kortbygget').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 1200)
    expect(gren).toContain("approval_type: 'customer_fact'")
    expect(gren).toContain('fact_type:')
    expect(gren).toContain('evidence_quote:')
    expect(gren).toContain('confidence:')
    expect(gren).toContain('recording_id')
  })

  test('inget kort skapas utan en härledd kund — hoppas tyst', () => {
    const s = read(ANALYZE)
    const i = s.indexOf("s.type === 'customer_fact'")
    const gren = s.slice(i, i + 400)
    expect(gren, 'ingen vakt mot saknad kund').toContain('if (!factCustomerId) continue')
  })

  test('customer_id härleds via bokningen när samtalet saknar den direkt', () => {
    const s = read(ANALYZE)
    expect(s, 'fallback till booking.customer_id saknas').toContain("from('booking')")
    expect(s).toContain('recording.booking_id')
  })
})

test.describe('konsumenterna läser fail-safe', () => {
  test('resolvern filtrerar på superseded_by och begränsar till 10', () => {
    const s = read('lib/matte/resolver.ts')
    const i = s.indexOf("from('customer_fact')")
    expect(i, 'resolvern läser inte customer_fact').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 400)
    expect(gren).toContain('superseded_by')
    expect(gren).toContain('.limit(10)')
    expect(s).toContain('confirmedFacts')
  })

  test('intent-agentens kontext visar bekräftade kundfakta bara när listan inte är tom', () => {
    const s = read('lib/matte/intent-agent.ts')
    expect(s).toContain('BEKRÄFTADE KUNDFAKTA')
    expect(s).toContain('entity.confirmedFacts.length > 0')
  })

  test('läs-API:et för kundkortet är fail-safe (try/catch → tom lista)', () => {
    const s = read('app/api/customers/[id]/facts/route.ts')
    expect(s).toContain('getAuthenticatedBusiness')
    expect(s).toContain('superseded_by')
    expect(s, 'inget try/catch runt frågan').toContain('catch')
    expect(s).toContain('facts: []')
  })

  test('tidslinjens källa har egen try/catch och rätt event-form', () => {
    const s = read('app/api/customers/[id]/timeline/route.ts')
    const i = s.indexOf("customer_fact_confirmed")
    expect(i, 'källa 13 saknas').toBeGreaterThan(-1)
    const gren = s.slice(Math.max(0, i - 800), i + 400)
    expect(gren).toContain('try {')
    expect(gren).toContain('catch')
    expect(gren).toContain("f.confirmed_at || f.created_at")
  })
})
