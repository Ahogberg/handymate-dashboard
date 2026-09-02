/**
 * Facit: Handymate-stämpeln i de utgående e-postvägarna
 * (lib/branding/attribution.ts, sql/v202).
 *
 *   npx playwright test tests/facit-attribution-email.spec.ts --project=chromium
 *
 * Källskanning — ingen webbläsare, ingen databas. Vaktar att
 *   1. varje utgående mejlväg hämtar foten från helpern (ingen yta bygger
 *      sin egen sträng — annars saknar den rekommendationslänken och
 *      Inställningar-toggeln biter inte),
 *   2. ingen av dem har kvar den gamla klartexten,
 *   3. helpern kan laddas utan att fälla utskicket innan v202 är körd
 *      (PostgREST fäller hela selecten om en begärd kolumn saknas).
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

const YTOR = [
  'app/api/quotes/send/route.ts',        // 1. offertmejl (Gmail + Resend, samma HTML)
  'lib/invoices/send-invoice.ts',        // 2. fakturamejl
  'lib/invoice-reminder-send.ts',        // 3. påminnelsemejl (leveranspunkten)
  'lib/portal/notification-emails.ts',   // 4. portalnotiser
  'app/api/orders/send/route.ts',        // 5. materialbeställning till leverantör (B2B)
  'lib/email-templates.ts',              // emailLayout — nurture + legacy auto-generate
]

test.describe('stämpeln kommer från helpern', () => {
  for (const rel of YTOR) {
    test(`${rel} importerar från lib/branding/attribution`, () => {
      const src = kod(rel)
      expect(src).toMatch(/from '(@\/lib\/|(\.\.\/)+)branding\/attribution'/)
      expect(src).toContain('attributionEmailHtml(')
    })

    test(`${rel} har ingen egen Handymate-klartext kvar`, () => {
      const src = kod(rel)
      expect(src).not.toContain('via Handymate')
      expect(src).not.toContain('Powered by Handymate')
    })
  }
})

test.describe('underlaget hämtas rätt', () => {
  test('helpern exporterar loadAttribution med fallback-select på bara referral_code', () => {
    const src = kod('lib/branding/attribution.ts')
    expect(src).toContain('export async function loadAttribution')
    expect(src).toContain(".select('referral_code, attribution_link_enabled')")
    expect(src).toContain(".select('referral_code')")
    // Aldrig kasta — utskicket får inte stanna på stämpeln.
    expect(src).toMatch(/catch \{\s*return buildAttribution\(null\)/)
  })

  test('ytor med hela business_config-raden i scope bygger direkt (ingen extra query)', () => {
    // getAuthenticatedBusiness → select('*'); send-invoice hämtar businessConfig med '*'
    expect(kod('app/api/quotes/send/route.ts')).toContain('attributionEmailHtml(buildAttribution(business))')
    expect(kod('app/api/orders/send/route.ts')).toContain('attributionEmailHtml(buildAttribution(business))')
    expect(kod('lib/invoices/send-invoice.ts')).toContain('attribution: buildAttribution(businessConfig)')
    expect(kod('lib/auth.ts')).toContain('referral_code?: string | null')
  })

  test('ytor med explicit kolumnlista laddar via loadAttribution', () => {
    expect(kod('lib/invoice-reminder-send.ts')).toContain('await loadAttribution(supabase, businessId)')
    expect(kod('lib/portal/notification-emails.ts')).toContain('await loadAttribution(supabase, businessId)')
    expect(kod('lib/nurture.ts')).toContain('loadAttribution(getServerSupabase(), params.businessId)')
    // Legacy auto-generate: EN laddning före kundloopen, aldrig i den.
    const auto = kod('app/api/invoices/auto-generate/route.ts')
    expect(auto).toContain('const attribution = params.autoSend ? await loadAttribution(supabase, params.businessId) : null')
    expect(auto.indexOf('await loadAttribution(')).toBeLessThan(auto.indexOf('for (const'))
  })

  test('emailLayout tar valfri attribution och faller tillbaka på texten utan länk', () => {
    const src = kod('lib/email-templates.ts')
    expect(src).toContain('attribution?: Attribution')
    expect(src).toContain('attributionEmailHtml(branding.attribution ?? buildAttribution(null))')
  })
})
