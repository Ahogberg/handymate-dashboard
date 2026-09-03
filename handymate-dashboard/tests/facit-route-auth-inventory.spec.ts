/**
 * Facit: inventeringen av API-rutter som INTE går genom getAuthenticatedBusiness
 * (tenant-svepet 2026-09-01, docs/audits/TENANT_SWEEP_2026-09-01.md).
 *
 * Varje rutt i app/api måste antingen
 *   (a) anropa getAuthenticatedBusiness, eller
 *   (b) bära en KÄND grind (cron-hemlighet, plattformsadmin, partner-token,
 *       leverantörssignatur, Supabase-session, ägarskapskontroll), eller
 *   (c) stå i PUBLIC_BY_DESIGN nedan med sin credential och motivering.
 *
 * En ny rutt som inte passar i (a) eller (b) fäller testet tills någon
 * fattar beslutet och skriver in den i (c). Listan är beslutet, inte en
 * beskrivning — samma princip som tests/permission-contract.spec.ts.
 *
 * Körs: npx playwright test tests/facit-route-auth-inventory.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const API = path.join(ROOT, 'app', 'api')

function routes(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) routes(p, out)
    else if (e.name === 'route.ts') out.push(p)
  }
  return out
}

const rel = (f: string) => path.relative(API, f).replace(/\\/g, '/').replace(/\/route\.ts$/, '')

/** Kända grindar — namnet är dokumentationen. */
const KANDA_GRINDAR: Record<string, RegExp> = {
  standardgrind: /getAuthenticatedBusiness\(/,
  cron_hemlighet: /verifyCronSecret\(/,
  plattformsadmin: /\bisAdmin\(request\)/,
  superadmin: /isSuperAdmin\(|superadmin/i,
  aktuell_anvandare: /getCurrentUser\(/,
  agare_admin: /isOwnerOrAdmin\(/,
  partner_token: /getPartnerTokenFromRequest|verifyApproveToken|PARTNER_API_KEY|signApproveToken|partner_token|lib\/partners\/auth/i,
  elks_signatur: /verifyElksSignature\(/,
  stripe_signatur: /constructEvent\(/,
  postmark_basic_auth: /verifyPostmarkBasicAuth\(/,
  supabase_session: /auth\.getUser\(|auth\.getSession\(|createRouteHandlerClient/,
  agarskap: /verifyOwnership\(/,
  hmac_token: /jwtVerify\(|verifyToken\(|verifySignedToken|createHmac|timingSafeEqual/,
  google_oauth_state: /verifyOAuthState\(/,
  kalender_kanaltoken: /calendarChannelTokenMatches\(/,
  // Byggdagboken (2026-09-02): helpern kör getAuthenticatedBusiness +
  // getCurrentUser och returnerar 401-svaret själv (lib/diary/route-context.ts).
  dagbokskontext: /loadDiaryContext\(/,
}

/**
 * Publika by design. Nyckel = rutt relativt app/api. Värde = credential +
 * varför den räcker. Rate limit-kravet står separat nedan.
 */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'health': 'Ingen — visar bara booleans/SHA/sparat kreditläge, gör inga leverantörsanrop',
  'ata/sign/[token]': 'sign_token (randomUUID, unik) i path — atomisk statusövergång sedan 2026-09-01',
  'ata/sign/[token]/pdf': 'sign_token i path — samma credential som signeringssidan, läsning av dokumentet',
  'field-reports/[id]/sign': 'signature_token i body MÅSTE matcha raden [id] — paret är credentialen',
  'field-reports/public': 'signature_token i query, läsning',
  'invite/[token]': 'invite_token (randomUUID) — läsning av inbjudan',
  'invite/[token]/accept': 'invite_token + utgångsdatum (saknat datum = utgånget sedan 2026-09-01)',
  'jobbpass/public/[token]': 'jobbpass-token + status=published, allowlistad vy',
  'lead-portal/[code]': 'portal_code (ls-uuid) + is_active — fönstrad GET, rate-limitad POST',
  'partners/register': 'Ingen (registrering) — fail-closed IP-tak sedan 2026-09-01',
  'partners/validate': 'Ingen — returnerar bara partnernamn för aktiv kod, IP-tak',
  'portal': 'portal_token i query/body — samma validering som portal/[token]',
  'portal/[token]': 'portal_token (randomUUID) + portal_enabled via getCustomerFromPortalToken',
  'portal/[token]/activity': 'portal_token',
  'portal/[token]/agreements': 'portal_token',
  'portal/[token]/documents': 'portal_token, signerade storage-URL:er',
  'portal/[token]/installations': 'portal_token',
  'portal/[token]/invoices': 'portal_token',
  'portal/[token]/invoices/[id]': 'portal_token + [id] låst till kundens business/customer i queryn',
  'portal/[token]/invoices/[id]/claim-paid': 'portal_token + ägarskap i JS, idempotent per faktura',
  'portal/[token]/jobbpass': 'portal_token',
  'portal/[token]/messages': 'portal_token — fail-closed tak per kund på POST',
  'portal/[token]/projects': 'portal_token',
  'portal/[token]/quotes': 'portal_token',
  'portal/[token]/reports': 'portal_token',
  'public/availability/[slug]': 'storefront-slug + is_published — bara beräknade slots',
  'public/book/[slug]': 'storefront-slug + is_published — fail-closed IP-tak, datumvalidering',
  'quotes/public/[token]': 'sign_token (randomUUID) — atomisk signering (v97), tak på fråga/bokning',
  'quotes/track': 'quote_id + sign_token (t=) krävs för varje skrivning sedan 2026-09-01',
  'storefront/contact': 'business_id valideras mot publicerad storefront — honeypot + IP-tak',
  'storefront/track': 'business_id (publikt) — bara en räknare, IP-tak',
  'swish-qr': 'Ingen tenant — strikt format på nummer/belopp/meddelande, ingen DB',
  'widget/chat': 'business_id (publikt, i snippet) + widget_enabled — IP-tak, samtalstak, bränslegrind',
  'leads/intake': 'api_key / portal_code → källa/företag, IP-tak',
  'email/inbound': 'Postmark Basic Auth (fail-closed), tenant ur mottagaradress',
  'voice/greeting': '46elks-signatur sedan 2026-09-01',
  'webhooks/google-calendar': 'kanaltoken (HMAC av kanal-id) eller resource-id för legacykanaler',
  'google/callback': 'HMAC-signerad state + sessionsmatchning sedan 2026-09-01',
  'integrations/fortnox/callback': 'httpOnly state-cookie (16 slumpbytes) jämförs med state-parametern',
  'auth/logout': 'Supabase-session',
  'auth/register': 'Ingen (registrering) — business_id genereras kryptografiskt server-side',
  'foretagsskannern/spar': 'Ingen tenant (anonym publik sida, ingen DB-skrivning) — honeypot + IP-tak, 2026-09-02',
}

/** Publika rutter som SKRIVER något dyrt (SMS/LLM/kort/rad) måste ha fail-closed tak. */
const KRAVER_PUBLIKT_TAK = [
  'portal/[token]/messages',
  'lead-portal/[code]',
  'public/book/[slug]',
  'quotes/public/[token]',
  'storefront/track',
  'storefront/contact',
  'partners/register',
  'partners/validate',
  'leads/intake',
  'widget/chat',
  'foretagsskannern/spar',
]

test('varje rutt utan standardgrind bär en känd grind eller står i PUBLIC_BY_DESIGN', () => {
  const okanda: string[] = []
  const inventering: Record<string, string[]> = {}
  for (const f of routes(API)) {
    const src = fs.readFileSync(f, 'utf8')
    const r = rel(f)
    const grindar = Object.entries(KANDA_GRINDAR).filter(([, re]) => re.test(src)).map(([k]) => k)
    inventering[r] = grindar
    if (grindar.length === 0 && !(r in PUBLIC_BY_DESIGN)) okanda.push(r)
  }
  expect(
    okanda,
    'Rutter utan känd grind och utan beslut i PUBLIC_BY_DESIGN. Lägg till en grind, eller skriv in rutten med credential + motivering.',
  ).toEqual([])
})

test('PUBLIC_BY_DESIGN pekar bara på rutter som finns (ingen död post)', () => {
  const finns = new Set(routes(API).map(rel))
  const doda = Object.keys(PUBLIC_BY_DESIGN).filter(r => !finns.has(r))
  expect(doda).toEqual([])
})

test('publika skrivvägar har fail-closed rate limit', () => {
  const saknar = KRAVER_PUBLIKT_TAK.filter(r => {
    const src = fs.readFileSync(path.join(API, r, 'route.ts'), 'utf8')
    return !/checkPublicRateLimitDb\(/.test(src)
  })
  expect(saknar).toEqual([])
})

test('publika GET-rutter som läser headers/cookies är force-dynamic', () => {
  const saknar: string[] = []
  for (const r of Object.keys(PUBLIC_BY_DESIGN)) {
    const src = fs.readFileSync(path.join(API, r, 'route.ts'), 'utf8')
    const harGet = /export async function GET/.test(src)
    const laserHeaders = /request\.headers|req\.headers|request\.cookies|cookies\(\)/.test(src)
    if (harGet && laserHeaders && !/export const dynamic = 'force-dynamic'/.test(src)) saknar.push(r)
  }
  expect(saknar).toEqual([])
})

test('inventeringens storlek — ändras den, uppdatera docs/audits/TENANT_SWEEP_2026-09-01.md', () => {
  const alla = routes(API)
  const utanStandard = alla.filter(f => !/getAuthenticatedBusiness\(/.test(fs.readFileSync(f, 'utf8')))
  // Räknade fakta 2026-09-01: 554 rutter, 120 utanför standardgrinden.
  // 2026-09-02 (räddningskön + lanseringsbevis, tasks/plan-raddningsko.md):
  // fem nya admin/cron-rutter utan tenant-kontext (isAdmin/verifyCronSecret
  // — cron/raddningsko, admin/raddningsko, admin/raddningsko/[id],
  // admin/raddningsko/manuell-fix, admin/launch-readiness/bevis) → 135.
  // 2026-09-03 (veckopulsen, tasks/plan-veckopuls.md): en ny admin-rutt
  // (admin/launch/veckopuls) — plattformsadmin, ingen tenant-kontext → 141.
  expect(alla.length).toBeGreaterThanOrEqual(550)
  expect(utanStandard.length).toBeLessThanOrEqual(141)
})
