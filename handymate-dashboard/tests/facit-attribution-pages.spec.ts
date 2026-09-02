/**
 * Facit: Handymate-stämpeln på de publika webbsidorna
 * (lib/branding/attribution.ts, components/branding/AttributionStamp.tsx, sql/v202).
 *
 *   npx playwright test tests/facit-attribution-pages.spec.ts --project=chromium --no-deps
 *
 * Källskanning — ingen webbläsare, ingen databas. Vaktar att
 *   1. kundportalen, offertsidan, jobbpasset, lead-portalen, rekommendera-
 *      sidan och chatt-widgeten renderar stämpeln via den delade React-
 *      komponenten och typar underlaget från helpern — ingen yta skriver
 *      "Drivs av"/"Powered by" själv,
 *   2. länken öppnas i ny flik (target=_blank + rel=noopener) och är teal,
 *   3. underlaget laddas EN gång per sidvisning i sidans egen data-route
 *      (loadAttribution när routen har en kolumnlista, buildAttribution när
 *      hela raden är i scope) — ingen ny klient-fetch, aldrig
 *      attribution_link_enabled i en explicit kolumnlista,
 *   4. helpern och React-stämpeln förblir klientsäkra (inga server-only-
 *      importer — klientkomponenterna importerar dem direkt),
 *   5. globalt: ingen gammal stämpel-klartext kvar under app/, lib/,
 *      components/ utom helpern och en dokumenterad allowlist.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
const HELPER_IMPORT_RE = /from '(@\/lib\/|(\.\.\/)+)branding\/attribution'/
const STAMP_IMPORT_RE = /import AttributionStamp from '@\/components\/branding\/AttributionStamp'/

/** Den gamla klartexten i alla former som fanns på sidorna. */
const GAMMAL_KLARTEXT_RE = /Powered by Handymate|Drivs av Handymate|Drivs av\s*(\{' '\})?\s*<[^>]*>\s*Handymate|Powered by\s*<[^>]*>\s*Handymate|Genererad via Handymate/

/** Den nya texten får bara skrivas i helpern — ytorna renderar via komponenten. */
const NY_KLARTEXT_RE = /Skickat via Handymate/

/**
 * Avsiktligt kvar — inte stämpeln, eller inte kundvänt. Motivering per fil.
 * Lägg ALDRIG till en kundvänd yta här — koppla den till helpern i stället.
 */
const ALLOWLIST: Record<string, string> = {
  'lib/branding/attribution.ts': 'helpern — den enda källan till strängen',
  'app/via/[code]/page.tsx': 'stämpelns egen landningssida — rubriken ÄR texten, inte en stämpel',
  'app/dashboard/settings/page.tsx': 'intern inställningstext som beskriver stämpeln för företagaren (inte kundvänd)',
}

/** Kommentarer bort så att förklarande texter i kod inte räknas som en stämpel. */
function utanKommentarer(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(line => !/^\s*(\/\/|\*)/.test(line))
    .join('\n')
}

const KUNDVANDA_SIDOR = [
  'app/portal/[token]/components/PortalHandymateAttribution.tsx',
  'app/quote/[token]/page.tsx',
  'app/jobbpass/[token]/page.tsx',
  'app/lead-portal/[code]/page.tsx',
  'app/rekommendera/[token]/page.tsx',
  'app/widget/chat/page.tsx',
]

