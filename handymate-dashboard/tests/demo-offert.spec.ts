/**
 * Facit: demo-offerten på handymate.se — "Skicka en offert till dig själv"
 * (Varumärkeslagret yta 9, 2026-09-08; brief docs/design/briefs/09-demo-offert-till-dig-sjalv.md).
 *
 * Löftet till besökaren är "du får den som din kund får den". Det håller
 * bara om:
 *   1. offert-SMS:et byggs på ETT ställe (lib/quotes/quote-sms.ts) som både
 *      den riktiga send-routen och demo-routen använder
 *   2. demo-routen är publik men fail-closed: tre DB-backade tak, CORS
 *      låst till handymate.se, skriver bara i det hårdkodade demo-företaget
 *   3. status-routen aldrig läcker en riktig offerts token (låst till
 *      demo-företaget)
 *   4. SMS 2 bara går till demo-företagets kunder (grind i finalize)
 *   5. siffrorna i offerten är de designen visar, med ROT räknat på riktigt
 *   6. v223 sätter skyddsflaggorna och städfunktionen finns + körs
 *
 *   npx playwright test tests/demo-offert.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildQuoteSmsText } from '../lib/quotes/quote-sms'
import { sanitizeSenderId } from '../lib/sms/sender-id'
import {
  DEMO_QUOTE_BUSINESS_ID,
  DEMO_QUOTE_LIMITS,
  arGiltigtDemoNamn,
  arSvensktMobilnummer,
  demoCorsHeaders,
  demoLandingUrl,
  demoQuoteTotals,
} from '../lib/demo/demo-quote-data'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const SEND_ROUTE = 'app/api/quotes/send/route.ts'
const DEMO_ROUTE = 'app/api/public/demo-quote/route.ts'
const STATUS_ROUTE = 'app/api/public/demo-quote/[token]/status/route.ts'
const FINALIZE = 'lib/quotes/finalize-accepted.ts'
const DEMO_LIB = 'lib/demo/demo-quote.ts'
const CLEANUP_LIB = 'lib/demo/demo-quote-cleanup.ts'
const MAINTENANCE = 'app/api/cron/maintenance/route.ts'
const MIGRATION = 'sql/v223_demo_offert.sql'

// ── 1. Ett offert-SMS, två avsändare ────────────────────────────────────

test('send-routen bygger SMS:et via buildQuoteSmsText — ingen inline-text kvar', () => {
  const s = read(SEND_ROUTE)
  expect(s).toContain("from '@/lib/quotes/quote-sms'")
  expect(s).toContain('buildQuoteSmsText({')
  expect(s).not.toContain('Här kommer din offert från')
  // Facit från tidigare pass som fortfarande ska hålla i samma fil
  expect(s).toContain('brandingFromConfig(business)')
  expect(s).toContain('buildQuoteEmailHtml(')
  expect(s).toContain('&t=${encodeURIComponent(signToken)}')
})

test('demo-lib:et skickar samma SMS-text som send-routen', () => {
  const s = read(DEMO_LIB)
  expect(s).toContain("from '@/lib/quotes/quote-sms'")
  expect(s).toContain('buildQuoteSmsText({')
  // Strypunkten — aldrig 46elks direkt
  expect(s).toContain("from '@/lib/sms-send'")
  expect(s).not.toMatch(/api\.46elks\.com/)
})

test('buildQuoteSmsText: ordalydelsen är den gamla literalens, ROT-raden och Frågor-raden är villkorade', () => {
  const bas = {
    customerName: 'Anders Nilsson',
    businessName: 'Ekström Bygg AB',
    assignedPhoneNumber: null,
    total: 77500,
    customerPays: 64000,
    rotRutType: 'rot',
    validUntil: '2026-09-15T00:00:00.000Z',
    portalUrl: 'https://app.handymate.se/portal/abc?tab=quotes',
  }
  const medTelefon = buildQuoteSmsText({ ...bas, businessPhone: '08-123 45 67' })
  expect(medTelefon).toContain('Hej Anders!')
  expect(medTelefon).toContain('Här kommer din offert från Ekström Bygg AB:')
  expect(medTelefon).toMatch(/Totalt: 77\s500 kr \(efter ROT: 64\s000 kr\)/)
  expect(medTelefon).toContain('Giltig till: 2026-09-15')
  expect(medTelefon).toContain('Öppna din kundportal:\nhttps://app.handymate.se/portal/abc?tab=quotes')
  expect(medTelefon).toContain('Frågor? Ring 08-123 45 67')
  expect(medTelefon.trimEnd().endsWith('//Ekström Bygg AB')).toBe(true)

  // Saknat nummer → raden utelämnas. Tidigare skrevs "Ring null" till kunden.
  const utanTelefon = buildQuoteSmsText({ ...bas, businessPhone: null })
  expect(utanTelefon).not.toContain('Frågor?')
  expect(utanTelefon).not.toContain('null')

  // Utan ROT → ingen parentes
  const utanRot = buildQuoteSmsText({ ...bas, businessPhone: null, rotRutType: null, customerPays: null })
  expect(utanRot).toMatch(/Totalt: 77\s500 kr\n/)
  expect(utanRot).not.toContain('efter')
})

// ── 2. Demo-routen: publik men fail-closed ───────────────────────────────

test('demo-routen är force-dynamic, har tre DB-backade tak och CORS-helpern', () => {
  const s = read(DEMO_ROUTE)
  expect(s).toContain("export const dynamic = 'force-dynamic'")
  expect(s).toContain('export async function OPTIONS')
  expect(s).toContain('demoCorsHeaders(request)')
  expect((s.match(/checkPublicRateLimitDb\(/g) || []).length).toBe(3)
  expect(s).toContain('demo-quote:phone:')
  expect(s).toContain('demo-quote:ip:')
  expect(s).toContain("'demo-quote:global'")
  expect(s).toContain('DEMO_QUOTE_LIMITS.perPhonePerDay')
  expect(s).toContain('DEMO_QUOTE_LIMITS.perIpPerHour')
  expect(s).toContain('DEMO_QUOTE_LIMITS.globalPerDay')
  // Aldrig egen auth-grind — det är en publik rutt by design
  expect(s).not.toContain('requirePermission')
  expect(s).not.toContain('getAuthenticatedBusiness')
})

test('taken är briefens siffror: 3 per nummer och dygn, 5 per IP och timme, 200 per dygn globalt', () => {
  expect(DEMO_QUOTE_LIMITS).toEqual({ perPhonePerDay: 3, perIpPerHour: 5, globalPerDay: 200 })
})

test('demo-lib:et skriver bara i det hårdkodade demo-företaget och vägrar utan is_demo_tenant', () => {
  const s = read(DEMO_LIB)
  expect(DEMO_QUOTE_BUSINESS_ID).toBe('biz_demo_ekstrom')
  expect(s).toContain('biz.is_demo_tenant !== true')
  // Varje skrivning bär demo-företagets id — inget business_id kommer från anroparen
  const skrivningar = s.match(/\.from\('(customer|customer_activity)'\)\.insert\(\{[\s\S]*?\}\)/g) || []
  expect(skrivningar.length).toBeGreaterThanOrEqual(2)
  for (const w of skrivningar) expect(w).toContain('business_id: DEMO_QUOTE_BUSINESS_ID')
  expect(s).toContain('createQuote(supabase, DEMO_QUOTE_BUSINESS_ID, {')
})

test('validering: namn = bokstäver 1–40, nummer = svenskt mobilnummer i E.164', () => {
  expect(arGiltigtDemoNamn('Anders Nilsson')).toBe(true)
  expect(arGiltigtDemoNamn("Åsa O'Brien-Löf")).toBe(true)
  expect(arGiltigtDemoNamn('')).toBe(false)
  expect(arGiltigtDemoNamn('<script>')).toBe(false)
  expect(arGiltigtDemoNamn('A'.repeat(41))).toBe(false)
  expect(arSvensktMobilnummer('+46701234567')).toBe(true)
  expect(arSvensktMobilnummer('+4681234567')).toBe(false) // fast nummer
  expect(arSvensktMobilnummer('0701234567')).toBe(false) // inte normaliserat
})

test('CORS: bara handymate.se släpps igenom, okänt origin faller tillbaka till handymate.se', () => {
  const h = (origin: string | null) => demoCorsHeaders({ headers: { get: () => origin } as any })
  expect(h('https://handymate.se')['Access-Control-Allow-Origin']).toBe('https://handymate.se')
  expect(h('https://www.handymate.se')['Access-Control-Allow-Origin']).toBe('https://www.handymate.se')
  expect(h('https://evil.example')['Access-Control-Allow-Origin']).toBe('https://handymate.se')
  expect(h(null)['Access-Control-Allow-Origin']).toBe('https://handymate.se')
  expect(h('https://handymate.se')['Vary']).toBe('Origin')
})

test('efteråt-länken pekar på landningen med token + ankare', () => {
  expect(demoLandingUrl('abc-123')).toMatch(/^https:\/\/[^/]+\/\?demo=abc-123#demo-offert$/)
})

// ── 3. Status-routen ─────────────────────────────────────────────────────

test('status-routen är force-dynamic, rate-limitad och låst till demo-företaget', () => {
  const s = read(STATUS_ROUTE)
  expect(s).toContain("export const dynamic = 'force-dynamic'")
  expect(s).toContain('checkPublicRateLimitDb(')
  expect(s).toContain("'Cache-Control': 'no-store'")
  // Varje uppslag (offert, projekt, affär) filtrerar på demo-företaget
  expect((s.match(/\.eq\('business_id', DEMO_QUOTE_BUSINESS_ID\)/g) || []).length).toBe(3)
  expect(s).toContain(".eq('sign_token', token)")
  // Affären räknas vunnen bara när steget faktiskt är 'won'
  expect(s).toContain("stage?.slug === 'won'")
  // Inga personuppgifter utöver förnamnet
  expect(s).not.toContain('phone_number')
  expect(s).not.toContain('email')
})

// ── 4. SMS 2 bara för demo-företaget ─────────────────────────────────────

test('finalize-accepted grindar demo-efter-SMS:et på demo-företaget och är non-blocking', () => {
  const s = read(FINALIZE)
  const block = s.slice(s.indexOf('Demo-offerten på handymate.se'), s.indexOf('return result'))
  expect(block).toContain('arDemoOffertForetag(input.businessId)')
  expect(block).toContain('skickaDemoEfterSms(supabase, {')
  expect(block).toContain('projectCreated: result.projectCreated')
  expect(block).toContain('dealMoved: result.dealMoved')
  expect(block).toMatch(/try \{[\s\S]*\} catch/)
  // Dynamisk import — vanliga accepter drar inte in demo-modulen
  expect(block).toContain("await import('@/lib/demo/demo-quote')")
})

test('SMS 2 påstår bara det som hände och kommer från Handymate, inte från Ekström', () => {
  const s = read(DEMO_LIB)
  const fn = s.slice(s.indexOf('export async function skickaDemoEfterSms'))
  expect(fn).toContain("businessName: 'Handymate'")
  expect(fn).toContain("messageType: 'demo_quote_after'")
  expect(fn).toContain('input.projectCreated')
  expect(fn).toContain('input.dealMoved')
  expect(fn).toContain(".eq('business_id', DEMO_QUOTE_BUSINESS_ID)")
})

// ── 5. Siffrorna ─────────────────────────────────────────────────────────

test('offerten: 62 000 ex moms, 15 500 moms, 77 500 totalt; ROT 13 500 på riktigt → kunden betalar 64 000', () => {
  const t = demoQuoteTotals(25)
  expect(t.subtotal).toBe(62000)
  expect(t.vat).toBe(15500)
  expect(t.total).toBe(77500)
  expect(t.rotWorkCost).toBe(36000)
  expect(t.rotDeduction).toBe(13500) // 36 000 × 1,25 × 0,30
  expect(t.customerPays).toBe(64000)
})

test('avsändar-ID: "Ekström Bygg AB" → "EkstromBygg", inte "EkstrmBygg"', () => {
  expect(sanitizeSenderId('Ekström Bygg AB')).toBe('EkstromBygg')
  expect(sanitizeSenderId('Bee Service AB')).toBe('BeeService')
  expect(sanitizeSenderId('Åsas Måleri')).toBe('AsasMaleri')
  expect(sanitizeSenderId('')).toBe('Handymate')
})

// ── 6. Migrationen + städningen ──────────────────────────────────────────

test('v223 seedar demo-företaget med skyddsflaggorna och definierar städfunktionen', () => {
  const s = read(MIGRATION)
  expect(s).toContain("'biz_demo_ekstrom'")
  expect(s).toMatch(/is_demo_tenant = true/)
  expect(s).toMatch(/agents_globally_paused = true/)
  expect(s).toContain('sms_auto_enabled = false')
  expect(s).toContain('sms_quote_followup = false')
  expect(s).toContain('CREATE OR REPLACE FUNCTION public.demo_quote_cleanup(')
  // Städningen vägrar på allt som inte är demo
  expect(s).toContain('IF v_is_demo IS DISTINCT FROM true THEN')
  expect(s).toContain('RAISE EXCEPTION')
  // Inget inloggningsbart konto
  expect(s).not.toMatch(/INSERT INTO (public\.)?business_users/i)
  expect(s).not.toMatch(/INSERT INTO auth\.users/i)
  // Bara service_role får köra funktionen
  expect(s).toContain('GRANT EXECUTE ON FUNCTION public.demo_quote_cleanup(text, integer) TO service_role')
})

test('städningen körs från underhållscronen via RPC:n, fail-soft', () => {
  const lib = read(CLEANUP_LIB)
  expect(lib).toContain(".rpc('demo_quote_cleanup', {")
  expect(lib).toContain('p_business_id: DEMO_QUOTE_BUSINESS_ID')
  const cron = read(MAINTENANCE)
  expect(cron).toContain("await import('@/lib/demo/demo-quote-cleanup')")
  expect(cron).toContain('results.demo_quote_cleanup = await stadaDemoOfferter(supabase)')
  expect(cron).toContain('results.demo_quote_cleanup_error')
})
