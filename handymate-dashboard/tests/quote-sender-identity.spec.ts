/**
 * Offert-identitet — avsändaren = skaparen + "Vår referens" (Commit 3, RENDER).
 * buildQuoteTemplateData:
 *  (1) creator satt → business.contactName/phone/email = skaparens
 *  (2) creator null → business_config-fallback (legacy oförändrad)
 *  (3) creator med null-telefon → namn från skaparen, telefon från fallback
 *  (4) referencePerson mappas från quote.reference_person
 * Körs: npx playwright test tests/quote-sender-identity.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { buildQuoteTemplateData } from '../lib/quote-templates/data-builder'

// Minimal giltig offert: inga rader (quote_items/items tomma), inga totaler.
// data-buildern tål tomma arrays och härleder resten.
function quote(over: Record<string, any> = {}) {
  return { quote_items: [], items: [], created_at: '2026-07-01T00:00:00Z', ...over }
}

// business_config med ägarens kontaktfält (fallback-källan).
const config = {
  business_name: 'Bygg AB',
  org_number: '556677-8899',
  contact_name: 'Ägaren Olle',
  phone_number: '070-1111111',
  contact_email: 'olle@byggab.se',
}

test.describe('buildQuoteTemplateData — avsändaridentitet', () => {
  test('(1) creator satt → skaparens namn/tel/mail vinner', () => {
    const d = buildQuoteTemplateData(quote(), config, config, {
      name: 'Skaparen Sara',
      phone: '070-2222222',
      email: 'sara@byggab.se',
    })
    expect(d.business.contactName).toBe('Skaparen Sara')
    expect(d.business.phone).toBe('070-2222222')
    expect(d.business.email).toBe('sara@byggab.se')
    // Företagsnamn/orgnr behålls alltid från config
    expect(d.business.name).toBe('Bygg AB')
    expect(d.business.orgNumber).toBe('556677-8899')
  })

  test('(2) creator null → business_config-fallback (legacy oförändrad)', () => {
    const d = buildQuoteTemplateData(quote(), config, config, null)
    expect(d.business.contactName).toBe('Ägaren Olle')
    expect(d.business.phone).toBe('070-1111111')
    expect(d.business.email).toBe('olle@byggab.se')
  })

  test('(2b) creator utelämnad (undefined) → samma fallback', () => {
    const d = buildQuoteTemplateData(quote(), config, config)
    expect(d.business.contactName).toBe('Ägaren Olle')
    expect(d.business.phone).toBe('070-1111111')
    expect(d.business.email).toBe('olle@byggab.se')
  })

  test('(3) creator med null-telefon → namn från skaparen, tel från fallback', () => {
    const d = buildQuoteTemplateData(quote(), config, config, {
      name: 'Skaparen Sara',
      phone: null,
      email: 'sara@byggab.se',
    })
    expect(d.business.contactName).toBe('Skaparen Sara')
    expect(d.business.phone).toBe('070-1111111') // ?? fallback
    expect(d.business.email).toBe('sara@byggab.se')
  })

  test('(4) referencePerson mappas från quote.reference_person', () => {
    const d = buildQuoteTemplateData(quote({ reference_person: 'Sara' }), config, config, null)
    expect(d.referencePerson).toBe('Sara')
  })

  test('(4b) reference_person saknas → referencePerson null', () => {
    const d = buildQuoteTemplateData(quote(), config, config, null)
    expect(d.referencePerson).toBeNull()
  })
})
