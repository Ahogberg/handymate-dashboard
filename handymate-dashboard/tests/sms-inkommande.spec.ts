import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import * as ts from 'typescript'

// Facit för inkommande SMS.
//
// 2026-09-09: sms_log innehöll 192 utgående meddelanden och NOLL inkommande —
// någonsin. Rutten hade aldrig tagit emot ett enda anrop, eftersom den delade
// samma trasiga signaturgrind som samtalsvägen (headern X-46elks-Signature
// finns inte). Samtidigt går det sedan samma kväll ut ett fångst-SMS dygnet
// runt som ordagrant säger "Svara på detta SMS med vad du behöver hjälp med".
// Vi bad alltså kunden om något som gick rakt ner i ett svart hål.
//
// Provet kör den VERKLIGA rutten mot den payload 46elks dokumenterar. Det är
// den enda sortens prov som hade fångat felet: ett facit som signerar sina
// egna anrop bekräftar bara vår egen antagning.

const ROT = join(__dirname, '..')

/** 46elks dokumenterade payload för inkommande SMS. */
const PAYLOAD = new URLSearchParams({
  direction: 'incoming',
  id: 'sf1ab2c3d4e5f6',
  from: '+46708379552',
  to: '+46766860747',
  message: 'Hej, proppskåpet är från 70-talet och en säkring går hela tiden.',
  created: '2026-09-09T22:31:34.148000',
}).toString()

function laddaRutt(mocks: Record<string, any>) {
  const fil = join(ROT, 'app/api/sms/incoming/route.ts')
  const kod = ts.transpileModule(readFileSync(fil, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports: Record<string, any> = {}
  new Function('require', 'exports', kod)((id: string) => mocks[id] ?? require(id), exports)
  return exports
}

function db(svar: Record<string, any[]>, operationer: any[] = []) {
  return {
    operationer,
    from(tabell: string) {
      const resultat = svar[tabell]?.shift() ?? { data: null, error: null }
      const q: any = { then: (r: any) => Promise.resolve(resultat).then(r) }
      for (const m of ['select', 'eq', 'is', 'in', 'order', 'limit', 'insert', 'update', 'upsert']) {
        q[m] = (...a: any[]) => { operationer.push([tabell, m, ...a]); return q }
      }
      q.maybeSingle = async () => { operationer.push([tabell, 'maybeSingle']); return resultat }
      q.single = async () => { operationer.push([tabell, 'single']); return resultat }
      return q
    },
  }
}

const FORETAG = { business_id: 'biz_al7pjuu5smi', business_name: 'Nordström El AB' }

function bas(extra: Record<string, any> = {}) {
  return {
    '@/lib/elks-webhook-auth': {
      verifieraElksWebhook: () => ({ ok: true, via: 'hemlighet' }),
      larmaAvvisadElksWebhook: () => {},
      medElksHemlighet: (u: string) => u,
    },
    '@/lib/agent-trigger': { triggerAgentFireAndForget: () => {}, makeIdempotencyKey: () => 'k' },
    '@/lib/sms-send': { sendSmsViaElks: async () => ({ ok: true }), parseOptOutCommand: () => null },
    '@/lib/outbound/sms-gate': { resolveSmsCustomer: async () => ({ ok: false, code: 'not_found', error: 'x' }) },
    '@/lib/matte/owner-sender': { isTeamPhone: async () => false },
    // Nås via dynamisk import längre ner i rutten. Mockas för att hålla
    // grindens utdata ren — att den ALLS nås är i sig ett tecken på att
    // tenantupplösningen gick igenom.
    '@/lib/matte/resolver': { resolveEntity: async () => null },
    ...extra,
  }
}

function anrop() {
  return new NextRequest('https://app.handymate.se/api/sms/incoming?k=hemlig', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: PAYLOAD,
  })
}

test('dokumentationens payload når fram och tenanten löses på det uppringda numret', async () => {
  const ops: any[] = []
  const api = laddaRutt(bas({
    '@/lib/supabase': { getServerSupabase: () => db({ business_config: [{ data: FORETAG, error: null }] }, ops) },
  }))
  const svar = await api.POST(anrop())

  expect(svar.status, 'gick inte igenom grinden').not.toBe(401)
  expect(svar.status).toBeLessThan(500)
  // Tenanten ska slås upp på det NUMMER SOM RINGDES, inte på avsändaren.
  const uppslag = ops.find(o => o[0] === 'business_config' && o[1] === 'eq' && o[2] === 'assigned_phone_number')
  expect(uppslag, 'slår inte upp företaget på assigned_phone_number').toBeTruthy()
  expect(uppslag[3]).toBe('+46766860747')
})

test('okänt nummer avvisas mjukt — 200 och handled:false, aldrig 401 eller 500', async () => {
  // 46elks köar om varje icke-2xx i sex timmar enligt sin dokumentation. Ett
  // SMS vi inte kan placera får därför inte svara med fel.
  const api = laddaRutt(bas({
    '@/lib/supabase': {
      getServerSupabase: () => db({
        business_config: [{ data: null, error: null }],
        customer: [{ data: [], error: null }],
      }),
    },
  }))
  const svar = await api.POST(anrop())
  expect(svar.status).toBe(200)
  expect(await svar.json()).toEqual({ success: true, handled: false })
})

test('tvetydig avsändare gissar aldrig tenant', async () => {
  // Ett nummer som finns som kund hos två firmor får inte routas till den som
  // råkar returneras först. Hantverkare i samma bransch delar underleverantörer.
  const ops: any[] = []
  const api = laddaRutt(bas({
    '@/lib/supabase': {
      getServerSupabase: () => db({
        business_config: [{ data: null, error: null }],
        customer: [{ data: [{ business_id: 'biz_a' }, { business_id: 'biz_b' }], error: null }],
      }, ops),
    },
  }))
  const svar = await api.POST(anrop())
  expect(svar.status).toBe(200)
  expect(await svar.json()).toEqual({ success: true, handled: false })

  // Det räcker inte att svaret blir handled:false — rutten får inte ens ha
  // FRÅGAT efter ett av de tvetydiga företagen. Ett tidigare utkast av det här
  // provet kunde inte se skillnad på "avstod" och "gissade men fick tomt".
  const gissning = ops.find(o => o[0] === 'business_config' && o[1] === 'eq' && o[2] === 'business_id')
  expect(gissning, 'rutten slog upp ett av de tvetydiga företagen i stället för att avstå').toBeFalsy()
})

test('fältnamnen är de 46elks faktiskt skickar', () => {
  // Elva dagars tystnad kom av att vi antog ett fält (en header) som inte
  // fanns. Samma klass av fel på nyttolasten hade varit lika osynlig.
  const src = readFileSync(join(ROT, 'app/api/sms/incoming/route.ts'), 'utf8')
  for (const falt of ['from', 'to', 'message']) {
    expect(src, `läser inte det dokumenterade fältet ${falt}`).toContain(`params.get('${falt}')`)
  }
})
