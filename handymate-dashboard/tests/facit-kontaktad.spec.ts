/**
 * Facit: "Kontaktad" gäller alla kontaktvägar (Andreas 2026-08-28).
 *
 * Tidigare flyttade bara ett SMS via /api/sms/send affären till Kontaktad.
 * Nu: en regel (lib/pipeline/contacted.ts) anropad från varje kontaktväg —
 * SMS-strypunkten, mejl (lib/email med kundkontext), agentens mejl,
 * portalmeddelande, bokat besök och smart kundkommunikation. Riktningen
 * skyddas av moveDeal: aldrig bakåt från Offert skickad/Vunnen.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test('regeln: moveDeal till contacted som system, best-effort, bara öppna affärer', () => {
  const c = kod('lib/pipeline/contacted.ts')
  expect(c).toContain("toStageSlug: 'contacted'")
  expect(c).toContain("triggeredBy: 'system'")
  expect(c).toContain(".is('closed_at', null)")
  expect(c).not.toMatch(/throw /)
})

test('varje kontaktväg anropar regeln', () => {
  const vagar: Array<[string, string]> = [
    ['lib/sms-send.ts', "markCustomerContacted(supabase, businessId, resolvedCustomerId, 'sms')"],
    ['lib/email.ts', "markCustomerContacted(getServerSupabase(), businessId, customerId, 'mejl')"],
    ['lib/nurture.ts', 'customerId: params.customerId,\n      to: params.to,'],
    ['lib/quote-confirmation-email.ts', 'customerId: quote.customer_id,\n    to: customer.email,'],
    ['app/api/agent/trigger/tool-router.ts', "(params.customer_id as string) || null, 'mejl')"],
    ['app/api/portal-messages/route.ts', "markCustomerContacted(supabase, business.business_id, customerId, 'portalmeddelande')"],
    ['app/api/bookings/route.ts', "customer_id, 'besök bokat')"],
    ['lib/smart-communication.ts', "params.channel === 'sms' ? 'sms' : 'mejl')"],
  ]
  for (const [fil, snutt] of vagar) expect(kod(fil), fil).toContain(snutt)
  // Agentens mejl: båda vägarna (Gmail + Resend)
  expect(kod('app/api/agent/trigger/tool-router.ts').split("|| null, 'mejl')").length - 1).toBe(2)
})

test('SMS-hooken ligger i strypunkten efter lyckat kundutskick — inte bara i en rutt', () => {
  const s = kod('lib/sms-send.ts')
  const i = s.indexOf("if (success && recipient === 'customer') {")
  expect(i).toBeGreaterThan(-1)
  expect(s.indexOf("markCustomerContacted(supabase, businessId, resolvedCustomerId, 'sms')")).toBeGreaterThan(i)
})