test.describe('sidorna renderar stämpeln via helpern', () => {
  for (const rel of KUNDVANDA_SIDOR) {
    test(`${rel} importerar typen från lib/branding/attribution och komponenten`, () => {
      const src = kod(rel)
      expect(src).toMatch(HELPER_IMPORT_RE)
      expect(src).toMatch(STAMP_IMPORT_RE)
      expect(src).toMatch(/<AttributionStamp attribution=\{/)
    })

    test(`${rel} har ingen egen Handymate-klartext kvar`, () => {
      const src = utanKommentarer(kod(rel))
      expect(src).not.toMatch(GAMMAL_KLARTEXT_RE)
      expect(src).not.toMatch(NY_KLARTEXT_RE)
    })
  }

  test('portalens fyra vyer skickar ner portal.attribution till komponenten', () => {
    for (const rel of [
      'app/portal/[token]/page.tsx',
      'app/portal/[token]/components/PortalHome.tsx',
      'app/portal/[token]/components/PortalContact.tsx',
      'app/portal/[token]/components/PortalDocumentsList.tsx',
    ]) {
      expect(kod(rel), rel).toContain('<PortalHandymateAttribution attribution={portal.attribution} />')
    }
    expect(kod('app/portal/[token]/types.ts')).toContain('attribution?: Attribution | null')
  })

  test('React-stämpeln: ny flik, noopener, teal, text utan länk som fallback', () => {
    const src = kod('components/branding/AttributionStamp.tsx')
    expect(src).toMatch(HELPER_IMPORT_RE)
    expect(src).toContain('target="_blank"')
    expect(src).toContain('rel="noopener noreferrer"')
    expect(src).toContain('ATTRIBUTION_LINK_COLOR')
    expect(src).toContain('const a = attribution ?? buildAttribution(null)')
    // Strängen skrivs aldrig här — den kommer ur helperns konstanter.
    expect(utanKommentarer(src)).not.toMatch(NY_KLARTEXT_RE)
    expect(src).toContain('{ATTRIBUTION_PREFIX}')
    expect(src).toContain('{ATTRIBUTION_BRAND}')
  })

  test('helperns konstanter bär texten och färgen', () => {
    const src = kod('lib/branding/attribution.ts')
    expect(src).toContain("export const ATTRIBUTION_BRAND = 'Handymate'")
    expect(src).toContain("export const ATTRIBUTION_PREFIX = 'Skickat via '")
    expect(src).toContain("export const ATTRIBUTION_LINK_COLOR = '#0F766E'")
  })

  test('portalens CSS färgar länken teal (--hm-700), inte företagets accent', () => {
    const css = kod('app/portal/[token]/portal.css')
    expect(css).toContain('.bp-hm-attr a, .bp-hm-attr span { color: var(--hm-700)')
    expect(css).not.toContain('.bp-hm-attr strong')
  })
})

test.describe('underlaget laddas en gång per sidvisning i data-routen', () => {
  test('routes med kolumnlista laddar via loadAttribution (aldrig i loop)', () => {
    expect(kod('app/api/portal/[token]/route.ts')).toContain('await loadAttribution(supabase, customer.business_id)')
    expect(kod('app/api/quotes/public/[token]/route.ts')).toContain('await loadAttribution(supabase, quote.business_id)')
    expect(kod('app/api/jobbpass/public/[token]/route.ts')).toContain('await loadAttribution(supabase, jobbpass.business_id)')
    expect(kod('app/api/lead-portal/[code]/route.ts')).toContain('await loadAttribution(supabase, source.business_id)')
    expect(kod('app/api/referral-lead/route.ts')).toContain('await loadAttribution(supabase, decoded.businessId)')
  })

  test('widget-config har hela raden (select(*)) och bygger direkt', () => {
    const src = kod('app/api/widget/config/route.ts')
    expect(src).toContain("select('*')")
    expect(src).toContain('attribution: buildAttribution(config)')
  })

  test('varje route exponerar attribution i JSON-svaret', () => {
    for (const rel of [
      'app/api/portal/[token]/route.ts',
      'app/api/quotes/public/[token]/route.ts',
      'app/api/jobbpass/public/[token]/route.ts',
      'app/api/lead-portal/[code]/route.ts',
      'app/api/referral-lead/route.ts',
    ]) {
      expect(kod(rel), rel).toMatch(/\n\s+attribution,\n|\{ jobbpass: view, attribution \}/)
    }
  })

  test('attribution_link_enabled ligger aldrig i en explicit kolumnlista', () => {
    for (const rel of [
      'app/api/portal/[token]/route.ts',
      'app/api/jobbpass/public/[token]/route.ts',
      'app/api/lead-portal/[code]/route.ts',
      'app/api/referral-lead/route.ts',
      'app/api/widget/config/route.ts',
    ]) {
      expect(utanKommentarer(kod(rel)), rel).not.toContain('attribution_link_enabled')
    }
  })

  test('sidorna läser attribution ur svaret de redan hämtar — ingen ny fetch', () => {
    expect(kod('app/quote/[token]/page.tsx')).toContain('setAttribution(data.attribution || null)')
    expect(kod('app/jobbpass/[token]/page.tsx')).toContain('setAttribution(data.attribution || null)')
    expect(kod('app/lead-portal/[code]/page.tsx')).toContain('attribution={data.attribution}')
    expect(kod('app/rekommendera/[token]/page.tsx')).toContain('attribution={info.attribution}')
    expect(kod('app/widget/chat/page.tsx')).toContain('attribution={config.attribution}')
    for (const rel of KUNDVANDA_SIDOR) {
      expect(kod(rel), rel).not.toMatch(/fetch\([^)]*attribution/)
      expect(kod(rel), rel).not.toContain('loadAttribution')
    }
  })
})

test.describe('klientsäkerhet', () => {
  test('helpern och React-stämpeln importerar inget server-only', () => {
    for (const rel of ['lib/branding/attribution.ts', 'components/branding/AttributionStamp.tsx', 'lib/site-url.ts']) {
      const src = kod(rel)
      expect(src, rel).not.toMatch(/from '@\/lib\/supabase'/)
      expect(src, rel).not.toMatch(/from 'server-only'/)
      expect(src, rel).not.toMatch(/from '(fs|crypto|next\/headers)'/)
      // SupabaseClient får bara komma in som typ.
      expect(src, rel).not.toMatch(/^import \{ SupabaseClient \}/m)
      expect(src, rel).not.toMatch(/process\.env\.(?!NEXT_PUBLIC_)/)
    }
  })
})

// ── Global sweep ───────────────────────────────────────────────────────────

function allaKallfiler(dir: string, ut: string[] = []): string[] {
  for (const namn of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${namn}`
    const stat = fs.statSync(path.join(ROOT, rel))
    if (stat.isDirectory()) {
      if (namn === 'node_modules' || namn === '.next') continue
      allaKallfiler(rel, ut)
    } else if (/\.(ts|tsx|css)$/.test(namn)) {
      ut.push(rel)
    }
  }
  return ut
}

test('ingen stämpel-klartext utanför helpern och allowlisten (app/, lib/, components/)', () => {
  const rester: string[] = []
  for (const rel of [...allaKallfiler('app'), ...allaKallfiler('lib'), ...allaKallfiler('components')]) {
    if (ALLOWLIST[rel]) continue
    const src = utanKommentarer(kod(rel))
    if (GAMMAL_KLARTEXT_RE.test(src) || NY_KLARTEXT_RE.test(src)) rester.push(rel)
  }
  expect(rester, `Klartext kvar i: ${rester.join(', ')}`).toEqual([])
})

test('allowlistens filer finns fortfarande (annars är posten död)', () => {
  for (const rel of Object.keys(ALLOWLIST)) {
    expect(fs.existsSync(path.join(ROOT, rel)), rel).toBe(true)
  }
})
