/**
 * Facit: Starttiden — signatur i soffan till "Bokat" i telefonen
 * (docs/audits/WOW_GENOMLYSNING_2026-09-05.md, "2. A. Starttiden").
 *
 * ═══ FELET SOM VAKTAS ═══
 *
 * app/api/quotes/public/[token]/route.ts skapade vid action 'request_booking'
 * ett pending_approvals-kort av typ new_booking_request med texten "Bekräfta
 * så läggs den i kalendern" — men executorn (app/api/approvals/[id]/route.ts,
 * det delade `propose_booking_times`/`reschedule_request`/
 * `new_booking_request`-caset) läste `pl.customer_reply_pending` och
 * `pl.entity?.phone`, som inte finns i den payloaden, och returnerade tyst
 * `{skipped:'no message or phone'}`. Godkännandet gjorde alltså ingenting.
 * `buildPushTemplate` saknade typen helt, så kortet pushade aldrig heller.
 *
 * Den här filen låser källkontraktet (källskanning, kommentarer strippade)
 * för fixen: en egen gren för source:'quote_signing', bokning FÖRE SMS,
 * inget SMS vid bokningsfel, ett SMS-fel klassas ALDRIG som ett misslyckat
 * godkännande, idempotensuppslag FÖRE POST, en riktig pushmall — plus rena
 * enhetstester för de delar som går att köra utan nätverk/DB.
 *
 * Körs: npx playwright test tests/starttid-loop.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { classifyExecutionResult } from '../lib/approvals/execution-outcome'
import { buildPushTemplate } from '../lib/notifications/approval-push'
import { PUSH_KLASS_PER_TYP } from '../lib/notifications/push-policy'
import { approveLabel } from '../lib/jarvis/approval-view'
import { buildValueReceipt, RECEIPT_APPROVAL_TYPES } from '../lib/approvals/value-receipt'
import { buildBookingConfirmationSms } from '../lib/bookings/confirmation-sms'
import { formatRequestedDateShort } from '../lib/quotes/booking-suggestions'

const ROOT = path.resolve(__dirname, '..')

/** Läser en fil och strippar block-/radkommentarer, som approval-action-contract.spec.ts. */
function kallkod(rel: string): string {
  const raw = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(r => !r.trim().startsWith('//'))
    .join('\n')
}

const EXECUTOR_REL = 'app/api/approvals/[id]/route.ts'
const EXECUTOR = kallkod(EXECUTOR_REL)

/** Källan för bara executeQuoteSigningBooking-funktionskroppen. */
function executorFnKod(): string {
  const start = EXECUTOR.indexOf('async function executeQuoteSigningBooking(')
  expect(start, 'executeQuoteSigningBooking hittas inte i executorn').toBeGreaterThan(-1)
  // Funktionen är den sista hjälparen innan appUrl-kommentaren/switchen —
  // ett generöst men ändamålsenligt fönster räcker för ordningskontrollerna.
  return EXECUTOR.slice(start, start + 6000)
}

test.describe('quote_signing-grenen finns och nås', () => {
  test('det delade bokningscaset har en explicit gren för source:quote_signing', () => {
    const i = EXECUTOR.indexOf("case 'new_booking_request': {")
    expect(i, "case 'new_booking_request' saknas").toBeGreaterThan(-1)
    const gren = EXECUTOR.slice(i, i + 1500)
    expect(gren).toContain("pl.source === 'quote_signing'")
    expect(gren).toContain('executeQuoteSigningBooking(pl)')
  })

  test('gissningsvägen (no message or phone) nås ALDRIG för source:quote_signing — grenen ligger textmässigt före', () => {
    const i = EXECUTOR.indexOf("case 'new_booking_request': {")
    const gren = EXECUTOR.slice(i, i + 1500)
    const guardIdx = gren.indexOf("pl.source === 'quote_signing'")
    const gissningIdx = gren.indexOf('pl.customer_reply_pending')
    const skippedIdx = gren.indexOf("skipped: 'no message or phone'")
    expect(guardIdx).toBeGreaterThan(-1)
    expect(gissningIdx).toBeGreaterThan(-1)
    expect(skippedIdx).toBeGreaterThan(-1)
    // quote_signing-grenen returnerar (return-satsen finns mellan guarden
    // och gissningsraden) INNAN koden som läser customer_reply_pending/
    // entity.phone ens exekveras.
    const returnIdx = gren.indexOf('return await executeQuoteSigningBooking')
    expect(returnIdx).toBeGreaterThan(guardIdx)
    expect(returnIdx).toBeLessThan(gissningIdx)
    expect(gissningIdx).toBeLessThan(skippedIdx)
  })
})

