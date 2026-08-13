/**
 * Margin Guardian — fristående E2E-test (2026-08-13).
 *
 * Bevisar att ata_signal-kopplingen (lib/projects/margin-guardian.ts →
 * lib/profitability.ts → lib/jarvis/approval-view.ts → JarvisHome.tsx)
 * fungerar genom HELA kedjan i praktiken — inte bara i facit
 * (tests/margin-guardian.spec.ts, som bara bevisar den rena funktionen).
 *
 * Återanvänder Golden Path-harnessets mönster (fixtures/db.ts, riktig
 * demo-ägarsession via golden-path-setup) men lever i en EGEN fil/eget
 * Playwright-projekt: en lönsamhetsvarning är en villkorad gren (ett
 * projekt måste faktiskt gå över budget), inte en del av kundresans
 * lyckade huvudspår — den ska inte sakta ner eller komplicera Golden
 * Paths 14-stationers kedja.
 *
 * Triggas via den RIKTIGA produktionsvägen: POST /api/time-entry anropar
 * checkProfitabilityWarnings synkront (se app/api/time-entry/route.ts)
 * precis som en hantverkare som loggar tid gör i skarpt läge — ingen
 * admin-seed-genväg för själva varningen.
 *
 * Två faser på SAMMA projekt (checkProfitabilityWarnings dedupar på
 * project_id + status='pending' och UPPDATERAR i stället för att skapa en
 * andra rad — Fas B bevisar även att den mekaniken håller):
 *   Fas A: kostnadsöverdrag UTAN ÄTA-underlag → ata_signal:false →
 *          länken säger "Öppna projektet →"
 *   Fas B: samma projekt får en skickad-men-osignerad ÄTA (project_change,
 *          precis det fält compute-economics.ts läser för ata_pending_kr)
 *          → ata_signal:true → länken säger "Skapa ÄTA →" OCH klicket
 *          landar faktiskt på ÄTA-fliken (?tab=changes).
 *
 * NAMNGIVNING MED FLIT: projektet/kunden heter INTE "E2E ..."/"Testkund ..."
 * (till skillnad från Golden Path). lib/testdata.ts's arTestdataApproval
 * gömmer allt så namngivet från /api/approvals — precis den yta det här
 * testet ska bevisa renderar rätt (upptäckt live, 2026-08-13: kortet dök
 * först upp i "Värt att veta"-momentraden, en HELT ANNAN renderingsväg som
 * inte använder lib/jarvis/approval-view.tss deepLinkFor alls). Ett riktigt
 * kundprojekt skulle aldrig heta så och skulle alltså aldrig gömmas — testet
 * ska efterlikna det, inte trigga hygienfiltret. Städningen nedan är därför
 * extra viktig: ingenting här skyddas av filtret om afterAll skulle missa.
 */
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import { getSupabaseAdmin, DEMO_BUSINESS_ID, DEMO_OWNER_EMAIL, requireDemoOwnerPassword } from '../e2e-golden-path/fixtures/db'

// Ingen ärvd storageState — riktig UI-lösenordsinloggning i beforeAll
// (samma mönster som golden-path.spec.ts Station 1, se playwright.config.ts
// för varför den ärvda demo-owner.json inte dög).
test.use({ storageState: undefined })

const RUN_TS = Date.now()
const PROJECT_NAME = `Guardian Provkörning ${RUN_TS}`
const CUSTOMER_NAME = `Guardian Provkund ${RUN_TS}`
const BUDGET_KR = 10000
const BUDGET_HOURS = 40
// Temporär default-timkostnad — demo-tenanten har ingen konfigurerad
// (business_config.default_internal_hourly_cost är null just nu, verifierat
// via MCP innan detta test skrevs). Utan den blir arbete_kr alltid null och
// ingen varning triggas av att bara logga tid. Återställs i afterAll.
const TEMP_INTERNAL_COST = 400

let ctx: BrowserContext
let page: Page
let customerId: string | null = null
let projectId: string | null = null
let approvalId: string | null = null
const timeEntryIds: string[] = []
let changeId: string | null = null
let originalInternalCost: number | null = null

