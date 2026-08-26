/**
 * Facit: leverantörsfakturor kopplas till projekt när Fortnox själv säger
 * vilket (2026-08-26). Gissningar går fortfarande till Karins kö.
 *
 *   npx playwright test tests/facit-supplier-invoice-auto-match.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('sql/v171 — kolumnerna finns innan koden skriver dem', () => {
  const sql = read('sql/v171_supplier_invoice_fortnox_match.sql')
  for (const col of ['fortnox_project_number', 'fortnox_cost_center', 'fortnox_reference', 'fortnox_rows', 'match_source', 'matched_at']) {
    test(`ADD COLUMN IF NOT EXISTS ${col}`, () => {
      expect(sql).toMatch(new RegExp(`ADD COLUMN IF NOT EXISTS ${col}\\s+`))
    })
  }
})

test.describe('importen — detalj + säker matchning, aldrig gissning', () => {
  const s = read('lib/fortnox/import-supplier-invoices.ts')

  test('detaljen hämtas per NY faktura via getFortnoxSupplierInvoice, best-effort', () => {
    expect(s).toContain('getFortnoxSupplierInvoice(businessId, docNumber)')
    expect(s).toContain('importerar utan koppling')
  })

  test('matchningen är den rena funktionen och projektnumren hämtas en gång per körning', () => {
    expect(s).toContain('matchSupplierInvoiceToProject(detail, projects)')
    expect(s).toContain('if (projectRefs === null) projectRefs = await loadProjectRefs(businessId)')
  })

  test('project_id/match_source/matched_at sätts bara ur matchningen; subcontractor_id aldrig', () => {
    const cols = s.slice(s.indexOf('function detailColumns('), s.indexOf('async function loadProjectRefs('))
    expect(cols).toContain('project_id: match?.project_id ?? null')
    expect(cols).toContain('match_source: match?.source ?? null')
    expect(cols).toContain('matched_at: match ? nowIso : null')
    expect(cols).not.toContain('subcontractor_id')
  })

  test('svepet rör bara okopplade rader utan detalj och skriver aldrig över en manuell koppling', () => {
    const fn = s.slice(s.indexOf('export async function rescanUnlinkedSupplierInvoices'))
    expect(fn).toContain(".is('project_id', null)")
    expect(fn).toContain(".is('fortnox_rows', null)")
    expect(fn).toContain(".is('matched_at', null)")
    // Vakten på UPDATE:en också — inte bara på urvalet.
    const upd = fn.slice(fn.indexOf('.update({'))
    expect(upd.slice(0, 700)).toContain(".is('project_id', null)")
  })

  test('2h-cronen kör svepet efter importen och rapporterar auto_matched', () => {
    const cron = read('app/api/cron/fortnox-sync/route.ts')
    const imp = cron.indexOf('importSupplierInvoicesForBusiness(biz.business_id)')
    const rescan = cron.indexOf('rescanUnlinkedSupplierInvoices(biz.business_id)')
    expect(rescan).toBeGreaterThan(imp)
    expect(cron).toContain('total_supplier_invoices_auto_matched')
  })
})

test.describe('lib/fortnox/match-supplier-invoice.ts — ordningen är låst', () => {
  test('fortnox_project → row_project → reference; blandade rader ger ingen koppling', () => {
    const s = read('lib/fortnox/match-supplier-invoice.ts')
    const a = s.indexOf("source: 'fortnox_project'")
    const b = s.indexOf("source: 'row_project'")
    const c = s.indexOf("source: 'reference'")
    expect(a).toBeGreaterThan(-1)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
    expect(s).toContain('Blandade rader = delad faktura')
  })
})