test.describe('bokning FÖRE SMS, aldrig SMS vid bokningsfel', () => {
  test('idempotensuppslaget sker före POST /api/bookings', () => {
    const fn = executorFnKod()
    const idempotensIdx = fn.indexOf('hittaBefintligBokningForKort(')
    const postIdx = fn.indexOf('/api/bookings`, {')
    expect(idempotensIdx, 'idempotensuppslaget saknas').toBeGreaterThan(-1)
    expect(postIdx, 'POST /api/bookings saknas').toBeGreaterThan(-1)
    expect(idempotensIdx).toBeLessThan(postIdx)
  })

  test('POST /api/bookings sker textmässigt före sendSms', () => {
    const fn = executorFnKod()
    const postIdx = fn.indexOf('/api/bookings`, {')
    const smsIdx = fn.indexOf('await sendSms({')
    expect(postIdx).toBeGreaterThan(-1)
    expect(smsIdx, 'sendSms-anropet saknas').toBeGreaterThan(-1)
    expect(postIdx).toBeLessThan(smsIdx)
  })

  test('ett misslyckat bokningssvar returnerar innan sendSms nås', () => {
    const fn = executorFnKod()
    const postIdx = fn.indexOf('/api/bookings`, {')
    const failIdx = fn.indexOf('if (!r.ok) {', postIdx)
    const smsIdx = fn.indexOf('await sendSms({')
    expect(failIdx, 'felkollen efter POST saknas').toBeGreaterThan(postIdx)
    const failBlock = fn.slice(failIdx, failIdx + 200)
    expect(failBlock).toContain('return {')
    expect(failIdx).toBeLessThan(smsIdx)
  })

  test('cookie-forwarding + businessId följer med POST:en, precis som create_booking-caset', () => {
    const fn = executorFnKod()
    expect(fn).toContain('headers: forwardHeaders()')
    expect(fn).toContain('classifyResponse(res)')
  })
})

test.describe('SMS-fel klassas aldrig som ett misslyckat godkännande', () => {
  test('caset sätter explicit ok:true oavsett sms_sent', () => {
    const fn = executorFnKod()
    // De två retursatserna (utan telefon / efter sendSms) sätter båda ok:true.
    const matches = Array.from(fn.matchAll(/ok:\s*true/g))
    expect(matches.length, 'ok:true saknas i minst en retursats').toBeGreaterThanOrEqual(2)
    expect(fn).toContain('sms_sent: false')
    expect(fn).toContain('sms_sent: smsResult.sms_sent')
  })

  test('execution-outcome.ts har ett uttryckligt undantag för ok:true + sms_sent:false', () => {
    const src = kallkod('lib/approvals/execution-outcome.ts')
    expect(src).toContain("result.sms_sent === false && result.ok !== true")
  })

  test('enhetstest: {ok:true, sms_sent:false, booking_id} → success, inte failed', () => {
    const r = classifyExecutionResult({
      action: 'new_booking_request',
      ok: true,
      booking_id: 'book_123',
      sms_sent: false,
      sms_reason: 'Inget telefonnummer sparat på kunden',
    })
    expect(r.outcome).toBe('success')
    expect(r.error_text).toBeNull()
  })

  test('enhetstest: gamla regeln lever kvar för cases UTAN ok:true (send_sms m.fl.)', () => {
    const r = classifyExecutionResult({ action: 'send_sms', sms_sent: false })
    expect(r.outcome).toBe('failed')
  })

  test('enhetstest: ok:false vid ett faktiskt bokningsfel klassas fortfarande som failed', () => {
    const r = classifyExecutionResult({ action: 'new_booking_request', ok: false, error: 'HTTP 500' })
    expect(r.outcome).toBe('failed')
  })
})

