/**
 * Facit: utgående kommunikation säger sanningen (Etapp 0 i
 * docs/audits/OUTBOUND_COMMUNICATION_INVENTORY.md, 2026-08-27).
 *
 * Fynden som stängs:
 *   8.1 server-side fetch mot den sessions-grindade /api/sms/send → 401,
 *       medan anroparen räknade "skickat"
 *   8.2 V3 send_email mot /api/email/send (finns inte); tool-routerns
 *       interna executor mot /api/quotes/{id}/send och /api/invoices/{id}/send
 *       (finns inte)
 *   8.4 /api/push/send utan auth; "0 mottagare" rapporterat som success
 *   8.5/8.6 Smart Communications dubblerande setTimeout-SMS efter offert/faktura
 *
 *   npx playwright test tests/facit-outbound-truth.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p, out) }
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p)
  }
  return out
}

// Server-side anrop till /api/sms/send som ÄR legitima: de forwardar
// användarens cookie (har en session att forwarda) — eller är klientkod.
const SMS_FETCH_ALLOWLIST = new Set([
  'app/api/jobbuddy/actions/route.ts',        // forwardar cookie
  'app/api/sms/conversations/route.ts',       // forwardar cookie
  'app/api/approvals/[id]/route.ts',          // forwardHeaders()
  'lib/sms/site-visit-confirm.ts',            // klienthjälpare (relativ URL i webbläsaren)
  'lib/sms-send.ts',                          // strypunkten själv (kommentar)
])

test.describe('8.1 — inga sessionslösa serveranrop till /api/sms/send', () => {
  test('varje server-side fetch mot /api/sms/send är allowlistad (forwardar cookie) — resten går genom sendSmsViaElks', () => {
    const files = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app', 'api'))]
    const offenders: string[] = []
    for (const f of files) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/')
      const src = fs.readFileSync(f, 'utf8')
      if (!/fetch\([^)]*\/api\/sms\/send/.test(src)) continue
      if (SMS_FETCH_ALLOWLIST.has(rel)) continue
      offenders.push(rel)
    }
    expect(offenders, `server-side fetch mot /api/sms/send utan session (401): ${offenders.join(', ')}`).toEqual([])
  })

  test('de tidigare trasiga vägarna läser strypunktens resultat', () => {
    for (const f of [
      'lib/booking-reminders.ts',
      'lib/matte/action-executor.ts',
      'lib/projects/auto-invoice-on-complete.ts',
      'lib/projects/create-from-lead.ts',
      'lib/projects/create-from-quote.ts',
      'app/api/invoices/[id]/status/route.ts',
      'app/api/projects/[id]/milestones/route.ts',
      'app/api/quotes/accept/route.ts',
    ]) {
      const s = read(f)
      expect(s, `${f} går inte genom sendSmsViaElks`).toContain('sendSmsViaElks({')
      expect(s, `${f} läser inte resultatet`).toMatch(/\.success/)
    }
    // booking-reminders räknar bara verkligt skickade
    expect(read('lib/booking-reminders.ts')).toContain('if (r.success) sent++')
  })
})

test.describe('8.2 — inga anrop till rutter som inte finns', () => {
  test('/api/email/send anropas inte; V3 send_email går via e-postkärnan och läser resultatet', () => {
    const s = read('lib/automation-engine.ts')
    expect(s).not.toContain('/api/email/send')
    const fn = s.slice(s.indexOf('async function handleSendEmail'), s.indexOf('async function handleRunAgent'))
    expect(fn).toContain("await import('@/lib/email')")
    expect(fn).toContain('if (!result.success) return { success: false')
  })

  test('tool-routerns interna executor: SMS via strypunkten, faktura via sändkärnan, send_quote OCH create_booking fail-closed', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    expect(s).not.toMatch(/api\/quotes\/\$\{[^}]+\}\/send/)
    expect(s).not.toMatch(/api\/invoices\/\$\{[^}]+\}\/send/)
    // create_booking borttagen 2026-09-02: dess exec-gren gjorde en
    // osessionerad fetch mot en sessions-grindad rutt (samma 401-mönster
    // send_quote/send_invoice redan fixades för), OCH — separat skäl —
    // require_approval_create_booking ska betyda en människa ser kortet,
    // inte att modellen själv får gissa risknivå och exekvera direkt.
    expect(s).toContain("const INTERNAL_EXEC_TYPES = new Set(['send_sms', 'send_invoice'])")
    const fn = s.slice(s.indexOf('async function executeApprovalPayloadInternal'))
    expect(fn.slice(0, 2500)).toContain('sendSmsViaElks({')
    expect(fn.slice(0, 2500)).toContain("await import('@/lib/invoices/send-invoice')")
    // Grenen för create_booking ska vara borta helt, inte bara ur mängden —
    // annars kan den råka återinföras utan att någon märker det.
    expect(fn.slice(0, 2500)).not.toContain("case 'create_booking'")
  })

  test('create_booking har en riktig kodgrind mot require_approval_create_booking, inte bara prompt-text', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const fn = s.slice(s.indexOf('async function createBooking'), s.indexOf('async function bookSiteVisitTool'))
    expect(fn).toContain("select('require_approval_create_booking')")
    expect(fn).toContain('automationSettings?.require_approval_create_booking')
    // Fail-closed vid frågefel (adversariell granskning 2026-09-02): data:null
    // vid ett riktigt DB-fel ser likadant ut som "ingen rad finns" om man
    // bara läser data — måste kolla error separat och blockera, inte anta
    // false och falla igenom till en obevakad insert.
    expect(fn).toContain('error: automationSettingsError')
    expect(fn).toContain('if (automationSettingsError)')
    const preGate = fn.slice(0, fn.indexOf('if (automationSettings?.require_approval_create_booking)'))
    expect(preGate.slice(preGate.indexOf('if (automationSettingsError)'))).toContain('success: false')
    // När grindad: en pending_approvals-rad, ALDRIG en direkt insert i booking,
    // och funktionen måste faktiskt RETURNERA — annars faller koden igenom
    // och skapar bokningen ändå trots att den redan köats för godkännande.
    const gated = fn.slice(fn.indexOf('if (automationSettings?.require_approval_create_booking)'), fn.indexOf("const bookingId = generateId('book')"))
    expect(gated).toContain("approval_type: 'create_booking'")
    expect(gated).toContain("status: 'pending'")
    expect(gated).toContain("risk_level: 'high'")
    expect(gated).not.toContain(".from('booking').insert")
    expect(gated).toContain('return {')
    expect(gated).toContain('deferred: true')

    // Nyttolasten måste vara EXAKT vad POST /api/bookings destrukturerar ur
    // sin body — annars misslyckas varje godkänd bokning tyst vid utförande
    // (hantverkaren klickar Godkänn, tror det funkade, inget händer).
    const bookingsRoute = read('app/api/bookings/route.ts')
    const destructureLine = bookingsRoute.slice(
      bookingsRoute.indexOf('export async function POST'),
      bookingsRoute.indexOf('export async function POST') + 1000,
    )
    for (const field of ['customer_id', 'scheduled_start', 'scheduled_end', 'notes', 'service_type']) {
      expect(destructureLine).toContain(field)
      expect(gated).toContain(`${field}:`)
    }
  })
})

test.describe('8.4 — push är signerad och ärlig', () => {
  test('/api/push/send kräver intern signatur eller session som äger business_id', () => {
    const s = read('app/api/push/send/route.ts')
    expect(s).toContain('verifyCronSecret(request)')
    expect(s).toContain('business.business_id !== business_id')
    expect(s).toContain("{ error: 'Unauthorized' }, { status: 401 }")
  })

  test('varje server-side push-anrop skickar internalPushHeaders()', () => {
    const files = [...walk(path.join(ROOT, 'lib')), ...walk(path.join(ROOT, 'app', 'api'))]
    const offenders: string[] = []
    for (const f of files) {
      const rel = path.relative(ROOT, f).replace(/\\/g, '/')
      if (rel === 'app/api/push/send/route.ts' || rel === 'lib/notifications/push-internal.ts') continue
      const src = fs.readFileSync(f, 'utf8')
      const re = /fetch\(`\$\{[^`]*\}\/api\/push\/send`,\s*\{[\s\S]{0,400}?headers:\s*([^\n]+)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(src))) {
        if (!m[1].includes('internalPushHeaders()')) offenders.push(`${rel}: ${m[1].trim()}`)
      }
    }
    expect(offenders, 'push-anrop utan intern signatur').toEqual([])
  })

  test('helpern använder den header verifyCronSecret faktiskt läser (x-cron-secret)', () => {
    expect(read('lib/notifications/push-internal.ts')).toContain("'x-cron-secret': process.env.CRON_SECRET || ''")
    expect(read('lib/cron/verify-secret.ts')).toContain("request.headers.get('x-cron-secret')")
  })

  test('V3 notify_owner räknar inte "0 mottagare" som levererat', () => {
    const s = read('lib/automation-engine.ts')
    const fn = s.slice(s.indexOf('async function handleNotifyOwner'), s.indexOf('async function handleRejectLead'))
    expect(fn).toContain('sendInternalPush(')
    expect(fn).toContain('if (!push.delivered) return { success: false')
  })
})

test.describe('8.5/8.6 — inga dubblerande legacy-utskick efter offert/faktura', () => {
  test('quotes/send och send-invoice triggar inte längre Smart Communication', () => {
    expect(read('app/api/quotes/send/route.ts')).not.toMatch(/event:\s*'quote_sent'[\s\S]{0,200}triggerEventCommunication|triggerEventCommunication\([\s\S]{0,200}event:\s*'quote_sent'/)
    expect(read('lib/invoices/send-invoice.ts')).not.toContain("event: 'invoice_sent'")
  })
})
