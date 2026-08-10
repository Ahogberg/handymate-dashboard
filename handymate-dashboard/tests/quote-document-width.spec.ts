/**
 * Dokumentbredden mäts PÅ RIKTIGT (2026-08-10, Andreas fynd).
 *
 * Häromdagen klipptes både förhandsvisningen och PDF:en på höger sida —
 * innehåll försvann. Rotorsaken: sidan är fast 210 mm och ingen regel lät
 * ord brytas, så en enda obruten sträng tryckte tabellen förbi kanten.
 *
 * Det här provet är ingen källskanning: det renderar EXAKT samma HTML som
 * PDF:en byggs av (renderModernHtml — samma komponent som förhands-
 * visningen), lastar den med fientligt innehåll (obrutna 90-teckenssträngar,
 * långa filnamn, lång URL) och MÄTER overflow i en riktig webbläsare.
 * Klipps dokumentet blir provet rött — innan kunden ser det.
 *
 *   npx playwright test tests/quote-document-width.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { buildQuoteTemplateData } from '../lib/quote-templates/data-builder'
import { renderModernHtml } from '../lib/quote-templates/render-react'

const OBRUTEN = 'X'.repeat(90)
const LANG_URL = `https://exempel.storage.supabase.co/${'segment/'.repeat(12)}fil.pdf`

const fientligOffert = {
  quote_number: '#2026-9999',
  title: `Totalrenovering ${OBRUTEN}`,
  description: `Beskrivning med en lång adress ${LANG_URL} mitt i texten.`,
  quote_items: [
    {
      item_type: 'item',
      description: `Specialbeställd_komponent_${OBRUTEN}`,
      quantity: 1200,
      unit: 'löpmeter',
      unit_price: 1234567.89,
      total: 1481481468,
      is_rot_eligible: true,
      sort_order: 0,
    },
    {
      item_type: 'item',
      description: 'Vanlig rad',
      quantity: 2,
      unit: 'st',
      unit_price: 500,
      total: 1000,
      sort_order: 1,
    },
  ],
  items: [],
  not_included: `Ingår inte: ${OBRUTEN}`,
  terms_text: `Villkor med URL ${LANG_URL}`,
  reservations_snapshot: [{ title: OBRUTEN.slice(0, 40), content: `Förbehåll ${OBRUTEN}` }],
  attachments: [{ name: `Ritning_${OBRUTEN}.pdf`, url: LANG_URL }],
  subtotal: 1481482468,
  vat_rate: 25,
  total: 1851853085,
}

const fientligtForetag = {
  business_name: `Bygg & Allservice ${OBRUTEN.slice(0, 40)} AB`,
  email: `faktura.${OBRUTEN.slice(0, 30).toLowerCase()}@exempel.se`,
}

// Provet behöver ingen inloggning (ren setContent) — nollad storageState så
// det kör med --no-deps utan projektets auth-fil.
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('dokumentet klipps aldrig på höger sida', () => {
  test('fientligt innehåll ryms inom 210 mm — uppmätt i webbläsaren', async ({ page }) => {
    const data = buildQuoteTemplateData(fientligOffert, fientligtForetag, {})
    const html = renderModernHtml(data)

    await page.setViewportSize({ width: 1200, height: 900 })
    await page.setContent(html, { waitUntil: 'load' })

    const matt = await page.evaluate(() => {
      const sida = document.querySelector('.quote-document .page') as HTMLElement
      return {
        sidaScroll: sida.scrollWidth,
        sidaClient: sida.clientWidth,
        dokumentScroll: document.documentElement.scrollWidth,
        vy: document.documentElement.clientWidth,
      }
    })

    // Sanity: A4 vid 96 dpi ≈ 794 px — har sidan inte den bredden har
    // provet inte renderat det riktiga dokumentet och är grönt av fel skäl.
    expect(matt.sidaClient).toBeGreaterThan(750)
    expect(matt.sidaClient).toBeLessThan(850)

    // Kärnan: inget innehåll sticker ut ur sidan (1 px tolerans för
    // subpixelavrundning), och dokumentet skapar ingen horisontell scroll.
    expect(matt.sidaScroll, 'innehåll sticker ut förbi högerkanten').toBeLessThanOrEqual(matt.sidaClient + 1)
    expect(matt.dokumentScroll, 'sidan skapar horisontell scroll').toBeLessThanOrEqual(matt.vy + 1)
  })

  test('överlevnadsregeln står kvar i dokument-CSS:en', () => {
    const css = require('../components/quotes/document/modern-css').MODERN_DOCUMENT_CSS as string
    expect(css, 'overflow-wrap på .page är borttagen — klippet är tillbaka').toContain('overflow-wrap: anywhere')
    expect(css).toContain('.quote-document img { max-width: 100%; }')
  })
})
