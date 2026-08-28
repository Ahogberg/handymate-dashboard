/**
 * F07 · "Klart är inte alltid faktureringsklart" — produktbevis.
 *
 * Sanningen om ytan (kartlagd 2026-08-28): Evidence-to-Payment
 * (lib/projects/commercial-readiness.ts, åtta bevisplatser) har INGEN egen
 * sida. Den nås genom Mattes chatt (verktyget get_project_commercial_
 * readiness) och fryses på fakturans bevismanifest. Projektsidans band
 * "Redo att fakturera" är en annan, enklare beräkning utan ÄTA.
 *
 * Därför filmas F07 så här: ÄTA-fliken (riktig ÄTA som väntar) → Matte får
 * frågan "Är projektet redo att fakturera?" och svarar med produktens egen
 * blockerarmening. Det är on-brand — Matte är ingången — och det är sant.
 *
 * Seed via produktens vägar: kund → offert → accepterad (skapar projektet)
 * → tidrapport → ÄTA (utkast via POST /api/ata) → ÄTA:n markeras "skickad
 * till kund" i databasen (produktens sändväg kräver SMS-saldo) → projektet
 * avslutas via PUT /api/projects. Readiness läses sedan med produktens egen
 * funktion och skrivs som sanningsfil bredvid inspelningen.
 */
import { test } from '@playwright/test'
import { loadProjectCommercialReadiness, byggReadinessSummering } from '@/lib/projects/commercial-readiness'
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
  todayIsoDate,
  writeTruth,
} from './fixtures/filming'

const FILM = 'F07_KLART'
const KUND = assertFilmName('Johan Ek')
const OFFERT = 'Badrumsrenovering, Ekbacken 4'