test.describe('pushmall för new_booking_request', () => {
  test('finns en klass i PUSH_KLASS_PER_TYP', () => {
    expect(PUSH_KLASS_PER_TYP['new_booking_request']).toBe('beslut')
  })

  test('buildPushTemplate ger titel+kropp, även med tomt payload', () => {
    const mall = buildPushTemplate('new_booking_request', {})
    expect(mall).not.toBeNull()
    expect(mall!.title.length).toBeGreaterThan(0)
    expect(mall!.body).toContain('Bekräfta')
  })

  test('titeln nämner kunden och datumet när payloaden har dem', () => {
    const mall = buildPushTemplate('new_booking_request', {
      customer_name: 'Maria',
      requested_date: '2026-09-22',
    })
    expect(mall!.title).toContain('Maria')
    expect(mall!.title).toContain('vill börja')
  })
})

test.describe('approveLabel — "Boka {datum}"', () => {
  test('med requested_date i payloaden', () => {
    const label = approveLabel('new_booking_request', { requested_date: '2026-09-22' })
    expect(label.startsWith('Boka ')).toBe(true)
    expect(label).not.toBe('Godkänn')
  })

  test('utan requested_date faller tillbaka snyggt, kraschar aldrig', () => {
    const label = approveLabel('new_booking_request', {})
    expect(label).toBe('Boka')
  })
})

test.describe('kvittot', () => {
  test('RECEIPT_APPROVAL_TYPES och switchen är i synk (samma vakt som tests/value-receipt.spec.ts)', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/approvals/value-receipt.ts'), 'utf8')
    const switchStart = src.indexOf('switch (approval.approval_type)')
    const cases = Array.from(src.slice(switchStart).matchAll(/case '([a-z_]+)':/g)).map(m => m[1])
    expect(cases).toContain('new_booking_request')
    expect([...RECEIPT_APPROVAL_TYPES]).toContain('new_booking_request')
  })

  test('SMS-fel → "Bokad ... Kunden kunde inte nås per SMS — ring {nummer}"', () => {
    const kvitto = buildValueReceipt(
      { approval_type: 'new_booking_request', payload: { requested_date: '2026-09-22', customer_phone: '0701234567' } },
      { action: 'new_booking_request', ok: true, booking_id: 'book_1', sms_sent: false },
      'success',
    )
    expect(kvitto).not.toBeNull()
    expect(kvitto!.text).toContain('Kunden kunde inte nås per SMS')
    expect(kvitto!.text).toContain('0701234567')
  })

  test('lyckad SMS → ett kvitto utan "kunde inte nås"', () => {
    const kvitto = buildValueReceipt(
      { approval_type: 'new_booking_request', payload: { requested_date: '2026-09-22' } },
      { action: 'new_booking_request', ok: true, booking_id: 'book_1', sms_sent: true },
      'success',
    )
    expect(kvitto).not.toBeNull()
    expect(kvitto!.text).not.toContain('kunde inte nås')
    expect(kvitto!.link).toBe('/dashboard/bookings/book_1')
  })

  test('ingen bokning skapad (ok:false) → inget kvitto, aldrig ett påhittat "Bokad"', () => {
    const kvitto = buildValueReceipt(
      { approval_type: 'new_booking_request', payload: {} },
      { action: 'new_booking_request', ok: false, error: 'HTTP 500' },
      'failed',
    )
    expect(kvitto).toBeNull()
  })
})

test.describe('idempotens — aldrig två bokningar', () => {
  test('idempotensmärkningen skrivs in i booking.notes (verifierad kolumn) via samma idempotensMarkorFor som ÄTA/offert', () => {
    const src = kallkod('app/api/approvals/[id]/route.ts')
    const helperIdx = src.indexOf('async function hittaBefintligBokningForKort(')
    expect(helperIdx).toBeGreaterThan(-1)
    const helper = src.slice(helperIdx, helperIdx + 900)
    expect(helper).toContain(".from('booking')")
    expect(helper).toContain("ilike('notes'")
    expect(helper).toContain('idempotensMarkorFor(approvalId)')

    const fn = executorFnKod()
    expect(fn).toContain('idempotensMarkorFor(approvalId)')
  })

  test('en befintlig bokning hoppar över POST helt (befintlig-grenen sätter bookingId/scheduledStart utan fetch)', () => {
    const fn = executorFnKod()
    const befintligIdx = fn.indexOf('if (befintlig) {')
    const elseIdx = fn.indexOf('} else {', befintligIdx)
    expect(befintligIdx).toBeGreaterThan(-1)
    expect(elseIdx).toBeGreaterThan(befintligIdx)
    const befintligBlock = fn.slice(befintligIdx, elseIdx)
    expect(befintligBlock).not.toContain('/api/bookings')
  })
})

