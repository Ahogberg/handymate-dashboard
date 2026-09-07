/**
 * Facit: Handymate-stämpeln i de utgående e-postvägarna
 * (lib/branding/attribution.ts, sql/v202) — och sedan varumärkeslagret
 * 2026-09-07 (lib/branding/get-branding.ts + emailLayout i
 * lib/email-templates.ts).
 *
 *   npx playwright test tests/facit-attribution-email.spec.ts --project=chromium
 *
 * Källskanning — ingen webbläsare, ingen databas. Vaktar att
 *   1. varje utgående kundmejl får sin fot från EN väg: antingen direkt från
 *      stämpelhelpern (attributionEmailHtml) eller via masterlayouten
 *      emailLayout(), som själv anropar helpern. Ingen yta bygger sin egen
 *      sträng — annars saknar den rekommendationslänken och
 *      Inställningar-toggeln biter inte,
 *   2. ingen av dem har kvar den gamla klartexten,
 *   3. helpern kan laddas utan att fälla utskicket innan v202 är körd
 *      (PostgREST fäller hela selecten om en begärd kolumn saknas),
 *   4. varumärket (logotyp/accent/kontakt) kommer ur samma enda sanning
 *      som stämpeln — get-branding — så Claude Designs master är ett byte
 *      i EN fil.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

/** Kundmejl som renderas genom masterlayouten (stämpeln följer med layouten). */
const LAYOUT_YTOR = [
  'app/api/quotes/send/route.ts',        // 1. offertmejl (Gmail + Resend, samma HTML)
  'lib/invoices/send-invoice.ts',        // 2. fakturamejl
  'lib/invoice-reminder-send.ts',        // 3. påminnelsemejl (leveranspunkten)
  'lib/portal/notification-emails.ts',   // 4. portalnotiser
  'lib/quote-confirmation-email.ts',     // 6. bekräftelse efter signering
  'lib/job-report.ts',                   // 7. jobbrapport-mejlet
  'lib/automation-engine.ts',            // 8. V3 send_email-regler (fritext)
]

/** Ytor som stämplar direkt via helpern (B2B/leverantör — ingen kundlayout). */
const DIREKT_YTOR = [
  'app/api/orders/send/route.ts',        // 5. materialbeställning till leverantör (B2B)
]

