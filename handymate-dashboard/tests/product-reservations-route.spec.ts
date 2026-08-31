import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import ts from 'typescript'
import { NextRequest } from 'next/server'

/**
 * app/api/products/[id]/reservations/route.ts — kopplar förbehåll
 * (reservation_texts) till en artikel FRÅN ARTIKELSIDAN (sql/v91_reservations.sql).
 *
 * Den enda egenskap som HELA designen hänger på: PUT scopear delete+insert på
 * product_id (inte reservation_id) och trigger_type='product', så en koppling
 * gjord härifrån aldrig stör en reservations ÖVRIGA triggers (annan artikel,
 * en category-trigger, ett keyword) — till skillnad från PUT /api/reservations
 * som ersätter en reservations HELA triggerlista.
 *
 * Mönster kopierat från tests/call-routes.spec.ts: transpilera routen och kör
 * de riktiga handlerfunktionerna mot explicita boundary-doubles. Ingen nätverk,
 * inga credentials.
 */
function loadRoute(file: string, mocks: Record<string, any>) {
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports: Record<string, any> = {}
  new Function('require', 'exports', code)((id: string) => mocks[id] ?? require(id), exports)
  return exports
}

const ROUTE_FILE = 'app/api/products/[id]/reservations/route.ts'

/**
 * Bygger en fejk-Supabase som spelar in varje kedjat anrop (table, method, args)
 * och svarar enligt `responses[table]` (en kö — .shift() per anrop mot tabellen).
 */
function fakeSupabase(responses: Record<string, any[]> = {}) {
  const operations: any[] = []
  const db = {
    from(table: string) {
      const q: any = {
        then: (resolve: any) => Promise.resolve(responses[table]?.shift() ?? { data: [], error: null }).then(resolve),
      }
      for (const method of ['select', 'eq', 'in', 'maybeSingle', 'delete', 'insert']) {
        q[method] = (...args: any[]) => {
          operations.push([table, method, ...args])
          return q
        }
      }
      return q
    },
  }
  return { db, operations }
}

function route(business: { business_id: string } | null, responses: Record<string, any[]> = {}) {
  const { db, operations } = fakeSupabase(responses)
  const api = loadRoute(ROUTE_FILE, {
    '@/lib/auth': { getAuthenticatedBusiness: async () => business },
    '@/lib/supabase': { getServerSupabase: () => db },
  })
  return { api, operations }
}

