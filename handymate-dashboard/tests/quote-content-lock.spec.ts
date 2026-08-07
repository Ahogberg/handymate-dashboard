/**
 * Facit för innehållslåset på accepterade offerter (2026-08-07).
 *
 * Kompletterar tests/quote-lifecycle.spec.ts, som låser STATUSKONTRAKTET.
 * Den här filen låser vad som får ÄNDRAS när en status väl är nådd.
 *
 * ═══ FELET SOM VAKTAS ═══
 *
 * `PUT /api/quotes` hämtade offertens status men använde den bara för att sätta
 * `sent_at`. Ingen gren avvisade `accepted` eller `signed`. En offert kunden
 * sagt ja till kunde alltså skrivas om i efterhand — priser, rader, villkor,
 * förbehåll — medan `signature_data` och `signed_at` stod kvar orörda.
 *
 * Kunden ser sin gamla signeringslänk, som läser den muterbara raden. Signaturen
 * pekar därmed på ett annat innehåll än det som signerades, och ingenting i
 * systemet säger att de gått isär. Varken `content_hash` eller
 * `accepted_snapshot` finns i repot.
 *
 * Det viktigaste testet är **listorna glider inte isär**: läggs ett nytt
 * kundvänt fält till i PUT utan att låsas blir det rött. Annars återuppstår
 * hålet en kolumn i taget.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-content-lock.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  isLocked,
  lockedChanges,
  lockedChangeMessage,
  LOCKED_QUOTE_STATUSES,
  COMMERCIAL_FIELDS,
  OPERATIONAL_FIELDS,
} from '../lib/quotes/lifecycle'
import { WON_QUOTE_STATUSES, OPEN_QUOTE_STATUSES, LOST_QUOTE_STATUSES } from '../lib/quotes/statuses'

const ROOT = path.resolve(__dirname, '..')
const RUTT = fs.readFileSync(path.join(ROOT, 'app/api/quotes/route.ts'), 'utf8')

test.describe('vad som är låst', () => {
  test('accepterad och signerad är låsta', () => {
    for (const s of WON_QUOTE_STATUSES) {
      expect(isLocked(s), `${s} måste vara låst`).toBe(true)
    }
  })

  test('öppna offerter är fria', () => {
    for (const s of ['draft', ...OPEN_QUOTE_STATUSES]) {
      expect(isLocked(s), `${s} ska gå att redigera`).toBe(false)
    }
  })

  test('avböjd och utgången låses INTE', () => {
    // De är återvändsgränder, inte avtal. Ingen signatur pekar på dem, och en
    // hantverkare ska kunna återuppliva en avböjd offert.
    for (const s of LOST_QUOTE_STATUSES) {
      expect(isLocked(s), `${s} ska inte vara låst`).toBe(false)
    }
  })

  test('okänd status låser inte', () => {
    // Ett fallback till "låst" hade kunnat frysa offerter av misstag.
    expect(isLocked('nagot_nytt')).toBe(false)
    expect(isLocked(null)).toBe(false)
    expect(isLocked(undefined)).toBe(false)
    expect(isLocked('')).toBe(false)
  })

  test('låsta statusar är exakt de vunna', () => {
    expect([...LOCKED_QUOTE_STATUSES].sort()).toEqual([...WON_QUOTE_STATUSES].sort())
  })
})

test.describe('vad spärren stoppar', () => {
  test('priser och rader stoppas på en accepterad offert', () => {
    const stoppade = lockedChanges('accepted', ['quote_id', 'total', 'items', 'subtotal'])
    expect(stoppade).toEqual(['items', 'subtotal', 'total'])
  })

  test('villkor och förbehåll stoppas', () => {
    expect(lockedChanges('signed', ['terms_text', 'reservations_snapshot'])).toHaveLength(2)
  })

  test('avdragen stoppas', () => {
    // Ett ändrat ROT-avdrag flyttar vad kunden ska betala.
    expect(lockedChanges('accepted', ['rot_deduction'])).toEqual(['rot_deduction'])
  })

  test('operativa fält släpps igenom', () => {
    // Annars går arbetsflödet efter accept sönder, och då kringgår folk spärren
    // i stället för att versionera.
    expect(lockedChanges('accepted', [...OPERATIONAL_FIELDS])).toEqual([])
  })

  test('quote_id självt är aldrig en ändring', () => {
    expect(lockedChanges('accepted', ['quote_id'])).toEqual([])
  })

  test('en öppen offert stoppas aldrig', () => {
    expect(lockedChanges('draft', [...COMMERCIAL_FIELDS])).toEqual([])
    expect(lockedChanges('sent', ['total', 'items'])).toEqual([])
  })
})

test.describe('listorna glider inte isär', () => {
  test('varje fält PUT skriver är antingen låst eller uttryckligen operativt', () => {
    // Kärntestet. Läggs ett nytt kundvänt fält till i PUT utan att låsas
    // återuppstår hålet en kolumn i taget.
    const put = RUTT.slice(RUTT.indexOf('export async function PUT'))
    const skrivna = new Set(
      Array.from(put.matchAll(/updates\.([a-z_]+)\s*=/g)).map(m => m[1]),
    )

    // Fält som sätts av servern själv, inte av klienten.
    const SERVERSATTA = new Set(['updated_at', 'sent_at'])

    const kommersiella = new Set<string>(COMMERCIAL_FIELDS as readonly string[])
    const operativa = new Set<string>(OPERATIONAL_FIELDS as readonly string[])

    const oklassade = Array.from(skrivna)
      .filter(f => !SERVERSATTA.has(f) && !kommersiella.has(f) && !operativa.has(f))
      .sort()

    expect(oklassade, 'fält i PUT som varken är låsta eller uttryckligen operativa').toEqual([])
  })

  test('inget fält står i båda listorna', () => {
    const operativa = new Set<string>(OPERATIONAL_FIELDS as readonly string[])
    const bada = (COMMERCIAL_FIELDS as readonly string[]).filter(f => operativa.has(f))
    expect(bada, 'ett fält kan inte vara både låst och fritt').toEqual([])
  })

  test('de tunga kundvända fälten finns med', () => {
    for (const f of ['items', 'total', 'terms_text', 'rot_deduction', 'payment_plan', 'reservations_snapshot']) {
      expect(COMMERCIAL_FIELDS as readonly string[], `${f} saknas i låset`).toContain(f)
    }
  })
})

test.describe('rutten använder spärren', () => {
  test('PUT anropar lockedChanges och svarar 409', () => {
    const put = RUTT.slice(RUTT.indexOf('export async function PUT'))
    expect(put).toContain('lockedChanges(existing.status')
    expect(put, 'en blockerad ändring ska ge 409, inte 200').toContain('status: 409')
  })

  test('spärren ligger före uppdateringsobjektet byggs', () => {
    const put = RUTT.slice(RUTT.indexOf('export async function PUT'))
    const spärr = put.indexOf('lockedChanges(existing.status')
    const bygge = put.indexOf('const updates: Record<string, any>')
    expect(spärr).toBeGreaterThan(-1)
    expect(spärr, 'spärren måste komma före fälten samlas ihop').toBeLessThan(bygge)
  })
})

test.describe('meddelandet', () => {
  test('säger vad man gör i stället', () => {
    // Ett blankt "otillåtet" hade bara lett till att någon redigerade i
    // databasen i stället.
    for (const s of WON_QUOTE_STATUSES) {
      const m = lockedChangeMessage(s)
      expect(m).toContain('ny version')
      expect(m.length).toBeGreaterThan(40)
    }
  })

  test('skiljer signerad från accepterad', () => {
    expect(lockedChangeMessage('signed')).toContain('signerad')
    expect(lockedChangeMessage('accepted')).toContain('accepterad')
  })

  test('är på svenska utan tekniska termer', () => {
    for (const s of WON_QUOTE_STATUSES) {
      expect(lockedChangeMessage(s)).not.toMatch(/payload|status code|forbidden|locked_fields/i)
    }
  })
})