test('F07 — projektet är klart men ÄTA:n väntar på kunden: inte faktureringsklart', async ({ browser }) => {
  await assertFilmingTenant()
  await sweepFilmResidue()

  const admin = getSupabaseAdmin()
  const session = await openFilmContext(browser, 'f07-klart')
  const { page } = session
  try {
    await loginOwner(page)

    // ── Seed ──────────────────────────────────────────────────────────────
    const kund = await apiOk(page, 'POST', '/api/customers', { name: KUND, phone_number: FILM_PHONE, email: FILM_EMAIL }, 'Skapa kund')
    const customerId = pickId(kund, 'customer_id')

    const offert = await apiOk(
      page,
      'POST',
      '/api/quotes',
      {
        customer_id: customerId,
        title: OFFERT,
        description: 'Totalrenovering av badrum 6 m²: rivning, tätskikt, kakel/klinker, VVS och el.',
        status: 'draft',
        vat_rate: 25,
        rot_rut_type: 'rot',
        quote_items: [
          { item_type: 'item', description: 'Rivning och bortforsling', quantity: 16, unit: 'tim', unit_price: 650 },
          { item_type: 'item', description: 'Tätskikt enligt BKR', quantity: 6, unit: 'm²', unit_price: 1900 },
          { item_type: 'item', description: 'Kakel och klinker inkl. sättning', quantity: 22, unit: 'm²', unit_price: 1450 },
          { item_type: 'item', description: 'VVS-installation dusch, WC, tvättställ', quantity: 1, unit: 'st', unit_price: 18500 },
        ],
      },
      'Skapa offert',
    )
    const quoteId = pickId(offert, 'quote_id', 'id')

    // Produktens ordning: en offert måste vara skickad innan den kan accepteras.
    // Riktigt utskick (mejl till harnessets adress), sedan accept →
    // createProjectFromQuote skapar projektet.
    await apiOk(page, 'POST', '/api/quotes/send', { quoteId, method: 'email' }, 'Skicka offerten')
    await pollRow('quotes', { quote_id: quoteId, status: 'sent' }, { select: 'quote_id' })
    await apiOk(page, 'POST', '/api/quotes/accept', { quoteId }, 'Acceptera offerten')
    const projekt = await pollRow<{ project_id: string; name: string; status: string }>(
      'project',
      { business_id: DEMO_BUSINESS_ID, quote_id: quoteId },
      { select: 'project_id, name, status' },
    )
    const projectId = projekt.project_id

    // Tidrapport — bevisplatsen "tid" ska vara styrkt så att ÄTA:n blir den enda blockeraren.
    await apiOk(
      page,
      'POST',
      '/api/time-entry',
      { project_id: projectId, work_date: todayIsoDate(), duration_minutes: 480, work_category: 'work', description: 'Rivning och tätskikt' },
      'Registrera tid',
    )

    // ÄTA via produktens rutt (landar som utkast) …
    const ata = await apiOk(
      page,
      'POST',
      '/api/ata',
      {
        projectId,
        customerId,
        changeType: 'addition',
        description: 'Extra eluttag och spotlights i badrumstak',
        items: [
          { description: 'Spotlights inkl. montage', quantity: 6, unit_price: 1450 },
          { description: 'Extra eluttag', quantity: 2, unit_price: 1900 },
        ],
      },
      'Skapa ÄTA',
    )
    const changeId = pickId(ata, 'change_id', 'id')
    // … och markeras skickad till kund (produktens sändväg är SMS och kräver saldo).
    const { error: ataError } = await admin
      .from('project_change')
      .update({ status: 'sent', sent_at: daysAgoIso(2, 14), sent_to_phone: FILM_PHONE })
      .eq('change_id', changeId)
      .eq('business_id', DEMO_BUSINESS_ID)
    if (ataError) throw new Error(`ÄTA kunde inte markeras skickad: ${ataError.message}`)

    // Projektet avslutas via produktens väg (alla avslutseffekter körs på riktigt).
    const avslut = await api(page, 'PUT', '/api/projects', { project_id: projectId, status: 'completed' })
    if (avslut.status !== 200 || avslut.json?.requires_approval) {
      throw new Error(`Projektavslut gav ${avslut.status}: ${JSON.stringify(avslut.json).slice(0, 300)}`)
    }

    // ── Sanningen: produktens egen readiness-beräkning ────────────────────
    const readiness = await loadProjectCommercialReadiness(admin as any, DEMO_BUSINESS_ID, projectId)
    if (!readiness) throw new Error('Readiness kunde inte beräknas')
    const sammanfattning = byggReadinessSummering(readiness)
    expect(readiness.verdict, sammanfattning).not.toBe('ready')
    expect(readiness.blockers.join(' | ')).toContain('väntar på kundgodkännande')

    // ── Beat 1: färdigt projekt, ÄTA-fliken ───────────────────────────────
    await page.goto(`/dashboard/projects/${projectId}?tab=changes`)
    await dismissOverlays(page, 3_000)
    await expect(page.getByText('Extra eluttag och spotlights i badrumstak').first()).toBeVisible({ timeout: 25_000 })
    await beat(session, FILM, 1, 'ata-vantar-pa-kund', 3_000)

    // ── Beat 2: översikten ────────────────────────────────────────────────
    await page.goto(`/dashboard/projects/${projectId}`)
    await dismissOverlays(page, 3_000)
    await beat(session, FILM, 2, 'projekt-oversikt', 2_500)

    // ── Beat 3–4: Matte namnger blockeraren ───────────────────────────────
    await page.getByRole('button', { name: 'Öppna Matte' }).click()
    const falt = page.getByPlaceholder('Be Matte göra något…')
    await expect(falt).toBeVisible({ timeout: 10_000 })
    await falt.click()
    await falt.pressSequentially(`Är ${projekt.name} redo att fakturera?`, { delay: 45 })
    await beat(session, FILM, 3, 'fragan-till-matte', 1_200)
    await falt.press('Enter')
    // Vänta på att Matte faktiskt svarat: "Tänker…" ska synas och sedan försvinna,
    // och svaret ska nämna blockeraren. Sökningen scope:as till chattens dialog så
    // att ÄTA-fliken bakom modalen inte räknas som svar.
    await expect(page.getByText('Tänker…')).toBeVisible({ timeout: 15_000 }).catch(() => undefined)
    await expect(page.getByText('Tänker…')).toBeHidden({ timeout: 120_000 })
    // Ordet "ÄTA" ensamt räcker inte (fliken bakom modalen heter så) — svaret
    // ska bära produktens blockerarmening eller verdictet.
    const svar = page.getByText(/kundgodkännande|inte redo att fakturera|väntar på kund/i).last()
    await expect(svar).toBeVisible({ timeout: 15_000 })
    await beat(session, FILM, 4, 'matte-namnger-blockeraren', 4_000)
    const matteSvar = await svar.innerText().catch(() => '')

    writeTruth(session, FILM, {
      film: 'F07',
      kund: KUND,
      projekt: { project_id: projectId, name: projekt.name },
      ata: { change_id: changeId, status: 'sent' },
      matte_svar: matteSvar,
      mobil_overflow: [await measureOverflow(page, 'projekt-oversikt')],
      readiness: {
        verdict: readiness.verdict,
        blockers: readiness.blockers,
        truth_notes: readiness.truth_notes,
        sammanfattning,
        slots: readiness.slots,
      },
      sanningsgrans: 'Evidence-to-Payment har ingen egen sida — bevisas via Mattes chatt. Visa aldrig procentsiffra eller "AI-bedömning".',
    })
  } finally {
    await finishFilm(session, 'HM_F07_KLART_PRODUKTBEVIS_9x16')
  }
})
