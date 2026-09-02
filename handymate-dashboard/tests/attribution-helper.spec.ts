/**
 * "Skickat via Handymate"-stämpeln (lib/branding/attribution.ts, sql/v202).
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
  loadAttribution,
  stampAttributionOnPdf,
  type AttributionPdfDoc,
} from '../lib/branding/attribution'
import type { SupabaseClient } from '@supabase/supabase-js'

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

/**
 * Fejkad Supabase-klient: svarar per select-sträng. Så kan vi spela upp
 * "kolumnen finns inte än" (PostgREST 400 på den fulla selecten) utan databas.
 */
function fakeSupabase(svar: Record<string, { data?: unknown; error?: { message: string } | null }>, logg: string[] = []) {
  const from = (table: string) => ({
    select: (cols: string) => {
      logg.push(`${table}:${cols}`)
      const r = svar[cols] ?? { data: null, error: { message: `oväntad select: ${cols}` } }
      const chain = {
        eq: () => chain,
        maybeSingle: async () => ({ data: r.data ?? null, error: r.error ?? null }),
      }
      return chain
    },
  })
  return { from } as unknown as SupabaseClient
}

test.describe('loadAttribution — tål att sql/v202 inte är körd', () => {
  const FULL = 'referral_code, attribution_link_enabled'
  const BARA_KOD = 'referral_code'

  test('kolumnen finns: en query, enabled respekteras', async () => {
    const logg: string[] = []
    const sb = fakeSupabase({ [FULL]: { data: { referral_code: 'BEE-4821', attribution_link_enabled: false } } }, logg)
    const a = await loadAttribution(sb, 'biz_1')
    expect(a.url).toBeNull()
    expect(a.text).toBe(ATTRIBUTION_TEXT)
    expect(logg).toEqual([`business_config:${FULL}`])
  })

  test('kolumnen saknas (fulla selecten 400:ar): faller tillbaka på referral_code, länken PÅ', async () => {
    const logg: string[] = []
    const sb = fakeSupabase(
      {
        [FULL]: { error: { message: 'column business_config.attribution_link_enabled does not exist' } },
        [BARA_KOD]: { data: { referral_code: 'BEE-4821' } },
      },
      logg,
    )
    const a = await loadAttribution(sb, 'biz_1')
    expect(a.url).toMatch(/\/via\/BEE-4821$/)
    expect(logg).toEqual([`business_config:${FULL}`, `business_config:${BARA_KOD}`])
  })

  test('båda selecterna faller: texten utan länk, kastar aldrig', async () => {
    const sb = fakeSupabase({
      [FULL]: { error: { message: 'nere' } },
      [BARA_KOD]: { error: { message: 'nere' } },
    })
    await expect(loadAttribution(sb, 'biz_1')).resolves.toEqual({ text: ATTRIBUTION_TEXT, url: null })
  })

  test('klienten kastar: texten utan länk, kastar aldrig', async () => {
    const sb = { from: () => { throw new Error('boom') } } as unknown as SupabaseClient
    await expect(loadAttribution(sb, 'biz_1')).resolves.toEqual({ text: ATTRIBUTION_TEXT, url: null })
  })

  test('okänt företag (ingen rad): texten utan länk', async () => {
    const sb = fakeSupabase({ [FULL]: { data: null } })
    await expect(loadAttribution(sb, 'finns_inte')).resolves.toEqual({ text: ATTRIBUTION_TEXT, url: null })
  })
})

test.describe('stampAttributionOnPdf — jsPDF-stämpeln', () => {
  function fakeDoc(pages: number) {
    const calls: string[] = []
    const doc: AttributionPdfDoc = {
      getNumberOfPages: () => pages,
      setPage: n => calls.push(`setPage:${n}`),
      internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
      setFontSize: s => calls.push(`fontSize:${s}`),
      setTextColor: (r, g, b) => calls.push(`color:${r},${g},${b}`),
      text: (t, x, y, o) => calls.push(`text:${t}@${x},${y},${o?.align}`),
      textWithLink: (t, x, y, o) => { calls.push(`link:${t}@${x},${y},${o.align}→${o.url}`); return 0 },
    }
    return { doc, calls }
  }

  test('med länk: sista sidan, centrerad längst ner, grå 8pt, hela raden klickbar', () => {
    const { doc, calls } = fakeDoc(3)
    const a = buildAttribution({ referral_code: 'BEE-4821' })
    stampAttributionOnPdf(doc, a)
    expect(calls[0]).toBe('setPage:3')
    expect(calls).toContain('fontSize:8')
    expect(calls).toContain('color:107,114,128')
    const link = calls.find(c => c.startsWith('link:'))
    expect(link).toBe(`link:Skickat via Handymate@105,292,center→${a.url}`)
    expect(calls.some(c => c.startsWith('text:'))).toBe(false)
  })

  test('utan länk: ren text, ingen textWithLink', () => {
    const { doc, calls } = fakeDoc(1)
    stampAttributionOnPdf(doc, buildAttribution(null))
    expect(calls[0]).toBe('setPage:1')
    expect(calls).toContain('text:Skickat via Handymate@105,292,center')
    expect(calls.some(c => c.startsWith('link:'))).toBe(false)
  })
})

test.describe('källskanning', () => {
  test('sql/v202 lägger till kolumnen idempotent med default true', () => {
    const sql = kod('sql/v202_attribution_link_enabled.sql')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS attribution_link_enabled BOOLEAN DEFAULT true')
    expect(sql).toContain('COMMENT ON COLUMN business_config.attribution_link_enabled')
  })

  test('Inställningar laddar, sparar och visar toggeln', () => {
    const src = kod('app/dashboard/settings/page.tsx')
    expect(src).toContain('attribution_link_enabled')
    expect(src).toContain('data.attribution_link_enabled !== false')
    expect(src).toContain('Rekommendationslänk i dokument och mejl')
    // Egen update så en okörd v202 inte fäller resten av sparningen
    expect(src).toMatch(/\.update\(\{ attribution_link_enabled: attributionLinkEnabled \}\)/)
  })
})
