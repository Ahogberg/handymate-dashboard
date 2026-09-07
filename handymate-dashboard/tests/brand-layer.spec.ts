/**
 * Varumärkeslagret (2026-09-07) — runtime-facit för
 * lib/branding/get-branding.ts + emailLayout/byggstenarna i
 * lib/email-templates.ts.
 *
 *   npx playwright test tests/brand-layer.spec.ts --no-deps --project=chromium
 *
 * Ingen webbläsare, ingen databas. Låser kontraktet som alla kundmejl
 * lutar sig mot: accentfärgen är alltid giltig, firmanamnet aldrig tomt,
 * stämpeln alltid med, ROT alltid preliminärt, och layouten är ett
 * komplett dokument (Claude Designs master byts i EN fil utan att
 * anroparna märker det).
 */
import { test, expect } from '@playwright/test'
import {
  brandingFromConfig, normalizeAccentColor, DEFAULT_ACCENT_COLOR, loadBranding,
} from '../lib/branding/get-branding'
import { ATTRIBUTION_TEXT } from '../lib/branding/attribution'
import {
  emailLayout, summaryTable, rotRutNotice, swishDeeplink, formatKr, ctaButton, detailRows,
} from '../lib/email-templates'

test.describe('normalizeAccentColor', () => {
  test('giltig #rrggbb passerar, allt annat blir teal', () => {
    expect(normalizeAccentColor('#1E40AF')).toBe('#1E40AF')
    expect(normalizeAccentColor('  #1e40af ')).toBe('#1e40af')
    expect(normalizeAccentColor('#fff')).toBe(DEFAULT_ACCENT_COLOR)
    expect(normalizeAccentColor('red')).toBe(DEFAULT_ACCENT_COLOR)
    expect(normalizeAccentColor('#1E40AF;color:red')).toBe(DEFAULT_ACCENT_COLOR)
    expect(normalizeAccentColor(null)).toBe(DEFAULT_ACCENT_COLOR)
    expect(normalizeAccentColor(undefined)).toBe(DEFAULT_ACCENT_COLOR)
  })
})

test.describe('brandingFromConfig', () => {
  test('tom rad → neutralt varumärke som aldrig fäller ett utskick', () => {
    const b = brandingFromConfig(null)
    expect(b.businessName).toBe('Handymate')
    expect(b.accentColor).toBe(DEFAULT_ACCENT_COLOR)
    expect(b.logoUrl).toBeUndefined()
    expect(b.attribution.text).toBe(ATTRIBUTION_TEXT)
  })

  test('business_name vinner över display_name; public_phone över phone_number', () => {
    const b = brandingFromConfig({
      business_name: 'Bee Service AB', display_name: 'Bee', public_phone: '070-1', phone_number: '+4610',
      accent_color: '#123456', logo_url: 'https://x/logo.png', org_number: '556000-0000',
      swish_number: '123 456 78 90', bankgiro: '123-4567', contact_email: 'a@b.se', contact_name: 'Andreas',
    })
    expect(b.businessName).toBe('Bee Service AB')
    expect(b.contactPhone).toBe('070-1')
    expect(b.accentColor).toBe('#123456')
    expect(b.logoUrl).toBe('https://x/logo.png')
    expect(b.swishNumber).toBe('123 456 78 90')
  })

  test('tomma strängar räknas som saknade (fallback, inte "")', () => {
    const b = brandingFromConfig({ business_name: '  ', display_name: 'Firman', accent_color: '' })
    expect(b.businessName).toBe('Firman')
    expect(b.accentColor).toBe(DEFAULT_ACCENT_COLOR)
  })

  test('attribution_link_enabled: false stänger länken men behåller texten', () => {
    const b = brandingFromConfig({ referral_code: 'ABC', attribution_link_enabled: false })
    expect(b.attribution.text).toBe(ATTRIBUTION_TEXT)
    expect(b.attribution.url).toBeNull()
  })
})

test.describe('loadBranding kastar aldrig', () => {
  test('exploderande klient → neutralt varumärke', async () => {
    const supabase = { from: () => { throw new Error('boom') } } as any
    const b = await loadBranding(supabase, 'biz_x')
    expect(b.businessName).toBe('Handymate')
    expect(b.accentColor).toBe(DEFAULT_ACCENT_COLOR)
  })

  test('första selecten (med attribution_link_enabled) faller → fallback-selecten används', async () => {
    const selects: string[] = []
    const supabase = {
      from: () => ({
        select: (cols: string) => {
          selects.push(cols)
          const failing = cols.includes('attribution_link_enabled')
          return {
            eq: () => ({
              maybeSingle: async () => failing
                ? { data: null, error: { message: 'column does not exist' } }
                : { data: { business_name: 'Fallbackfirman', accent_color: '#ABCDEF' }, error: null },
            }),
          }
        },
      }),
    } as any
    const b = await loadBranding(supabase, 'biz_x')
    expect(selects).toHaveLength(2)
    expect(b.businessName).toBe('Fallbackfirman')
    expect(b.accentColor).toBe('#ABCDEF')
  })
})