function req(url: string, init?: { method?: string; body?: unknown }) {
  return new NextRequest(`https://test${url}`, {
    method: init?.method,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
}

// ── Auth / ownership ─────────────────────────────────────────────────────

test('GET kräver autentisering', async () => {
  const { api } = route(null)
  const res = await api.GET(req('/api/products/p1/reservations'), { params: { id: 'p1' } })
  expect(res.status).toBe(401)
})

test('PUT kräver autentisering', async () => {
  const { api } = route(null)
  const res = await api.PUT(req('/api/products/p1/reservations', { method: 'PUT', body: { reservation_ids: [] } }), {
    params: { id: 'p1' },
  })
  expect(res.status).toBe(401)
})

test('GET 404:ar på en produkt som tillhör ett annat företag', async () => {
  const { api } = route({ business_id: 'biz_a' }, { products: [{ data: null, error: null }] })
  const res = await api.GET(req('/api/products/foreign/reservations'), { params: { id: 'foreign' } })
  expect(res.status).toBe(404)
})

test('PUT 404:ar på en produkt som tillhör ett annat företag — och rör aldrig triggers', async () => {
  const { api, operations } = route(
    { business_id: 'biz_a' },
    { products: [{ data: null, error: null }] }
  )
  const res = await api.PUT(
    req('/api/products/foreign/reservations', { method: 'PUT', body: { reservation_ids: ['res_1'] } }),
    { params: { id: 'foreign' } }
  )
  expect(res.status).toBe(404)
  expect(operations.some(([table]) => table === 'reservation_triggers')).toBe(false)
})

test('produktägarskapet kontrolleras scopeat på business_id', async () => {
  const { api, operations } = route(
    { business_id: 'biz_a' },
    {
      products: [{ data: { id: 'p1' }, error: null }],
      reservation_triggers: [{ data: [], error: null }],
    }
  )
  await api.GET(req('/api/products/p1/reservations'), { params: { id: 'p1' } })
  expect(operations).toContainEqual(['products', 'eq', 'id', 'p1'])
  expect(operations).toContainEqual(['products', 'eq', 'business_id', 'biz_a'])
})

// ── GET ───────────────────────────────────────────────────────────────────

test('GET returnerar titel/innehåll för länkade förbehåll (join reservation_texts)', async () => {
  const { api } = route(
    { business_id: 'biz_a' },
    {
      products: [{ data: { id: 'p1' }, error: null }],
      reservation_triggers: [{ data: [{ reservation_id: 'res_1' }, { reservation_id: 'res_2' }], error: null }],
      reservation_texts: [
        {
          data: [
            { id: 'res_1', title: 'Dolda fel', content: 'Reservation för dolda fel.' },
            { id: 'res_2', title: 'Asbest', content: 'Reservation för asbest.' },
          ],
          error: null,
        },
      ],
    }
  )
  const res = await api.GET(req('/api/products/p1/reservations'), { params: { id: 'p1' } })
  expect(res.status).toBe(200)
  const body = await res.json()
  expect(body.reservations).toEqual([
    { id: 'res_1', title: 'Dolda fel', content: 'Reservation för dolda fel.' },
    { id: 'res_2', title: 'Asbest', content: 'Reservation för asbest.' },
  ])
})

test('GET returnerar tom lista utan extra uppslag när inga triggers finns', async () => {
  const { api, operations } = route(
    { business_id: 'biz_a' },
    {
      products: [{ data: { id: 'p1' }, error: null }],
      reservation_triggers: [{ data: [], error: null }],
    }
  )
  const res = await api.GET(req('/api/products/p1/reservations'), { params: { id: 'p1' } })
  expect(res.status).toBe(200)
  expect((await res.json()).reservations).toEqual([])
  expect(operations.some(([table]) => table === 'reservation_texts')).toBe(false)
})

// ── PUT: validering ──────────────────────────────────────────────────────

test('PUT avvisar ett id som inte finns i företagets reservationsbibliotek — INNAN någon skrivning', async () => {
  const { api, operations } = route(
    { business_id: 'biz_a' },
    {
      products: [{ data: { id: 'p1' }, error: null }],
      reservation_texts: [{ data: [{ id: 'res_1' }], error: null }], // res_evil saknas
    }
  )
  const res = await api.PUT(
    req('/api/products/p1/reservations', { method: 'PUT', body: { reservation_ids: ['res_1', 'res_evil'] } }),
    { params: { id: 'p1' } }
  )
  expect(res.status).toBe(400)
  expect(operations.some(([table, method]) => table === 'reservation_triggers' && method === 'delete')).toBe(false)
  expect(operations.some(([table, method]) => table === 'reservation_triggers' && method === 'insert')).toBe(false)
})

test('PUT kräver att reservation_ids är en lista', async () => {
  const { api } = route(
    { business_id: 'biz_a' },
    { products: [{ data: { id: 'p1' }, error: null }] }
  )
  const res = await api.PUT(req('/api/products/p1/reservations', { method: 'PUT', body: {} }), {
    params: { id: 'p1' },
  })
  expect(res.status).toBe(400)
})

// ── PUT: den skarpa egenskapen — scopead delete+insert ──────────────────

test('PUT ersätter produktens triggers SCOPEAT på product_id — rör aldrig reservation_id', async () => {
  const { api, operations } = route(
    { business_id: 'biz_a' },
    {
      products: [{ data: { id: 'p1' }, error: null }],
      reservation_texts: [
        { data: [{ id: 'res_1' }], error: null }, // valideringsuppslaget
        { data: [{ id: 'res_1', title: 'Dolda fel', content: 'Text' }], error: null }, // svaret i slutet
      ],
    }
  )
  const res = await api.PUT(
    req('/api/products/p1/reservations', { method: 'PUT', body: { reservation_ids: ['res_1'] } }),
    { params: { id: 'p1' } }
  )
  expect(res.status).toBe(200)

  const deleteCall = operations.find(([table, method]) => table === 'reservation_triggers' && method === 'delete')
  expect(deleteCall).toBeTruthy()
  expect(operations).toContainEqual(['reservation_triggers', 'eq', 'product_id', 'p1'])
  expect(operations).toContainEqual(['reservation_triggers', 'eq', 'business_id', 'biz_a'])
  expect(operations).toContainEqual(['reservation_triggers', 'eq', 'trigger_type', 'product'])
  // Den skarpa negativa kontrollen: delete/insert-scopet nämner ALDRIG
  // reservation_id — det är precis det som hade riskerat att tappa en
  // reservations övriga triggers (annan artikel/category/keyword).
  expect(operations.some(([table, method, col]) => table === 'reservation_triggers' && method === 'eq' && col === 'reservation_id')).toBe(false)

  const insertCall = operations.find(([table, method]) => table === 'reservation_triggers' && method === 'insert')
  expect(insertCall).toBeTruthy()
  const insertedRows = insertCall![2]
  expect(insertedRows).toEqual([{ business_id: 'biz_a', reservation_id: 'res_1', trigger_type: 'product', product_id: 'p1' }])
})

test('PUT med tom lista raderar produktens kopplingar utan att röra andra tabeller', async () => {
  const { api, operations } = route(
    { business_id: 'biz_a' },
    { products: [{ data: { id: 'p1' }, error: null }] }
  )
  const res = await api.PUT(req('/api/products/p1/reservations', { method: 'PUT', body: { reservation_ids: [] } }), {
    params: { id: 'p1' },
  })
  expect(res.status).toBe(200)
  expect((await res.json()).reservations).toEqual([])
  expect(operations.some(([table, method]) => table === 'reservation_triggers' && method === 'delete')).toBe(true)
  expect(operations.some(([table, method]) => table === 'reservation_triggers' && method === 'insert')).toBe(false)
})

/**
 * Två OLIKA produkter som båda länkas till SAMMA reservation: att spara
 * produkt A:s koppling får inte generera någon delete/insert-operation som
 * nämner produkt B — bara p_a dyker upp i product_id-argumenten.
 */
test('PUT för produkt A nämner aldrig produkt B:s id i scope-argumenten', async () => {
  const { api, operations } = route(
    { business_id: 'biz_a' },
    {
      products: [{ data: { id: 'p_a' }, error: null }],
      reservation_texts: [{ data: [{ id: 'res_1' }], error: null }, { data: [{ id: 'res_1', title: 'x', content: 'y' }], error: null }],
    }
  )
  await api.PUT(req('/api/products/p_a/reservations', { method: 'PUT', body: { reservation_ids: ['res_1'] } }), {
    params: { id: 'p_a' },
  })
  const productIdArgs = operations
    .filter(([table, method, col]) => table === 'reservation_triggers' && method === 'eq' && col === 'product_id')
    .map(op => op[3])
  expect(productIdArgs).toEqual(['p_a'])
  expect(productIdArgs).not.toContain('p_b')
})