/** Samma tre kända overlays som golden-path.spec.ts — kopierat med flit,
 *  inte importerat (samma oberoende-princip som fixtures/db.ts's filhuvud).
 *  Plus en FJÄRDE, specifik för det här testet: CompanyScan.tsx (components/
 *  tour/CompanyScan.tsx) — en "här är vad teamet hittade"-rundtur som poppar
 *  upp så fort en NY kund/nytt projekt upptäcks, precis vad det här testet
 *  skapar varje gång. Upptäckt live (2026-08-13) genom att den blockerade
 *  klicket på Guardian-kortets egen länk. */
async function dismissKnownOverlays(p: Page, windowMs = 8000, pollMs = 400): Promise<void> {
  const deadline = Date.now() + windowMs
  while (Date.now() < deadline) {
    const monday = p.getByRole('button', { name: 'Stäng' })
    if (await monday.isVisible().catch(() => false)) {
      await monday.click({ timeout: 2000 }).catch(() => {})
    }
    const welcome = p.getByText('Välkommen — ditt team är på plats.')
    if (await welcome.isVisible().catch(() => false)) {
      await p.mouse.click(10, 10).catch(() => {})
    }
    const cookies = p.getByRole('button', { name: 'Godkänn alla' })
    if (await cookies.isVisible().catch(() => false)) {
      await cookies.click({ timeout: 2000 }).catch(() => {})
    }
    const companyScan = p.getByRole('button', { name: 'Hoppa över' })
    if (await companyScan.isVisible().catch(() => false)) {
      await companyScan.click({ timeout: 2000 }).catch(() => {})
    }
    await p.waitForTimeout(pollMs)
  }
}

