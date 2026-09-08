/**
 * Facit: kundens signeringssida för fältrapporten (app/sign/report/[token]).
 *
 * Sidan är syskon till offertsidan: samma beslutstyngd, samma varumärke.
 * Det som får sidan att hålla över tid är inte utseendet utan tre regler:
 *  1. varumärket kommer ur brand-lagret (get-branding), inte en egen select
 *  2. sidan tror på servern — res.ok läses, ett 400 blir aldrig "Signerat!"
 *  3. inga emoji-ikoner på en kundvänd yta
 * Plus: sign-routen (tenant-svepets grindar) lämnas orörd av omdesignen.
 *
 *   npx playwright test tests/faltrapport-signering.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.join(__dirname, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const PAGE = 'app/sign/report/[token]/page.tsx'
const PUBLIC_ROUTE = 'app/api/field-reports/public/route.ts'
const SIGN_ROUTE = 'app/api/field-reports/[id]/sign/route.ts'

test.describe('publika rapport-routen bär varumärket', () => {
  test('läser varumärket via loadBranding — ingen egen kolumnlista för logo/färg', () => {
    const src = read(PUBLIC_ROUTE)
    expect(src).toContain("from '@/lib/branding/get-branding'")
    expect(src).toContain('loadBranding(supabase, businessId)')
    expect(src).toContain('attribution: branding.attribution')
    expect(src).toContain('accent_color: branding.accentColor')
    // Den gamla routen gjorde en andra select bara för att hitta business_id.
    expect(src).not.toMatch(/select\('business_id'\)/)
  })

  test('auth-GET med query är force-dynamic och svarar 404 via maybeSingle', () => {
    const src = read(PUBLIC_ROUTE)
    expect(src).toContain("export const dynamic = 'force-dynamic'")
    expect(src).toContain('.maybeSingle()')
    expect(src).toContain("{ status: 404 }")
  })

  test('business_id lämnar aldrig svaret', () => {
    const src = read(PUBLIC_ROUTE)
    expect(src).toContain('const { business_id: businessId, ...publicReport } = report')
    expect(src).toContain('report: publicReport')
  })
})

test.describe('signeringssidan', () => {
  test('varumärke + stämpel: accentfärg på knappen, AttributionStamp i foten', () => {
    const src = read(PAGE)
    expect(src).toContain("import AttributionStamp from '@/components/branding/AttributionStamp'")
    expect(src).toContain('<AttributionStamp attribution={attribution}')
    expect(src).toContain('style={{ background: accent }}')
    expect(src).toContain("business?.accent_color || '#0F766E'")
  })

  test('tror på servern: res.ok läses och felet visas, båda åtgärderna går genom samma submit', () => {
    const src = read(PAGE)
    expect(src).toContain('if (!res.ok) {')
    expect(src).toContain("setErrorMessage(data?.error || 'Något gick fel. Försök igen.')")
    expect(src).toContain("submit('sign')")
    expect(src).toContain("submit('reject')")
    // Den gamla sidan satte "signed" utan att titta på svaret.
    expect(src).not.toMatch(/await fetch\([^)]*\/sign`[\s\S]{0,400}?\}\)\s*\n\s*setSigned\(true\)/)
  })

  test('godkännande = namn + kryss; invändning kräver en beskrivning', () => {
    const src = read(PAGE)
    expect(src).toContain('const canSign = !!(signerName.trim() && termsAccepted && !submitting)')
    expect(src).toContain('const canObject = !!(note.trim() && !submitting)')
    expect(src).toContain('Det ersätter en signatur.')
  })

  test('avgjord rapport visar utfallet men behåller rapporten på sidan', () => {
    const src = read(PAGE)
    expect(src).toContain("if (data.report.status === 'signed') setState('signed')")
    expect(src).toContain("else if (data.report.status === 'rejected') setState('rejected')")
    expect(src).toContain("state === 'viewing' ? 'Arbetet är utfört' : 'Utfört arbete'")
  })

  test('inga emoji-ikoner på en kundvänd yta', () => {
    const src = read(PAGE)
    expect(src).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2705}\u{274C}]/u)
  })

  test('ingen påstådd leverans: sidan lovar inget mejl och ingen faktura', () => {
    const src = read(PAGE)
    expect(src).not.toMatch(/mejl|e-post|faktura/i)
  })
})

test.describe('sign-routen är orörd av omdesignen', () => {
  test('token+id är credentialen, engångs-reject, längdgränser', () => {
    const src = read(SIGN_ROUTE)
    expect(src).toContain(".eq('signature_token', token)")
    expect(src).toContain("if (report.status === 'rejected')")
    expect(src).toContain('signed_by.length > 120')
    expect(src).toContain('customer_note.length > 1000')
    expect(src).toContain("'field_report_signed'")
  })
})
