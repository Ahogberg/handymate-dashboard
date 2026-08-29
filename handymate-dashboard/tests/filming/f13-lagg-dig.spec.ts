/**
 * F13 · "Efter jobbet" — produktbevis.
 *
 * Morgonvyn i hemmet: rubriken "Det här behöver dig idag" och tre riktiga
 * kort som väntar på ett beslut — Karin (fakturapåminnelse), Daniel
 * (offertuppföljning) och Lars (checklista för ett nytt projekt).
 *
 * Så här görs det sant:
 *  1. EN kund skapas via produktens rutt och bär alla tre ärendena. Tre
 *     kunder går inte: alla filmkunder måste ha harnessets nummer (utskick +
 *     städning) och demokontot har unique_phone_per_business. Det ger inget
 *     "kund-case" (lib/jarvis/customer-case.ts): av de tre typerna är bara
 *     invoice_reminder med i allowlistan, och ett case kräver två typer.
 *  2. Lars: projektet skapas via produktens rutt; produkten själv föreslår
 *     branschchecklistan (lib/egenkontroll/suggest-checklist.ts, routed_agent
 *     lars). Projektet skapas som 'planning': ett 'active'-projekt får
 *     steget "Jobb påbörjat" och ett fjärde kort (SMS till kunden).
 *     PRODUKTFYND 2026-08-29: rutten skriver förslaget fire-and-forget efter
 *     svaret — på Vercel fryses funktionen innan det hinner ske (kortet kom
 *     bara när stegautomationen råkade hålla funktionen vid liv, efter 22 s).
 *     Uteblir kortet anropas produktens EGEN suggestChecklistForProject från
 *     harnesset (samma funktion, inte en kopia) — och sanningsfilen säger
 *     vilken väg det blev.
 *  3. Daniel: offerten SKICKAS på riktigt (mejl till harnessets adress) och
 *     sent_at flyttas sex dagar bakåt — det enda produkten inte kan. Kortet
 *     byggs av produktens byggare (lib/agents/daniel/quote-follow-up-card.ts).
 *  4. Karin: fakturan SKICKAS på riktigt (mejl) och förfallodagen flyttas
 *     bakåt så att den är förfallen — samma tillstånd morgoncronen letar
 *     efter. Kortet byggs av produktens byggare (lib/invoice-reminder-card.ts:
 *     samma steg, samma text, samma payload som cronen och onboardingens
 *     första handling). Demokontot har auto_reminder_enabled=false, så cronen
 *     själv hade INTE skapat kortet — det står i sanningsfilen.
 *  5. Godkännandet (SMS via 46elks) körs bara med FILMING_APPROVE=1 och
 *     filmas som det utfall produkten själv rapporterar — kvitto eller fel.
 *
 * Beats: 1 tre-kort (rubriken + Karin + Daniel) · 2 karin-kort ("Läs & ändra"
 * öppet) · 3 daniel-lars-kort · 4 kvitto (bara med FILMING_APPROVE).
 */
import { test } from '@playwright/test'
import { createQuoteFollowUpCard } from '@/lib/agents/daniel/quote-follow-up-card'
import { buildUnopenedNudgeMessage, daysSinceSent } from '@/lib/agents/daniel/unopened-quotes'
import { composeReminderStep, createInvoiceReminderCard, loadReminderConfig, type ReminderInvoiceRow } from '@/lib/invoice-reminder-card'
import { suggestChecklistForProject } from '@/lib/egenkontroll/suggest-checklist'
import {
  DEMO_BUSINESS_ID,
  FILM_EMAIL,
  FILM_PHONE,
  api,
  apiOk,
  assertFilmName,
  assertFilmingTenant,
  beat,
  daysAgoIso,
  dismissOverlays,
  expect,
  finishFilm,
  getSupabaseAdmin,
  loginOwner,
  measureOverflow,
  openFilmContext,
  pickId,
  pollRow,
  sweepFilmResidue,
  writeTruth,
} from './fixtures/filming'

const FILM = 'F13_LAGG_DIG'
const KUND = assertFilmName('Lena Nyström')
const OFFERT = 'Fasadmålning, Björkvägen 12'
const PROJEKT = 'Garage och carport, Tallstigen 3'

