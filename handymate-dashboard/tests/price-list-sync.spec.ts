import { test, expect } from '@playwright/test'
import { syncPriceListRow } from '../lib/products/sync-price-list'

// price_list och products är två separata tabeller utan gemensam nyckel
// fram tills v137 (product_id). En prisändring i produktbanken (Settings →
// Produkter) har historiskt ALDRIG synts i price_list — telefonagenten
// Lisa, den publika storefronten och widget-chatten fortsätter citera det
// gamla, seedade priset för alltid. Det här facitet läser aldrig en riktig
// databas — det verifierar bara matchnings- och felhanteringslogiken mot en
// handrullad fejk-klient, samma stil som tests/outbound-safety.spec.ts.

type QueryResult = { data: any; error: any }

function fakePriceList(byProductId: QueryResult, byName?: QueryResult) {
  const calls: Array<{ filters: Record<string, unknown>; updates: Record<string, unknown> }> = []

  return {
    calls,
    client: {
      from(table: string) {
        if (table !== 'price_list') throw new Error(`oväntad tabell: ${table}`)
        let updates: Record<string, unknown> = {}
        const filters: Record<string, unknown> = {}
        const query: any = {
          update(u: Record<string, unknown>) { updates = u; return query },
          eq(col: string, val: unknown) { filters[col] = val; return query },
          is(col: string, val: unknown) { filters[col] = val; return query },
          select() {
            calls.push({ filters: { ...filters }, updates })
            const isNameMatch = 'name' in filters
            return Promise.resolve(isNameMatch ? (byName ?? { data: [], error: null }) : byProductId)
          },
          // supabase-js-byggaren är själv PromiseLike — .update().eq() utan
          // ett avslutande .select() går fortfarande att await:a direkt.
          then(resolve: (v: QueryResult) => unknown, reject: (e: unknown) => unknown) {
            calls.push({ filters: { ...filters }, updates })
            const isNameMatch = 'name' in filters
            return Promise.resolve(isNameMatch ? (byName ?? { data: null, error: null }) : byProductId)
              .then(resolve, reject)
          },
        }
        return query
      },
    } as any,
  }
}

test.describe('syncPriceListRow — products → price_list skriv-igenom', () => {
  test('matchar på product_id och uppdaterar pris/namn/enhet/aktiv-status', async () => {
    const fake = fakePriceList({ data: [{ id: 'pl_1' }], error: null })
    await syncPriceListRow(fake.client, 'biz_a', 'prod_1',
      { name: 'Elinstallation', unit: 'tim', unit_price: 650, is_active: true },
    )
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0].filters).toMatchObject({ business_id: 'biz_a', product_id: 'prod_1' })
    expect(fake.calls[0].updates).toEqual({ name: 'Elinstallation', unit: 'tim', unit_price: 650, is_active: true })
  })

  test('produkt utan product_id-träff och utan namn-fallback är ett säkert no-op', async () => {
    const fake = fakePriceList({ data: [], error: null })
    await syncPriceListRow(fake.client, 'biz_a', 'prod_utan_koppling', { is_active: false })
    // Bara product_id-försöket görs — ingen namn-fallback skickades in.
    expect(fake.calls).toHaveLength(1)
  })

  test('förmigrations-rad (product_id NULL) matchas via namn-fallback', async () => {
    const fake = fakePriceList(
      { data: [], error: null },
      { data: null, error: null },
    )
    await syncPriceListRow(fake.client, 'biz_a', 'prod_1',
      { name: 'Elinstallation', unit: 'tim', unit_price: 700, is_active: true },
      'Elinstallation',
    )
    expect(fake.calls).toHaveLength(2)
    expect(fake.calls[1].filters).toMatchObject({ business_id: 'biz_a', product_id: null, name: 'Elinstallation' })
  })

  test('ett DB-fel på product_id-matchningen loggas men kastar aldrig', async () => {
    const fake = fakePriceList({ data: null, error: { message: 'boom' } })
    const originalError = console.error
    const logs: any[] = []
    console.error = (...args: any[]) => { logs.push(args) }
    try {
      await expect(syncPriceListRow(fake.client, 'biz_a', 'prod_1',
        { name: 'X', unit: 'tim', unit_price: 100, is_active: true },
      )).resolves.toBeUndefined()
      expect(logs.some(l => JSON.stringify(l).includes('boom'))).toBe(true)
    } finally {
      console.error = originalError
    }
  })

  test('ett DB-fel på namn-fallbacken loggas men kastar aldrig', async () => {
    const fake = fakePriceList(
      { data: [], error: null },
      { data: null, error: { message: 'namn-fel' } },
    )
    const originalError = console.error
    const logs: any[] = []
    console.error = (...args: any[]) => { logs.push(args) }
    try {
      await expect(syncPriceListRow(fake.client, 'biz_a', 'prod_1',
        { name: 'X', unit: 'tim', unit_price: 100, is_active: true },
        'X',
      )).resolves.toBeUndefined()
      expect(logs.some(l => JSON.stringify(l).includes('namn-fel'))).toBe(true)
    } finally {
      console.error = originalError
    }
  })

  test('produkt.category synkas ALDRIG — mappningen är inte 1:1', async () => {
    const fake = fakePriceList({ data: [{ id: 'pl_1' }], error: null })
    await syncPriceListRow(fake.client, 'biz_a', 'prod_1',
      { name: 'X', unit: 'st', unit_price: 100, is_active: true },
    )
    expect(fake.calls[0].updates).not.toHaveProperty('category')
  })

  test('ett tomt updates-objekt är ett no-op — ingen fråga skickas', async () => {
    const fake = fakePriceList({ data: [], error: null })
    await syncPriceListRow(fake.client, 'biz_a', 'prod_1', {})
    expect(fake.calls).toHaveLength(0)
  })
})
