/**
 * Facit för autofakturans underlag (2026-08-09, projektauditen P1-3).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * quotes.items (JSONB) är en legacy-spegling — moderna offerter sparar
 * `items: []` där och raderna bor i quote_items-tabellen, som PDF och utskick
 * läser. autoInvoiceOnComplete läste BARA speglingen. Fakturan för ett modernt
 * fastprisprojekt byggdes alltså utan offertens rader: enbart ÄTA, eller
 * "Inga fakturarader" — medan summan på kortet såg rimlig ut.
 *
 * ═══ FLYTTAD, INTE BORTA (Tur 4 etapp 2, 2026-08-10) ═══
 *
 * Kompositionen som facit skyddar bodde ursprungligen i
 * lib/projects/auto-invoice-on-complete.ts, men flyttades till
 * lib/invoices/project-invoice-draft.ts (byggProjektFakturaUnderlag) så att
 * missad-intäkt-svepets fakturera_projekt-kort och godkännande-drift-vakten
 * kan dela samma sanning i stället för tre kopior som glider isär. Facit
 * pekade kvar på den gamla filen i flera dagar utan att någon märkte det —
 * hittat vid en full-svit-körning 2026-08-14, verifierat mot koden (inte
 * antaget) att alla fyra skyddsregler fortfarande gäller, bara på ny adress.
 *
 *   npx playwright test tests/fakturaunderlaget.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const FIL = 'lib/invoices/project-invoice-draft.ts'

test.describe('fakturan byggs ur sanningen, inte speglingen', () => {
  test('quote_items läses FÖRST, JSONB:n bara som legacy-fallback', () => {
    const s = kod(FIL)
    const tabell = s.indexOf("from('quote_items')")
    const spegling = s.indexOf('quote?.items && Array.isArray(quote.items)')
    expect(tabell, 'quote_items läses inte alls').toBeGreaterThan(-1)
    expect(spegling, 'legacy-fallbacken saknas — gamla offerter tappar sina rader').toBeGreaterThan(-1)
    expect(tabell, 'speglingen prövas före tabellen').toBeLessThan(spegling)
  })

  test('tabelläsningen är tenantfiltrerad och sorterad', () => {
    const s = kod(FIL)
    const block = s.slice(s.indexOf("from('quote_items')"), s.indexOf('if (strukturerade'))
    expect(block, 'business_id-filtret saknas').toContain("eq('business_id', businessId)")
    expect(block, 'raderna kommer i odefinierad ordning').toContain("order('sort_order')")
  })

  test('bort-valda tillval faktureras aldrig; valda blir vanliga rader', () => {
    const s = kod(FIL)
    expect(s).toContain("item.item_type !== 'option' || item.option_selected === true")
    // Valda tillval måste bli 'item' — subtotalens filter räknar bara items,
    // och ett kvarlämnat 'option' hade tyst tappat beställt arbete ur summan.
    expect(s).toContain("item.item_type === 'option' ? 'item'")
  })

  test('offertens ROT/RUT-fält ärvs bara när rader faktiskt hittades', () => {
    // Ett avdrag utan rader hade gett en faktura med negativ effekt ur
    // ingenting — villkoret binder metadatan till underlaget.
    const s = kod(FIL)
    expect(s).toContain('if (quote && quoteItems.length > 0)')
  })
})