test.describe('stämpeln kommer från helpern — direkt eller via emailLayout', () => {
  for (const rel of LAYOUT_YTOR) {
    test(`${rel} renderar genom emailLayout med varumärke ur get-branding`, () => {
      const src = kod(rel)
      expect(src).toContain('emailLayout(')
      expect(src).toMatch(/(loadBranding|brandingFromConfig)\(/)
      expect(src).toMatch(/(from '@\/lib\/branding\/get-branding'|import\('@\/lib\/branding\/get-branding'\))/)
    })
  }
  for (const rel of DIREKT_YTOR) {
    test(`${rel} importerar från lib/branding/attribution`, () => {
      const src = kod(rel)
      expect(src).toMatch(/from '(@\/lib\/|(\.\.\/)+)branding\/attribution'/)
      expect(src).toContain('attributionEmailHtml(')
    })
  }
  for (const rel of [...LAYOUT_YTOR, ...DIREKT_YTOR, 'lib/email-templates.ts', 'lib/nurture.ts', 'app/api/invoices/auto-generate/route.ts']) {
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

  test('get-branding: EN sanning, validerad accent, fallback-select, kastar aldrig', () => {
    const src = kod('lib/branding/get-branding.ts')
    expect(src).toContain('export async function loadBranding')
    expect(src).toContain('export function brandingFromConfig')
    expect(src).toContain("export const DEFAULT_ACCENT_COLOR = '#0F766E'")
    // Stämpeln byggs av samma rad som varumärket — inte en separat query.
    expect(src).toContain('attribution: buildAttribution(row)')
    // Två selects: med attribution_link_enabled (v202) och utan (fallback).
    expect(src).toContain('.select(`${BRANDING_COLUMNS}, attribution_link_enabled`)')
    expect(src).toContain('.select(BRANDING_COLUMNS)')
    expect(src).toMatch(/catch \{\s*return brandingFromConfig\(null\)/)
  })

  test('ytor med hela business_config-raden i scope bygger direkt (ingen extra query)', () => {
    // getAuthenticatedBusiness → select('*'); send-invoice hämtar businessConfig med '*'
    expect(kod('app/api/quotes/send/route.ts')).toContain('brandingFromConfig(business)')
    expect(kod('app/api/orders/send/route.ts')).toContain('attributionEmailHtml(buildAttribution(business))')
    expect(kod('lib/invoices/send-invoice.ts')).toContain('branding: brandingFromConfig(businessConfig)')
    // PDF:en stämplas fortfarande direkt (facit-attribution-pdf).
    expect(kod('lib/invoices/send-invoice.ts')).toContain('attribution: buildAttribution(businessConfig)')
    expect(kod('lib/auth.ts')).toContain('referral_code?: string | null')
  })

  test('ytor med explicit kolumnlista laddar via loadBranding', () => {
    expect(kod('lib/invoice-reminder-send.ts')).toContain('await loadBranding(supabase, businessId)')
    expect(kod('lib/portal/notification-emails.ts')).toContain('await loadBranding(supabase, businessId)')
    expect(kod('lib/quote-confirmation-email.ts')).toContain('await loadBranding(supabase, businessId)')
    expect(kod('lib/job-report.ts')).toContain('await loadBranding(supabase, businessId)')
    expect(kod('lib/nurture.ts')).toContain('loadBranding(getServerSupabase(), params.businessId)')
    // Legacy auto-generate: EN laddning före kundloopen, aldrig i den.
    const auto = kod('app/api/invoices/auto-generate/route.ts')
    expect(auto).toContain('const branding = params.autoSend ? await loadBranding(supabase, params.businessId) : null')
    expect(auto.indexOf('await loadBranding(')).toBeLessThan(auto.indexOf('for (const'))
  })

  test('påminnelsen: innehållsfragment i kortet, layout vid leverans, legacy-kort får bara stämpeln', () => {
    // Kortet komponerar inte längre ett helt dokument (ingen hårdkodad teal-header).
    const card = kod('lib/invoice-reminder-card.ts')
    expect(card).not.toContain('border-radius:12px 12px 0 0')
    expect(card).not.toContain('background:#0F766E')
    // Leveransen: nya fragment → emailLayout; gamla hela dokument → stämpel som förut.
    const send = kod('lib/invoice-reminder-send.ts')
    expect(send).toContain('export function arRedanHeltMejl')
    expect(send).toContain('if (arRedanHeltMejl(messages.emailBody))')
    expect(send).toContain('html = emailLayout(branding, messages.emailBody)')
    expect(send).toContain('await loadAttribution(supabase, businessId)')
  })

  test('emailLayout tar valfri attribution och faller tillbaka på texten utan länk', () => {
    const src = kod('lib/email-templates.ts')
    expect(src).toContain('attribution?: Attribution')
    expect(src).toContain('attributionEmailHtml(branding.attribution ?? buildAttribution(null))')
    // Accentfärgen valideras alltid i layouten — en ogiltig sträng i
    // business_config får aldrig nå kundens mejl.
    expect(src).toContain('const accent = normalizeAccentColor(branding.accentColor)')
  })
})

test.describe('sanningsregler i kundmejlen', () => {
  test('ROT/RUT är alltid preliminärt — aldrig "dras automatiskt"', () => {
    for (const rel of ['lib/invoices/send-invoice.ts', 'app/api/quotes/send/route.ts', 'lib/quote-confirmation-email.ts', 'lib/email-templates.ts']) {
      expect(kod(rel), rel).not.toMatch(/dras automatiskt/i)
    }
    expect(kod('lib/email-templates.ts')).toContain('Skatteverket fastställer det slutgiltiga beloppet')
  })
})
