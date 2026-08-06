/**
 * Facit-tester för kundens samtalstråd (etapp 2-3, 2026-08-06).
 *
 * Bakgrund: tråden fanns men var ett svart hål — kundens meddelanden skrevs
 * till tabellen och stannade där, utan vy, notis eller kö. Samtidigt låg
 * offertfrågan bara som ett kort, så kunden hade ingen historik.
 *
 * De rena funktionerna här bär två löften som måste hålla:
 *   1. Sammanhanget följer med i tråden — "vad ingår här?" ska vara begripligt
 *      månader senare.
 *   2. Vi skickar ALDRIG ett svar hantverkaren inte skrivit. En orörd mall
 *      räknas inte som ett svar.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/customer-thread.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  buildQuoteContextPrefix,
  buildReplyDraft,
  buildReplyNotificationSms,
} from '../lib/portal/customer-thread'

test.describe('buildQuoteContextPrefix — tråden ska vara begriplig senare', () => {
  test('offertnummer och rad tas med', () => {
    const prefix = buildQuoteContextPrefix({
      quoteNumber: '2026-014',
      itemDescription: 'Rivning badrum',
    })
    expect(prefix).toBe('Om offert 2026-014, raden "Rivning badrum": ')
  })

  test('saknas nummer används titeln', () => {
    expect(buildQuoteContextPrefix({ quoteTitle: 'Badrumsrenovering' })).toBe(
      'Om offerten "Badrumsrenovering": ',
    )
  })

  test('nummer vinner över titel — det är den entydiga referensen', () => {
    const prefix = buildQuoteContextPrefix({ quoteNumber: '2026-014', quoteTitle: 'Badrum' })
    expect(prefix).toContain('2026-014')
    expect(prefix).not.toContain('Badrum')
  })

  test('bara rad utan offertidentitet ger ändå sammanhang', () => {
    expect(buildQuoteContextPrefix({ itemDescription: 'Kakel' })).toBe('raden "Kakel": ')
  })

  test('utan sammanhang blir prefixet tomt — ingen påhittad referens', () => {
    expect(buildQuoteContextPrefix({})).toBe('')
    expect(buildQuoteContextPrefix({ quoteNumber: null, quoteTitle: null })).toBe('')
  })
})

test.describe('buildReplyDraft — en inledning, aldrig ett svar', () => {
  test('förnamnet används', () => {
    expect(buildReplyDraft('Anna Andersson')).toBe('Hej Anna! Tack för din fråga — ')
  })

  test('utan namn blir hälsningen neutral', () => {
    expect(buildReplyDraft('')).toBe('Hej! Tack för din fråga — ')
    expect(buildReplyDraft('   ')).toBe('Hej! Tack för din fråga — ')
  })

  test('mallen innehåller aldrig ett faktiskt svar', () => {
    // Den slutar med tankstreck just för att signalera "skriv vidare här".
    expect(buildReplyDraft('Anna').trim().endsWith('—')).toBe(true)
  })

  test('mallen är deterministisk — exekveringen jämför mot den för att avgöra om svaret är orört', () => {
    expect(buildReplyDraft('Anna')).toBe(buildReplyDraft('Anna Andersson'))
  })
})

test.describe('buildReplyNotificationSms — kort avisering, inte hela svaret', () => {
  test('företagsnamnet och länken finns med', () => {
    const sms = buildReplyNotificationSms('Bee Service', 'https://app.handymate.se/portal/abc')
    expect(sms).toContain('Bee Service')
    expect(sms).toContain('https://app.handymate.se/portal/abc')
  })

  test('utan företagsnamn blir texten ändå begriplig', () => {
    const sms = buildReplyNotificationSms(null, 'https://x/portal/abc')
    expect(sms).toContain('svar')
    expect(sms).toContain('https://x/portal/abc')
  })

  test('aviseringen är kort — den ska rymmas i ett SMS', () => {
    const sms = buildReplyNotificationSms('Ett Ganska Långt Hantverksföretag AB', 'https://app.handymate.se/portal/0123456789abcdef')
    expect(sms.length).toBeLessThanOrEqual(160)
  })

  test('svarets innehåll läcker aldrig ut i SMS:et', () => {
    const sms = buildReplyNotificationSms('Bee', 'https://x/p/1')
    expect(sms).not.toContain('Tack för din fråga')
  })
})
