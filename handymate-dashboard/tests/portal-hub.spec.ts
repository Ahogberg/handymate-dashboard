/**
 * Vakter för kundportalens kommunikationshubb + hem (2026-08-10).
 *
 * Ärlighetsklassen: portalen påstod närvaro ("● Online"), leverans
 * ("Levererad") och projektläge ("Pågår") som ingen mekanik backade upp —
 * och kundens nyss skickade meddelande försvann ur vyn för att POST:en
 * aldrig returnerade raden. Källskanningarna här håller lögnerna borta.
 *
 *   npx playwright test tests/portal-hub.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildQuoteContextPrefix } from '../lib/portal/customer-thread'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('tråden ljuger aldrig', () => {
  const trad = read('app/portal/[token]/components/PortalMessagesThread.tsx')

  test('ingen påstådd närvaro — Online-etiketten är borta', () => {
    expect(trad).not.toContain('Online')
    expect(trad).not.toContain('bp-live-dot')
  })

  test('Skickat i stället för Levererad — en databasrad är ingen leverans', () => {
    expect(trad).toContain("'Läst' : 'Skickat'")
    expect(trad).not.toContain('Levererad')
  })

  test('sändfel sägs högt och utkastet står kvar', () => {
    expect(trad).toContain('setSendError(')
    expect(trad).toContain('kunde inte skickas')
    expect(trad).toContain('role="alert"')
  })

  test('serverns rad appendas bara när den finns — aldrig undefined i tråden', () => {
    expect(trad).toContain('if (data.message) onMessageSent(data.message)')
  })

  test('datumseparatorn följer dagarna, inte bara första meddelandet', () => {
    expect(trad).toContain('nyDag')
    expect(trad).toContain('toDateString()')
  })
})

test.describe('läskvittot är sant: svarat = läst', () => {
  const helper = read('lib/portal/customer-thread.ts')

  test('hantverkarens svar sätter read_at på kundens olästa meddelanden', () => {
    const i = helper.indexOf('export async function sendCustomerReply')
    const block = helper.slice(i)
    expect(block).toContain("update({ read_at:")
    expect(block).toContain(".eq('direction', 'inbound')")
    expect(block).toContain(".is('read_at', null)")
  })

  test('kundens trådrad returneras så portalen kan visa den direkt', () => {
    expect(helper).toContain("select('id, direction, message, read_at, created_at')")
    expect(helper).toContain('result.message = threadRow')
    expect(read('app/api/portal/[token]/messages/route.ts')).toContain('message: result.message ?? null')
  })

  test('kontextprefixet är oförändrat — tråden förblir begriplig', () => {
    expect(buildQuoteContextPrefix({ quoteNumber: '#014' })).toBe('Om offert #014: ')
    expect(buildQuoteContextPrefix({})).toBe('')
  })
})

test.describe('hem och navigering', () => {
  const hem = read('app/portal/[token]/components/PortalHome.tsx')

  test('statuschippen följer projektets läge — pulsen är förtjänad', () => {
    // Chippen var hårdkodad "Pågår" med puls även för avslutade projekt
    // (kortet faller tillbaka på första projektet när inget är aktivt).
    expect(hem).toContain('statusChip')
    expect(hem).toContain("'Planeras'")
    expect(hem).toContain("'Klart'")
    expect(hem).toContain('statusChip.puls && <span className="bp-live-dot" />')
  })

  test('Offerter och Fakturor deep-linkar till varsin sektion', () => {
    expect(hem).toContain("docsSection: 'quotes'")
    expect(hem).toContain("docsSection: 'invoices'")
    const lista = read('app/portal/[token]/components/PortalDocumentsList.tsx')
    expect(lista).toContain('initialFilter')
    expect(read('app/portal/[token]/page.tsx')).toContain('initialFilter={docsSection}')
  })

  test('headerikonen är meddelanden med antal — inte en klocka med prick', () => {
    const header = read('app/portal/[token]/components/PortalShellHeader.tsx')
    expect(header).toContain('MessageCircle')
    expect(header).not.toContain('Bell')
    expect(header).toContain("unreadMessages > 9 ? '9+' : unreadMessages")
  })

  test('tråden pollar medan den är öppen', () => {
    const sida = read('app/portal/[token]/page.tsx')
    const i = sida.indexOf("subRoute !== 'messages' || !portal")
    expect(i, 'trådpollningen saknas').toBeGreaterThan(-1)
    expect(sida.slice(i, i + 600)).toContain('setInterval')
  })
})
