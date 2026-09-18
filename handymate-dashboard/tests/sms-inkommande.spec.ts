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

// ══════════════════════════════════════════════════════════════════════
// ETT SVAR PER KUND-SMS (2026-09-18)
//
// Rutten startade två oberoende svarsvägar på samma inkommande kund-SMS:
// Matte-intelligensen (resolver → intent-agent → action-executor, som kan
// svara kunden via sendCustomerReply när business_config.
// matte_customer_reply_enabled är på) OCH agentkörningen
// triggerAgentFireAndForget('incoming_sms', …), vars systemprompt sa
// "svara med SMS" och som hade send_sms bland sina verktyg.
//
// Prod 2026-09-18: flaggan är true hos 0 av 29 företag och inget utgående
// SMS har någonsin följt på ett inkommande kund-SMS (noll inom 1 minut OCH
// inom 30 minuter, kontrollerat mot 14 inkommande kund-SMS och 101 utgående
// rader i sms_log). Buggen har alltså aldrig smällt — men spår 1 gjorde
// precis den här vägen användbar, så den stängs före det första riktiga
// kundsvaret.
//
// Påståendet som bevisas: ETT inkommande kund-SMS ger HÖGST ETT utgående,
// oavsett flaggans läge. Mätt genom att räkna faktiska sendSmsViaElks-anrop
// — inte genom att läsa källtext.
// ══════════════════════════════════════════════════════════════════════

import { executeTool } from '../app/api/agent/trigger/tool-router'
import * as smsSend from '../lib/sms-send'
import { toolDefinitions } from '../app/api/agent/trigger/tool-definitions'
import { AGENT_PERSONALITIES } from '../lib/agents/personalities'
import { agsVerktygetAvMatte, KUNDSVAR_AGS_AV_MATTE_MEDDELANDE } from '../lib/agent/kundsvar-agare'

const las = (p: string) => readFileSync(join(ROT, p), 'utf8').replace(/\r\n/g, '\n')

