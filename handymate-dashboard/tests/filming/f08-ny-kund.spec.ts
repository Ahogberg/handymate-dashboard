/**
 * F08 · "Ny kund medan du står under diskbänken" — produktbevis.
 *
 * Handbokens krav: "Skärminspelning måste visa en riktig testförfrågan hela
 * vägen till både lead och affär. Om bara kanalen nåtts ska filmen säga
 * 'mottagen', inte 'affär skapad'." Därför läses sanningen ur databasen
 * (leads + deal) innan pipelinen filmas — faller den, faller filmen.
 *
 * Sanningsgräns 2026-08-28: webbformuläret är bevisat; mejlinflödet är det
 * inte. Filmen får säga "hemsidan", inte "hemsidan eller mejlen".
 */
import { test } from '@playwright/test'
import {
  DEMO_BUSINESS_ID,
  FILM_PHONE,
  api,
  apiOk,
  assertFilmName,
  assertFilmingTenant,
  beat,
  dismissOverlays,
  expect,
  finishFilm,
  getSupabaseAdmin,
  loginOwner,
  openFilmContext,
  pollRow,
  sweepFilmResidue,
  typeSlow,
  writeTruth,
} from './fixtures/filming'

const FILM = 'F08_NYKUND'
const NAME = assertFilmName('Maria Lindqvist')
const MESSAGE = 'Hej! Vi vill byta köksblandare och få hjälp med ett läckande avlopp under diskbänken. När kan ni komma?'

test('F08 — förfrågan på hemsidan blir kund, lead och affär', async ({ browser }) => {
  await assertFilmingTenant()
  await sweepFilmResidue()

  const admin = getSupabaseAdmin()
  const { data: storefront } = await admin
    .from('storefront')
    .select('slug, is_published')
    .eq('business_id', DEMO_BUSINESS_ID)
    .maybeSingle()
  if (!storefront?.slug) {
    throw new Error('Demokontot saknar hemsida (storefront). Skapa den i Inställningar → Hemsida innan F08 filmas.')
  }
  const varPublicerad = storefront.is_published === true

  const session = await openFilmContext(browser, 'f08-ny-kund')
  const { page } = session
  try {
    await loginOwner(page)
    // Formuläret kräver publicerad hemsida — publicera via produktens egen rutt
    // som ägaren, och återställ efteråt om den var opublicerad.
    if (!varPublicerad) await apiOk(page, 'PUT', '/api/storefront', { is_published: true }, 'Publicera hemsidan')

    // ── Beat 1–3: kundens vy — hemsidan, formuläret, skickat ──────────────
    await page.goto(`/site/${storefront.slug}`)
    await dismissOverlays(page, 2_500)
    const rubrik = page.getByRole('heading', { name: 'Skicka en förfrågan' })
    await expect(rubrik).toBeVisible({ timeout: 15_000 })
    await rubrik.scrollIntoViewIfNeeded()
    await beat(session, FILM, 1, 'hemsidan-formular', 1_800)

    await typeSlow(page, 'Ditt namn *', NAME, 70)
    await typeSlow(page, 'Telefon', FILM_PHONE, 55)
    await typeSlow(page, 'Beskriv vad du behöver hjälp med...', MESSAGE, 30)
    await beat(session, FILM, 2, 'formular-ifyllt', 1_200)

    await page.getByRole('button', { name: 'Skicka förfrågan' }).click()
    await beat(session, FILM, 3, 'forfragan-skickad', 2_500)

    // ── Sanningen: lead OCH affär måste finnas innan pipelinen filmas ────
    const lead = await pollRow<{ lead_id: string; customer_id: string; source: string; status: string }>(
      'leads',
      { business_id: DEMO_BUSINESS_ID, name: NAME },
      { select: 'lead_id, customer_id, source, status' },
    )
    const deal = await pollRow<{ id: string; title: string; stage_id: string; deal_number: string | null }>(
      'deal',
      { business_id: DEMO_BUSINESS_ID, lead_id: lead.lead_id },
      { select: 'id, title, stage_id, deal_number' },
    )
    const { data: stage } = await admin.from('pipeline_stage').select('slug, name').eq('id', deal.stage_id).maybeSingle()
    expect(stage?.slug, 'affären ska ligga i Ny förfrågan').toBe('new_inquiry')

    // ── Beat 4: ägarens pipeline — förfrågan syns i "Ny förfrågan" ───────
    await page.goto('/dashboard/pipeline')
    await dismissOverlays(page, 3_000)
    const kortet = page.getByText(NAME, { exact: true }).first()
    await expect(kortet).toBeVisible({ timeout: 20_000 })
    await kortet.scrollIntoViewIfNeeded().catch(() => undefined)
    await beat(session, FILM, 4, 'pipeline-ny-forfragan', 3_000)

    // ── Beat 5: kundkortet som skapades av förfrågan ─────────────────────
    await page.goto(`/dashboard/customers/${lead.customer_id}`)
    await dismissOverlays(page, 2_000)
    await expect(page.getByText(NAME).first()).toBeVisible({ timeout: 15_000 })
    await beat(session, FILM, 5, 'kundkort', 2_500)

    writeTruth(session, FILM, {
      film: 'F08',
      kund: NAME,
      lead: { lead_id: lead.lead_id, source: lead.source, status: lead.status },
      affar: { id: deal.id, deal_number: deal.deal_number, steg: stage?.name, slug: stage?.slug },
      sanningsgrans: 'Webbformulär → kund + lead + affär bevisat. Mejlinflöde EJ bevisat — säg "hemsidan".',
    })
  } finally {
    if (!varPublicerad) await api(page, 'PUT', '/api/storefront', { is_published: false })
    await finishFilm(session, 'HM_F08_NYKUND_PRODUKTBEVIS_9x16')
  }
})