test.describe('projektkoppling utan quotes.project_id', () => {
  test('projektet slås upp via project.quote_id, inte quotes.project_id (kolumnen finns inte)', () => {
    const fn = executorFnKod()
    expect(fn).toContain(".from('project')")
    expect(fn).toContain("eq('quote_id', pl.quote_id)")
    expect(fn).not.toContain('quote.project_id')
  })

  test('bookings-routen accepterar och validerar project_id mot businessen (passthrough)', () => {
    const src = kallkod('app/api/bookings/route.ts')
    const i = src.indexOf('export async function POST(')
    const body = src.slice(i, i + 4000)
    expect(body).toContain('project_id')
    expect(body).toContain(".from('project')")
    expect(body).toContain("eq('business_id', business.business_id)")
  })
})

test.describe('SMS-texten (extraherad, återanvänd, tidszonskorrekt)', () => {
  test('buildBookingConfirmationSms används av både actions/route.ts och executorn', () => {
    expect(kallkod('app/api/actions/route.ts')).toContain('buildBookingConfirmationSms')
    expect(kallkod('app/api/approvals/[id]/route.ts')).toContain('buildBookingConfirmationSms')
  })

  test('visar svensk lokaltid explicit (Europe/Stockholm), inte serverns (UTC på Vercel)', () => {
    // 07:30 svensk sommartid (CEST, UTC+2) = 05:30 UTC. Utan explicit
    // timeZone hade en Vercel-server (UTC) visat "05:30" i SMS:et.
    const text = buildBookingConfirmationSms({
      customerName: 'Maria Andersson',
      businessName: 'Rörjour AB',
      assignedPhoneNumber: null,
      scheduledStart: '2026-06-22T05:30:00.000Z',
    })
    expect(text).toContain('07:30')
    expect(text).not.toContain('05:30')
    expect(text).toContain('Hej Maria!')
  })
})

test.describe('formatRequestedDateShort — delad datumetikett', () => {
  test('"mån 22 sep"-formen, veckodagen glider inte av tidszon', () => {
    const label = formatRequestedDateShort('2026-09-21') // en måndag
    expect(label).toContain('21')
    expect(label.toLowerCase()).toContain('mån')
  })
})

test.describe('kundtexten — "Veckor vi har utrymme att börja"', () => {
  test('app/quote/[token]/page.tsx använder den nya texten, inte "har vi ledigt"', () => {
    const src = fs.readFileSync(path.join(ROOT, 'app/quote/[token]/page.tsx'), 'utf8')
    expect(src).toContain('Veckor vi har utrymme att börja')
    expect(src).not.toContain('har vi ledigt')
    expect(src).toContain('preliminär tills dess')
  })

  test('PortalQuoteSigningModal.tsx speglar samma text', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'app/portal/[token]/components/PortalQuoteSigningModal.tsx'),
      'utf8',
    )
    expect(src).toContain('Veckor vi har utrymme att börja')
    expect(src).not.toContain('har vi ledigt')
    expect(src).toContain('preliminär tills dess')
  })
})

test.describe('facit-inkoppling', () => {
  // Inte "sist i listan": den invarianten blev röd så fort nästa pass kopplade
  // in sitt facit efter det här (driftlarm-saldo, kommunikation-installningar),
  // precis som autopilot-rapport.spec.ts och autopilot-utgang.spec.ts en gång
  // gjorde. Det som ska gälla är att specen körs i CI och lokalt — inte platsen.
  test('den här filen är kopplad i test:contracts (package.json)', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts['test:contracts'] as string).toContain('tests/starttid-loop.spec.ts')
  })

  test('den här filen är kopplad i .github/workflows/contracts.yml', () => {
    const yaml = fs.readFileSync(path.join(ROOT, '..', '.github', 'workflows', 'contracts.yml'), 'utf8')
    expect(yaml).toContain('tests/starttid-loop.spec.ts')
  })
})