/** Transpilerar en riktig källfil och kör den med injicerade beroenden. */
function laddaModul(fil: string, mocks: Record<string, any>) {
  const kod = ts.transpileModule(las(fil), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports: Record<string, any> = {}
  new Function('require', 'exports', kod)((id: string) => (id in mocks ? mocks[id] : require(id)), exports)
  return exports
}

/** Räknare som ersätter den riktiga sms-strypunkten i en modulmock. */
function smsRaknare() {
  const skickade: any[] = []
  return {
    skickade,
    mock: {
      sendSmsViaElks: async (a: any) => { skickade.push(a); return { success: true, elksId: 'sms_1' } },
      parseOptOutCommand: () => null,
    },
  }
}

const KUND = {
  type: 'customer', customerId: 'cust_1', customerName: 'Anna', phone: '+46708379552',
  activeDeals: [], activeProjects: [], recentInvoices: [], conversationHistory: [], confirmedFacts: [],
}
const SIGNAL = { channel: 'sms', from: '+46708379552', body: 'Kan ni komma på torsdag?', receivedAt: new Date().toISOString() }
const BESLUT = {
  intent: 'booking_request', confidence: 90, reasoning: 'r',
  actions: [{ type: 'update_project_notes', autonomous: true, params: {}, description: 'd' }],
  customerReply: { send: true, message: 'Vi hör av oss med en tid.' },
}

const matteMocks = (smsMock: any) => ({
  '@/lib/ata/suggest-ata-draft': { suggestAtaDraft: async () => {} },
  '@/lib/leads/golden-path': { createLeadAndDeal: async () => ({ leadId: 'l', dealId: 'd', customerId: 'c' }) },
  '@/lib/notifications/push-internal': { internalPushHeaders: () => ({}) },
  '@/lib/invoices/apply-payment': { applyInvoicePayment: async () => ({ ok: true }) },
  '@/lib/supabase': { getServerSupabase: () => db({}) },
  '@/lib/sms-send': smsMock,
})

test('flaggan AV: Matte-vägen skickar noll SMS — svaret blir ett kort', async () => {
  const { skickade, mock } = smsRaknare()
  const ops: any[] = []
  await laddaModul('lib/matte/action-executor.ts', matteMocks(mock)).executeMatteActions(
    BESLUT, KUND, SIGNAL, 'biz_1',
    db({ business_config: [{ data: { matte_customer_reply_enabled: false, agents_globally_paused: false }, error: null }] }, ops),
    [],
  )
  expect(skickade.length, 'ett LLM-skrivet SMS gick till kunden trots att flaggan är av').toBe(0)
  expect(ops.filter(o => o[0] === 'pending_approvals' && o[1] === 'insert').length,
    'kunden lämnades obesvarad — svaret ska bli ett kort när flaggan är av').toBe(1)
})

test('flaggan PÅ: Matte-vägen skickar EXAKT ett SMS', async () => {
  const { skickade, mock } = smsRaknare()
  await laddaModul('lib/matte/action-executor.ts', matteMocks(mock)).executeMatteActions(
    BESLUT, KUND, SIGNAL, 'biz_1',
    db({ business_config: [{ data: { matte_customer_reply_enabled: true, agents_globally_paused: false }, error: null }] }),
    [],
  )
  expect(skickade.length, 'Matte-vägen skickade inte exakt ett svar').toBe(1)
  expect(skickade[0].messageType).toBe('matte_reply')
})

test('agenten blockeras: send_sms i incoming_sms-kontexten når aldrig SMS-strypunkten', async () => {
  // Det är den andra svarsvägen. Med Matte-flaggan på hade kunden annars
  // fått två olika svar, från två modeller som inte vet om varandra.
  const original = (smsSend as any).sendSmsViaElks
  const skickade: any[] = []
  ;(smsSend as any).sendSmsViaElks = async (a: any) => { skickade.push(a); return { success: true, elksId: 'sms_x' } }
  const tidigare = process.env.DISABLE_SMS_NIGHT_BLOCK
  process.env.DISABLE_SMS_NIGHT_BLOCK = '1'
  try {
    const bas = { businessName: 'Nordström El AB', contactEmail: '', googleConnection: null, triggerSource: 'user' as const }
    const argument = { to: '+46708379552', message: 'Hej! Vi kan komma på torsdag.' }

    const blockerat = await executeTool('send_sms', argument, db({}) as any, 'biz_1', { ...bas, triggerType: 'incoming_sms' })
    expect(blockerat.success).toBe(false)
    expect(blockerat.error, 'ett annat fel än vaktens — då nåddes den riktiga koden').toBe(KUNDSVAR_AGS_AV_MATTE_MEDDELANDE)
    expect(skickade.length, 'agenten skickade ett andra SMS på samma kund-SMS').toBe(0)

    // Kontrollen: samma anrop från en ANNAN trigger går fram. Utan den mäter
    // testet bara att räknaren aldrig kan öka.
    const slappt = await executeTool('send_sms', argument, db({}) as any, 'biz_1', { ...bas, triggerType: 'phone_call' })
    expect(slappt.success, 'samtalsvägen tappade sin SMS-förmåga — grinden är för bred').toBe(true)
    expect(skickade.length, 'räknaren mäter inte riktiga utskick').toBe(1)
  } finally {
    ;(smsSend as any).sendSmsViaElks = original
    if (tidigare === undefined) delete process.env.DISABLE_SMS_NIGHT_BLOCK
    else process.env.DISABLE_SMS_NIGHT_BLOCK = tidigare
  }
})

test('modellen ser inte ens send_sms när Matte äger kundsvaret — och ser den i alla andra lägen', async () => {
  // Grind ett av två: listan till modellen. Grind två är vakten i executeTool
  // (testet ovan) — listan är UX, vakten är gränsen.
  const lisa = AGENT_PERSONALITIES.lisa.allowedTools as string[]
  expect(lisa, 'förutsättningen har ändrats: Lisa har inte längre send_sms').toContain('send_sms')

  const vidTrigger = (trigger: string) => toolDefinitions
    .filter((t: any) => lisa.includes(t.name))
    .filter((t: any) => !agsVerktygetAvMatte(t.name, trigger))
    .map((t: any) => t.name)

  expect(vidTrigger('incoming_sms'), 'agenten ser fortfarande send_sms på ett inkommande SMS').not.toContain('send_sms')
  expect(vidTrigger('phone_call'), 'grinden är för bred — samtalsvägen tappade send_sms').toContain('send_sms')
  expect(vidTrigger('cron'), 'grinden är för bred — cron tappade send_sms').toContain('send_sms')
  // Smal med flit: bara ETT verktyg försvinner, inget annat.
  expect(vidTrigger('incoming_sms').length).toBe(vidTrigger('cron').length - 1)
  expect(vidTrigger('incoming_sms'), 'e-postvägen drogs med — det är en egen beteendeändring').toContain('send_email')

  // Och rutten måste faktiskt koppla in filtret i listan som går till modellen.
  const rutt = las('app/api/agent/trigger/route.ts')
  const toolsIdx = rutt.indexOf('tools: (agentAllowedTools')
  expect(toolsIdx, 'hittade inte verktygslistan i agent-rutten').toBeGreaterThan(-1)
  expect(rutt.slice(toolsIdx, toolsIdx + 1400), 'rutten filtrerar inte listan med agsVerktygetAvMatte').toContain('agsVerktygetAvMatte(t.name, trigger_type)')
  expect(rutt, 'rutten skickar inte med triggerType till vakten i tool-router').toContain('triggerType: trigger_type')
})

test('ett svar som redan fångats av spår 3 når varken Matte-vägen eller agenten', async () => {
  // Kunden svarar "2" på ett tidsförslag vi själva skickat. Då är svaret redan
  // hanterat av lib/bookings/svar-pa-erbjudande.ts — varken Matte eller
  // agenten får lägga ett eget svar ovanpå bokningskortet.
  const { skickade, mock } = smsRaknare()
  let agentTriggad = 0
  let entiteterLosta = 0
  const api = laddaRutt(bas({
    '@/lib/sms-send': mock,
    '@/lib/agent-trigger': { triggerAgentFireAndForget: () => { agentTriggad++ }, makeIdempotencyKey: () => 'k' },
    '@/lib/matte/resolver': { resolveEntity: async () => { entiteterLosta++; return null } },
    '@/lib/bookings/svar-pa-erbjudande': { svarPaErbjudande: async () => ({ hanterat: true }) },
    '@/lib/automation-engine': { fireEvent: async () => ({}) },
    '@/lib/supabase': { getServerSupabase: () => db({ business_config: [{ data: FORETAG, error: null }] }) },
  }))
  const svar = await api.POST(anrop())
  await new Promise(r => setTimeout(r, 30))

  expect(svar.status).toBe(200)
  expect(agentTriggad, 'agenten kördes på ett redan besvarat tidsval').toBe(0)
  expect(entiteterLosta, 'Matte-vägen kördes på ett redan besvarat tidsval').toBe(0)
  expect(skickade.length, 'rutten skickade ett eget SMS ovanpå bokningskortet').toBe(0)
})

test('ett vanligt kund-SMS beväpnar fortfarande båda vägarna — men bara en kan svara', async () => {
  // Grinden får inte stänga av kvalificeringen: agenten ska fortfarande köras,
  // med trigger_type 'incoming_sms' — det är just den etiketten vakten läser.
  const { skickade, mock } = smsRaknare()
  const triggrar: any[] = []
  const api = laddaRutt(bas({
    '@/lib/sms-send': mock,
    '@/lib/agent-trigger': { triggerAgentFireAndForget: (...a: any[]) => { triggrar.push(a) }, makeIdempotencyKey: () => 'k' },
    '@/lib/bookings/svar-pa-erbjudande': { svarPaErbjudande: async () => ({ hanterat: false }) },
    '@/lib/automation-engine': { fireEvent: async () => ({}) },
    '@/lib/supabase': { getServerSupabase: () => db({ business_config: [{ data: FORETAG, error: null }] }) },
  }))
  await api.POST(anrop())
  await new Promise(r => setTimeout(r, 30))

  expect(triggrar.length, 'agenten kvalificerar inte längre inkommande SMS').toBe(1)
  expect(triggrar[0][1], 'trigger-etiketten är inte incoming_sms — då läser vakten fel kontext').toBe('incoming_sms')
  expect(skickade.length, 'rutten skickade själv ett SMS på ett vanligt kund-SMS').toBe(0)
})
