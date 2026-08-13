/**
 * A9 — Anställd utan ekonomibehörighet (403 → ytor göms).
 *
 * Körs EFTER golden-path.spec.ts (Playwright project-dependency i
 * playwright.config.ts — samma mönster som setup→chromium), eftersom den
 * behöver projektet golden-path skapade för att verifiera "döljs ÄTA-priser/
 * Ekonomi på just DETTA projekt". Läser ID:n från en fil golden-path.spec.ts
 * skrev i sin afterAll (separata Playwright-projekt = separata processer,
 * modul-variabler kan inte delas).
 *
 * Källor för de exakta assertions (inga gissade nav-namn/rutter):
 * - components/Sidebar.tsx: HIDDEN_FOR_EMPLOYEE / HIDDEN_CHILDREN_FOR_EMPLOYEE
 *   / OWNER_ADMIN_ONLY_CHILDREN (rad ~571-632)
 * - lib/permissions.ts: hasPermission/PERMISSION_MAP
 * - tests/permission-contract.spec.ts: SENSITIVE_ROUTES (källskanning av att
 *   koden INNEHÅLLER ett guard-anrop — den begränsningen stänger den här
 *   filen genom att göra RIKTIGA HTTP-anrop och kräva ett RIKTIGT 403).
 *
 * Städning: den här filens afterAll är den SANNA sista städ-punkten för
 * kärnraderna (kund/offert/projekt/milestones/godkännande) — se
 * golden-path.spec.ts's afterAll-kommentar för varför den lämnar dem kvar.
 */
import * as fs from 'fs'
import * as path from 'path'
import { test, expect } from '@playwright/test'
import { getSupabaseAdmin, DEMO_BUSINESS_ID } from './fixtures/db'
import { pushResult } from './fixtures/report'

const IDS_HANDOFF_FILE = path.join(process.cwd(), 'test-results', 'golden-path', 'ids.json')

interface HandoffIds {
  customerId: string | null
  quoteId: string | null
  signToken: string | null
  projectId: string | null
  milestoneIds: string[]
  bookingId: string | null
  timeEntryIds: string[]
  approvalId: string | null
  // ── Fas 2 (station 8-14) ──────────────────────────────────────────────
  invoiceId: string | null
  debriefApprovalId: string | null
  reviewInvoiceApprovalId: string | null
  confirmPaymentApprovalId: string | null
  customerFactApprovalId: string | null
  customerFactIds: string[]
  meetingRecordingId: string | null
  lessonTexts: string[]
  approvalIds: string[]
  allStationsOk: boolean
}

function readHandoff(): HandoffIds | null {
  if (!fs.existsSync(IDS_HANDOFF_FILE)) return null
  try {
    return JSON.parse(fs.readFileSync(IDS_HANDOFF_FILE, 'utf8')) as HandoffIds
  } catch {
    return null
  }
}

// Hrefs hämtade EXAKT ur components/Sidebar.tsx — gissa aldrig.
const HIDDEN_HREFS_FOR_EMPLOYEE = [
  '/dashboard/settings',
  '/dashboard/team',
  '/dashboard/automations',
  '/dashboard/analytics',
  '/dashboard/billing',
]
const OWNER_ADMIN_ONLY_HREFS = ['/dashboard/karin', '/dashboard/pengar']

// Minst 3 rutter ur tests/permission-contract.spec.ts's SENSITIVE_ROUTES.
const SENSITIVE_API_CHECKS: { path: (ids: HandoffIds) => string; label: string }[] = [
  { path: () => '/api/analytics/economics', label: 'analytics/economics (see_financials)' },
  { path: (ids) => `/api/projects/${ids.projectId}/profitability`, label: 'projects/[id]/profitability (see_financials)' },
  { path: () => '/api/export', label: 'export (owner-admin)' },
]

