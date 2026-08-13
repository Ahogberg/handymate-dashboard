import { test, expect } from '@playwright/test'
import { asTermsString } from '@/lib/quote-templates/data-builder'

/**
 * Regressionsfacit för en riktig produktionskrasch (2026-08-13, hittad via
 * Golden Path E2E-harnesset): business_config.default_quote_terms är JSONB
 * DEFAULT '{}' (sql/quote_enhancements.sql:22) men lib/quote-templates/
 * data-builder.ts's paymentTerms-fallback läste den som om den vore en
 * sträng. QuoteDocument.tsx renderar {data.quote.paymentTerms} direkt som
 * JSX-barn i visningsläge — ett rått {} där kraschade sidan med
 * "Objects are not valid as a React child" för VARJE ny offert (bekräftat:
 * samtliga 22 företag i produktion stod på default-värdet {}).
 *
 * asTermsString är den faktiska gaten — testar den direkt, inte via hela
 * buildQuoteTemplateData (som kräver ett stort fixture-objekt för litet
 * mervärde här).
 */
test.describe('asTermsString — skyddar mot JSONB-defaultens {} som JSX-barn', () => {
  test('en riktig sträng passerar oförändrad', () => {
    expect(asTermsString('30 dagar netto')).toBe('30 dagar netto')
  })

  test('tomt objekt (business_config.default_quote_terms JSONB-default) → tom sträng', () => {
    expect(asTermsString({})).toBe('')
  })

  test('objekt med nycklar → tom sträng (aldrig ett rått objekt som JSX-barn)', () => {
    expect(asTermsString({ some: 'shape' })).toBe('')
  })

  test('null/undefined → tom sträng', () => {
    expect(asTermsString(null)).toBe('')
    expect(asTermsString(undefined)).toBe('')
  })

  test('array → tom sträng (samma skydd, en annan icke-sträng-form)', () => {
    expect(asTermsString(['a', 'b'])).toBe('')
  })

  test('tom sträng förblir tom sträng', () => {
    expect(asTermsString('')).toBe('')
  })
})
