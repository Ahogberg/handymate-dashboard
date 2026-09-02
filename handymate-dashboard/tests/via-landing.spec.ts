/**
 * /via/<kod> — den publika rekommendationssidan bakom "Skickat via
 * Handymate"-foten (app/via/[code]/page.tsx, lib/branding/attribution.ts).
 *
 *   npx playwright test tests/via-landing.spec.ts --project=chromium
 *
 * Ren källskanning — ingen webbläsare, ingen databas. Samma stil som
 * tests/attribution-helper.spec.ts.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE = 'app/via/[code]/page.tsx'
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test.describe('/via/[code] — källskanning', () => {
  test('sidan finns och är en serverkomponent utan inloggning', () => {
    expect(fs.existsSync(path.join(ROOT, PAGE))).toBe(true)
    const src = kod(PAGE)
    expect(src).not.toContain("'use client'")
    expect(src).not.toContain('getAuthenticatedBusiness')
    expect(src).toContain('getServerSupabase')
  })

  test('force-dynamic — sidan loggar per anrop och får aldrig cachas statiskt', () => {
    expect(kod(PAGE)).toContain("export const dynamic = 'force-dynamic'")
  })

  test('slår upp business_config på referral_code', () => {
    const src = kod(PAGE)
    expect(src).toContain(".from('business_config')")
    expect(src).toContain(".eq('referral_code'")
    expect(src).toContain("'business_id, business_name, branch, service_area'")
  })

  test('läcker inga kontaktuppgifter — själva strängarna får inte finnas i filen', () => {
    const src = kod(PAGE)
    expect(src).not.toContain('contact_email')
    expect(src).not.toContain('phone_number')
    expect(src).not.toContain('org_number')
    expect(src).not.toContain('contact_phone')
    expect(src).not.toContain("select('*')")
  })

  test('loggar via_click till landing_events, felisolerat', () => {
    const src = kod(PAGE)
    expect(src).toContain(".from('landing_events')")
    expect(src).toContain("event: 'via_click'")
    expect(src).toContain('found: business !== null')
    // Loggningen ligger i try/catch med console.warn — ett fel får aldrig fälla sidan
    expect(src).toMatch(/catch \(err\) \{\s*console\.warn\('\[via\] kunde inte logga via_click:'/)
  })

  test('knapparna: registrering med ref-kod + marknadssajten', () => {
    const src = kod(PAGE)
    expect(src).toContain('/registrera?ref=')
    expect(src).toContain("'/registrera'") // okänd kod → utan ?ref
    expect(src).toContain('https://handymate.se')
    expect(src).toContain('Starta för er firma')
    expect(src).toContain('Så fungerar Handymate')
  })

  test('texter: hittad firma, okänd kod, transparensrad och sidfot', () => {
    const src = kod(PAGE)
    expect(src).toContain('sköter offerter,')
    expect(src).toContain('Det här dokumentet skickades via Handymate')
    expect(src).toContain('en månad gratis')
    expect(src).toContain('Handymate · app.handymate.se')
    // Inga länkar till inloggningen på en publik sida
    expect(src).not.toContain('/login')
    expect(src).not.toContain('/dashboard')
  })

  test('metadata: per-firma-sidor indexeras inte', () => {
    const src = kod(PAGE)
    expect(src).toContain('export async function generateMetadata')
    expect(src).toContain('index: false')
    expect(src).toContain('använder Handymate')
    expect(src).toContain("'Skickat via Handymate'")
  })

  test('ligger inte under en layout som kräver inloggning', () => {
    expect(fs.existsSync(path.join(ROOT, 'app/via/layout.tsx'))).toBe(false)
    expect(fs.existsSync(path.join(ROOT, 'app/via/[code]/layout.tsx'))).toBe(false)
    // Rotlayouten har ingen auth-grind — den grinden ligger i app/dashboard/layout.tsx
    const root = kod('app/layout.tsx')
    expect(root).not.toContain('getAuthenticatedBusiness')
    expect(root).not.toContain('redirect(')
  })
})