test.describe.serial('Margin Guardian — ata_signal i praktiken', () => {
  test.beforeAll(async ({ browser }) => {
    const supabase = getSupabaseAdmin()

    const { data: biz, error: bizErr } = await supabase
      .from('business_config')
      .select('default_internal_hourly_cost')
      .eq('business_id', DEMO_BUSINESS_ID)
      .single()
    if (bizErr) throw new Error(`Kunde inte läsa business_config: ${bizErr.message}`)
    originalInternalCost = biz?.default_internal_hourly_cost ?? null

    const { error: setCostErr } = await supabase
      .from('business_config')
      .update({ default_internal_hourly_cost: TEMP_INTERNAL_COST })
      .eq('business_id', DEMO_BUSINESS_ID)
    if (setCostErr) throw new Error(`Kunde inte sätta temporär timkostnad: ${setCostErr.message}`)

    const { data: customer, error: custErr } = await supabase
      .from('customer')
      .insert({
        business_id: DEMO_BUSINESS_ID,
        name: CUSTOMER_NAME,
        phone_number: '+46700000000',
      })
      .select('customer_id')
      .single()
    if (custErr || !customer) throw new Error(`Kunde inte skapa testkund: ${custErr?.message}`)
    customerId = customer.customer_id

    ctx = await browser.newContext()
    page = await ctx.newPage()

    const password = requireDemoOwnerPassword()
    await page.goto('/login')
    await page.locator('input[type="email"]').fill(DEMO_OWNER_EMAIL)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: 'Logga in' }).click()
    await page.waitForURL(/\/dashboard(?!\/settings)/, { timeout: 15_000 })
    await dismissKnownOverlays(page)
  })

  test.afterAll(async () => {
    const supabase = getSupabaseAdmin()
    for (const teId of timeEntryIds) {
      await supabase.from('time_entry').delete().eq('time_entry_id', teId)
    }
    if (changeId) await supabase.from('project_change').delete().eq('change_id', changeId)
    if (approvalId) await supabase.from('pending_approvals').delete().eq('id', approvalId)
    // KÄLLGRANSKAT (upptäckt live, 2026-08-13): projektet triggar EGNA
    // automationer utöver Guardian-kortet — t.ex. Lars auto-genererar en
    // "SMS — jobb startat"-approval (send_sms) när status='active' sätts.
    // approvalId ovan fångar bara Guardian-kortet självt. En sopning på
    // payload->>project_id (samma mönster som golden-path.spec.ts's
    // cleanupCore) fångar ALLT det projektet genererat, oavsett typ.
    if (projectId) {
      const { data: orphaned } = await supabase
        .from('pending_approvals')
        .select('id, payload')
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('status', 'pending')
      for (const row of orphaned || []) {
        if ((row as any).payload?.project_id === projectId) {
          await supabase.from('pending_approvals').delete().eq('id', (row as any).id)
        }
      }
    }
    if (projectId) await supabase.from('project').delete().eq('project_id', projectId)
    if (customerId) await supabase.from('customer').delete().eq('customer_id', customerId)
    await supabase
      .from('business_config')
      .update({ default_internal_hourly_cost: originalInternalCost })
      .eq('business_id', DEMO_BUSINESS_ID)
    await ctx?.close().catch(() => {})
  })

  test('Fas A: kostnadsöverdrag utan ÄTA-underlag → "Öppna projektet →"', async () => {
    const createRes = await page.request.post('/api/projects', {
      data: {
        name: PROJECT_NAME,
        customer_id: customerId,
        project_type: 'hourly',
        status: 'active',
        budget_amount: BUDGET_KR,
        budget_hours: BUDGET_HOURS,
      },
    })
    expect(createRes.ok(), `POST /api/projects: ${await createRes.text()}`).toBeTruthy()
    const created = await createRes.json()
    projectId = created.project?.project_id || created.project_id
    expect(projectId, 'projekt-id saknas i svaret').toBeTruthy()

    // 20h × 400 kr/h = 8000 kr av 10 000 kr budget = 80 % → at_risk (>75 %,
    // <96 %) — medvetet under over_budget-tröskeln så titeln (och därmed
    // testet) inte blir känslig för vilken av de två den råkar bli.
    const teRes = await page.request.post('/api/time-entry', {
      data: {
        project_id: projectId,
        customer_id: customerId,
        work_date: new Date().toISOString().split('T')[0],
        duration_minutes: 20 * 60,
        description: 'Guardian-provkörning — arbete (fas A)',
        is_billable: true,
      },
    })
    expect(teRes.ok(), `POST /api/time-entry: ${await teRes.text()}`).toBeTruthy()
    const teBody = await teRes.json()
    timeEntryIds.push(teBody.entry.time_entry_id)

    // ── DB-sanning ──────────────────────────────────────────────────────
    const supabase = getSupabaseAdmin()
    let approvalRow: any = null
    for (let i = 0; i < 10 && !approvalRow; i++) {
      const { data } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('business_id', DEMO_BUSINESS_ID)
        .eq('approval_type', 'profitability_warning')
        .eq('status', 'pending')
        .contains('payload', { project_id: projectId })
        .maybeSingle()
      if (data) approvalRow = data
      else await page.waitForTimeout(500)
    }
    expect(approvalRow, 'inget profitability_warning-kort skapades för projektet').toBeTruthy()
    approvalId = approvalRow.id
    expect(approvalRow.payload.ata_signal, 'ata_signal ska vara false utan ÄTA-underlag').toBe(false)
    expect(approvalRow.payload.cost_percent).toBeGreaterThan(75)

    // ── UI-bevis ────────────────────────────────────────────────────────
    // JarvisHome expanderar automatiskt de första MAX_FULL_CARDS korten
    // (components/jarvis/JarvisHome.tsx) — i en tunn demo-kö (som just nu)
    // visas kortet redan utfällt utan klick. Klickar bara om en hopfälld
    // växlingsknapp faktiskt finns, så testet klarar båda lägena.
    await page.goto('/dashboard')
    await dismissKnownOverlays(page, 4000)
    await expect(page.getByText(PROJECT_NAME).first(), 'Guardian-kortet syns inte på hemskärmen').toBeVisible({ timeout: 10_000 })
    const vaxlare = page.getByRole('button', { name: new RegExp(PROJECT_NAME) })
    if (await vaxlare.isVisible().catch(() => false)) await vaxlare.click()

    const lank = page.getByRole('link', { name: 'Öppna projektet →' })
    await expect(lank).toBeVisible()
    await expect(lank).toHaveAttribute('href', `/dashboard/projects/${projectId}`)
    await expect(page.getByRole('link', { name: 'Skapa ÄTA →' })).toHaveCount(0)
  })

  test('Fas B: skickad-men-osignerad ÄTA finns → "Skapa ÄTA →" → landar på ÄTA-fliken', async () => {
    expect(projectId, 'Fas A måste ha skapat projektet').toBeTruthy()

    const supabase = getSupabaseAdmin()
    const { data: change, error: changeErr } = await supabase
      .from('project_change')
      .insert({
        business_id: DEMO_BUSINESS_ID,
        project_id: projectId,
        change_type: 'addition',
        description: 'Guardian-provkörning — sex extra spotlights',
        amount: 3000,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .select('change_id')
      .single()
    if (changeErr || !change) throw new Error(`Kunde inte skapa test-ÄTA: ${changeErr?.message}`)
    changeId = change.change_id

    // checkProfitabilityWarnings läser projektets FULLA nuläge varje gång —
    // en ny (liten) tidrad räcker för att trigga en omräkning som nu ser
    // den osignerade ÄTA:n. Dedup i lib/profitability.ts uppdaterar SAMMA
    // pending_approvals-rad snarare än att skapa en andra.
    const teRes = await page.request.post('/api/time-entry', {
      data: {
        project_id: projectId,
        customer_id: customerId,
        work_date: new Date().toISOString().split('T')[0],
        duration_minutes: 6,
        description: 'Guardian-provkörning — omräkningstrigger (fas B)',
        is_billable: true,
      },
    })
    expect(teRes.ok(), `POST /api/time-entry: ${await teRes.text()}`).toBeTruthy()
    const teBody = await teRes.json()
    timeEntryIds.push(teBody.entry.time_entry_id)

    // ── DB-sanning ──────────────────────────────────────────────────────
    let approvalRow: any = null
    for (let i = 0; i < 10; i++) {
      const { data } = await supabase
        .from('pending_approvals')
        .select('*')
        .eq('id', approvalId as string)
        .single()
      if (data?.payload?.ata_signal === true) { approvalRow = data; break }
      await page.waitForTimeout(500)
    }
    expect(approvalRow, 'ata_signal blev aldrig true efter den skickade ÄTA:n').toBeTruthy()

    const antalKort = await supabase
      .from('pending_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', DEMO_BUSINESS_ID)
      .eq('approval_type', 'profitability_warning')
      .contains('payload', { project_id: projectId })
    expect(antalKort.count, 'dedup ska uppdatera SAMMA rad, inte skapa en andra').toBe(1)

    // ── UI-bevis ────────────────────────────────────────────────────────
    await page.goto('/dashboard')
    await dismissKnownOverlays(page, 4000)
    await expect(page.getByText(PROJECT_NAME).first(), 'Guardian-kortet syns inte på hemskärmen').toBeVisible({ timeout: 10_000 })
    const vaxlare = page.getByRole('button', { name: new RegExp(PROJECT_NAME) })
    if (await vaxlare.isVisible().catch(() => false)) await vaxlare.click()

    const lank = page.getByRole('link', { name: 'Skapa ÄTA →' })
    await expect(lank).toBeVisible()
    await expect(lank).toHaveAttribute('href', `/dashboard/projects/${projectId}?tab=changes`)

    await lank.click()
    await page.waitForURL(new RegExp(`/dashboard/projects/${projectId}\\?tab=changes`))
    await expect(page.getByRole('button', { name: 'Ny ÄTA' }), 'ÄTA-fliken öppnade inte i praktiken').toBeVisible({ timeout: 10_000 })
  })
})
