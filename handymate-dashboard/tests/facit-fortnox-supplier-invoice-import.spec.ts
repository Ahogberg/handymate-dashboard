// tests/facit-fortnox-supplier-invoice-import.spec.ts
//
// OMPEKAT 2026-08-26 (medveten spec-ändring): importlogiken (hämta → dedup
// → mappa → infoga → audit) flyttade ur rutten till
// lib/fortnox/import-supplier-invoices.ts så att 2h-cronen kan köra samma
// kod (cronen kan inte anropa rutten — session-grindad). Rutten är nu tunn:
// POST-export, auth först, anslutningskoll och den svenska återanslut-
// texten bor kvar där. Assertions om fetch/dedup/insert/felisolering pekar
// därför på lib-filen.
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE_PATH = path.join(
  __dirname, '..', 'app/api/integrations/fortnox/import/supplier-invoices/route.ts',
)
const LIB_PATH = path.join(__dirname, '..', 'lib/fortnox/import-supplier-invoices.ts')

const route = () => fs.readFileSync(ROUTE_PATH, 'utf8')
const lib = () => fs.readFileSync(LIB_PATH, 'utf8')

test.describe('POST /api/integrations/fortnox/import/supplier-invoices — tunn rutt', () => {
  test('rutten finns och exporterar POST', () => {
    expect(fs.existsSync(ROUTE_PATH)).toBe(true)
    expect(route()).toContain('export async function POST')
  })

  test('kräver autentisering före importen', () => {
    const src = route()
    const authIdx = src.indexOf('getAuthenticatedBusiness')
    const importIdx = src.indexOf('importSupplierInvoicesForBusiness(businessId)')
    expect(authIdx).toBeGreaterThan(-1)
    expect(importIdx).toBeGreaterThan(authIdx)
  })

  test('rutten delegerar — ingen egen Fortnox-hämtning eller insert kvar', () => {
    const src = route()
    expect(src).not.toContain('getFortnoxSupplierInvoices')
    expect(src).not.toMatch(/\.from\('supplier_invoices'\)/)
  })

  test('scope-fel (403 fran Fortnox) ger en tydlig svensk atenanslut-text, inte ett generiskt fel', () => {
    const src = route()
    expect(src).toMatch(/[åa]teranslut/i)
    expect(src).toContain('needs_reconnect')
  })
})

test.describe('lib/fortnox/import-supplier-invoices.ts — den delade importen', () => {
  test('exporterar importSupplierInvoicesForBusiness och hämtar via getFortnoxSupplierInvoices', () => {
    const src = lib()
    expect(src).toContain('export async function importSupplierInvoicesForBusiness')
    expect(src).toContain('getFortnoxSupplierInvoices(businessId)')
  })

  test('dedup mot befintliga fortnox_supplier_invoice_number — och dedup-uppslaget läser error', () => {
    const src = lib()
    expect(src).toContain('fortnox_supplier_invoice_number')
    expect(src).toMatch(/new Set\(/)
    expect(src, 'ett misslyckat dedup-uppslag får aldrig tolkas som "inga befintliga"').toContain('if (existingError) throw existingError')
  })

  test('nya rader: subcontractor_id ALDRIG satt av importen; project_id BARA via säker matchning (match_source)', () => {
    // 2026-08-26 (medveten spec-ändring): importen får koppla projekt när
    // Fortnox själv säger vilket (konterad på projektet / littrat) — se
    // lib/fortnox/match-supplier-invoice.ts. Gissningar går fortfarande
    // till Karins kö. UE-kopplingen ägs av kön/UI:t som förr.
    const src = lib()
    const match = src.match(/\.from\('supplier_invoices'\)\s*\.insert\(/)
    expect(match).not.toBeNull()
    const insertIdx = match!.index!
    const insertBlock = src.slice(insertIdx, insertIdx + 900)
    expect(insertBlock).not.toMatch(/subcontractor_id:/)
    expect(insertBlock).toContain('...detailColumns(detail, match, nowIso)')
    const cols = src.slice(src.indexOf('function detailColumns('), src.indexOf('async function loadProjectRefs('))
    expect(cols).toContain('project_id: match?.project_id ?? null')
    expect(cols).toContain('match_source: match?.source ?? null')
  })

  test('per-rad felisolering — ett trasigt insert stoppar inte hela batchen', () => {
    expect(lib()).toMatch(/results\.errors\.push/)
  })

  test('403/scope-fel returnerar needs_reconnect i stället för att kasta', () => {
    const src = lib()
    expect(src).toContain('needs_reconnect: true')
    expect(src).toMatch(/message\.includes\('403'\)/)
  })

  test('aggregatlogg via logFortnoxOperation finns kvar', () => {
    expect(lib()).toContain("logFortnoxOperation(businessId, 'import_supplier_invoices'")
  })
})

test.describe('2h-cronen importerar leverantörsfakturor automatiskt', () => {
  const CRON = fs.readFileSync(
    path.join(__dirname, '..', 'app/api/cron/fortnox-sync/route.ts'),
    'utf8',
  )

  test('cronen anropar importSupplierInvoicesForBusiness FÖRE betalstatus-synken', () => {
    const importIdx = CRON.indexOf('importSupplierInvoicesForBusiness(biz.business_id)')
    const paymentsIdx = CRON.indexOf('syncSupplierInvoicePayments(biz.business_id)')
    expect(importIdx).toBeGreaterThan(-1)
    expect(paymentsIdx).toBeGreaterThan(importIdx)
  })

  test('needs_reconnect räknas separat — hamnar inte i errors[]', () => {
    const block = CRON.slice(CRON.indexOf('importSupplierInvoicesForBusiness(biz.business_id)'))
    const reconnectBranch = block.slice(block.indexOf('if (importResult.needs_reconnect)'), block.indexOf('} else {'))
    expect(reconnectBranch).toContain('businessesNeedingReconnect++')
    expect(reconnectBranch).not.toContain('errors.push')
  })

  test('needs_reconnect rapporteras till driftlarmet högst en gång per dygn', () => {
    expect(CRON).toContain("'fortnox-sync:supplier-import-needs-reconnect'")
    expect(CRON).toContain('rapporteraTystFel(')
    expect(CRON).toContain('24 * 60 * 60 * 1000')
  })

  test('svaret bär de nya aggregatfälten (additivt)', () => {
    expect(CRON).toContain('total_supplier_invoices_imported')
    expect(CRON).toContain('businesses_needing_reconnect')
  })
})

test.describe('Installningar - Hamta historik inkluderar leverantorsfakturor', () => {
  const PAGE = fs.readFileSync(
    path.join(__dirname, '..', 'app/dashboard/settings/integrations/page.tsx'),
    'utf8',
  )

  test('handleFortnoxImportHistory anropar import/supplier-invoices', () => {
    const start = PAGE.indexOf('async function handleFortnoxImportHistory')
    const end = PAGE.indexOf('async function handleFortnoxDisconnect')
    const block = PAGE.slice(start, end === -1 ? start + 3000 : end)
    expect(block).toContain('/api/integrations/fortnox/import/supplier-invoices')
  })
})
