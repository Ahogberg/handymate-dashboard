/**
 * Hemsida-nudgen — facit-tester för den rena hjälpfunktionen i
 * lib/storefront/generate-content.ts (slug-genereringen, delad mellan
 * den manuella "Skapa min hemsida"-knappen och app/api/cron/hemsida-forslag).
 * Ren funktion, ingen nätverk/DB.
 *
 * Körs: npx playwright test tests/hemsida-nudge.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { generateStorefrontSlug } from '../lib/storefront/generate-content'

test.describe('generateStorefrontSlug', () => {
  test('gör om företagsnamn till lowercase-slug', () => {
    expect(generateStorefrontSlug('Andreas Bygg')).toBe('andreas-bygg')
  })

  test('strippar bolagsform-suffix (AB, HB, KB, enskild firma, EF)', () => {
    expect(generateStorefrontSlug('Andreas Bygg AB')).toBe('andreas-bygg')
    expect(generateStorefrontSlug('Nordic VVS HB')).toBe('nordic-vvs')
    expect(generateStorefrontSlug('Petersson Måleri KB')).toBe('petersson-maleri')
    expect(generateStorefrontSlug('Karlsson Enskild Firma')).toBe('karlsson')
    expect(generateStorefrontSlug('Karlsson EF')).toBe('karlsson')
  })

  test('translittererar å/ä/ö', () => {
    expect(generateStorefrontSlug('Åkerlunds Måleri')).toBe('akerlunds-maleri')
    expect(generateStorefrontSlug('Örebro Elektriker')).toBe('orebro-elektriker')
  })

  test('tar bort icke-alfanumeriska tecken och kollapsar bindestreck', () => {
    expect(generateStorefrontSlug('J&J Bygg + Renovering!')).toBe('j-j-bygg-renovering')
  })

  test('trimmar ledande/avslutande bindestreck som uppstår av specialtecken', () => {
    expect(generateStorefrontSlug('!Bygg!')).toBe('bygg')
  })

  test('begränsar längden till 30 tecken', () => {
    const slug = generateStorefrontSlug('Ett Väldigt Långt Företagsnamn Som Inte Får Plats')
    expect(slug.length).toBeLessThanOrEqual(30)
  })

  test('tom/saknad input kraschar inte — ger tom sträng', () => {
    expect(generateStorefrontSlug('')).toBe('')
    // @ts-expect-error — defensivt: cron-koden kan i teorin skicka in null/undefined
    // om business_name saknas i business_config; funktionen ska degradera snällt.
    expect(generateStorefrontSlug(undefined)).toBe('')
  })
})
