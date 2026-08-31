/**
 * Facit för Fas 1.7 (offert-omtaget, 2026-08-31) — den konfirmerade buggen
 * där varje företag fick Handymates hårdkodade mallpriser
 * (lib/quote-template-defaults.ts) istället för sin egen timkostnad eller
 * sina egna artikelpriser.
 *
 * Tre kategorier testas separat, plus att "hellre missa än gissa fel" hålls
 * — en falsk träff är dyrare än en prislös rad (se
 * lib/products/match-generated-items.ts).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/resolve-template-item-prices.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  resolveTemplateItemPrices,
  DEFAULT_TEMPLATE_HOURLY_RATE,
  type TemplatePricingProduct,
} from '../lib/quotes/resolve-template-item-prices'
import { getDefaultQuoteTemplates } from '../lib/quote-template-defaults'
import type { QuoteItem } from '../lib/types/quote'

function line(overrides: Partial<QuoteItem>): QuoteItem {
  return {
    id: overrides.id || 'qi_test',
    item_type: 'item',
    description: 'Rad',
    quantity: 1,
    unit: 'st',
    unit_price: 0,
    total: 0,
    is_rot_eligible: false,
    is_rut_eligible: false,
    rot_rut_type: null,
    sort_order: 0,
    ...overrides,
  }
}

test.describe('kategori 1 — arbetsrader (unit "tim")', () => {
  test('företagets egen timkostnad slår mallens gissning, inte tvärtom', () => {
    const items = [line({ description: 'Arbetskostnad', quantity: 8, unit: 'tim', unit_price: 650 })]
    const [resolved] = resolveTemplateItemPrices(items, [], 950)
    expect(resolved.unit_price).toBe(950)
    expect(resolved.total).toBe(8 * 950)
  })

  test('gäller lika för alla branschers seedade á-priser (650/750/550...)', () => {
    // El-mallarna seedar 750, måleri seedar 550 — ingen av dem ska överleva.
    const items = [
      line({ description: 'El-arbete', quantity: 4, unit: 'tim', unit_price: 750 }),
      line({ description: 'Målningsarbete', quantity: 4, unit: 'tim', unit_price: 550 }),
    ]
    const resolved = resolveTemplateItemPrices(items, [], 900)
    expect(resolved.every(i => i.unit_price === 900)).toBe(true)
  })

  test('gäller även tillvalsrader (item_type "option") i timmar', () => {
    const items = [
      line({ item_type: 'option', description: 'Målning snickerier', quantity: 8, unit: 'tim', unit_price: 550 }),
    ]
    const [resolved] = resolveTemplateItemPrices(items, [], 900)
    expect(resolved.unit_price).toBe(900)
    expect(resolved.total).toBe(8 * 900)
  })

  test('saknas pricingSettings.hourly_rate: faller tillbaka på 650, precis som den äldre legacy-vägen', () => {
    const items = [line({ unit: 'tim', quantity: 2, unit_price: 750 })]
    expect(resolveTemplateItemPrices(items, [], null)[0].unit_price).toBe(DEFAULT_TEMPLATE_HOURLY_RATE)
    expect(resolveTemplateItemPrices(items, [], undefined)[0].unit_price).toBe(DEFAULT_TEMPLATE_HOURLY_RATE)
    expect(resolveTemplateItemPrices(items, [], 0)[0].unit_price).toBe(DEFAULT_TEMPLATE_HOURLY_RATE)
  })

  test('rubrik- och delsummerader har ingen "timkostnad" — rörs aldrig', () => {
    const heading = line({ item_type: 'heading', description: 'Rivning', unit: 'st', unit_price: 0, total: 0 })
    const subtotal = line({ item_type: 'subtotal', description: 'Delsumma', unit: 'st', unit_price: 0, total: 12345 })
    const [h, s] = resolveTemplateItemPrices([heading, subtotal], [], 950)
    expect(h).toEqual(heading)
    expect(s).toEqual(subtotal)
  })
})

test.describe('kategori 2 — materialrader kopplas till produktbanken', () => {
  test('exakt namnträff mot en artikel med satt pris: artikelns pris vinner, inte mallens gissning', () => {
    const items = [line({ description: 'Färg och material', quantity: 1, unit: 'st', unit_price: 3500 })]
    const products: TemplatePricingProduct[] = [
      { id: 'prod-farg', name: 'Färg och material', unit: 'st', sales_price: 2100 },
    ]
    const [resolved] = resolveTemplateItemPrices(items, products, 650)
    expect(resolved.unit_price).toBe(2100)
    expect(resolved.total).toBe(2100)
    expect(resolved.linked_product_id).toBe('prod-farg')
    expect(resolved.ai_price_missing).toBeFalsy()
  })

  test('träff mot en artikel som SJÄLV är prislös: kopplas, men blir ändå prislös — ärver inte mallens gissning', () => {
    const items = [line({ description: 'Färg och material', quantity: 1, unit: 'st', unit_price: 3500 })]
    const products: TemplatePricingProduct[] = [
      { id: 'prod-farg', name: 'Färg och material', unit: 'st', sales_price: 0 },
    ]
    const [resolved] = resolveTemplateItemPrices(items, products, 650)
    expect(resolved.unit_price).toBe(0)
    expect(resolved.total).toBe(0)
    expect(resolved.ai_price_missing).toBe(true)
    expect(resolved.linked_product_id).toBe('prod-farg')
  })

  test('fel enhetsfamilj hindrar en FUZZY-träff, hur likt namnet än är', () => {
    // Ett nära (men inte exakt) namn i olika enhetsfamiljer (styck vs timmar)
    // är olika saker — se lib/products/match-generated-items.ts UNIT_FAMILIES.
    // (Exakt namnmatch ignorerar medvetet enhetsfamiljen — det testas i
    // tests/match-generated-items.spec.ts — så det här fallet måste vara
    // en FUZZY-kandidat, inte en exakt sträng, för att pröva rätt gren.)
    const items = [line({ description: 'Kakel och klinker till badrum', quantity: 1, unit: 'st', unit_price: 14000 })]
    const products: TemplatePricingProduct[] = [
      { id: 'prod-x', name: 'Kakel och klinker', unit: 'tim', sales_price: 500 },
    ]
    const [resolved] = resolveTemplateItemPrices(items, products, 650)
    expect(resolved.ai_price_missing).toBe(true)
    expect(resolved.linked_product_id).toBeUndefined()
  })

  test('ingen träff alls: prislös, mallens gissning skrivs aldrig fram', () => {
    const items = [line({ description: 'Byggmaterial (skivor, flytspackel, tätskikt)', quantity: 1, unit: 'st', unit_price: 18000 })]
    const [resolved] = resolveTemplateItemPrices(items, [], 650)
    expect(resolved.unit_price).toBe(0)
    expect(resolved.total).toBe(0)
    expect(resolved.ai_price_missing).toBe(true)
    expect(resolved.linked_product_id).toBeUndefined()
  })

  test('avsiktlig 0-kronorsrad ("debiteras löpande") rörs inte — ingen amber-markering', () => {
    const items = [line({ description: 'Material debiteras med inköpspris + 15 % påslag', quantity: 1, unit: 'st', unit_price: 0 })]
    const [resolved] = resolveTemplateItemPrices(items, [], 650)
    expect(resolved.unit_price).toBe(0)
    expect(resolved.ai_price_missing).toBeFalsy()
  })
})

test.describe('kategori 3 — fasta paketpriser: samma "prislös tills bekräftad"-fålla som en omatchad materialrad', () => {
  test('elbesiktningens fasta pris utan tidigare bekräftelse: markeras prislös, visar aldrig Handymates gissning som fakta', () => {
    const items = [line({ description: 'Elbesiktning inkl. protokoll (fast pris)', quantity: 1, unit: 'st', unit_price: 4500 })]
    const [resolved] = resolveTemplateItemPrices(items, [], 650)
    expect(resolved.unit_price).toBe(0)
    expect(resolved.total).toBe(0)
    expect(resolved.ai_price_missing).toBe(true)
  })

  test('om företaget råkar ha en artikel som EXAKT matchar paketnamnet med ett satt pris används den istället', () => {
    const items = [line({ description: 'Elbesiktning inkl. protokoll (fast pris)', quantity: 1, unit: 'st', unit_price: 4500 })]
    const products: TemplatePricingProduct[] = [
      { id: 'prod-besiktning', name: 'Elbesiktning inkl. protokoll (fast pris)', unit: 'st', sales_price: 3900 },
    ]
    const [resolved] = resolveTemplateItemPrices(items, products, 650)
    expect(resolved.unit_price).toBe(3900)
    expect(resolved.ai_price_missing).toBeFalsy()
  })
})

test.describe('integrationsfacit — alla riktiga mallar i lib/quote-template-defaults.ts', () => {
  test('ingen bransch-mall lämnar en arbetsrad med mallens hårdkodade á-pris kvar', () => {
    for (const branch of ['construction', 'electrician', 'plumber', 'painter', 'other']) {
      for (const tmpl of getDefaultQuoteTemplates(branch)) {
        const resolved = resolveTemplateItemPrices(tmpl.default_items, [], 999)
        for (const item of resolved) {
          if (item.unit === 'tim' && (item.item_type === 'item' || item.item_type === 'option')) {
            expect(item.unit_price).toBe(999)
          }
        }
      }
    }
  })

  test('utan produktbank blir varje gissad materialrad/paketpris i alla mallar prislös, aldrig kvar med Handymates gissning', () => {
    for (const branch of ['construction', 'electrician', 'plumber', 'painter', 'other']) {
      for (const tmpl of getDefaultQuoteTemplates(branch)) {
        const resolved = resolveTemplateItemPrices(tmpl.default_items, [], 650)
        for (const item of resolved) {
          if (
            (item.item_type === 'item' || item.item_type === 'option') &&
            item.unit !== 'tim' &&
            tmpl.default_items.find(o => o.id === item.id)!.unit_price > 0
          ) {
            expect(item.ai_price_missing).toBe(true)
            expect(item.unit_price).toBe(0)
          }
        }
      }
    }
  })
})