test.describe('emailLayout', () => {
  const branding = brandingFromConfig({
    business_name: 'Bee Service AB', accent_color: '#123456', logo_url: 'https://x/logo.png',
    org_number: '556000-0000', public_phone: '070-1', contact_email: 'a@b.se',
  })

  test('komplett dokument: doctype, ljust färgschema, 600px, logotyp, sidfot, stämpel', () => {
    const html = emailLayout(branding, '<p>Innehåll</p>')
    expect(html).toMatch(/^\s*<!DOCTYPE html>/i)
    expect(html).toContain('<meta name="color-scheme" content="light">')
    expect(html).toContain('max-width:600px')
    expect(html).toContain('<img src="https://x/logo.png"')
    expect(html).toContain('<p>Innehåll</p>')
    expect(html).toContain('Org.nr 556000-0000')
    expect(html).toContain('070-1')
    expect(html).toContain('a@b.se')
    expect(html).toContain(ATTRIBUTION_TEXT)
    expect(html).toContain('</body>')
  })

  test('utan logotyp visas firmanamnet som rubrik; ogiltig accent blir teal', () => {
    const html = emailLayout({ businessName: 'Firman', accentColor: 'javascript:alert(1)' }, '')
    expect(html).not.toContain('<img')
    expect(html).toContain('Firman')
    expect(html).not.toContain('javascript:')
    expect(html).toContain(DEFAULT_ACCENT_COLOR)
  })

  test('ctaButton normaliserar också sin färg', () => {
    expect(ctaButton('Visa', 'https://x', '#GGGGGG')).toContain(`background:${DEFAULT_ACCENT_COLOR}`)
    expect(ctaButton('Visa', 'https://x', '#112233')).toContain('background:#112233')
  })
})

test.describe('byggstenarna', () => {
  test('summaryTable: första raden utan linje, avdrag grönt, summering i accent', () => {
    const html = summaryTable([
      { label: 'Delsumma', value: '1 000 kr' },
      { label: 'Preliminärt ROT-avdrag', value: '−300 kr', deduction: true },
      { label: 'Att betala', value: '700 kr', emphasis: true },
    ], '#123456')
    const rows = html.split('<tr>').slice(1)
    expect(rows).toHaveLength(3)
    expect(rows[0]).not.toContain('border-top')
    expect(rows[1]).toContain('#059669')
    expect(rows[2]).toContain('#123456')
  })

  test('rotRutNotice säger preliminärt och pekar på Skatteverket — aldrig "dras automatiskt"', () => {
    const html = rotRutNotice('rot', 12345)
    expect(html).toContain('Preliminärt ROT-avdrag')
    expect(html.replace(/[\s  ]/g, ' ')).toContain('12 345 kr')
    expect(html).toContain('Skatteverket fastställer det slutgiltiga beloppet')
    expect(html).not.toMatch(/dras automatiskt/i)
  })

  test('swishDeeplink: bara siffror i payee, heltalsbelopp, JSON-kodad', () => {
    const link = swishDeeplink('123 456 78 90', 1234.6, 'Faktura 1042')
    expect(link.startsWith('swish://payment?data=')).toBe(true)
    const data = JSON.parse(decodeURIComponent(link.slice('swish://payment?data='.length)))
    expect(data).toEqual({ version: 1, payee: { value: '1234567890' }, amount: { value: 1235 }, message: { value: 'Faktura 1042' } })
  })

  test('formatKr + detailRows', () => {
    // sv-SE tusentalsavgränsare är ett (hårt) mellanslag — vilket av dem beror på ICU.
    expect(formatKr(84500).replace(/[\s  ]/g, ' ')).toBe('84 500 kr')
    expect(formatKr(null)).toBe('0 kr')
    const rows = detailRows([{ label: 'Bankgiro', value: '' }, { label: 'OCR', value: '123' }])
    expect(rows).not.toContain('Bankgiro')
    expect(rows).toContain('OCR')
  })
})
