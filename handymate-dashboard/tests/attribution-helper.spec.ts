/**
 * "Skickat via Handymate"-stämpeln (lib/branding/attribution.ts, sql/v200).
 *
 *   npx playwright test tests/attribution-helper.spec.ts --project=chromium
 *
 * Rena funktioner + källskanning — ingen webbläsare, ingen databas.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  ATTRIBUTION_TEXT,
  buildAttribution,
  attributionEmailHtml,
  attributionDocumentHtml,
  attributionPdfText,
} from '../lib/branding/attribution'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')

test.describe('buildAttribution', () => {
  test('kod + enabled undefined (kolumnen saknas än) → länk på', () => {
    const a = buildAttribution({ referral_code: 'BEE-4821' })
    expect(a.text).toBe(ATTRIBUTION_TEXT)
    expect(a.url).toMatch(/^https?:\/\/.+\/via\/BEE-4821$/)
  })

  test('kod + enabled true → länk', () => {
    const a = buildAttribution({ referral_code: 'BEE-4821', attribution_link_enabled: true })
    expect(a.url).toMatch(/\/via\/BEE-4821$/)
  })

  test('kod + enabled null → länk (null tolkas som på)', () => {
    const a = buildAttribution({ referral_code: 'BEE-4821', attribution_link_enabled: null })
    expect(a.url).toMatch(/\/via\/BEE-4821$/)
  })

  test('enabled false → ingen länk, texten kvar', () => {
    const a = buildAttribution({ referral_code: 'BEE-4821', attribution_link_enabled: false })
    expect(a.url).toBeNull()
    expect(a.text).toBe('Skickat via Handymate')
  })

  test('kod null/tom/whitespace → ingen länk', () => {
    expect(buildAttribution({ referral_code: null, attribution_link_enabled: true }).url).toBeNull()
    expect(buildAttribution({ referral_code: '', attribution_link_enabled: true }).url).toBeNull()
    expect(buildAttribution({ referral_code: '   ', attribution_link_enabled: true }).url).toBeNull()
  })

  test('cfg null/undefined → ingen länk, texten kvar', () => {
    expect(buildAttribution(null)).toEqual({ text: ATTRIBUTION_TEXT, url: null })
    expect(buildAttribution(undefined)).toEqual({ text: ATTRIBUTION_TEXT, url: null })
  })

  test('koden trimmas och URL-kodas', () => {
    const a = buildAttribution({ referral_code: '  BEE-4821 ' })
    expect(a.url).toMatch(/\/via\/BEE-4821$/)
    expect(buildAttribution({ referral_code: 'A B/C' }).url).toMatch(/\/via\/A%20B%2FC$/)
  })
})

test.describe('attributionEmailHtml', () => {
  test('med länk: <a href="…/via/BEE-4821"> runt Handymate', () => {
    const html = attributionEmailHtml(buildAttribution({ referral_code: 'BEE-4821' }))
    expect(html).toMatch(/<a href="[^"]+\/via\/BEE-4821"/)
    expect(html).toContain('>Handymate</a>')
    expect(html).toContain('Skickat via ')
    expect(html).toContain('#0F766E')
  })

  test('utan länk: ren text, inget <a', () => {
    const html = attributionEmailHtml(buildAttribution(null))
    expect(html).not.toContain('<a')
    expect(html).toContain('Skickat via Handymate')
    expect(html).toMatch(/^<p /)
  })
})

test.describe('attributionDocumentHtml', () => {
  test('med länk: klass hm-attribution + klickbar länk', () => {
    const html = attributionDocumentHtml(buildAttribution({ referral_code: 'BEE-4821' }))
    expect(html).toContain('class="hm-attribution"')
    expect(html).toMatch(/<a href="[^"]+\/via\/BEE-4821"/)
    expect(html).toContain('>Handymate</a>')
  })

  test('utan länk: ren text, inget <a', () => {
    const html = attributionDocumentHtml(buildAttribution({ referral_code: 'BEE-4821', attribution_link_enabled: false }))
    expect(html).toContain('class="hm-attribution"')
    expect(html).not.toContain('<a')
    expect(html).toContain('Skickat via Handymate')
  })
})

test.describe('attributionPdfText', () => {
  test('returnerar text + url', () => {
    const a = buildAttribution({ referral_code: 'BEE-4821' })
    expect(attributionPdfText(a)).toEqual({ text: 'Skickat via Handymate', url: a.url })
    expect(attributionPdfText(buildAttribution(null))).toEqual({ text: 'Skickat via Handymate', url: null })
  })
})

test.describe('källskanning', () => {
  test('sql/v200 lägger till kolumnen idempotent med default true', () => {
    const sql = kod('sql/v200_attribution_link_enabled.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS attribution_link_enabled BOOLEAN DEFAULT true')
    expect(sql).toContain('COMMENT ON COLUMN business_config.attribution_link_enabled')
  })

  test('Inställningar laddar, sparar och visar toggeln', () => {
    const src = kod('app/dashboard/settings/page.tsx')
    expect(src).toContain('attribution_link_enabled')
    expect(src).toContain('data.attribution_link_enabled !== false')
    expect(src).toContain('Rekommendationslänk i dokument och mejl')
    // Egen update så en okörd v200 inte fäller resten av sparningen
    expect(src).toMatch(/\.update\(\{ attribution_link_enabled: attributionLinkEnabled \}\)/)
  })
})
