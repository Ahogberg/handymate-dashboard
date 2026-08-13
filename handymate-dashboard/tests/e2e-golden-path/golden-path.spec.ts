/**
 * Golden Path — Fas 1 (station 1-7), Reality Week körd av Claude i en riktig
 * webbläsare mot produktion (biz_0lovw5vcwzqn, demokontot). Se planen
 * (jaunty-pondering-hummingbird.md) och docs/REALITY-WEEK.md för det fulla
 * kontraktet — kommentarerna här förklarar bara VARFÖR koden ser ut som den
 * gör, inte vad varje station ska bevisa (det äger körboken).
 *
 * EN sammanhängande ägar-session: EN BrowserContext/Page skapas i
 * test.beforeAll och återanvänds genom alla stationer via modul-scopade
 * variabler (INTE Playwrights `{ page }`-fixture, som ger en FÄRSK sida per
 * test — det hade brutit "en riktig ägare som klickar sig igenom flödet").
 * Station 5/6 öppnar en SEPARAT, oinloggad context (simulerar kunden).
 *
 * test.describe.serial: ett misslyckat steg stoppar resten av kedjan (senare
 * stationer bygger på tidigare ID:n) — men test.afterAll körs ALLTID (se
 * Städning-avsnittet längst ner).
 */
import * as fs from 'fs'
import * as path from 'path'
import { test, expect, type BrowserContext, type Page } from '@playwright/test'
import {
  getSupabaseAdmin,
  waitForRow,
  assertRow,
  fetchLatest,
  countRows,
  DEMO_BUSINESS_ID,
  DEMO_OWNER_EMAIL,
  E2E_TEST_PHONE,
  E2E_TEST_EMAIL,
  requireDemoOwnerPassword,
} from './fixtures/db'
import { pushResult, resetReportFile, type Verdict } from './fixtures/report'

// Ingen storageState ärvd — Station 1 gör en RIKTIG UI-lösenordsinloggning.
// (playwright.config.ts's globala `use.storageState` pekar på Andreas eget
// konto — utan den här raden hade den sessionen smugit med i kontexten.)
test.use({ storageState: undefined })

const RUN_TS = Date.now()
const CUSTOMER_NAME = `E2E Testkund ${RUN_TS}`
// Deterministisk testbudget (se Station 4:s judgment-call-kommentar).
const SEEDED_BUDGET_KR = 6000

let ownerCtx: BrowserContext
let ownerPage: Page
let customerCtx: BrowserContext | null = null
let customerPage: Page | null = null

const ids: {
  customerId: string | null
  quoteId: string | null
  signToken: string | null
  projectId: string | null
  milestoneIds: string[]
  bookingId: string | null
  timeEntryIds: string[]
  approvalId: string | null
} = {
  customerId: null,
  quoteId: null,
  signToken: null,
  projectId: null,
  milestoneIds: [],
  bookingId: null,
  timeEntryIds: [],
  approvalId: null,
}

let allStationsOk = true

/**
 * Kända, legitima overlays en FÄRSK webbläsarsession möter (en riktig
 * förstagångsanvändare/nytt device hade sett samma sak) — se Station 1:s
 * kommentar för research-bakgrunden. Varje post: en trigger-locator (något
 * som bara finns när overlayn är öppen) + hur den stängs UTAN att godkänna
 * något (bara döljer, ingen server-mutation).
 */
const KNOWN_OVERLAYS: {
  name: string
  trigger: (p: Page) => ReturnType<Page['getByText']> | ReturnType<Page['getByRole']>
  dismiss: (p: Page, trigger: ReturnType<Page['getByRole']>) => Promise<void>
}[] = [
  // Ordning: högst z-index (mest sannolikt att ligga OVANPÅ en annan
  // overlay just nu) prövas först varje omgång — se dismissKnownOverlays
  // kommentar för race-scenariot detta skyddar mot.
  {
    name: 'Måndagsmötet-takeover',
    trigger: (p) => p.getByRole('button', { name: 'Stäng' }),
    dismiss: async (_p, t) => { await t.click({ timeout: 2000 }) },
  },
  {
    name: 'WelcomeModal',
    trigger: (p) => p.getByText('Välkommen — ditt team är på plats.'),
    dismiss: async (p) => { await p.mouse.click(10, 10) },
  },
  {
    name: 'Cookiebanner',
    trigger: (p) => p.getByRole('button', { name: 'Godkänn alla' }),
    dismiss: async (_p, t) => { await t.click({ timeout: 2000 }) },
  },
]

/**
 * Pollar under ett FAST tidsfönster (inte en tidig avbrytning — se Station
 * 1:s kommentar för VARFÖR: Måndagsmötet-takeoverns egen gate väntar på en
 * API-fetch och kan montera flera sekunder efter sidladdning, GOTT OCH VÄL
 * efter att en snabbare overlay som cookiebannern redan hunnit stängas. Ett
 * tidigt break på "en tom omgång" missade den varje gång i praktiken — ett
 * fast fönster (helt normal engångskostnad vid Station 1) är den enda
 * tillförlitliga lösningen.
 *
 * VARJE dismiss-klick har en KORT egen timeout (2s, inte Playwrights
 * default ~30s actionability-väntan): en overlay kan montera OVANPÅ en
 * annan MITT I klicket (en riktig körning visade exakt detta — cookie-
 * bannerns klick blockerades av att Måndagsmötet-takeovern hann montera
 * under väntan). Ett blockerat klick ska misslyckas snabbt och lämna
 * ordet till nästa varv (som då hittar och stänger det som faktiskt ligger
 * överst just då) — inte hänga kvar och äta hela testets tidsbudget.
 */
