/**
 * F06 · "Offerten som höll på att kallna" — produktbevis.
 *
 * Kedjan handboken vill visa: riktig offertvy (status + datum) → Daniels
 * riktiga förslag → godkännande → utförandestatus från verkligt utfall.
 *
 * Så här görs det sant:
 *  1. Kund + offert skapas via produktens API:er och offerten SKICKAS på
 *     riktigt (mejl till harnessets adress). Ingen påhittad status.
 *  2. Det enda produkten inte kan: backdatera. sent_at flyttas sex dagar
 *     bakåt i databasen — exakt det tillstånd cronen skulle ha hittat.
 *  3. Daniels kort skapas av produktens EGEN byggare
 *     (lib/agents/daniel/quote-follow-up-card.ts) med produktens egen
 *     meddelandetext — inte en kopia i harnesset.
 *  4. Godkännandet (SMS via 46elks) körs bara med FILMING_APPROVE=1. Utan
 *     saldo hos 46elks blir utfallet ett ärligt fel — och det är vad som
 *     får filmas då, inte ett låtsat "skickat".
 */
import { test } from '@playwright/test'
import { createQuoteFollowUpCard } from '@/lib/agents/daniel/quote-follow-up-card'
import { buildUnopenedNudgeMessage, daysSinceSent } from '@/lib/agents/daniel/unopened-quotes'
import {
  DEMO_BUSINESS_ID,
  FILM_EMAIL,
  FILM_PHONE,
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

const FILM = 'F06_OFFERT'
const KUND = assertFilmName('Anna Bergström')
const OFFERT = 'Altan i lärk, 24 m²'

test('F06 — offert skickad för sex dagar sedan, Daniel förbereder uppföljningen', async ({ browser }) => {
  await assertFilmingTenant()
  await sweepFilmResidue()

  const admin = getSupabaseAdmin()
  const session = await openFilmContext(browser, 'f06-offert')
  const { page } = session
  try {
    await loginOwner(page)

    // ── Seed via produktens vägar ─────────────────────────────────────────
    const kund = await apiOk(page, 'POST', '/api/customers', { name: KUND, phone_number: FILM_PHONE, email: FILM_EMAIL }, 'Skapa kund')
    const customerId = pickId(kund, 'customer_id')

    const offert = await apiOk(
      page,
      'POST',
      '/api/quotes',
      {
        customer_id: customerId,
        title: OFFERT,
        description: 'Altan i lärkträ på plintar, inkl. räcke och trappa. ROT-avdrag på arbetskostnaden.',
        status: 'draft',
        vat_rate: 25,
        rot_rut_type: 'rot',
        quote_items: [
          { item_type: 'item', description: 'Altangolv i lärk 28 mm inkl. bärlina och reglar', quantity: 24, unit: 'm²', unit_price: 1850 },
          { item_type: 'item', description: 'Räcke i lärk med rostfria ståndare', quantity: 12, unit: 'lm', unit_price: 950 },
          { item_type: 'item', description: 'Trappa tre steg', quantity: 1, unit: 'st', unit_price: 6400 },
        ],
      },
      'Skapa offert',
    )
    const quoteId = pickId(offert, 'quote_id', 'id')

    // Riktigt utskick (mejl) — sätter status 'sent' + sent_at i produkten.
    await apiOk(page, 'POST', '/api/quotes/send', { quoteId, method: 'email' }, 'Skicka offerten')
    const skickad = await pollRow<{ quote_id: string; status: string; sent_at: string; total: number | null }>(
      'quotes',
      { quote_id: quoteId, status: 'sent' },
      { select: 'quote_id, status, sent_at, total' },
    )

    // Det enda produkten inte kan: backdatera. Sex dagar — samma fönster som
    // Daniels ren-logik (UNOPENED_WINDOW 5–14 dagar) och first-action (> 5).
    const sentAt = daysAgoIso(6, 10)
    const { error: backdateError } = await admin
      .from('quotes')
      .update({ sent_at: sentAt, created_at: daysAgoIso(7, 9), view_count: 0 })
      .eq('quote_id', quoteId)
      .eq('business_id', DEMO_BUSINESS_ID)
    if (backdateError) throw new Error(`Backdatering misslyckades: ${backdateError.message}`)

    // Daniels kort — produktens egen byggare och produktens egen text.
    const { data: bizRow } = await admin.from('business_config').select('contact_name').eq('business_id', DEMO_BUSINESS_ID).maybeSingle()
    const message = buildUnopenedNudgeMessage({ customerFirstName: KUND, contactFirstName: bizRow?.contact_name ?? null })
    const dagar = daysSinceSent(sentAt, Date.now()) ?? 6
    const kort = await createQuoteFollowUpCard(admin, {
      businessId: DEMO_BUSINESS_ID,
      quote: { quote_id: quoteId, title: OFFERT, customer_id: customerId },
      customer: { name: KUND, phone_number: FILM_PHONE },
      message,
      amountKr: skickad.total ?? null,
      daysSinceSent: dagar,
      extraPayload: { filming_source: 'F06' },
    })
    if (!('id' in kort)) throw new Error(`Daniels kort skapades inte: ${JSON.stringify(kort)}`)
    const approvalId = kort.id

    // ── Beat 1–2: offertvyn — status "Skickad" och datumet ───────────────
    await page.goto(`/dashboard/quotes/${quoteId}`)
    await dismissOverlays(page, 3_000)
    await expect(page.getByText('Skickad', { exact: true }).first()).toBeVisible({ timeout: 20_000 })
    await beat(session, FILM, 1, 'offert-skickad', 2_500)
    const tidslinje = page.getByText('Skickad').nth(1)
    if (await tidslinje.isVisible().catch(() => false)) await tidslinje.scrollIntoViewIfNeeded()
    await beat(session, FILM, 2, 'offert-tidslinje', 2_000)

    // ── Beat 3–4: hemkön — Daniels kort ──────────────────────────────────
    await page.goto('/dashboard')
    await dismissOverlays(page, 4_000)
    const kortTitel = page.getByText('Följ upp offerten som väntar').first()
    await expect(kortTitel).toBeVisible({ timeout: 25_000 })
    const overflowHem = await measureOverflow(page, 'hemmet')
    await kortTitel.scrollIntoViewIfNeeded()
    await beat(session, FILM, 3, 'hemkon-daniels-kort', 2_500)
    const lasRaderna = page.getByRole('button', { name: 'Läs raderna' }).first()
    if (await lasRaderna.isVisible().catch(() => false)) {
      await lasRaderna.click()
      await beat(session, FILM, 4, 'daniels-forslag-oppet', 3_000)
    }

    // ── Beat 5: Godkännanden ──────────────────────────────────────────────
    await page.goto('/dashboard/approvals')
    await dismissOverlays(page, 3_000)
    await expect(page.getByText('Följ upp offerten som väntar').first()).toBeVisible({ timeout: 20_000 })
    await beat(session, FILM, 5, 'godkannanden-kort', 2_500)

    // ── Beat 6 (valfritt): godkänn → riktigt utfall ───────────────────────
    let utfall: unknown = 'inte godkänt (FILMING_APPROVE saknas)'
    if (process.env.FILMING_APPROVE === '1') {
      const svar = await apiOk(page, 'POST', `/api/approvals/${approvalId}`, { action: 'approve' }, 'Godkänn Daniels kort')
      utfall = svar
      await page.reload()
      await dismissOverlays(page, 3_000)
      await beat(session, FILM, 6, 'efter-godkannande', 3_000)
    }

    writeTruth(session, FILM, {
      film: 'F06',
      kund: KUND,
      offert: { quote_id: quoteId, status: skickad.status, sent_at: sentAt, total: skickad.total, dagar_sedan_skickad: dagar },
      daniels_kort: { id: approvalId, approval_type: 'send_sms', meddelande: message },
      utfall,
      mobil_overflow: [overflowHem],
      sanningsgrans: 'Uppföljningen är ett SMS via 46elks. Utan saldo blir godkännandet ett ärligt fel — filma "skickat" först efter påfyllning.',
    })
  } finally {
    await finishFilm(session, 'HM_F06_OFFERT_PRODUKTBEVIS_9x16')
  }
})
