/**
 * Vakter för öppnad-spårningen (2026-08-10, Andreas: "står inte som Öppnad").
 *
 * Kedjan var kopplad på alla tre ytor men kunde dö tyst: kolumnlistor med
 * v16-räknarna i samma operation som statusflippen, och inget .error läst
 * någonstans. Vakterna låser isoleringen och felläsningen.
 *
 *   npx playwright test tests/quote-open-tracking.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('statusflippen kan inte dödas av saknade räknarkolumner', () => {
  const helper = read('lib/quotes/track-open.ts')

  test('flippen är en egen minimal uppdatering — bara status', () => {
    expect(helper).toContain(".update({ status: 'opened' })")
    // Räknarna ligger i en SEPARAT uppdatering — aldrig i samma objekt.
    const flip = helper.indexOf(".update({ status: 'opened' })")
    const raknare = helper.indexOf('view_count: newViewCount')
    expect(raknare).toBeGreaterThan(flip)
  })

  test('varje databasfel läses och loggas — aldrig tyst', () => {
    for (const vakt of ['statusErr', 'eventErr', 'raknareErr']) {
      expect(helper, `${vakt} läses inte`).toContain(vakt)
    }
    expect(helper).toContain('är v16 körd?')
  })

  test('offertläsningen tål saknade kolumner — select(*) på enradsläsningen', () => {
    expect(helper).toContain(".select('*')")
  })

  test('en besvarad offert blir aldrig öppnad igen — flippen grindar på sent', () => {
    const flip = helper.indexOf("if (quote.status === 'sent')")
    expect(flip).toBeGreaterThan(-1)
    // Dubbelvakt i själva uppdateringen: eq-status så en race aldrig
    // skriver över accepterad/avvisad.
    expect(helper).toContain(".eq('status', 'sent')")
  })
})

test.describe('track-rutten och ytorna', () => {
  test('ruttens select listar bara kolumner som bevisligen finns — och läser felet', () => {
    const rutt = read('app/api/quotes/track/route.ts')
    expect(rutt).toContain(".select('business_id, status')")
    expect(rutt).not.toContain("view_count, first_viewed_at, status')")
    expect(rutt).toContain('quoteErr')
  })

  test('alla tre kundytorna registrerar öppningen', () => {
    // Pixeln i mejlet, den fristående kundvyn och portalens modal — samma väg.
    expect(read('app/api/quotes/send/route.ts')).toContain('/api/quotes/track?q=')
    expect(read('app/quote/[token]/page.tsx')).toContain('/api/quotes/track?q=')
    expect(read('app/portal/[token]/components/PortalQuoteSigningModal.tsx')).toContain('/api/quotes/track?q=')
  })
})