test.describe('A9 — Behörighetstestet (anställd utan ekonomibehörighet)', () => {
  const handoff = readHandoff()

  test.afterAll(async () => {
    if (!handoff) return
    const supabase = getSupabaseAdmin()
    const leftover: string[] = []
    const del = async (table: string, column: string, value: string | null) => {
      if (!value) return
      const { error } = await supabase.from(table).delete().eq(column, value)
      if (error) leftover.push(`${table}:${value} (${error.message})`)
    }
    // Fas 2 (station 8-14) — FÖRE milestones/quote/project (FK-barn), samma
    // ordning/motivering som golden-path.spec.ts:s egen cleanupCore().
    await del('customer_fact', 'customer_id', handoff.customerId)
    await del('call_recording', 'recording_id', handoff.meetingRecordingId)
    for (const aId of handoff.approvalIds) await del('pending_approvals', 'id', aId)
    // Samma project_id-sopning som golden-path.spec.ts:s cleanupCore() —
    // fångar Fas 2-kort som skapades server-sida men aldrig hann in i
    // handoff.approvalIds (se den filens kommentar för det källgranskade
    // scenariot detta täcker).
    if (handoff.projectId) {
      const { data: orphanedApprovals } = await supabase
        .from('pending_approvals')
        .select('id, payload')
        .eq('business_id', DEMO_BUSINESS_ID)
        .in('approval_type', ['review_auto_invoice', 'project_debrief', 'confirm_payment', 'send_sms', 'review_request', 'scheduled_review_request'])
      for (const row of orphanedApprovals || []) {
        if ((row as any).payload?.project_id === handoff.projectId) await del('pending_approvals', 'id', (row as any).id)
      }
    }
    await del('project_outcome', 'project_id', handoff.projectId)
    await del('project_lesson', 'project_id', handoff.projectId)
    await del('invoice', 'invoice_id', handoff.invoiceId)
    await del('invoice', 'project_id', handoff.projectId)
    for (const mId of handoff.milestoneIds) await del('project_milestone', 'milestone_id', mId)
    await del('pending_approvals', 'id', handoff.approvalId)
    await del('quote_tracking_events', 'quote_id', handoff.quoteId)
    await del('quotes', 'quote_id', handoff.quoteId)
    await del('project', 'project_id', handoff.projectId)
    // Samma FK-fynd som golden-path.spec.ts:s cleanupCore — se dess kommentar.
    await del('customer_activity', 'customer_id', handoff.customerId)
    await del('customer', 'customer_id', handoff.customerId)

    pushResult({
      station: 'Städning',
      steg: 'permission-check.spec.ts afterAll (sista städ-punkten)',
      ui_bevis: '',
      db_bevis: '',
      verdict: leftover.length > 0 ? 'FAIL' : 'PASS',
      detalj: leftover.length > 0 ? `Kunde inte städa: ${leftover.join('; ')}` : 'Kärnrader (kund/offert/projekt/milestones/godkännande) städade.',
    })
  })

  test('UI-bevis: Ekonomi/ÄTA-priser och sidomeny-punkter döljs för anställd', async ({ page }) => {
    if (!handoff || !handoff.allStationsOk || !handoff.projectId) {
      pushResult({
        station: 'A9',
        steg: 'UI-bevis',
        ui_bevis: '',
        db_bevis: '',
        verdict: 'SKIP',
        detalj: 'golden-path.spec.ts skapade inget användbart projekt (misslyckades eller körde aldrig) — inget att verifiera behörigheter mot.',
      })
      test.skip()
      return
    }

    try {
      await test.step('Navigera till projektet golden-path skapade', async () => {
        await page.goto(`/dashboard/projects/${handoff.projectId}`)
      })

      await test.step('Ekonomi-fliken är omdöpt till "Offert" (canSeeFinancials=false döljer Ekonomi/Material/Leverantörer)', async () => {
        await expect(page.getByText('Ekonomi & offert')).toHaveCount(0)
      })

      await test.step('Dolda sidomeny-punkter för anställd saknas helt i DOM:en (inte bara CSS-dolda)', async () => {
        for (const href of [...HIDDEN_HREFS_FOR_EMPLOYEE, ...OWNER_ADMIN_ONLY_HREFS]) {
          await expect(page.locator(`a[href="${href}"]`), `${href} ska INTE finnas i sidomenyn för en anställd`).toHaveCount(0)
        }
      })

      pushResult({
        station: 'A9',
        steg: 'UI-bevis',
        ui_bevis: `/dashboard/projects/${handoff.projectId} som anställd: "Ekonomi & offert" ej synlig, ${
          HIDDEN_HREFS_FOR_EMPLOYEE.length + OWNER_ADMIN_ONLY_HREFS.length
        } dolda menylänkar saknas i DOM`,
        db_bevis: '(rent UI-bevis — se API-bevis-testet för DB/rutt-nivå)',
        verdict: 'PASS',
      })
    } catch (err) {
      pushResult({
        station: 'A9',
        steg: 'UI-bevis',
        ui_bevis: '',
        db_bevis: '',
        verdict: 'FAIL',
        detalj: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  })

  test('API-bevis: minst 3 SENSITIVE_ROUTES ger verkligt 403 för anställd-sessionen', async ({ page }) => {
    if (!handoff || !handoff.allStationsOk || !handoff.projectId) {
      pushResult({
        station: 'A9',
        steg: 'API-bevis',
        ui_bevis: '',
        db_bevis: '',
        verdict: 'SKIP',
        detalj: 'golden-path.spec.ts skapade inget användbart projekt — inget projektspecifikt API att testa mot.',
      })
      test.skip()
      return
    }

    // Källgranskat fynd (2026-08-13, en riktig körning): page.context().request
    // gav 401 (inte 403) på den FÖRSTA raden i den här testfilens EGEN
    // browser-context, trots giltig storageState — en riktig sidnavigering
    // först säkerställer att sessionen faktiskt är "varm" innan de råa
    // API-anropen görs (samma mönster som UI-bevis-testet redan gör via
    // sitt page.goto()).
    await page.goto('/dashboard')

    const results: string[] = []
    try {
      for (const check of SENSITIVE_API_CHECKS) {
        await test.step(`GET ${check.path(handoff)} → förväntar 403`, async () => {
          const res = await page.request.get(check.path(handoff))
          expect(res.status(), `${check.label}: förväntade 403, fick ${res.status()}`).toBe(403)
          results.push(`${check.label} -> 403`)
        })
      }

      pushResult({
        station: 'A9',
        steg: 'API-bevis',
        ui_bevis: '(rent API-bevis — direkta HTTP-anrop, inte källskanning som tests/permission-contract.spec.ts)',
        db_bevis: results.join('; '),
        verdict: 'PASS',
      })
    } catch (err) {
      pushResult({
        station: 'A9',
        steg: 'API-bevis',
        ui_bevis: '',
        db_bevis: results.join('; '),
        verdict: 'FAIL',
        detalj: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  })

  // Sanity: bekräfta att DEMO_BUSINESS_ID faktiskt användes (skydd mot att
  // handoff-filen av misstag pekar på fel tenant om env-nycklar ändras
  // mellan körningar).
  test('Sanity: projektet tillhör DEMO_BUSINESS_ID', async () => {
    if (!handoff || !handoff.projectId) {
      test.skip()
      return
    }
    const supabase = getSupabaseAdmin()
    const { data } = await supabase.from('project').select('business_id').eq('project_id', handoff.projectId).maybeSingle()
    expect(data?.business_id).toBe(DEMO_BUSINESS_ID)
  })
})
