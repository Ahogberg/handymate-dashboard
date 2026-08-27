/**
 * Facit för kontextrevisionens åtgärder (2026-08-16) — den kompletta
 * kommunikationsloggen per kund över alla kontaktytor.
 *
 * Bakgrund: docs/audits/CUSTOMER_CONTEXT_MEMORY_AUDIT.md (Fable 5-revision).
 * Nio fynd — de åtgärdade låses här så de inte kan regressa tyst:
 *   1. Utgående e-post sparades ALDRIG (Gmail-pollern hoppade över ägarens
 *      mejl, send_email sparade inget, ingen e-postlogg fanns).
 *   2. resolveEntity() körde Mattes e-postintelligens med ALLTID tom
 *      historik trots att inkommande brödtext fanns sparad.
 *   3. Utgående SMS delad hjärna: sms_log hade allt, sms_conversation (det
 *      alla historik-konsumenter läser) fick bara ~3 av ~20 vägar.
 *   4. Kundtidslinjen saknade samtal/möten/e-post/portal/widget helt.
 *   5. Portal-tråden (customer_message) hade noll kontextkonsumenter.
 *   6. Postmark-inkommande e-post sparades aldrig i sin helhet — förstörande.
 *   9. Intent-agenten trunkerade historikmeddelanden till 80 tecken.
 *
 *   npx playwright test tests/customer-context-trail.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('fynd 3: utgående SMS speglas till konversationshistoriken i strypunkten', () => {
  test('sendSmsViaElks speglar lyckade kundutskick till sms_conversation', () => {
    const s = read('lib/sms-send.ts')
    const i = s.indexOf("from('sms_conversation')")
    expect(i, 'speglingen saknas i strypunkten').toBeGreaterThan(-1)
    const gren = s.slice(Math.max(0, i - 600), i + 400)
    // Bara lyckade kundutskick — interna notiser hör inte hemma i en kundkonversation.
    expect(gren).toContain("success && recipient === 'customer'")
    expect(gren).toContain("role: 'assistant'")
    // Best-effort — får aldrig fälla själva utskicket.
    expect(gren).toContain('try {')
    expect(gren).toContain('catch')
  })

  test('agentens send_sms-verktyg dubbelskriver INTE längre sin egen kopia', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const sendSmsStart = s.indexOf('sms_log skrivs numera av helpern')
    expect(sendSmsStart).toBeGreaterThan(-1)
    const gren = s.slice(sendSmsStart, sendSmsStart + 2500)
    expect(gren, 'den lokala sms_conversation-inserten ska vara borttagen')
      .not.toContain(".from('sms_conversation')")
  })

  test('dashboardens manuella svar dubbelskriver INTE längre', () => {
    const s = read('app/api/sms/conversations/route.ts')
    const postStart = s.indexOf('export async function POST')
    const gren = s.slice(postStart)
    expect(gren).not.toContain(".from('sms_conversation').insert")
  })
})

test.describe('fynd 1: utgående e-post sparas — äntligen båda halvorna av konversationen', () => {
  test('logOutboundEmail skriver direction outbound till email_conversations, best-effort', () => {
    const s = read('lib/comm/log-outbound-email.ts')
    expect(s).toContain("from('email_conversations')")
    expect(s).toContain("direction: 'outbound'")
    // Syntetiskt id när Gmail-id saknas (Resend-vägen) — kolumnen är NOT NULL UNIQUE.
    expect(s).toMatch(/out_\$\{Date\.now\(\)\}/)
    expect(s).toContain('try {')
    expect(s).toContain('catch')
  })

  test('send_email-verktyget loggar på BÅDA vägarna (Gmail och Resend)', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const sendEmailStart = s.indexOf('async function sendEmail(')
    expect(sendEmailStart).toBeGreaterThan(-1)
    const gren = s.slice(sendEmailStart, sendEmailStart + 4000)
    const anrop = gren.match(/logOutboundEmail\(/g) || []
    expect(anrop.length, 'båda sändvägarna ska logga').toBeGreaterThanOrEqual(2)
    expect(gren).toContain("sentVia: 'gmail'")
    expect(gren).toContain("sentVia: 'resend'")
  })

  test('Gmail-pollern arkiverar ägarens skickade mejl som outbound i stället för att kasta dem', () => {
    const s = read('lib/gmail/processor.ts')
    const i = s.indexOf('isFromOwner(message, ownerEmail)')
    expect(i).toBeGreaterThan(-1)
    const gren = s.slice(i, i + 2200)
    expect(gren, 'ägarens mejl ska sparas, inte hoppas över').toContain("direction: 'outbound'")
    expect(gren).toContain("from('email_conversations')")
    // Dedup på gmail_message_id även för outbound.
    expect(gren).toContain('gmail_message_id')
    // Inga automations-events för utgående — de ska reagera på KUNDENS mejl.
    expect(gren).not.toContain('fireEvent')
  })
})

test.describe('fynd 2+5: resolvern läser äntligen e-post OCH portal-tråden', () => {
  const RESOLVER = 'lib/matte/resolver.ts'

  test('e-posthistorik hämtas ur email_conversations för e-postnycklade uppslag', () => {
    const s = read(RESOLVER)
    expect(s).toContain("from('email_conversations')")
    const i = s.indexOf("from('email_conversations')")
    const gren = s.slice(Math.max(0, i - 300), i + 500)
    expect(gren).toContain('!isPhone')
    expect(gren).toContain("eq('from_email', cleanFrom)")
  })

  test('portal-tråden (customer_message) hämtas för kända kunder', () => {
    const s = read(RESOLVER)
    expect(s).toContain("from('customer_message')")
  })

  test('alla tre kanaler sammanflätas kronologiskt i conversationHistory', () => {
    const s = read(RESOLVER)
    expect(s).toContain("channel: 'sms' as const")
    expect(s).toContain("channel: 'email' as const")
    expect(s).toContain("channel: 'portal' as const")
    // Kronologisk sortering av den sammanslagna listan.
    expect(s).toMatch(/\.sort\(\(a, b\) => new Date\(a\.timestamp\)\.getTime\(\) - new Date\(b\.timestamp\)\.getTime\(\)\)/)
    // Typen deklarerar portal-kanalen — inte bara implementationen.
    expect(s).toContain("channel: 'sms' | 'email' | 'portal'")
  })
})

test.describe('fynd 6: Postmark-inkommande arkiveras i sin helhet FÖRE klassificering', () => {
  test('hela brödtexten skrivs till email_conversations innan Stage 1 får avgöra', () => {
    const s = read('app/api/email/inbound/route.ts')
    const arkivering = s.indexOf("from('email_conversations')")
    const stage1 = s.indexOf('isLikelyLead(')
    expect(arkivering, 'arkiveringen saknas').toBeGreaterThan(-1)
    expect(stage1).toBeGreaterThan(-1)
    // Ordningen är poängen: arkivera FÖRST, klassificera SEN — ett felklassat
    // kundmejl ska gå att hitta i efterhand.
    expect(arkivering, 'arkiveringen måste ske FÖRE Stage 1-klassificeringen').toBeLessThan(stage1)
  })

  test('arkiveringen dedupar på Postmark-MessageID och är best-effort', () => {
    const s = read('app/api/email/inbound/route.ts')
    const i = s.indexOf('pm_${payload.MessageID}')
    expect(i, 'dedup-id:t saknas').toBeGreaterThan(-1)
    const gren = s.slice(Math.max(0, i - 500), i + 1800)
    expect(gren).toContain('maybeSingle()')
    expect(gren).toContain('catch')
  })
})

test.describe('fynd 4: kundtidslinjen är nu en komplett kommunikationslogg', () => {
  const TIMELINE = 'app/api/customers/[id]/timeline/route.ts'

  test('samtal och möten (call_recording) finns med', () => {
    const s = read(TIMELINE)
    expect(s).toContain("from('call_recording')")
    expect(s).toContain("'meeting_recorded'")
    expect(s).toContain("'call_recorded'")
  })

  test('e-post (email_conversations) finns med, båda riktningar', () => {
    const s = read(TIMELINE)
    expect(s).toContain("from('email_conversations')")
    expect(s).toContain("'email_sent'")
    expect(s).toContain("'email_received'")
  })

  test('portal-tråden (customer_message) finns med', () => {
    const s = read(TIMELINE)
    expect(s).toContain("from('customer_message')")
    expect(s).toContain("'portal_message_sent'")
    expect(s).toContain("'portal_message_received'")
  })

  test('utgående SMS läses ur sms_log och speglade konversationsrader dedupliceras', () => {
    const s = read(TIMELINE)
    const i = s.indexOf("from('sms_log')")
    expect(i, 'sms_log-sektionen saknas').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 900)
    expect(gren).toContain("eq('direction', 'outbound')")
    expect(gren).toContain('related_id')
    expect(gren).not.toContain(".lt('sent_at'")
    expect(s).toContain("event.metadata.source === 'sms_log'")
    expect(s).toContain("event.metadata.role !== 'assistant'")
  })

  test('offertöppningar (quote_tracking_events) finns med, tenant-filtrerade', () => {
    const s = read(TIMELINE)
    const i = s.indexOf("from('quote_tracking_events')")
    expect(i).toBeGreaterThan(-1)
    const gren = s.slice(i, i + 500)
    expect(gren).toContain("eq('business_id', businessId)")
    expect(gren).toContain("eq('event_type', 'opened')")
  })

  test('webbchatten (widget_conversation) matchas via besökarens telefon/e-post', () => {
    const s = read(TIMELINE)
    const i = s.indexOf("from('widget_conversation')")
    expect(i, 'widget-sektionen saknas').toBeGreaterThan(-1)
    const gren = s.slice(Math.max(0, i - 700), i + 600)
    expect(gren).toContain('visitor_phone')
    expect(gren).toContain('visitor_email')
    expect(gren).toContain("eq('business_id', businessId)")
  })
})

test.describe('fynd 9: intent-agentens historik är inte längre 80-teckens-stympad', () => {
  test('trunkeringen höjd till 300 tecken och kanalen visas per rad', () => {
    const s = read('lib/matte/intent-agent.ts')
    expect(s).not.toContain('m.body.slice(0, 80)')
    expect(s).toContain('m.body.slice(0, 300)')
    expect(s).toContain('${m.channel}')
  })
})
