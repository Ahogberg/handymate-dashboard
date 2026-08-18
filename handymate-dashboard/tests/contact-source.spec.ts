/**
 * v151 (e-post-opt-out) + v152 (kontaktproveniens) — facit-tester för de
 * rena, DB-fria delarna:
 *   - lib/customers/contact-source.ts: contactSourceFromLead-mappningen
 *   - lib/email/unsubscribe-link.ts: signerad avregistreringstoken
 *
 * Samma stil som tests/frequency-guard.spec.ts — inga DB-anrop, ingen
 * browser/session.
 *
 * Körs: npx playwright test tests/contact-source.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { contactSourceFromLead, isMissingContactSourceColumnError } from '../lib/customers/contact-source'
import { createUnsubscribeToken, verifyUnsubscribeToken } from '../lib/email/unsubscribe-link'

// HMAC-nyckeln måste finnas innan modulen anropas — signingSecret() läser
// process.env dynamiskt vid varje anrop, så det räcker att sätta den här,
// oavsett importordning.
process.env.CRON_SECRET = 'test-cron-secret-för-contact-source-spec'

test.describe('contactSourceFromLead', () => {
  test('referral mappas till referral', () => {
    expect(contactSourceFromLead('referral')).toBe('referral')
  })

  test('vapi_call mappas till phone_call', () => {
    expect(contactSourceFromLead('vapi_call')).toBe('phone_call')
  })

  test('email_lead och email_forward mappas till gmail_import', () => {
    expect(contactSourceFromLead('email_lead')).toBe('gmail_import')
    expect(contactSourceFromLead('email_forward')).toBe('gmail_import')
  })

  test('website_form, inbound_sms och manual mappas till lead_form (otherwise-hinken)', () => {
    expect(contactSourceFromLead('website_form')).toBe('lead_form')
    expect(contactSourceFromLead('inbound_sms')).toBe('lead_form')
    expect(contactSourceFromLead('manual')).toBe('lead_form')
  })

  test('okänd/tom/null källa mappas till lead_form, kraschar inte', () => {
    expect(contactSourceFromLead('nagot-okant')).toBe('lead_form')
    expect(contactSourceFromLead('')).toBe('lead_form')
    expect(contactSourceFromLead(null)).toBe('lead_form')
    expect(contactSourceFromLead(undefined)).toBe('lead_form')
  })

  test('case- och whitespace-okänslig', () => {
    expect(contactSourceFromLead('  Referral  ')).toBe('referral')
    expect(contactSourceFromLead('VAPI_CALL')).toBe('phone_call')
  })
})

test.describe('isMissingContactSourceColumnError', () => {
  test('känner igen PostgRESTs kolumn-saknas-felmeddelande', () => {
    expect(isMissingContactSourceColumnError(
      "column customer.contact_source does not exist",
    )).toBe(true)
  })

  test('känner inte igen ett orelaterat fel', () => {
    expect(isMissingContactSourceColumnError('duplicate key value violates unique constraint')).toBe(false)
    expect(isMissingContactSourceColumnError(null)).toBe(false)
    expect(isMissingContactSourceColumnError(undefined)).toBe(false)
  })
})

test.describe('createUnsubscribeToken / verifyUnsubscribeToken', () => {
  test('round-trip: en skapad token verifieras till samma businessId/customerId', () => {
    const token = createUnsubscribeToken({ businessId: 'biz_1', customerId: 'cust_1' })
    const result = verifyUnsubscribeToken(token)
    expect(result).toEqual({ ok: true, businessId: 'biz_1', customerId: 'cust_1' })
  })

  test('avvisar en manipulerad payload (annat customerId insmusslat)', () => {
    const token = createUnsubscribeToken({ businessId: 'biz_1', customerId: 'cust_1' })
    const [encoded] = token.split('.')
    const tamperedPayload = Buffer.from(
      JSON.stringify({ businessId: 'biz_1', customerId: 'cust_ANNAN', type: 'email_unsubscribe' }),
      'utf8',
    ).toString('base64url')
    // Byt payload men behåll den ORIGINALA signaturen — ska falla på
    // signaturjämförelsen, inte råka verifieras.
    const originalSig = token.split('.')[1]
    const tampered = `${tamperedPayload}.${originalSig}`
    expect(verifyUnsubscribeToken(tampered)).toEqual({ ok: false })
    expect(encoded).not.toBe(tamperedPayload)
  })

  test('avvisar trasig/ogiltig token utan att kasta', () => {
    expect(verifyUnsubscribeToken(null)).toEqual({ ok: false })
    expect(verifyUnsubscribeToken(undefined)).toEqual({ ok: false })
    expect(verifyUnsubscribeToken('')).toEqual({ ok: false })
    expect(verifyUnsubscribeToken('inte-en-giltig-token')).toEqual({ ok: false })
    expect(verifyUnsubscribeToken('bara-en-del')).toEqual({ ok: false })
  })

  test('avvisar en token signerad med fel hemlighet', () => {
    const token = createUnsubscribeToken({ businessId: 'biz_1', customerId: 'cust_1' })
    const [encoded] = token.split('.')
    // Simulera en token "förfalskad" med en annan hemlighet genom att bara
    // ändra sista tecknet i signaturen.
    const originalSig = token.split('.')[1]
    const wrongSig = originalSig.slice(0, -1) + (originalSig.slice(-1) === 'a' ? 'b' : 'a')
    expect(verifyUnsubscribeToken(`${encoded}.${wrongSig}`)).toEqual({ ok: false })
  })

  test('två olika kund/företags-par ger olika tokens', () => {
    const a = createUnsubscribeToken({ businessId: 'biz_1', customerId: 'cust_1' })
    const b = createUnsubscribeToken({ businessId: 'biz_1', customerId: 'cust_2' })
    expect(a).not.toBe(b)
  })
})