async function dismissKnownOverlays(page: Page, windowMs = 8000, pollMs = 400): Promise<string[]> {
  const dismissed: string[] = []
  const deadline = Date.now() + windowMs
  while (Date.now() < deadline) {
    for (const overlay of KNOWN_OVERLAYS) {
      const trigger = overlay.trigger(page) as ReturnType<Page['getByRole']>
      const visible = await trigger.isVisible().catch(() => false)
      if (!visible) continue
      const ok = await overlay.dismiss(page, trigger).then(() => true).catch(() => false)
      if (ok) dismissed.push(overlay.name)
      await page.waitForTimeout(300)
    }
    await page.waitForTimeout(pollMs)
  }
  return dismissed
}

/** Kör en stations kropp, bokför resultatet, och sätter allStationsOk=false
 *  + kastar vidare (så Playwright markerar testet som failed och describe.serial
 *  hoppar resten) om något går fel. */
async function station(
  stationNr: string,
  steg: string,
  body: () => Promise<{ ui: string; db: string }>,
): Promise<void> {
  try {
    const { ui, db } = await body()
    pushResult({ station: stationNr, steg, ui_bevis: ui, db_bevis: db, verdict: 'PASS' as Verdict })
  } catch (err) {
    allStationsOk = false
    pushResult({
      station: stationNr,
      steg,
      ui_bevis: '',
      db_bevis: '',
      verdict: 'FAIL' as Verdict,
      detalj: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
}

const IDS_HANDOFF_FILE = path.join(process.cwd(), 'test-results', 'golden-path', 'ids.json')

/** Skriver skapade ID:n + slutstatus till disk — permission-check.spec.ts
 *  körs i ett SEPARAT Playwright-projekt (annan process) och kan inte läsa
 *  modul-variabler härifrån. Se playwright.config.ts för dependencies-kedjan. */
function writeIdsHandoff() {
  const dir = path.dirname(IDS_HANDOFF_FILE)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(IDS_HANDOFF_FILE, JSON.stringify({ ...ids, allStationsOk }, null, 2))
}

/** Städar tidrapporter + bokning — inget permission-check.spec.ts behöver,
 *  så det är säkert att göra detta OAVSETT om resten körs. */
async function cleanupTimeAndBooking(): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const leftover: string[] = []
  for (const teId of ids.timeEntryIds) {
    const { error } = await supabase.from('time_entry').delete().eq('time_entry_id', teId)
    if (error) leftover.push(`time_entry:${teId} (${error.message})`)
  }
  if (ids.bookingId) {
    const { error } = await supabase.from('booking').delete().eq('booking_id', ids.bookingId)
    if (error) leftover.push(`booking:${ids.bookingId} (${error.message})`)
  }
  return leftover
}

/** Full städning av kärnraderna — barn före förälder, samma struktur som
 *  app/api/debug/e2e-lifecycle/route.ts's cleanup(). Anropas HÄR bara om en
 *  station misslyckades (permission-check.spec.ts:s Playwright-projekt beror
 *  på att golden-path lyckas, precis som chromium beror på setup — vid ett
 *  fel hoppas det ALDRIG över, se playwright.config.ts). Vid full framgång
 *  lämnas kärnraderna medvetet kvar åt permission-check.spec.ts:s egen
 *  afterAll, som är den sanna sista konsumenten (den testar mot DETTA
 *  projekt). */
async function cleanupCore(): Promise<string[]> {
  const supabase = getSupabaseAdmin()
  const leftover: string[] = []
  const del = async (table: string, column: string, value: string | null) => {
    if (!value) return
    const { error } = await supabase.from(table).delete().eq(column, value)
    if (error) leftover.push(`${table}:${value} (${error.message})`)
  }
  for (const mId of ids.milestoneIds) await del('project_milestone', 'milestone_id', mId)
  await del('pending_approvals', 'id', ids.approvalId)
  await del('quote_tracking_events', 'quote_id', ids.quoteId)
  await del('quotes', 'quote_id', ids.quoteId)
  await del('project', 'project_id', ids.projectId)
  // KÄLLGRANSKAT (upptäckt under en riktig körning, 2026-08-13): en riktig
  // /api/quotes/send-anrop loggar en customer_activity-rad (t.ex.
  // 'sms_sent') — en FK (customer_activity_customer_id_fkey) blockerar då
  // customer-raderingen om den här tas bort. Måste köras FÖRE customer.
  await del('customer_activity', 'customer_id', ids.customerId)
  await del('customer', 'customer_id', ids.customerId)
  return leftover
}

test.describe.serial('Golden Path — Fas 1 (station 1-7)', () => {
  test.beforeAll(async ({ browser }) => {
    resetReportFile()
    ownerCtx = await browser.newContext()
    ownerPage = await ownerCtx.newPage()
  })

  test.afterAll(async () => {
    // Skriv handoffen FÖRST — om något nedan kastar ska permission-check.spec.ts
    // ändå kunna läsa vilka ID:n som skapades och om det är säkert att förvänta
    // sig att projektet finns.
    writeIdsHandoff()

    const leftover: string[] = []
    try {
      leftover.push(...(await cleanupTimeAndBooking()))
    } catch (err) {
      leftover.push(`cleanupTimeAndBooking kastade: ${err instanceof Error ? err.message : String(err)}`)
    }

    if (!allStationsOk) {
      try {
        leftover.push(...(await cleanupCore()))
      } catch (err) {
        leftover.push(`cleanupCore kastade: ${err instanceof Error ? err.message : String(err)}`)
      }
    }

    pushResult({
      station: 'Städning',
      steg: 'golden-path.spec.ts afterAll',
      ui_bevis: '',
      db_bevis: '',
      verdict: leftover.length > 0 ? 'FAIL' : 'PASS',
      detalj:
        leftover.length > 0
          ? `Kunde inte städa: ${leftover.join('; ')}`
          : allStationsOk
            ? 'Tidrapporter+bokning städade. Kärnraderna (kund/offert/projekt) lämnade medvetet kvar åt permission-check.spec.ts:s afterAll.'
            : 'FULL städning körd (en station misslyckades — permission-check.spec.ts körs aldrig och kan därför inte städa).',
    })

    await ownerCtx?.close().catch(() => {})
    await customerCtx?.close().catch(() => {})
  })

  test('Station 1 — Inloggning', async () => {
    await station('1', 'Inloggning', async () => {
      const password = requireDemoOwnerPassword()

      await test.step('Riktig UI-inloggning (lösenord, ej magic-link/storageState)', async () => {
        await ownerPage.goto('/login')
        await ownerPage.locator('input[type="email"]').fill(DEMO_OWNER_EMAIL)
        await ownerPage.locator('input[type="password"]').fill(password)
        await ownerPage.getByRole('button', { name: 'Logga in' }).click()
        await ownerPage.waitForURL(/\/dashboard/, { timeout: 15_000 })
      })

      // KÄLLGRANSKAT (upptäckt under en riktig körning, 2026-08-13): en
      // FÄRSK webbläsarsession möter upp till TRE oberoende overlays, alla
      // legitima (en riktig förstagångsanvändare/nytt device hade sett
      // samma sak) — WelcomeModal.tsx (localStorage-gate),
      // cookiebannern, och MandagsmoteTakeover.tsx (riktigt pending
      // monday_brief-kort just DENNA vecka, se lib/jarvis/mandagsmote.ts —
      // det ÄR faktiskt måndag idag). De monterar på OBEROENDE async-gates
      // (Måndagsmötet väntar på queueLoaded/en API-fetch) — en fast
      // sekvens "kolla A, stäng A, kolla B, stäng B" race:ar mot en overlay
      // som monterar EFTER att en tidigare redan hunnit stängas mitt i
      // klicket på en annan. En pollande loop är den enda tillförlitliga
      // lösningen. Se dismissKnownOverlays ovan i filen.
      await test.step('Dismissa kända overlays (WelcomeModal/cookiebanner/Måndagsmötet) — pollar tills inget nytt dyker upp', async () => {
        const dismissed = await dismissKnownOverlays(ownerPage)
        if (dismissed.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`[golden-path] Station 1 dismissade: ${dismissed.join(', ')}`)
        }
      })

      const me = await test.step('DB-bevis: sessionen resolvar till DEMO_BUSINESS_ID via /api/me', async () => {
        const res = await ownerCtx.request.get('/api/me')
        expect(res.ok(), `/api/me svarade ${res.status()}`).toBeTruthy()
        const body = await res.json()
        expect(body?.business?.business_id, 'inloggad ägares business_id måste vara DEMO_BUSINESS_ID').toBe(
          DEMO_BUSINESS_ID,
        )
        return body
      })

      return {
        ui: `Riktig lösenordsinloggning i /login, redirect till ${ownerPage.url()}`,
        db: `GET /api/me -> business.business_id=${me.business.business_id}`,
      }
    })
  })

  test('Station 2 — Onboarding (assertion, ej ny registrering)', async () => {
    await station('2', 'Onboarding', async () => {
      await test.step('Verifiera att /dashboard INTE redirectar till /onboarding', async () => {
        // Vi är redan på /dashboard sedan Station 1 — en riktig grind hade
        // studsat vidare hit om onboarding_completed_at saknades.
        expect(ownerPage.url(), 'ska stå kvar på /dashboard, inte ha redirectats till /onboarding').toContain(
          '/dashboard',
        )
        expect(ownerPage.url()).not.toContain('/onboarding')
      })

      const biz = await test.step('DB-bevis: business_config.onboarding_completed_at satt', async () => {
        return await assertRow<{ onboarding_completed_at: string | null }>(
          'business_config',
          { business_id: DEMO_BUSINESS_ID },
          'business_config för demokontot',
        )
      })
      expect(biz.onboarding_completed_at, 'onboarding_completed_at måste vara satt för demokontot').not.toBeNull()

      await test.step('DB-bevis: ägarrad i business_users', async () => {
        await assertRow('business_users', { business_id: DEMO_BUSINESS_ID, role: 'owner' }, 'ägarrad')
      })

      return {
        ui: `/dashboard laddad utan redirect till /onboarding`,
        db: `business_config.onboarding_completed_at=${biz.onboarding_completed_at}, ägarrad i business_users finns`,
      }
    })
  })

  test('Station 3 — Första kunden', async () => {
    await station('3', 'Första kunden', async () => {
      await test.step('Navigera till Kunder', async () => {
        await ownerPage.goto('/dashboard/customers')
        // Källgranskat fynd (2026-08-13): cookiebannern monterar inte alltid
        // hunnit inom Station 1:s fönster — en riktig, fristående kontroll
        // efter VARJE sidnavigering är den enda pålitliga lösningen (se
        // dismissKnownOverlays filhuvud). Kort fönster här — det mesta är
        // redan avklarat sen Station 1.
        await dismissKnownOverlays(ownerPage, 2500)
      })

      await test.step('Öppna "Ny kund" och fyll i namn/telefon/e-post', async () => {
        await ownerPage.getByRole('button', { name: 'Ny kund' }).click()
        // CustomerModal.tsx: label och input är syskon (ingen for/id-koppling),
        // och namn-fältet saknar egna attribut helt — strukturell selektor.
        await ownerPage.locator('div:has(> label:text("Namn")) input').fill(CUSTOMER_NAME)
        await ownerPage.getByPlaceholder('+46…').fill(E2E_TEST_PHONE)
        await ownerPage.locator('input[type="email"]').fill(E2E_TEST_EMAIL)
        await ownerPage.getByRole('button', { name: 'Skapa', exact: true }).click()

        // KÄLLGRANSKAT fynd (2026-08-13, en riktig körning): E2E_TEST_PHONE
        // är FAST (samma nummer varje körning) — om en tidigare körnings
        // städning missat en rad (eller en samtidig körning pågår) triggar
        // riktig dubblett-detektion ("Möjlig dubblett"-dialogen) och
        // blockerar skapandet tills "Skapa ändå" klickas. Detta är en RIKTIG
        // produktbeteende, inte en bugg att kringgå tyst — men harnesset ska
        // vara motståndskraftigt mot sin egen ofullständiga städning.
        const skapaAnda = ownerPage.getByRole('button', { name: 'Skapa ändå' })
        const dupDialogAppeared = await skapaAnda
          .waitFor({ state: 'visible', timeout: 3000 })
          .then(() => true)
          .catch(() => false)
        if (dupDialogAppeared) await skapaAnda.click()
      })

      const customer = await test.step('DB-bevis: customer-rad finns med rätt fält', async () => {
        return await waitForRow<{ customer_id: string; phone_number: string; email: string }>(
          'customer',
          { business_id: DEMO_BUSINESS_ID, name: CUSTOMER_NAME },
          { label: `customer.name = "${CUSTOMER_NAME}"` },
        )
      })
      ids.customerId = customer.customer_id

      return {
        ui: `Skapade kund "${CUSTOMER_NAME}" via /dashboard/customers → "Ny kund"-modalen`,
        db: `customer.customer_id=${ids.customerId}, phone_number=${customer.phone_number}, email=${customer.email}`,
      }
    })
  })

  test('Station 4 — Offert skapas & skickas', async () => {
    await station('4', 'Offert skapas & skickas', async () => {
      await test.step('Navigera till Ny offert (kunden förvald via ?customerId=)', async () => {
        await ownerPage.goto(`/dashboard/quotes/new?customerId=${ids.customerId}`)
        await dismissKnownOverlays(ownerPage, 2500)
      })

      // KÄLLGRANSKAT (upptäckt under en riktig körning, 2026-08-13):
      // /dashboard/quotes/new öppnas i `mainView === 'document'` som
      // default (app/dashboard/quotes/new/page.tsx) — sök/skriv-kombon
      // (QuoteAddRowCombo.tsx) renderas bara i `mainView === 'list'`
      // ("Listvy"-togglen). Klicka dit först.
      await test.step('Växla till Listvy (sök/skriv-kombon finns bara där)', async () => {
        await ownerPage.getByRole('button', { name: 'Listvy' }).click()
      })

      await test.step('Lägg till en rad via sök/skriv-kombon', async () => {
        const combo = ownerPage.getByPlaceholder('Sök produkt eller skriv ny beskrivning…')
        await combo.waitFor({ state: 'visible', timeout: 10_000 })
        await combo.fill('Arbete — badrumsrenovering (E2E)')
        await combo.press('Enter')
      })

      // KÄLLGRANSKAT (upptäckt under en riktig körning, 2026-08-13): utan en
      // ifylld beskrivning visar "Skicka offert" en extra bekräftelse
      // ("Beskrivning saknas — skicka ändå?") istället för att gå vidare —
      // en riktig ägare skriver naturligtvis en beskrivning, så vi gör
      // samma sak här (mer verklighetstroget än att bara klicka igenom
      // varningen).
      await test.step('Fyll i beskrivning (undviker "Beskrivning saknas"-bekräftelsen)', async () => {
        await ownerPage.getByPlaceholder('Kort beskrivning av jobbet…').fill('E2E golden path — badrumsrenovering')
      })

      await test.step('Klicka "Skicka offert" (sparar utkast + öppnar skicka-modalen)', async () => {
        await ownerPage.getByRole('button', { name: 'Skicka offert', exact: true }).click()
        // OBS (fix efter en riktig körning): den gamla waitForURL-regexen
        // (/\/dashboard\/quotes\//) matchade redan STARTSIDAN
        // (/dashboard/quotes/new innehåller samma substräng) — ett no-op-
        // villkor som aldrig faktiskt väntade på något. Vänta istället in
        // skicka-modalen som "Bekräfta+skicka"-steget nedan ändå behöver.
        await ownerPage
          .locator('.fixed.inset-0')
          .filter({ hasText: 'Skicka offert' })
          .waitFor({ state: 'visible', timeout: 15_000 })
      })

      const quote = await test.step('Hämta den nyss skapade offerten', async () => {
        const q = await fetchLatest<{ quote_id: string; sign_token: string }>(
          'quotes',
          { business_id: DEMO_BUSINESS_ID, customer_id: ids.customerId },
          'created_at',
        )
        if (!q) throw new Error('Ingen offert hittades för kunden efter "Skicka offert"-klicket')
        return q
      })
      ids.quoteId = quote.quote_id

      // ── Judgment call (se slutrapporten): sätt TVÅ deterministiska arbets-
      // rader DIREKT i DB, EFTER att den riktiga "spara+navigera"-vägen redan
      // körts klart (aldrig FÖRE — annars kan klientens egen sparalogik skriva
      // över seedningen). Anledning: quote-radläggningens fullständiga pris-UI
      // (AI-assisterad prissättning m.m.) är utanför den här fasens rimliga
      // scope att reverse-engineera exakta selektorer för, men Station 6/7:s
      // bevis (milestones skapas bara vid >1 arbetsrad; Guardians 75/95%-
      // trösklar) behöver en KÄND, förutsägbar budget. Två rader (inte en)
      // så att Station 6 också kan bevisa milestone-skapandet på riktigt.
      await test.step('(Judgment call) Sätt två kända arbetsrader för Station 6/7:s budget-/milestone-bevis', async () => {
        const supabase = getSupabaseAdmin()
        await supabase.from('quote_items').delete().eq('quote_id', ids.quoteId)
        // KÄLLGRANSKAT (upptäckt under en riktig körning, 2026-08-13):
        // quote_items.id är TEXT utan DB-default (kolumnen genereras av
        // applikationskoden vid riktiga inserts, t.ex. `qi_<slumpsträng>`
        // i /api/quotes) — ett insert utan id kraschar med en NOT NULL-
        // violation. Genererar samma sortens id här.
        const itemId = (prefix: string) => `qi_e2e_${prefix}_${Date.now()}`
        const { error: itemsErr } = await supabase.from('quote_items').insert([
          {
            id: itemId('1'),
            quote_id: ids.quoteId,
            business_id: DEMO_BUSINESS_ID,
            item_type: 'item',
            description: 'Rivning (E2E)',
            unit: 'tim',
            quantity: 2,
            unit_price: 750,
            total: 1500,
            sort_order: 1,
          },
          {
            id: itemId('2'),
            quote_id: ids.quoteId,
            business_id: DEMO_BUSINESS_ID,
            item_type: 'item',
            description: 'Montering (E2E)',
            unit: 'tim',
            quantity: 6,
            unit_price: 750,
            total: 4500,
            sort_order: 2,
          },
        ])
        if (itemsErr) throw new Error(`Kunde inte seeda quote_items: ${itemsErr.message}`)
        const { error: totalsErr } = await supabase
          .from('quotes')
          .update({
            total: SEEDED_BUDGET_KR,
            subtotal: SEEDED_BUDGET_KR,
            labor_total: SEEDED_BUDGET_KR,
            customer_pays: SEEDED_BUDGET_KR,
          })
          .eq('quote_id', ids.quoteId)
        if (totalsErr) throw new Error(`Kunde inte sätta quotes.total: ${totalsErr.message}`)
      })

      await test.step('Bekräfta+skicka i skicka-modalen', async () => {
        const modal = ownerPage.locator('.fixed.inset-0').filter({ hasText: 'Skicka offert' })
        const [sendResponse] = await Promise.all([
          ownerPage.waitForResponse(
            (r) => r.url().includes('/api/quotes/send') && r.request().method() === 'POST',
            { timeout: 15_000 },
          ),
          modal.getByRole('button', { name: 'Skicka offert' }).click(),
        ])
        expect(sendResponse.ok(), `POST /api/quotes/send svarade ${sendResponse.status()}`).toBeTruthy()
      })

      const sentQuote = await test.step('DB-bevis: status=sent, sent_at satt, portal_token på kunden', async () => {
        const q = await waitForRow<{ sent_at: string; sign_token: string }>(
          'quotes',
          { quote_id: ids.quoteId },
          { predicate: (r: any) => r.status === 'sent' && !!r.sent_at, label: 'quotes.status -> sent' },
        )
        await waitForRow('customer', { customer_id: ids.customerId }, {
          predicate: (r: any) => !!r.portal_token,
          label: 'customer.portal_token satt',
        })
        return q
      })
      ids.signToken = sentQuote.sign_token

      return {
        ui: `Ny offert skapad+skickad via /dashboard/quotes/new + skicka-modalen (kund ${ids.customerId})`,
        db: `quotes.quote_id=${ids.quoteId}, status=sent, sent_at=${sentQuote.sent_at}, sign_token satt, customer.portal_token satt`,
      }
    })
  })

  test('Station 5 — Offerten öppnas (tracking)', async () => {
    await station('5', 'Offerten öppnas (tracking)', async () => {
      await test.step('Öppna en SEPARAT, oinloggad browser-context (simulerar kunden)', async () => {
        const browser = ownerCtx.browser()
        if (!browser) throw new Error('Kunde inte hämta browser-instansen från ownerCtx')
        customerCtx = await browser.newContext()
        customerPage = await customerCtx.newPage()
      })

      await test.step('Kunden öppnar offerten (?portal=1 kringgår portal-redirecten — se slutrapportens judgment calls)', async () => {
        await customerPage!.goto(`/quote/${ids.signToken}?portal=1`)
        await customerPage!.getByRole('button', { name: 'Godkänn offert' }).waitFor({
          state: 'visible',
          timeout: 15_000,
        })
      })

      await test.step('DB-bevis: status sent -> opened (exakt övergången), quote_tracking_events-rad', async () => {
        await waitForRow('quotes', { quote_id: ids.quoteId }, {
          predicate: (r: any) => r.status === 'opened',
          timeoutMs: 10_000,
          label: 'quotes.status -> opened',
        })
        await waitForRow('quote_tracking_events', { quote_id: ids.quoteId, event_type: 'opened' }, {
          label: 'quote_tracking_events(opened)',
        })
      })

      await test.step('Idempotensbevis: samma sida öppnas igen — status flippar inte fel, ingen dubblett-korruption', async () => {
        const before = await countRows('quote_tracking_events', { quote_id: ids.quoteId, event_type: 'opened' })

        await customerPage!.reload()
        await customerPage!.getByRole('button', { name: 'Godkänn offert' }).waitFor({
          state: 'visible',
          timeout: 15_000,
        })
        // Trackingen sker via en fire-and-forget fetch från klienten — ge den
        // en kort stund att skriva klart innan vi räknar om.
        await customerPage!.waitForTimeout(1500)

        const after = await countRows('quote_tracking_events', { quote_id: ids.quoteId, event_type: 'opened' })
        const stillOpened = await assertRow<{ status: string }>('quotes', { quote_id: ids.quoteId })

        expect(stillOpened.status, 'status ska förbli "opened" — inte korrumperas av en andra visning').toBe(
          'opened',
        )
        expect(after, 'en andra öppning ska logga fler händelser, aldrig 0 (tyst avbrott)').toBeGreaterThan(before)
      })

      return {
        ui: 'Oinloggad kund-context laddade /quote/[token] två gånger (samma sessionId ny varje gång)',
        db: 'quotes.status=opened (kvar efter dubbel-öppning), quote_tracking_events har fler rader än efter första öppningen',
      }
    })
  })

  test('Station 6 — Kunden accepterar', async () => {
    await station('6', 'Kunden accepterar', async () => {
      await test.step('Fyll namn', async () => {
        await customerPage!.getByPlaceholder('Ditt fullständiga namn').fill(CUSTOMER_NAME)
      })

      await test.step('Rita en riktig signatur på canvas (mouse move/down/move/up — ingen fejkad data-URL)', async () => {
        const canvas = customerPage!.locator('#signature-card canvas')
        // KÄLLGRANSKAT (upptäckt under en riktig körning, 2026-08-13):
        // canvasen ligger under vikningen (boundingBox() gav y≈782 i ett
        // ≈720px viewport) — utan explicit scroll landar page.mouse-
        // koordinaterna utanför den synliga ytan och onMouseDown/onMouseMove
        // (app/quote/[token]/page.tsx) triggas aldrig, så hasDrawn förblir
        // false och "Godkänn offert" stannar disabled i evighet. Detta är
        // INTE samma sak som .click()/.fill(), som auto-scrollar internt —
        // rå page.mouse gör det aldrig.
        await canvas.scrollIntoViewIfNeeded()
        const box = await canvas.boundingBox()
        if (!box) throw new Error('Signatur-canvasen hittades inte / saknar boundingBox')
        const startX = box.x + box.width * 0.2
        const startY = box.y + box.height * 0.5
        await customerPage!.mouse.move(startX, startY)
        await customerPage!.mouse.down()
        for (let i = 1; i <= 6; i++) {
          await customerPage!.mouse.move(startX + i * (box.width * 0.1), startY + Math.sin(i) * 15, { steps: 5 })
        }
        await customerPage!.mouse.up()
      })

      await test.step('Kryssa i villkoren', async () => {
        await customerPage!.locator('#signature-card input[type="checkbox"]').check()
      })

      await test.step('Klicka "Godkänn offert" — den RIKTIGA vägen (RPC sign_quote_with_options), inte /api/quotes/accept', async () => {
        const signBtn = customerPage!.getByRole('button', { name: 'Godkänn offert' })
        await expect(signBtn, 'knappen ska vara aktiv (namn+signatur+villkor ifyllda)').toBeEnabled({
          timeout: 5000,
        })
        await signBtn.click()
        await customerPage!.getByText('Tack! Din signatur har sparats.').waitFor({
          state: 'visible',
          timeout: 15_000,
        })
      })

      const acceptedQuote = await test.step('DB-bevis: quotes.status=accepted, signed_at satt', async () => {
        return await waitForRow<{ signed_at: string }>(
          'quotes',
          { quote_id: ids.quoteId },
          { predicate: (r: any) => r.status === 'accepted' && !!r.signed_at, timeoutMs: 15_000, label: 'quotes.status -> accepted' },
        )
      })

      const project = await test.step('DB-bevis: project skapat via finalizeAcceptedQuote → createProjectFromQuote (stage ps-01)', async () => {
        return await waitForRow<{ project_id: string }>(
          'project',
          { business_id: DEMO_BUSINESS_ID, quote_id: ids.quoteId },
          { predicate: (r: any) => r.current_workflow_stage_id === 'ps-01', timeoutMs: 15_000, label: 'project.current_workflow_stage_id -> ps-01' },
        )
      })
      ids.projectId = project.project_id

      await test.step('DB-bevis: project_milestone-rader från offertens två arbetsrader', async () => {
        const supabase = getSupabaseAdmin()
        const { data: milestones, error } = await supabase
          .from('project_milestone')
          .select('milestone_id')
          .eq('project_id', ids.projectId)
        if (error) throw new Error(`Kunde inte läsa project_milestone: ${error.message}`)
        ids.milestoneIds = (milestones || []).map((m: any) => m.milestone_id)
        // create-from-quote.ts skapar milestones bara vid >1 arbetsrad — vi
        // seedade medvetet TVÅ (Station 4) exakt för att bevisa detta här.
        expect(ids.milestoneIds.length, 'förväntade 2 milestones (en per seedad arbetsrad)').toBe(2)
      })

      const dealInfo = await test.step('DB-bevis (best-effort): deal -> won, om offerten var kopplad till en deal', async () => {
        const supabase = getSupabaseAdmin()
        const { data: deal } = await supabase
          .from('deal')
          .select('id, stage_id')
          .eq('business_id', DEMO_BUSINESS_ID)
          .eq('quote_id', ids.quoteId)
          .maybeSingle()
        if (!deal) return 'ingen deal kopplad till offerten (förväntat — skapad direkt, inte från pipelinen)'
        const stage = await waitForRow<{ slug: string }>('pipeline_stage', { id: deal.stage_id }, {
          predicate: (r: any) => r.slug === 'won',
          label: 'deal stage -> won',
        })
        return `deal ${deal.id} -> pipeline_stage.slug=${stage.slug}`
      })

      return {
        ui: 'Riktig canvas-signatur + ifyllt namn + ikryssade villkor + "Godkänn offert" i kundens egen browser-context',
        db: `quotes.status=accepted (signed_at=${acceptedQuote.signed_at}), project.project_id=${ids.projectId} (ps-01), ${ids.milestoneIds.length} milestones, ${dealInfo}`,
      }
    })
  })

  test('Station 7 — Projektsteget flyttar sig självt', async () => {
    await station('7', 'Projektsteget flyttar sig självt', async () => {
      // ── 7a: Bokning ────────────────────────────────────────────────────
      // KÄLLGRANSKAT (inte antaget): Kalender-sidans "Ny bokning" postar till
      // /api/actions (action:'create_booking') — en HELT separat, duplicerad
      // implementation som ALDRIG anropar advanceProjectStage. Bara POST
      // /api/bookings gör det (app/api/bookings/route.ts), och den enda
      // riktiga UI-ytan som faktiskt anropar DEN routen är kundkortets
      // "Boka platsbesök"-modal. Se slutrapportens judgment calls.
      await test.step('Skapa bokning via kundsidans "Boka platsbesök" (real UI → POST /api/bookings)', async () => {
        await ownerPage.goto(`/dashboard/customers/${ids.customerId}`)
        await dismissKnownOverlays(ownerPage, 2500)
        await ownerPage.getByRole('button', { name: 'Platsbesök' }).click()
        const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10)
        await ownerPage.locator('input[type="date"]').fill(tomorrow)
        const [bookingResponse] = await Promise.all([
          ownerPage.waitForResponse(
            (r) => r.url().includes('/api/bookings') && r.request().method() === 'POST',
            { timeout: 15_000 },
          ),
          ownerPage.getByRole('button', { name: 'Boka platsbesök' }).click(),
        ])
        expect(bookingResponse.ok(), `POST /api/bookings svarade ${bookingResponse.status()}`).toBeTruthy()
      })

      await test.step('DB-bevis: stage ps-01 → ps-02 (MEETING_BOOKED)', async () => {
        await waitForRow('project', { project_id: ids.projectId }, {
          predicate: (r: any) => r.current_workflow_stage_id === 'ps-02',
          timeoutMs: 10_000,
          label: 'stage -> ps-02',
        })
      })

      await test.step('Hämta bokningens id (för städning)', async () => {
        const supabase = getSupabaseAdmin()
        const { data: bookingRow } = await supabase
          .from('booking')
          .select('booking_id')
          .eq('business_id', DEMO_BUSINESS_ID)
          .eq('customer_id', ids.customerId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        ids.bookingId = bookingRow?.booking_id ?? null
      })

      // ── 7b: Statusändring → JOB_STARTED ─────────────────────────────────
      // KÄLLGRANSKAT: projektsidans statusmeny (PUT /api/projects
      // {status:'active'}) ÄR den riktiga UI-vägen som triggar
      // advanceProjectStage(JOB_STARTED) — app/api/projects/route.ts.
      await test.step('Statusändring "Aktivt" via projektsidans "Fler åtgärder"-meny (real UI → PUT /api/projects)', async () => {
        await ownerPage.goto(`/dashboard/projects/${ids.projectId}`)
        await dismissKnownOverlays(ownerPage, 2500)
        await ownerPage.getByRole('button', { name: 'Fler åtgärder' }).click()
        const [statusResponse] = await Promise.all([
          ownerPage.waitForResponse(
            (r) => r.url().endsWith('/api/projects') && r.request().method() === 'PUT',
            { timeout: 15_000 },
          ),
          ownerPage.getByRole('button', { name: 'Aktivt' }).click(),
        ])
        expect(statusResponse.ok(), `PUT /api/projects svarade ${statusResponse.status()}`).toBeTruthy()
      })

      await test.step('DB-bevis: stage ps-02 → ps-03 (JOB_STARTED)', async () => {
        await waitForRow('project', { project_id: ids.projectId }, {
          predicate: (r: any) => r.current_workflow_stage_id === 'ps-03',
          timeoutMs: 10_000,
          label: 'stage -> ps-03',
        })
      })

      // ── 7c: Riktig UI-tidrapport ─────────────────────────────────────────
      // KÄLLGRANSKAT: handleTimeSave() i app/dashboard/projects/[id]/page.tsx
      // skriver DIREKT till Supabase klient-sidan (`supabase.from('time_entry')
      // .insert(...)`) — INTE via POST /api/time-entry. Samma mönster i
      // TodayView.tsx. Ingen UI-yta i hela kodbasen (mobil eller desktop)
      // postar till /api/time-entry för en manuell tidrapport — bara check-in/
      // check-out/bulk/approve gör det, och TimerWidget (check-in) skickar
      // aldrig med project_id. Konsekvens: klicket nedan skapar en RIKTIG
      // time_entry-rad (bevisas), men triggar VARKEN Margin Guardians
      // checkProfitabilityWarnings NOCH advanceProjectStageForward — de
      // anropen finns bara i POST /api/time-entry-routen, som produktions-UI:t
      // aldrig når idag. Ett verkligt, källgranskat produktionsgap (samma typ
      // av upptäckt som /api/quotes/accept-divergensen redan i planen) — se
      // slutrapportens judgment calls för resonemanget bakom 7d nedan.
      await test.step('Logga tid via "Lägg till tid" (real UI-klick — se kommentar ovan för vad den INTE triggar)', async () => {
        await ownerPage.getByRole('button', { name: 'Lägg till tid' }).first().click()
        await ownerPage.getByRole('button', { name: '2h' }).click()
        await ownerPage.getByRole('button', { name: 'Spara' }).click()
      })

      await test.step('DB-bevis: time_entry-rad skapad av UI-klicket', async () => {
        const row = await waitForRow<{ time_entry_id: string }>(
          'time_entry',
          { business_id: DEMO_BUSINESS_ID, project_id: ids.projectId },
          { timeoutMs: 8000, label: 'time_entry från UI-modalen' },
        )
        ids.timeEntryIds.push(row.time_entry_id)
      })

      // ── 7d: Guardian-/automationsbevis ───────────────────────────────────
      // Eftersom INGEN nuvarande UI-yta kan trigga checkProfitabilityWarnings
      // (se 7c), anropas den RIKTIGA produktionsrouten POST /api/time-entry
      // direkt via den redan autentiserade ägar-sessionens request-context
      // (delar cookies med ownerPage — INTE ett separat/anonymt anrop).
      // Detta skiljer sig från /api/quotes/accept-fallet i planen: den routen
      // är en KÄND ALTERNATIV väg med annat (sämre) beteende. POST
      // /api/time-entry är istället den ENDA riktiga vägen till Guardian-
      // kortet idag — den är bara inte (ännu) kopplad till en UI-knapp.
      const rateInfo = await test.step('Slå upp intern timkostnad (för exakta 75%/95%-trösklar)', async () => {
        const ownerBu = await assertRow<{ id: string; internal_hourly_cost: number | null }>(
          'business_users',
          { business_id: DEMO_BUSINESS_ID, role: 'owner' },
          'ägarens business_users-rad',
        )
        const bizConfig = await assertRow<{ default_internal_hourly_cost: number | null }>(
          'business_config',
          { business_id: DEMO_BUSINESS_ID },
          'business_config',
        )
        const cost = ownerBu.internal_hourly_cost ?? bizConfig.default_internal_hourly_cost ?? null
        return { businessUserId: ownerBu.id as string, internalCost: cost }
      })

      if (rateInfo.internalCost == null) {
        pushResult({
          station: '7',
          steg: 'Guardian-kort (lönsamhetsvarning) — hoppat',
          ui_bevis: '',
          db_bevis: '',
          verdict: 'SKIP',
          detalj:
            'Intern timkostnad ej konfigurerad på demokontot (varken business_users.internal_hourly_cost ' +
            'eller business_config.default_internal_hourly_cost). Kör sql/demo_seed_internal_cost.sql ' +
            '(REALITY-WEEK.md F1) först — utan den kan Margin Guardian aldrig räkna en arbetskostnad.',
        })
        return {
          ui: 'Boka platsbesök → statusändring Aktivt → Lägg till tid',
          db: `stage ps-01→ps-02→ps-03, ${ids.timeEntryIds.length} time_entry-rad. Guardian-kort HOPPAT (se SKIP-rad ovan).`,
        }
      }

      const hoursForAtRisk = Math.ceil(((SEEDED_BUDGET_KR * 0.85) / rateInfo.internalCost) * 10) / 10
      const hoursForOverBudget = Math.ceil(((SEEDED_BUDGET_KR * 1.05) / rateInfo.internalCost) * 10) / 10
      const secondEntryHours = Math.max(0.5, Math.round((hoursForOverBudget - hoursForAtRisk) * 10) / 10)

      let firstApprovalId: string | null = null

      await test.step(`Riktig POST /api/time-entry #1 — ${hoursForAtRisk}h → ~85% av budget (at_risk)`, async () => {
        const res = await ownerCtx.request.post('/api/time-entry', {
          data: {
            project_id: ids.projectId,
            customer_id: ids.customerId,
            business_user_id: rateInfo.businessUserId,
            work_date: new Date().toISOString().slice(0, 10),
            duration_minutes: Math.round(hoursForAtRisk * 60),
            description: 'E2E Guardian-bevis #1 (75%-tröskel)',
            hourly_rate: 500,
          },
        })
        expect(res.ok(), `POST /api/time-entry #1 svarade ${res.status()}`).toBeTruthy()
        const body = await res.json()
        ids.timeEntryIds.push(body.entry.time_entry_id)
      })

      const firstApproval = await test.step('DB-bevis: pending_approvals(profitability_warning) skapat', async () => {
        return await waitForRow<{ id: string }>(
          'pending_approvals',
          { business_id: DEMO_BUSINESS_ID, approval_type: 'profitability_warning', status: 'pending' },
          {
            predicate: (r: any) => r.payload?.project_id === ids.projectId,
            timeoutMs: 10_000,
            label: 'Guardian-kort #1',
          },
        )
      })
      firstApprovalId = firstApproval.id
      ids.approvalId = firstApprovalId

      await test.step(`Riktig POST /api/time-entry #2 — ${secondEntryHours}h till → passerar tröskeln igen (over_budget)`, async () => {
        const res = await ownerCtx.request.post('/api/time-entry', {
          data: {
            project_id: ids.projectId,
            customer_id: ids.customerId,
            business_user_id: rateInfo.businessUserId,
            work_date: new Date().toISOString().slice(0, 10),
            duration_minutes: Math.round(secondEntryHours * 60),
            description: 'E2E Guardian-bevis #2 (dedupe-with-update)',
            hourly_rate: 500,
          },
        })
        expect(res.ok(), `POST /api/time-entry #2 svarade ${res.status()}`).toBeTruthy()
        const body = await res.json()
        ids.timeEntryIds.push(body.entry.time_entry_id)
      })

      await test.step('Automations-/idempotensbevis: SAMMA approval-id, uppdaterat — inte ett nytt kort', async () => {
        // checkProfitabilityWarnings anropas fire-and-forget (icke-blockerande)
        // inuti POST /api/time-entry — ge den en kort stund att skriva klart.
        await new Promise((resolve) => setTimeout(resolve, 1500))

        const stillPending = await assertRow<{ status: string }>(
          'pending_approvals',
          { id: firstApprovalId! },
          'Guardian-kort efter andra tidrapporten',
        )
        expect(stillPending.status, 'kortet ska fortfarande vara pending (samma rad, uppdaterad)').toBe('pending')

        // OBS (fix efter granskning): demokontots seed (resetDemoAccount)
        // skapar REDAN ett eget profitability_warning-kort för ett annat
        // projekt (bekräftat i dagens research) — en obetingad
        // countRows(business_id, approval_type) hade därför läst minst 2 på
        // ett nyss återställt demokonto och gett en FALSK FAIL på en
        // fungerande dedupe. Filtrera på payload.project_id, precis som
        // firstApproval-uppslaget ovan redan gör.
        const supabase = getSupabaseAdmin()
        const { data: warningRows, error: warningErr } = await supabase
          .from('pending_approvals')
          .select('id, payload')
          .eq('business_id', DEMO_BUSINESS_ID)
          .eq('approval_type', 'profitability_warning')
        if (warningErr) throw new Error(`Kunde inte räkna Guardian-kort: ${warningErr.message}`)
        const forThisProject = (warningRows || []).filter((r: any) => r.payload?.project_id === ids.projectId)
        expect(forThisProject.length, 'exakt ETT profitability_warning-kort för DETTA projekt').toBe(1)
      })

      return {
        ui: 'Boka platsbesök (kundsida) → statusändring Aktivt (projektsida) → Lägg till tid (projektsida) → 2× riktig POST /api/time-entry',
        db: `stage ps-01→ps-02→ps-03, ${ids.timeEntryIds.length} time_entry-rader, Guardian-kort ${ids.approvalId} (dedupe-with-update bevisat: samma id, count=1)`,
      }
    })
  })
})
