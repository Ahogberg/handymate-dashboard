/**
 * Facit för C3/C4 (Prisslingan V2 pass 3): POST /api/products är en UPSERT.
 * Källkontrakt — låser uppslaget, hitta+prissätt-vägen, 23505-skyddsnätet
 * och kategorinormaliseringen.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const source = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('POST /api/products — upsert, aldrig dubblettmotor', () => {
  const route = source('app/api/products/route.ts')

  test('exakt namn+enhet-uppslag (case-okänsligt, tenant-filtrerat) före insert', () => {
    expect(route).toContain(".ilike('name'")
    expect(route).toContain(".eq('unit', enhet)")
    // wildcard-tecken escapas — ett produktnamn med % får inte bli ett mönster
    expect(route).toContain("replace(/([%_\\\\])/g")
  })

  test('prislös befintlig + pris i body → UPDATE (hitta+prissätt), created:false', () => {
    expect(route).toContain('updated_price: true')
    expect(route).toContain('created: false')
  })

  test('23505-race → returnera vinnaren, inte ett fel', () => {
    expect(route).toContain("code === '23505'")
  })

  test('kategorin normaliseras till v88-mängden', () => {
    expect(route).toContain('kanoniskKategori(body.category)')
    expect(route).toMatch(/'arbete' \| 'material' \| 'hyra' \| 'övrigt'/)
  })

  test('nyskapade svarar created:true — klienterna kan skilja vägarna', () => {
    expect(route).toContain('product: data, created: true')
  })
})

test.describe('C4 — offertens auto-create speglar server-upserten', () => {
  test('created:false + updated_price → setLocalPrice', () => {
    const sida = source('app/dashboard/quotes/new/page.tsx')
    expect(sida).toContain('data.created === false && data.updated_price')
  })
})