interface KortRad {
  id: string
  approval_type: string
  title: string
  created_at: string
  payload: Record<string, unknown> | null
}

/** Vänta på ett pending-kort vars payload bär ett visst id — läses ur databasen, aldrig ur UI:t. */
async function pollKort(approvalType: string, payloadFilter: Record<string, unknown>, timeoutMs: number): Promise<KortRad | null> {
  const admin = getSupabaseAdmin()
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { data, error } = await admin
      .from('pending_approvals')
      .select('id, approval_type, title, created_at, payload')
      .eq('business_id', DEMO_BUSINESS_ID)
      .eq('approval_type', approvalType)
      .eq('status', 'pending')
      .contains('payload', payloadFilter)
      .limit(1)
    if (error) throw new Error(`pending_approvals kunde inte läsas: ${error.message}`)
    if (data && data.length) return data[0] as KortRad
    await new Promise((r) => setTimeout(r, 750))
  }
  return null
}

function datumFor(dagarSedan: number): string {
  return daysAgoIso(dagarSedan, 9).slice(0, 10)
}

test('F13 — morgonen efter jobbet: tre riktiga kort väntar i hemmet', async ({ browser }) => {
  await assertFilmingTenant()
  await sweepFilmResidue()

  const admin = getSupabaseAdmin()
  const session = await openFilmContext(browser, 'f13-lagg-dig')
  const { page } = session
  try {
    await loginOwner(page)

    // ── Kunden — en, se filhuvudet ────────────────────────────────────────
    const kund = await apiOk(page, 'POST', '/api/customers', { name: KUND, phone_number: FILM_PHONE, email: FILM_EMAIL }, 'Skapa kund')
    const customerId = pickId(kund, 'customer_id')

    // ── Lars: nytt projekt → produkten föreslår checklistan ───────────────
    // Skapas FÖRST så att kortet hamnar sist i kön (created_at fallande).
    const projektSvar = await apiOk(
      page,
      'POST',
      '/api/projects',
      {
        name: PROJEKT,
        customer_id: customerId,
        description: 'Nytt garage med carport, betongplatta, stomme i trä och plåttak.',
        // 'planning' med flit: ett projekt som skapas som 'active' får steget
        // "Jobb påbörjat" och därmed ett FJÄRDE kort ("Lars: SMS — jobb
        // startat") — sant, men inte den här filmens tre kort.
        status: 'planning',
        project_type: 'fixed',
        start_date: datumFor(0),
      },
      'Skapa projekt',
    )
    const projectId = pickId(projektSvar, 'project_id')
    // Rutten svarar innan förslaget skrivs (fire-and-forget). Pollas generöst;
    // uteblir det anropas produktens egen funktion (se filhuvudet).
    let larsKort = await pollKort('checklist_forslag', { project_id: projectId }, 45_000)
    let larsKortVag = 'produktens trigger vid projektskapande (rutten för POST projekt → suggestChecklistForProject)'
    if (!larsKort) {
      // Produktens serverbibliotek läser NEXT_PUBLIC_SUPABASE_URL; harnesset
      // har SUPABASE_URL. Samma databas, samma funktion — bara namnet på nyckeln.
      process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL
      await suggestChecklistForProject({ businessId: DEMO_BUSINESS_ID, projectId })
      larsKort = await pollKort('checklist_forslag', { project_id: projectId }, 15_000)
      larsKortVag = 'produktens egen suggestChecklistForProject (lib/egenkontroll/suggest-checklist.ts) anropad från harnesset — ruttens fire-and-forget skrev inget kort inom 45 s (produktfynd, se filhuvudet)'
    }
    if (!larsKort) throw new Error('Lars checklistkort skapades inte — varken av rutten eller av produktens egen funktion')

    // ── Daniel: offert skickad för sex dagar sedan ────────────────────────
    const offert = await apiOk(
      page,
      'POST',
      '/api/quotes',
      {
        customer_id: customerId,
        title: OFFERT,
        description: 'Tvätt, skrapning, grundning och två strykningar av träfasad. ROT-avdrag på arbetskostnaden.',
        status: 'draft',
        vat_rate: 25,
        rot_rut_type: 'rot',
        quote_items: [
          { item_type: 'item', description: 'Fasadtvätt och skrapning', quantity: 24, unit: 'tim', unit_price: 650 },
          { item_type: 'item', description: 'Grundning och två strykningar', quantity: 48, unit: 'tim', unit_price: 650 },
          { item_type: 'item', description: 'Färg och material', quantity: 1, unit: 'st', unit_price: 9800 },
        ],
      },
      'Skapa offert',
    )
    const quoteId = pickId(offert, 'quote_id', 'id')
    await apiOk(page, 'POST', '/api/quotes/send', { quoteId, method: 'email' }, 'Skicka offerten')
    const skickad = await pollRow<{ quote_id: string; status: string; total: number | null }>(
      'quotes',
      { quote_id: quoteId, status: 'sent' },
      { select: 'quote_id, status, total' },
    )
    const sentAt = daysAgoIso(6, 10)
    const { error: backdateError } = await admin
      .from('quotes')
      .update({ sent_at: sentAt, created_at: daysAgoIso(7, 9), view_count: 0 })
      .eq('quote_id', quoteId)
      .eq('business_id', DEMO_BUSINESS_ID)
    if (backdateError) throw new Error(`Backdatering av offerten misslyckades: ${backdateError.message}`)
    const { data: bizRow } = await admin.from('business_config').select('contact_name').eq('business_id', DEMO_BUSINESS_ID).maybeSingle()
    const danielMeddelande = buildUnopenedNudgeMessage({ customerFirstName: KUND, contactFirstName: bizRow?.contact_name ?? null })
    const dagarSedanSkickad = daysSinceSent(sentAt, Date.now()) ?? 6
    const danielKort = await createQuoteFollowUpCard(admin, {
      businessId: DEMO_BUSINESS_ID,
      quote: { quote_id: quoteId, title: OFFERT, customer_id: customerId },
      customer: { name: KUND, phone_number: FILM_PHONE },
      message: danielMeddelande,
      amountKr: skickad.total ?? null,
      daysSinceSent: dagarSedanSkickad,
      extraPayload: { filming_source: 'F13' },
    })
    if (!('id' in danielKort)) throw new Error(`Daniels kort skapades inte: ${JSON.stringify(danielKort)}`)

    // ── Karin: förfallen faktura ──────────────────────────────────────────
    // Skapas SIST så att kortet står överst i kön.
    const fakturaSvar = await apiOk(
      page,
      'POST',
      '/api/invoices',
      {
        customer_id: customerId,
        vat_rate: 25,
        due_days: 30,
        items: [
          { item_type: 'item', description: 'Byte av ytterdörr inkl. montage', quantity: 8, unit: 'tim', unit_price: 650 },
          { item_type: 'item', description: 'Ytterdörr Swedoor Character, antracit', quantity: 1, unit: 'st', unit_price: 12400 },
          { item_type: 'item', description: 'Foder, drev och tätning', quantity: 1, unit: 'st', unit_price: 1150 },
        ],
      },
      'Skapa faktura',
    )
    const invoiceId: string = fakturaSvar?.invoice?.invoice_id
    if (!invoiceId) throw new Error(`Inget invoice_id i svaret: ${JSON.stringify(fakturaSvar).slice(0, 300)}`)
    // Riktigt utskick (mejl) — produkten sätter status 'sent' bara när leveransen lyckades.
    await apiOk(page, 'POST', '/api/invoices/send', { invoice_id: invoiceId, send_email: true, send_sms: false }, 'Skicka fakturan')
    await pollRow('invoice', { invoice_id: invoiceId, status: 'sent' }, { select: 'invoice_id' })
    // Det enda produkten inte kan: backdatera. 12 dagar förfallen — förbi
    // cronens första tidsvakt (auto_reminder_days = 7) med marginal.
    const forfallodag = datumFor(12)
    const { error: forfallError } = await admin
      .from('invoice')
      .update({ invoice_date: datumFor(42), due_date: forfallodag })
      .eq('invoice_id', invoiceId)
      .eq('business_id', DEMO_BUSINESS_ID)
    if (forfallError) throw new Error(`Backdatering av fakturan misslyckades: ${forfallError.message}`)
    const inv = await pollRow<ReminderInvoiceRow & { status: string }>(
      'invoice',
      { invoice_id: invoiceId, due_date: forfallodag },
      { select: 'invoice_id, invoice_number, ocr_number, due_date, business_id, customer_id, total, customer_pays, rot_rut_type, reminder_count, status' },
    )
    const karinKund = { name: KUND, phone_number: FILM_PHONE, email: FILM_EMAIL }
    const cfg = await loadReminderConfig(admin, DEMO_BUSINESS_ID)
    const steg = composeReminderStep({ inv, customer: karinKund, cfg, today: new Date() })
    // Cronens tidsvakt hade släppt igenom fakturan — det är samma steg den hade byggt.
    expect(steg.requiredDays).toBeDefined()
    expect(steg.daysOverdue).toBeGreaterThanOrEqual(steg.requiredDays ?? Infinity)
    const karinKort = await createInvoiceReminderCard(admin, {
      businessId: DEMO_BUSINESS_ID,
      inv,
      customer: karinKund,
      step: steg,
      extraPayload: { filming_source: 'F13' },
    })
    if (!('id' in karinKort)) throw new Error(`Karins kort skapades inte: ${JSON.stringify(karinKort)}`)

    // ── Kön som produkten själv läser den (samma rutt som hemskärmen) ────
    const ko = await api<{ approvals: KortRad[] }>(page, 'GET', '/api/approvals?status=pending&limit=15')
    const koRader = (ko.json?.approvals ?? []).map((a) => ({ id: a.id, approval_type: a.approval_type, title: a.title, created_at: a.created_at }))
    const varaIds = new Set([karinKort.id, danielKort.id, larsKort.id])
    const andraKort = koRader.filter((r) => !varaIds.has(r.id))
    for (const id of Array.from(varaIds)) expect(koRader.map((r) => r.id), `kortet ${id} saknas i produktens kö`).toContain(id)

    // ── Beat 1: hemmet — rubriken och de tre korten i vila ────────────────
    await page.goto('/dashboard')
    await dismissOverlays(page, 4_000)
    const rubrik = page.getByRole('heading', { name: 'Det här behöver dig idag' })
    await expect(rubrik).toBeVisible({ timeout: 25_000 })
    const karinTitel = page.getByText(`Skicka påminnelse för faktura ${inv.invoice_number}`).first()
    const danielTitel = page.getByText('Följ upp offerten som väntar').first()
    const larsTitel = page.getByText(/checklistan för det här projektet\?/).first()
    await expect(karinTitel).toBeVisible({ timeout: 25_000 })
    await expect(danielTitel).toBeVisible({ timeout: 10_000 })
    await expect(larsTitel).toBeVisible({ timeout: 10_000 })
    const overflowHem = await measureOverflow(page, 'hemmet')
    // Layouten scrollar i <main>; scrollIntoView({ block: 'start' }) lägger
    // rubriken i överkant så kön — inte heron — fyller bilden. Tre utfällda
    // kort ryms inte på 432×768, därför beat 1 (Karin + Daniel) och beat 3
    // (Daniel + Lars).
    const tillToppen = (el: HTMLElement) => el.scrollIntoView({ block: 'start' })
    await rubrik.evaluate(tillToppen)
    await beat(session, FILM, 1, 'tre-kort', 3_000)

    // ── Beat 2: Karins kort — "Läs & ändra" är produktens egen expansion ──
    // (de tre första korten i kön är redan utfällda, MAX_FULL_CARDS = 3).
    await karinTitel.evaluate(tillToppen)
    const paminnKnapp = page.getByRole('button', { name: /^Påminn om / }).first()
    await expect(paminnKnapp).toBeVisible({ timeout: 10_000 })
    const lasAndra = page.getByRole('button', { name: 'Läs & ändra' }).first()
    let karinOppnad = false
    if (await lasAndra.isVisible().catch(() => false)) {
      await lasAndra.click()
      await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5_000 })
      karinOppnad = true
    }
    await beat(session, FILM, 2, 'karin-kort', 3_000)
    if (karinOppnad) {
      const avbryt = page.getByRole('button', { name: 'Avbryt' }).first()
      if (await avbryt.isVisible().catch(() => false)) await avbryt.click()
    }

    // ── Beat 3: Daniels och Lars kort ─────────────────────────────────────
    await danielTitel.evaluate(tillToppen)
    await expect(larsTitel).toBeVisible({ timeout: 5_000 })
    await beat(session, FILM, 3, 'daniel-lars-kort', 3_000)

    // ── Beat 4 (valfritt): godkänn → produktens eget kvitto eller fel ────
    let utfall: unknown = 'inte godkänt (FILMING_APPROVE saknas)'
    if (process.env.FILMING_APPROVE === '1') {
      await karinTitel.evaluate(tillToppen)
      await expect(paminnKnapp).toBeVisible({ timeout: 5_000 })
      await paminnKnapp.click()
      // Hemmets ångra-fönster (5 s) → utförande → kvitto/fel i bannern.
      const banner = page.getByText(/Påminnelsen skickad|Godkänt — men utförandet misslyckades|Kunde inte spara|hanterades redan/).first()
      await expect(banner).toBeVisible({ timeout: 45_000 })
      const bannerText = await banner.innerText().catch(() => '')
      await beat(session, FILM, 4, 'kvitto', 3_000)
      const efter = await pollRow<{ id: string; status: string; payload: Record<string, unknown> | null }>(
        'pending_approvals',
        { id: karinKort.id },
        { select: 'id, status, payload' },
      )
      utfall = { banner: bannerText, status: efter.status, execution_result: efter.payload?.execution_result ?? null }
    }

    writeTruth(session, FILM, {
      film: 'F13',
      kund: { customer_id: customerId, name: KUND },
      kort: [
        { id: karinKort.id, agent: 'karin', approval_type: 'invoice_reminder', faktura: { invoice_id: invoiceId, invoice_number: inv.invoice_number, status: inv.status, due_date: inv.due_date, dagar_forfallen: steg.daysOverdue, belopp_kr: steg.amountToPay, niva: steg.level }, sms: steg.messages.sms, skapat_av: 'createInvoiceReminderCard (lib/invoice-reminder-card.ts) — samma byggare som cronen och onboardingens första handling' },
        { id: danielKort.id, agent: 'daniel', approval_type: 'send_sms', offert: { quote_id: quoteId, title: OFFERT, status: skickad.status, sent_at: sentAt, total: skickad.total, dagar_sedan_skickad: dagarSedanSkickad }, meddelande: danielMeddelande, skapat_av: 'createQuoteFollowUpCard (lib/agents/daniel/quote-follow-up-card.ts)' },
        { id: larsKort.id, agent: 'lars', approval_type: 'checklist_forslag', projekt: { project_id: projectId, name: PROJEKT }, titel: larsKort.title, mall: larsKort.payload?.template_name ?? null, skapat_av: larsKortVag },
      ],
      andra_kort_i_kon: andraKort,
      utfall,
      karin_kort_oppnat_med_las_och_andra: karinOppnad,
      mobil_overflow: [overflowHem],
      sanningsgrans: [
        `Demokontot har auto_reminder_enabled=${cfg.auto_reminder_enabled}: morgoncronen hade själv inte skapat Karins kort. Kortet är produktens egen byggare med cronens steg och text — samma väg som onboardingens första verifierade handling.`,
        'Backdateringarna (offertens sent_at, fakturans due_date/invoice_date) är det enda harnesset gör som produkten inte kan.',
        andraKort.length
          ? `Kön bar ${andraKort.length} äldre kort som inte är filmens (${andraKort.map((k) => k.approval_type).join(', ')}) — de ligger under de tre filmkorten, hopfällda. De tillhör demokontot och rördes inte.`
          : 'Inga andra kort i kön.',
        'Påminnelsen går som SMS via 46elks. Utan saldo blir godkännandet ett ärligt fel — filma "skickat" först efter påfyllning.',
      ],
    })
  } finally {
    await finishFilm(session, 'HM_F13_LAGG_DIG_PRODUKTBEVIS_9x16')
  }
})
