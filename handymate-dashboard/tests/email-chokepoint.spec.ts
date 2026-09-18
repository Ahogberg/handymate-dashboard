/**
 * Facit: e-post har EN strypunkt — lib/email.ts (Spår 2, 2026-09-18).
 *
 * Felet som stängs: `sendEmail()` fanns, men elva andra ställen ringde Resend
 * själva — sju via SDK:n (`new Resend(...).emails.send`), fyra via rå
 * `fetch('https://api.resend.com/emails')`. Följden var att fakturamejl,
 * offertmejl, portalnotiser, teaminbjudningar, lösenordsåterställning,
 * partnermejl och agentens egna utskick gick förbi kanalkontrollen
 * (`gateChannel`), förbi H3b-löftet, förbi `markCustomerContacted` — och nu
 * även förbi leveranskvittot, eftersom ingen rad bar Resend-id:t.
 *
 * Samma idiom som tests/sms-quota-chokepoint.spec.ts: ren källskanning, ingen
 * mockning. En ny direktväg till Resend gör testet rött samma dag den skrivs.
 *
 * Körs: npx playwright test tests/email-chokepoint.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')

/**
 * De ENDA filer som får nå Resend direkt, med skäl.
 *
 * Varje rad här är en skuld. Läggs en rad till ska skälet stå i samma mening.
 */
const UNDANTAG: Record<string, string> = {
  // Strypunkten själv. Det är hit allt annat pekar.
  'lib/email.ts': 'strypunkten',
  // Diagnostikrutten vars HELA syfte är att pröva providervägen rå, så att
  // Andreas kan se om det är Gmail eller Resend som är trasigt. Den skickar
  // aldrig utan uttryckligt anrop och grindas av dry_run
  // (tests/facit-inga-testmejl.spec.ts).
  'app/api/debug/mail/route.ts': 'diagnostik som måste pröva providern rå',
  // Läser domänlistan (api.resend.com/domains) för kanalkontrollen — skickar
  // ingenting. Att gå genom strypunkten för en GET vore cirkulärt.
  'lib/channels/preflight.ts': 'läser domäner, skickar aldrig',
  'lib/launch/preflight.ts': 'läser domäner, skickar aldrig',
}

/** Alla .ts/.tsx under app/ och lib/, testmappen undantagen. */
function källfiler(): string[] {
  const ut: string[] = []
  const gå = (dir: string) => {
    for (const post of fs.readdirSync(dir, { withFileTypes: true })) {
      if (post.name === 'node_modules' || post.name.startsWith('.')) continue
      const p = path.join(dir, post.name)
      if (post.isDirectory()) gå(p)
      else if (/\.tsx?$/.test(post.name)) ut.push(path.relative(ROOT, p))
    }
  }
  for (const rot of ['app', 'lib', 'components']) gå(path.join(ROOT, rot))
  return ut
}

const FILER = källfiler()
const INNEHALL = new Map(FILER.map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]))

function träffar(mönster: RegExp): string[] {
  return FILER.filter(f => mönster.test(INNEHALL.get(f)!) && !(f in UNDANTAG))
}

test.describe('E-poststrypunkten', () => {
  test('ingen fil utanför lib/email.ts anropar resend.emails.send', () => {
    expect(träffar(/\.emails\.send\s*\(/)).toEqual([])
  })

  test('ingen fil utanför undantagen instansierar Resend-SDK:n', () => {
    expect(träffar(/new Resend\s*\(/)).toEqual([])
  })

  test('ingen fil utanför undantagen postar mot api.resend.com/emails', () => {
    expect(träffar(/https:\/\/api\.resend\.com\/emails/)).toEqual([])
  })

  test('undantagslistan växer inte tyst — exakt fyra filer, alla med skäl', () => {
    expect(Object.keys(UNDANTAG).sort()).toEqual([
      'app/api/debug/mail/route.ts',
      'lib/channels/preflight.ts',
      'lib/email.ts',
      'lib/launch/preflight.ts',
    ])
    for (const [fil, skäl] of Object.entries(UNDANTAG)) {
      expect(fs.existsSync(path.join(ROOT, fil)), `${fil} finns inte längre — städa undantaget`).toBe(true)
      expect(skäl.length).toBeGreaterThan(5)
    }
  })

  test('de elva flyttade anroparna går genom sendEmail', () => {
    const flyttade = [
      'lib/invoices/send-invoice.ts',
      'app/api/team/invite/route.ts',
      'app/api/team/[id]/resend-invite/route.ts',
      'app/api/orders/send/route.ts',
      'lib/partners/agreement.ts',
      'app/api/admin/partners/route.ts',
      'app/api/admin/partners/[id]/approve/route.ts',
      'app/api/partners/register/route.ts',
      'app/api/quotes/send/route.ts',
      'app/api/agent/trigger/tool-router.ts',
      'lib/auth/password-reset-email.ts',
      'lib/portal/notification-emails.ts',
    ]
    const utan = flyttade.filter(f => !/sendEmail\s*\(/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')))
    expect(utan).toEqual([])
  })

  test('strypunkten loggar Resend-id:t — utan det har leveranskvittot inget att uppdatera', () => {
    const src = INNEHALL.get('lib/email.ts')!
    // Kolumnen måste bära det FAKTISKA id:t, inte bara finnas i objektet.
    expect(src).toContain('provider_message_id: params.messageId')
    expect(src).toContain('messageId: data.id')
    // Loggningen sker EFTER att Resend gett ett id, aldrig i förväg.
    const idKollen = src.indexOf("typeof data.id !== 'string'")
    const loggningen = src.indexOf('await logEmail({')
    expect(idKollen).toBeGreaterThan(-1)
    expect(loggningen).toBeGreaterThan(idKollen)
  })

  test('Gmail-vägen returnerar message-id, inte bara en boolean', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/gmail-send.ts'), 'utf8')
    const start = src.indexOf('export async function sendViaGmail(')
    expect(start).toBeGreaterThan(-1)
    const returtyp = src.slice(src.indexOf('): Promise<', start), src.indexOf('): Promise<', start) + 40)
    expect(returtyp).toContain('Promise<GmailSandResultat>')
    expect(src).toMatch(/messageId\?:\s*string/)
    // Den gamla boolean-returen är borta ur sendViaGmail — id:t kastas inte bort.
    expect(returtyp).not.toContain('Promise<boolean>')
  })
})
