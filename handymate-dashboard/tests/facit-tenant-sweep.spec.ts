/**
 * Facit: tenant-svepet av rutterna utanför standardgrinden (2026-09-01).
 *
 * Bakgrund: 554 API-rutter, 449 anropar getAuthenticatedBusiness. De
 * övriga granskades en och en (tre parallella granskningar, se
 * docs/audits/TENANT_SWEEP_2026-09-01.md). Det här facitet låser
 * FIXARNA — inte inventeringen (den ligger i
 * tests/facit-route-auth-inventory.spec.ts):
 *
 *  - reminders + karin-deadlines använder verifyCronSecret (hårdkodad
 *    reservhemlighet / "Bearer undefined" borta)
 *  - Google OAuth-state är HMAC-signerad, tidsbegränsad och callbacken
 *    kräver session som matchar
 *  - Google Calendar-webhooken kräver kanaltoken (eller resource-id för
 *    legacykanaler)
 *  - quotes/track kräver sign_token för varje skrivning; alla tre
 *    pixelgeneratorer skickar med det
 *  - publika skrivvägar har FAIL-CLOSED rate limit
 *  - ÄTA-signering är atomisk, fältrapportens reject är engångs,
 *    inbjudan utan utgångsdatum är utgången, Swish-QR validerar
 *
 * Körs: npx playwright test tests/facit-tenant-sweep.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { signOAuthState, verifyOAuthState, GOOGLE_OAUTH_STATE_TTL_MS } from '../lib/google/oauth-state'
import { calendarChannelToken, calendarChannelTokenMatches } from '../lib/google/channel-token'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

test.describe('cron-hemligheten — inga egna jämförelser kvar', () => {
  for (const f of ['app/api/reminders/route.ts', 'app/api/cron/karin-deadlines/route.ts']) {
    test(`${f} använder verifyCronSecret`, () => {
      const src = read(f)
      expect(src).toContain("from '@/lib/cron/verify-secret'")
      expect(src).toContain('verifyCronSecret(request)')
      expect(src).not.toMatch(/\|\|\s*'handymate-cron-secret'/)
      expect(src).not.toMatch(/!==\s*`Bearer \$\{process\.env\.CRON_SECRET\}`/)
    })
  }

  test('ingen rutt i app/api jämför mot `Bearer ${process.env.CRON_SECRET}` eller har en reserv-hemlighet', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) walk(p, out)
        else if (e.name === 'route.ts') out.push(p)
      }
      return out
    }
    // Bara JÄMFÖRELSER (===/!==) mot mallsträngen räknas — utgående
    // Authorization-headers till 46elks/OpenAI/egna crons är legitima.
    const bad = walk(path.join(ROOT, 'app', 'api'))
      .filter(f => {
        const s = fs.readFileSync(f, 'utf8')
        return /[!=]==\s*`Bearer \$\{process\.env\.[A-Z_]+\}`/.test(s) || /CRON_SECRET\s*\|\|\s*'[^']+'/.test(s)
      })
      .map(f => path.relative(ROOT, f))
    expect(bad).toEqual([])
  })
})

test.describe('Google OAuth-state', () => {
  const env = { GOOGLE_CLIENT_SECRET: 'test-secret' }

  test('signerar och verifierar rundtur', () => {
    const s = signOAuthState({ business_id: 'biz_a', user_id: 'bu_1', timestamp: 1_000_000 }, env)
    const v = verifyOAuthState(s, env, 1_000_000 + 60_000)
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.state).toEqual({ business_id: 'biz_a', user_id: 'bu_1', timestamp: 1_000_000 })
  })

  test('manipulerad payload avvisas (bad_signature)', () => {
    const s = signOAuthState({ business_id: 'biz_a', user_id: 'bu_1', timestamp: 1_000_000 }, env)
    const [payload, sig] = s.split('.')
    const forged = Buffer.from(JSON.stringify({ business_id: 'biz_offer', user_id: 'bu_1', timestamp: 1_000_000 })).toString('base64url')
    expect(verifyOAuthState(`${forged}.${sig}`, env, 1_000_000)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verifyOAuthState(payload, env, 1_000_000)).toEqual({ ok: false, reason: 'malformed' })
  })

  test('gammal base64-JSON-state (det gamla formatet) avvisas', () => {
    const legacy = Buffer.from(JSON.stringify({ business_id: 'biz_a', user_id: 'bu_1', timestamp: Date.now() })).toString('base64')
    expect(verifyOAuthState(legacy, env).ok).toBe(false)
  })

  test('utgången efter TTL, annan hemlighet avvisas, ingen hemlighet = no_secret', () => {
    const s = signOAuthState({ business_id: 'biz_a', user_id: 'bu_1', timestamp: 1_000_000 }, env)
    expect(verifyOAuthState(s, env, 1_000_000 + GOOGLE_OAUTH_STATE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' })
    expect(verifyOAuthState(s, { GOOGLE_CLIENT_SECRET: 'annan' }, 1_000_000)).toEqual({ ok: false, reason: 'bad_signature' })
    expect(verifyOAuthState(s, {}, 1_000_000)).toEqual({ ok: false, reason: 'no_secret' })
  })

  test('connect signerar, callback verifierar OCH kräver matchande session', () => {
    expect(read('app/api/google/connect/route.ts')).toContain('signOAuthState({')
    const cb = read('app/api/google/callback/route.ts')
    expect(cb).toContain('verifyOAuthState(stateParam)')
    expect(cb).toContain('sessionBusiness.business_id !== state.business_id')
    expect(cb).not.toMatch(/JSON\.parse\(Buffer\.from\(stateParam/)
    // refresh_token skrivs bara när Google gav ett nytt.
    expect(cb).toContain('...(hasNewRefreshToken ? { google_refresh_token: tokens.refresh_token } : {})')
  })
})

test.describe('Google Calendar-webhooken', () => {
  const env = { CRON_SECRET: 'cron' }

  test('kanaltoken härleds ur kanal-id + hemlighet och verifieras i konstant tid', () => {
    const t = calendarChannelToken('hm-biz-abc', env)
    expect(t).toBeTruthy()
    expect(calendarChannelTokenMatches('hm-biz-abc', t, env)).toBe(true)
    expect(calendarChannelTokenMatches('hm-biz-abc', t + 'x', env)).toBe(false)
    expect(calendarChannelTokenMatches('hm-biz-annan', t, env)).toBe(false)
    expect(calendarChannelTokenMatches('hm-biz-abc', null, env)).toBe(false)
    expect(calendarChannelToken('hm-biz-abc', {})).toBeNull()
  })

  test('registreringen skickar token, webhooken kräver den (legacy bara på resource-id)', () => {
    expect(read('lib/google-calendar-watch.ts')).toMatch(/token: calendarChannelToken\(channelId\)!/)
    const wh = read('app/api/webhooks/google-calendar/route.ts')
    expect(wh).toContain("request.headers.get('x-goog-channel-token')")
    expect(wh).toContain('calendarChannelTokenMatches(channelId, presentedToken)')
    expect(wh).toContain('resourceId === watch.resource_id')
    expect(wh).toContain("status: 401")
  })
})

test.describe('quotes/track kräver sign_token', () => {
  test('GET och POST slår upp offerten på quote_id + sign_token och klampar duration', () => {
    const src = read('app/api/quotes/track/route.ts')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect((src.match(/\.eq\('sign_token', signToken\)/g) || []).length).toBe(2)
    expect(src).toContain('if (!quoteId || !signToken)')
    expect(src).toContain('begransaDuration(')
  })

  test('alla tre pixelgeneratorer skickar med t=', () => {
    expect(read('app/api/quotes/send/route.ts')).toContain('&t=${encodeURIComponent(signToken)}')
    const page = read('app/quote/[token]/page.tsx')
    expect(page).toContain('&t=${encodeURIComponent(token)}')
    expect(page).toContain('signToken: token,')
    expect(read('app/portal/[token]/components/PortalQuoteSigningModal.tsx')).toContain('&t=${encodeURIComponent(quote.sign_token)}')
  })
})

test.describe('publika skrivvägar har fail-closed rate limit', () => {
  test('checkPublicRateLimitDb nekar vid RPC-fel', () => {
    const src = read('lib/rate-limit-db.ts')
    const fn = src.slice(src.indexOf('export async function checkPublicRateLimitDb'))
    expect(fn).toMatch(/DENYING request[\s\S]*allowed: false/)
    expect((fn.match(/allowed: false/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(src).toContain('export function hashClientIp')
  })

  for (const [f, key] of [
    ['app/api/portal/[token]/messages/route.ts', 'portal-messages:customer:'],
    ['app/api/lead-portal/[code]/route.ts', 'lead-portal:source:'],
    ['app/api/public/book/[slug]/route.ts', 'public-book:ip:'],
    ['app/api/quotes/public/[token]/route.ts', 'quote-public-action:'],
    ['app/api/storefront/track/route.ts', 'storefront-track:ip:'],
    ['app/api/partners/register/route.ts', 'partners-register:ip:'],
    ['app/api/leads/intake/route.ts', 'leads-intake:ip:'],
    ['app/api/storefront/contact/route.ts', 'storefront-contact:ip:'],
    ['app/api/widget/chat/route.ts', ''],
    ['app/api/referral-lead/route.ts', 'referral-lead:ip:'],
    ['app/api/partners/validate/route.ts', ''],
  ] as const) {
    test(`${f} använder checkPublicRateLimitDb`, () => {
      const src = read(f)
      expect(src).toContain('checkPublicRateLimitDb(')
      expect(src).not.toMatch(/\bcheckRateLimitDb\(/)
      if (key) expect(src).toContain(key)
    })
  }

  test('offertfrågor/bokningsönskemål begränsas FÖRE de skapar kort', () => {
    const src = read('app/api/quotes/public/[token]/route.ts')
    const rate = src.indexOf("if (action === 'request_booking' || action === 'question')")
    const booking = src.indexOf("if (action === 'request_booking') {")
    const question = src.indexOf("if (action === 'question') {")
    expect(rate).toBeGreaterThan(0)
    expect(booking).toBeGreaterThan(rate)
    expect(question).toBeGreaterThan(rate)
  })

  test('leadportalens GET är fönstrad och företagsfiltrerad', () => {
    const src = read('app/api/lead-portal/[code]/route.ts')
    expect(src).toContain(".eq('business_id', source.business_id)")
    expect(src).toContain('.limit(LEAD_PORTAL_MAX_ROWS)')
    expect(src).toContain("gte('created_at', sedan)")
  })
})

test.describe('engångs- och atomicitetsguarder', () => {
  test('ÄTA: villkorad UPDATE + radräkning för både sign och decline', () => {
    const src = read('app/api/ata/sign/[token]/route.ts')
    expect((src.match(/\.not\('status', 'in', '\("signed","declined"\)'\)/g) || []).length).toBe(2)
    expect(src).toContain('if (!declinedRows || declinedRows.length === 0)')
    expect(src).toContain('if (!signedRows || signedRows.length === 0)')
  })

  test('fältrapport: reject är engångs och texter är begränsade', () => {
    const src = read('app/api/field-reports/[id]/sign/route.ts')
    expect(src).toContain("if (report.status === 'rejected')")
    expect(src).toContain('signed_by.length > 120')
    expect(src).toContain('customer_note.length > 1000')
  })

  test('inbjudan utan utgångsdatum är utgången', () => {
    expect(read('app/api/invite/[token]/accept/route.ts')).toContain('if (!invite.invite_expires_at || new Date(invite.invite_expires_at) < new Date())')
  })

  test('Swish-QR validerar nummer, belopp och meddelande', () => {
    const src = read('app/api/swish-qr/route.ts')
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain('normaliseraSwishNummer(')
    expect(src).toContain('SWISH_AMOUNT_MAX_SEK')
    expect(src).toContain('SWISH_MESSAGE_RE.test(message)')
  })

  test('voice/greeting kräver 46elks-signatur och svarar inte på oskyddad GET', () => {
    const src = read('app/api/voice/greeting/route.ts')
    expect(src).toContain('verifyElksSignature(req, text)')
    expect(src).toMatch(/export async function GET[\s\S]*ELKS_SKIP_SIGNATURE[\s\S]*status: 401/)
  })

  test('portalen filtrerar customer_message och projektbarn på business_id', () => {
    expect(read('app/api/portal/[token]/route.ts')).toMatch(/from\('customer_message'\)[\s\S]*?\.eq\('business_id', customer\.business_id\)/)
    expect(read('app/api/portal/[token]/activity/route.ts')).toMatch(/from\('customer_message'\)[\s\S]*?\.eq\('business_id', customer\.business_id\)/)
    expect(read('app/api/portal/[token]/messages/route.ts')).toMatch(/\.update\(\{ read_at[\s\S]*?\.eq\('business_id', customer\.business_id\)/)
  })

  test('auth/register genererar business_id kryptografiskt; inbound-mejl faller bara tillbaka vid saknat schema', () => {
    const reg = read('app/api/auth/register/route.ts')
    expect(reg).toContain("randomBytes(9)")
    expect(reg).not.toMatch(/const businessId = 'biz_' \+ Math\.random/)
    const inbound = read('app/api/email/inbound/route.ts')
    expect(inbound).toContain('if (arSchemaSaknas(err))')
    expect(inbound).toMatch(/avvisar utan fallback[\s\S]*?return null/)
  })
})
