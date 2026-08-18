/**
 * FACIT — app/api/mission/[id]/mandate/route.ts (Mission Mandates V1,
 * Etapp X: ägarens upplevelse, tasks/jaunty-pondering-hummingbird.md).
 *
 * Ingen route-körning (repot har ingen fake-NextRequest-härdad testrigg för
 * App Router-handlers, se tests/company-scan.spec.ts/hemtur.spec.ts/
 * startkort.spec.ts för samma konvention) — källskanning av kontraktet:
 * ägargrind, created_by ALDRIG från kroppen, plan_hash beräknad
 * SERVER-sidan ur den AKTUELLA planen, upsert-refuse-semantiken (409 vid
 * icke-återkallat mandat), fail-soft 503 på saknat schema, PATCH revoke/
 * resume (plan_changed blockerar resume), ingen DELETE. Den RIKTIGA
 * exekveringen bevisas av tests/e2e-golden-path/mission-proof.spec.ts:s
 * mandatstation (mot riktig databas).
 *
 * Körs: npx playwright test tests/mission-mandate-route.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const ROUTE = 'app/api/mission/[id]/mandate/route.ts'
const src = read(ROUTE)

test.describe('POST /api/mission/[id]/mandate — ägargrind + facit-först', () => {
  test('grindar på getAuthenticatedBusiness + isOwnerOrAdmin', () => {
    expect(src).toContain('getAuthenticatedBusiness(request)')
    expect(src).toContain('isOwnerOrAdmin(currentUser)')
  })

  test('created_by kommer ALLTID från serverns currentUser, aldrig från body/modellinput', () => {
    expect(src).toContain('created_by: currentUser.id')
    // Ingen skrivning som läser created_by ur den inskickade kroppen.
    expect(src).not.toMatch(/created_by:\s*body/)
  })

  test('plan_hash beräknas server-sidan ur den AKTUELLA plan_snapshot, aldrig ur klientens body', () => {
    expect(src).toContain('computePlanHash(')
    expect(src).not.toMatch(/plan_hash:\s*body/)
  })

  test('kandidaterna (typer/mål ägaren FÅR välja) härleds ur planen, inte ur klienten', () => {
    expect(src).toContain('deriveMandateCandidates(')
  })

  test('valideringen sker via den delade facit-först-helpern, inte en lokal ad hoc-koll', () => {
    expect(src).toContain('validateMandateCreateInput(')
  })

  test('upsert-refuse: ett befintligt icke-återkallat/icke-plan_changed-mandat ger 409 "Ett mandat finns redan"', () => {
    expect(src).toContain('409')
    expect(src).toContain('Ett mandat finns redan')
  })

  test('fail-soft: 42P01 (schema saknas) ger 503 med ett svenskt meddelande, aldrig ett kastat fel', () => {
    expect(src).toContain("42P01")
    expect(src).toContain('503')
  })

  test('mandatet skapas bara för uppdrag med status active (kan inte mandateras efter avslut)', () => {
    expect(src).toContain("eq('status', 'active')")
  })
})

test.describe('PATCH /api/mission/[id]/mandate — revoke/resume', () => {
  test('grindar på getAuthenticatedBusiness + isOwnerOrAdmin (samma gate som POST)', () => {
    // Räknar förekomster — grinden ska finnas för BÅDA metoderna, inte bara en.
    const occurrences = src.split('isOwnerOrAdmin(currentUser)').length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })

  test('revoke sätter status revoked + revoked_at', () => {
    expect(src).toContain("status: 'revoked'")
    expect(src).toContain('revoked_at:')
  })

  test('resume blockeras när pause_reason är plan_changed — kräver ett NYTT mandat', () => {
    expect(src).toContain("pause_reason === 'plan_changed'")
  })

  test('resume sätter status tillbaka till active', () => {
    expect(src).toMatch(/status:\s*'active'/)
  })

  test('ingen DELETE-operation någonstans i rutten (revoke är en statusflipp, aldrig en radering)', () => {
    expect(src).not.toContain('.delete(')
  })

  test('ogiltig action (varken revoke eller resume) avvisas med 400', () => {
    expect(src).toContain("'revoke'")
    expect(src).toContain("'resume'")
    expect(src).toContain('400')
  })
})

test.describe('lib/mandates/mission-mandate.ts / tool-router — mandat skapas ALDRIG av ett chattverktyg', () => {
  test('app/api/agent/trigger/tool-definitions.ts nämner aldrig mission_mandate', () => {
    const toolDefs = read('app/api/agent/trigger/tool-definitions.ts')
    expect(toolDefs.toLowerCase()).not.toContain('mission_mandate')
  })

  test('app/api/agent/trigger/tool-router.ts nämner aldrig mission_mandate', () => {
    const toolRouter = read('app/api/agent/trigger/tool-router.ts')
    expect(toolRouter.toLowerCase()).not.toContain('mission_mandate')
  })

  test('routen refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(src).not.toContain('executeApprovalPayloadInternal')
  })
})
