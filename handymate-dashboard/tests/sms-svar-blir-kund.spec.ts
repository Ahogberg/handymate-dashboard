/**
 * Facit för spår 1 — "Samtalet blir ett jobb".
 *
 * Fångst-SMS:et som går ut dygnet runt säger ordagrant: "Svara på detta SMS
 * med vad du behöver hjälp med, så återkommer vi direkt". Fram till nu
 * sparades svaret i sms_conversation och stannade där: ingen kund, inget
 * kort, ingen affär. Hantverkaren fick ringa upp och fråga om samma sak en
 * gång till.
 *
 * Fem påståenden, ett per steg i kundprovet (tasks/sprint-samtalet-blir-ett-
 * jobb.md §"Hur vi bevisar den"):
 *
 *   1. E.164 vs 070… är SAMMA kund — inte två.
 *   2. Okänd avsändare blir kund + EXAKT ett kort, och får INGET andra SMS.
 *   3. En i teamet hoppas helt.
 *   4. Obegripligt svar gissar aldrig ett jobb.
 *   5. Svar inom 24 h efter ett missat samtal kopplas till samtalet.
 *
 * Browserlöst. Rutten och libben körs på riktigt (ts.transpileModule +
 * injicerade modulmockar), samma harness som tests/sms-inkommande.spec.ts —
 * ett facit som bara läser källtext hade inte sett skillnad på "avstod" och
 * "gjorde fel sak".
 *
 *   npx playwright test tests/sms-svar-blir-kund.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'fs'
import { join } from 'path'
import { NextRequest } from 'next/server'
import * as ts from 'typescript'

const ROT = join(__dirname, '..')
const las = (p: string) => readFileSync(join(ROT, p), 'utf8').replace(/\r\n/g, '\n')

/** Transpilerar en riktig källfil och kör den med injicerade beroenden. */
function ladda(fil: string, mocks: Record<string, any>) {
  const kod = ts.transpileModule(las(fil), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText
  const exports: Record<string, any> = {}
  const req = (id: string) => (id in mocks ? mocks[id] : require(id))
  new Function('require', 'exports', kod)(req, exports)
  return exports
}

/** Fejkad Supabase: svar per tabell i kö, varje anrop loggas. */
function db(svar: Record<string, any[]>, operationer: any[] = []) {
  return {
    operationer,
    from(tabell: string) {
      const resultat = svar[tabell]?.shift() ?? { data: null, error: null }
      const q: any = { then: (r: any) => Promise.resolve(resultat).then(r) }
      for (const m of ['select', 'eq', 'is', 'not', 'in', 'gte', 'contains', 'order', 'limit', 'insert', 'update', 'upsert']) {
        q[m] = (...a: any[]) => { operationer.push([tabell, m, ...a]); return q }
      }
      q.maybeSingle = async () => { operationer.push([tabell, 'maybeSingle']); return resultat }
      q.single = async () => { operationer.push([tabell, 'single']); return resultat }
      return q
    },
  }
}

const KANDIDATER = { phoneCandidates: (t: string) => [t, t.startsWith('0') ? '+46' + t.slice(1) : t].filter((v, i, a) => a.indexOf(v) === i) }

// ══════════════════════════════════════════════════════════════════════
// 1. Rutten — identitet, tenant och teamgrinden
// ══════════════════════════════════════════════════════════════════════

const RUTT = 'app/api/sms/incoming/route.ts'
const FORETAG = { business_id: 'biz_1', business_name: 'Nordström El AB' }

const PAYLOAD = new URLSearchParams({
  direction: 'incoming', id: 'sf1', from: '+46701234567', to: '+46766860747',
  message: 'Hej, proppskåpet är från 70-talet och en säkring går hela tiden. Villa byggd 1974. Kan ni titta?',
}).toString()

function ruttMocks(extra: Record<string, any> = {}) {
  return {
    '@/lib/elks-webhook-auth': {
      verifieraElksWebhook: () => ({ ok: true, via: 'hemlighet' }),
      larmaAvvisadElksWebhook: () => {}, medElksHemlighet: (u: string) => u,
    },
    '@/lib/agent-trigger': { triggerAgentFireAndForget: () => {}, makeIdempotencyKey: () => 'k' },
    '@/lib/sms-send': { sendSmsViaElks: async () => ({ success: true }), parseOptOutCommand: () => null },
    '@/lib/outbound/sms-gate': { resolveSmsCustomer: async () => ({ ok: false, code: 'not_found', error: 'x' }) },
    '@/lib/matte/owner-sender': { isTeamPhone: async () => false },
    '@/lib/voice/find-customer-by-phone': { ...KANDIDATER, findCustomerByPhone: async () => null },
    '@/lib/sms/relatera-missat-samtal': {
      hittaMissatSamtal: async () => ({ related_call_id: null, svar_pa_missat_samtal: false }),
      INGEN_KOPPLING: { related_call_id: null, svar_pa_missat_samtal: false },
    },
    '@/lib/matte/resolver': { resolveEntity: async () => null },
    '@/lib/automation-engine': { fireEvent: async () => ({}) },
    ...extra,
  }
}

const anrop = () => new NextRequest('https://app.handymate.se/api/sms/incoming?k=h', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: PAYLOAD,
})

test.describe('1. E.164 och 070… är samma kund', () => {
  test('tenantfallbacken frågar på BÅDA formerna, aldrig bara råsträngen', async () => {
    const ops: any[] = []
    const api = ladda(RUTT, ruttMocks({
      '@/lib/supabase': { getServerSupabase: () => db({
        business_config: [{ data: null, error: null }],
        customer: [{ data: [{ business_id: 'biz_1' }], error: null }],
      }, ops) },
    }))
    await api.POST(anrop())

    const uppslag = ops.find(o => o[0] === 'customer' && o[1] === 'in' && o[2] === 'phone_number')
    expect(uppslag, "fallbacken slår inte upp kunden med .in('phone_number', …)").toBeTruthy()
    expect(uppslag[3], 'kandidatlistan saknar avsändarens nummer').toContain('+46701234567')
    // Den råa formen får ALDRIG vara enda frågan — det var precis den som
    // missade kunder sparade som "070-123 45 67".
    expect(ops.find(o => o[0] === 'customer' && o[1] === 'eq' && o[2] === 'phone_number'),
      'den råa exakt-matchningen finns kvar').toBeFalsy()
  })

  test('kunden löses normaliserat och skrivs på sms_conversation-raden', async () => {
    const ops: any[] = []
    const api = ladda(RUTT, ruttMocks({
      '@/lib/voice/find-customer-by-phone': {
        ...KANDIDATER,
        // Kunden är sparad som "070-123 45 67"; avsändaren är E.164.
        findCustomerByPhone: async () => ({ customer_id: 'cust_anna', name: 'Anna', phone_number: '070-123 45 67' }),
      },
      '@/lib/supabase': { getServerSupabase: () => db({
        business_config: [{ data: FORETAG, error: null }],
      }, ops) },
    }))
    await api.POST(anrop())

    const insert = ops.find(o => o[0] === 'sms_conversation' && o[1] === 'insert')
    expect(insert, 'ingen sms_conversation-rad skrevs').toBeTruthy()
    expect(insert[2].customer_id, 'raden bär inte kundens id — då måste varje läsare matcha om telefonsträngen').toBe('cust_anna')
    // Ingen NY kund fick skapas: den befintliga matchade.
    expect(ops.find(o => o[0] === 'customer' && o[1] === 'insert'), 'en dubblettkund skapades').toBeFalsy()
  })

  test('okänd kund men känd lead ⇒ lead_id på raden', async () => {
    const ops: any[] = []
    const api = ladda(RUTT, ruttMocks({
      '@/lib/supabase': { getServerSupabase: () => db({
        business_config: [{ data: FORETAG, error: null }],
        leads: [{ data: { lead_id: 'lead_7' }, error: null }],
      }, ops) },
    }))
    await api.POST(anrop())
    const insert = ops.find(o => o[0] === 'sms_conversation' && o[1] === 'insert')
    expect(insert[2].lead_id).toBe('lead_7')
    expect(insert[2].customer_id).toBeNull()
    // Lead-uppslaget måste också vara normaliserat.
    expect(ops.find(o => o[0] === 'leads' && o[1] === 'in' && o[2] === 'phone')).toBeTruthy()
  })
})

test.describe('3. En i teamet hoppas helt', () => {
  test('ingen rad, inget kort, ingen agent när avsändaren är teammedlem', async () => {
    const ops: any[] = []
    let agentTriggad = false
    const api = ladda(RUTT, ruttMocks({
      '@/lib/matte/owner-sender': { isTeamPhone: async () => true },
      '@/lib/agent-trigger': { triggerAgentFireAndForget: () => { agentTriggad = true }, makeIdempotencyKey: () => 'k' },
      '@/lib/supabase': { getServerSupabase: () => db({ business_config: [{ data: FORETAG, error: null }] }, ops) },
    }))
    const svar = await api.POST(anrop())
    expect(svar.status).toBe(200)
    for (const tabell of ['sms_conversation', 'leads', 'customer', 'pending_approvals']) {
      expect(ops.find(o => o[0] === tabell && o[1] === 'insert'), `${tabell} skrevs för en teammedlem`).toBeFalsy()
    }
    expect(agentTriggad, 'kundagenten kördes för en i teamet').toBe(false)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 2. svarBlirJobb — kortet, kunden och det uteblivna andra SMS:et
// ══════════════════════════════════════════════════════════════════════

const JOBB = 'lib/sms/svar-blir-jobb.ts'
const OKAND = { type: 'unknown', activeDeals: [], activeProjects: [], recentInvoices: [], conversationHistory: [], confirmedFacts: [], phone: '+46701234567' }
const INGEN_KOPPLING = { related_call_id: null, svar_pa_missat_samtal: false }
const TEXT = 'Hej, proppskåpet är från 70-talet och en säkring går hela tiden. Villa byggd 1974. Kan ni titta på det?'

function jobbMocks(o: { gyllene?: any[]; fakta?: any[] } = {}) {
  const gyllene = o.gyllene ?? []
  return {
    mocks: {
      '@/lib/leads/golden-path': {
        createLeadAndDeal: async (input: any) => { gyllene.push(input); return { leadId: 'lead_ny', dealId: 'deal_ny', customerId: 'cust_ny' } },
      },
      '@/lib/customer-facts/extract-from-text': {
        MIN_TEXT_LANGD: 80,
        EMAIL_FAKTA_MODELL: 'claude-haiku-test',
        extractCustomerFacts: async () => o.fakta ?? [],
      },
    },
    gyllene,
  }
}

const signal = { channel: 'sms', from: '+46701234567', body: TEXT, receivedAt: '2026-09-18T10:00:00Z' }

test.describe('2. Okänd avsändare blir kund + exakt ETT kort, utan andra SMS', () => {
  test('golden path anropas med notify:false — kunden tackas inte en andra gång', async () => {
    const { mocks, gyllene } = jobbMocks()
    const ops: any[] = []
    const mod = ladda(JOBB, mocks)
    const r = await mod.svarBlirJobb({
      decision: { intent: 'quote_request', confidence: 90, actions: [] },
      entity: OKAND, signal, businessId: 'biz_1', missatSamtal: INGEN_KOPPLING,
      supabase: db({ pending_approvals: [{ data: [], error: null }, { data: null, error: null }] }, ops),
    })

    expect(gyllene.length, 'golden path kördes inte — svaret blev aldrig en kund').toBe(1)
    // ═══ HELA POÄNGEN ═══ notify:true fyrar lead_received, och den seedade
    // regeln "Snabbsvar på ny lead" skickar då "Tack för din förfrågan" —
    // ovanpå fångst-SMS:et kunden just svarade på.
    expect(gyllene[0].notify, 'notify var inte false ⇒ kunden får ett andra SMS').toBe(false)
    expect(gyllene[0].source).toBe('inbound_sms')
    expect(r.leadId).toBe('lead_ny')
    expect(r.customerId).toBe('cust_ny')
  })

  test('exakt ett lead_review-kort, med kundens egna ord', async () => {
    const { mocks } = jobbMocks()
    const ops: any[] = []
    const mod = ladda(JOBB, mocks)
    const r = await mod.svarBlirJobb({
      decision: { intent: 'quote_request', confidence: 90, actions: [] },
      entity: OKAND, signal, businessId: 'biz_1', missatSamtal: INGEN_KOPPLING,
      supabase: db({ pending_approvals: [{ data: [], error: null }, { data: null, error: null }] }, ops),
    })

    const kort = ops.filter(o => o[0] === 'pending_approvals' && o[1] === 'insert')
    expect(kort.length, 'antalet kort är inte exakt ett').toBe(1)
    expect(kort[0][2].approval_type).toBe('lead_review')
    expect(kort[0][2].payload.raw_sms.body, 'kortet bär inte kundens ordagranna text').toBe(TEXT)
    expect(kort[0][2].payload.kund_ar_ny).toBe(true)
    expect(kort[0][2].payload.lead_id).toBe('lead_ny')
    expect(r.kortId).toBeTruthy()
  })

  test('kortet ersätter Mattes egna — annars två kort för samma SMS', async () => {
    const { mocks } = jobbMocks()
    const mod = ladda(JOBB, mocks)
    const r = await mod.svarBlirJobb({
      decision: { intent: 'quote_request', confidence: 90, actions: [] },
      entity: OKAND, signal, businessId: 'biz_1', missatSamtal: INGEN_KOPPLING,
      supabase: db({ pending_approvals: [{ data: [], error: null }, { data: null, error: null }] }),
    })
    expect(r.hanteradeTyper).toContain('quote_request')
    // create_lead är AUTONOM i Matte och kör golden path med notify:true —
    // den måste hoppas, annars kommer det andra SMS:et den vägen i stället.
    expect(r.hanteradeTyper, 'create_lead hoppas inte ⇒ andra SMS via Mattes autonoma väg').toContain('create_lead')
  })

  test('finns redan ett pending kort skapas inget nytt', async () => {
    const { mocks } = jobbMocks()
    const ops: any[] = []
    const mod = ladda(JOBB, mocks)
    const r = await mod.svarBlirJobb({
      decision: { intent: 'quote_request', confidence: 90, actions: [] },
      entity: { ...OKAND, type: 'known_customer', customerId: 'cust_a', activeDeals: [{ id: 'lead_x' }] },
      signal, businessId: 'biz_1', missatSamtal: INGEN_KOPPLING,
      supabase: db({ pending_approvals: [{ data: [{ id: 'appr_gammalt' }], error: null }] }, ops),
    })
    expect(ops.filter(o => o[0] === 'pending_approvals' && o[1] === 'insert').length, 'dubblettkort skapades').toBe(0)
    expect(r.kortId).toBeNull()
    // Dedupen måste fråga på DEN HÄR leadens id — en fråga som aldrig kan
    // matcha är inte en dedup, den bara ser ut som en.
    const dedup = ops.find(o => o[0] === 'pending_approvals' && o[1] === 'contains')
    expect(dedup, 'ingen dedupfråga mot payloadens lead_id').toBeTruthy()
    expect(dedup[3]).toEqual({ lead_id: 'lead_x' })
    // Matte ska ändå inte lägga ett eget ovanpå det som redan ligger.
    expect(r.hanteradeTyper).toContain('quote_request')
  })
})

test.describe('4. Obegripligt svar gissar aldrig ett jobb', () => {
  for (const fall of [
    { namn: 'intent unclear', decision: { intent: 'unclear', confidence: 90, actions: [] } },
    { namn: 'bränslet slut', decision: { intent: 'fuel_stopped', confidence: 0, actions: [] } },
    { namn: 'låg konfidens', decision: { intent: 'quote_request', confidence: 20, actions: [] } },
  ]) {
    test(`${fall.namn}: kortet säger att vi inte förstod, ingen jobbtyp, inga fakta`, async () => {
      const { mocks } = jobbMocks({ fakta: [{ fact_type: 'constraint', content: 'x', evidence_quote: 'y', confidence: 0.9 }] })
      const ops: any[] = []
      const mod = ladda(JOBB, mocks)
      const r = await mod.svarBlirJobb({
        decision: fall.decision, entity: OKAND, signal, businessId: 'biz_1', missatSamtal: INGEN_KOPPLING,
        supabase: db({ pending_approvals: [{ data: [], error: null }, { data: null, error: null }] }, ops),
      })

      const kort = ops.filter(o => o[0] === 'pending_approvals' && o[1] === 'insert')
      expect(kort.length, 'förfrågan tappades — kortet ska finnas även när vi inte förstod').toBe(1)
      const p = kort[0][2].payload
      expect(p.forstod_inte).toBe(true)
      expect(p.parsed.job_type, 'en jobbtyp gissades fram ur ett obegripligt svar').toBeNull()
      expect(p.parsed.description, 'en beskrivning gissades fram').toBeNull()
      expect(kort[0][2].title).toContain('förstod inte')
      // Kundminnet får aldrig fyllas av något vi inte förstod.
      expect(ops.find(o => o[0] === 'customer_fact' && o[1] === 'insert'), 'kundfakta sparades trots obegripligt svar').toBeFalsy()
      expect(r.begripligt).toBe(false)
      expect(r.faktaSparade).toBe(0)
    })
  }

  test('begripligt svar sparar kundfakta med ordagrant citat — men obekräftade', async () => {
    const { mocks } = jobbMocks({ fakta: [{ fact_type: 'constraint', content: 'Villa byggd 1974', evidence_quote: 'Villa byggd 1974', confidence: 0.9 }] })
    const ops: any[] = []
    const mod = ladda(JOBB, mocks)
    const r = await mod.svarBlirJobb({
      decision: { intent: 'quote_request', confidence: 90, actions: [] },
      entity: OKAND, signal, businessId: 'biz_1', missatSamtal: INGEN_KOPPLING, smsConversationId: 42,
      supabase: db({ pending_approvals: [{ data: [], error: null }, { data: null, error: null }], customer_fact: [{ data: null, error: null }] }, ops),
    })
    const fakta = ops.find(o => o[0] === 'customer_fact' && o[1] === 'insert')
    expect(fakta, 'inga kundfakta sparades').toBeTruthy()
    expect(fakta[2][0].evidence_quote).toBe('Villa byggd 1974')
    expect(fakta[2][0].source_type).toBe('sms')
    expect(fakta[2][0].source_id).toBe('42')
    // Ingen människa har godkänt det — och läsarna som påstår "godkända av
    // hantverkaren" filtrerar på confirmed_at.
    expect(fakta[2][0].confirmed_at, 'AI-fångade fakta markerades som bekräftade').toBeNull()
    expect(r.faktaSparade).toBe(1)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 3. Kopplingen till det missade samtalet
// ══════════════════════════════════════════════════════════════════════

const RELATERA = 'lib/sms/relatera-missat-samtal.ts'

test.describe('5. Svar inom 24 h kopplas till det missade samtalet', () => {
  const mockar = { '@/lib/voice/find-customer-by-phone': KANDIDATER }

  test('fångst-SMS + samtal i fönstret ⇒ kopplat, med samtalets id', async () => {
    const ops: any[] = []
    const mod = ladda(RELATERA, mockar)
    const r = await mod.hittaMissatSamtal(db({
      sms_log: [{ data: [{ sms_id: 's1', related_id: null }], error: null }],
      call_recording: [{ data: [{ recording_id: 'rec_9' }], error: null }],
    }, ops), 'biz_1', '+46701234567')

    expect(r.svar_pa_missat_samtal).toBe(true)
    expect(r.related_call_id).toBe('rec_9')
    // Fångst-SMS:et identifieras på det värde regelmotorn FAKTISKT skriver.
    expect(ops.find(o => o[0] === 'sms_log' && o[1] === 'eq' && o[2] === 'message_type' && o[3] === 'automation_rule'),
      "fångst-SMS:et slås inte upp på message_type='automation_rule'").toBeTruthy()
    // Numret matchas normaliserat, aldrig rått.
    expect(ops.find(o => o[0] === 'sms_log' && o[1] === 'in' && o[2] === 'phone_to')).toBeTruthy()
    expect(ops.find(o => o[0] === 'call_recording' && o[1] === 'in' && o[2] === 'from_number')).toBeTruthy()
  })

  test('fönstret är 24 timmar — äldre samtal kopplas inte', async () => {
    const ops: any[] = []
    const mod = ladda(RELATERA, mockar)
    const nu = new Date('2026-09-18T12:00:00.000Z')
    await mod.hittaMissatSamtal(db({
      sms_log: [{ data: [], error: null }], call_recording: [{ data: [], error: null }],
    }, ops), 'biz_1', '+46701234567', nu)

    const grans = ops.find(o => o[0] === 'sms_log' && o[1] === 'gte' && o[2] === 'created_at')
    expect(grans, 'ingen tidsgräns på uppslaget — då ärver ett år gammalt samtal sammanhanget').toBeTruthy()
    expect(grans[3]).toBe('2026-09-17T12:00:00.000Z')
    expect(mod.MISSAT_SAMTAL_FONSTER_MS).toBe(24 * 60 * 60 * 1000)
  })

  test('inget i fönstret ⇒ ingen koppling, och det kastar aldrig', async () => {
    const mod = ladda(RELATERA, mockar)
    const r = await mod.hittaMissatSamtal(db({
      sms_log: [{ data: [], error: null }], call_recording: [{ data: [], error: null }],
    }), 'biz_1', '+46701234567')
    expect(r).toEqual({ related_call_id: null, svar_pa_missat_samtal: false })

    const trasig = { from: () => { throw new Error('nere') } }
    await expect(mod.hittaMissatSamtal(trasig, 'biz_1', '+46701234567')).resolves.toEqual({ related_call_id: null, svar_pa_missat_samtal: false })
  })

  test('kopplingen följer med in i kortet', async () => {
    const { mocks } = jobbMocks()
    const ops: any[] = []
    const mod = ladda(JOBB, mocks)
    await mod.svarBlirJobb({
      decision: { intent: 'quote_request', confidence: 90, actions: [] },
      entity: OKAND, signal, businessId: 'biz_1',
      missatSamtal: { related_call_id: 'rec_9', svar_pa_missat_samtal: true },
      supabase: db({ pending_approvals: [{ data: [], error: null }, { data: null, error: null }] }, ops),
    })
    const kort = ops.find(o => o[0] === 'pending_approvals' && o[1] === 'insert')
    expect(kort[2].payload.raw_sms.related_call_id).toBe('rec_9')
    expect(kort[2].payload.raw_sms.svar_pa_missat_samtal).toBe(true)
  })
})

// ══════════════════════════════════════════════════════════════════════
// 4. Källlåsningar — hål som redan är stängda ska förbli stängda
// ══════════════════════════════════════════════════════════════════════

test.describe('låsningar', () => {
  test('golden path dedupar normaliserat — dubbelkundsbuggen får inte återuppstå', () => {
    // tasks/lead-intake-granskning-2026-08-10.md §"Dedup-hålet": samma person
    // som ringde och sedan fyllde i formuläret blev två kunder, eftersom
    // dedupen gjorde replace(/\s/g,'') + exakt match. Hålet är stängt; det
    // här facit ser till att det förblir det.
    const s = las('lib/leads/golden-path.ts')
    expect(s, 'dedupen går inte genom findCustomerDuplicates').toContain('findCustomerDuplicates(')
    expect(s, 'den råa exakt-matchningen på cleanPhone är tillbaka').not.toContain(".eq('phone_number', cleanPhone)")
    const i = s.indexOf('findCustomerDuplicates(')
    const anrop = s.slice(i, i + 220)
    expect(anrop, 'e-postfallbacken saknas i dedupen').toContain('email')
    // Normaliseringen bor i dedup-libben — kontrollera att den faktiskt är där.
    expect(las('lib/customer-dedupe.ts')).toContain('normalizeSwedishPhone(')
  })

  test('sms/send matchar kunden normaliserat', () => {
    const s = las('app/api/sms/send/route.ts')
    expect(s).toContain('findCustomerByPhone(')
    expect(s, "den råa .eq('phone_number', to) är tillbaka").not.toContain(".eq('phone_number', to)")
  })

  test('Matte-exekveraren hoppar de action-typer kortet redan täckt', async () => {
    // Beteende, inte källtext: en källskanning ser inte skillnad på en grind
    // som finns och en grind som är bortkopplad.
    const EXEC = 'lib/matte/action-executor.ts'
    const gyllene: any[] = []
    const mocks = {
      '@/lib/ata/suggest-ata-draft': { suggestAtaDraft: async () => {} },
      '@/lib/leads/golden-path': { createLeadAndDeal: async (i: any) => { gyllene.push(i); return { leadId: 'l', dealId: 'd', customerId: 'c' } } },
      '@/lib/notifications/push-internal': { internalPushHeaders: () => ({}) },
      '@/lib/invoices/apply-payment': { applyInvoicePayment: async () => ({ ok: true }) },
    }
    const entity = { ...OKAND, customerName: 'Anna' }
    const beslut = (typ: string, autonom: boolean) => ({
      intent: 'quote_request', confidence: 90, reasoning: 'r',
      actions: [{ type: typ, autonomous: autonom, params: {}, description: 'd' }],
    })

    // Utan grinden: Matte lägger sitt eget kort.
    const utan: any[] = []
    await ladda(EXEC, mocks).executeMatteActions(
      beslut('quote_request', false), entity, signal, 'biz_1', db({}, utan), [])
    expect(utan.filter(o => o[0] === 'pending_approvals' && o[1] === 'insert').length,
      'Matte skapade inget kort ens utan grinden — testet mäter fel sak').toBe(1)

    // Med grinden: inget andra kort.
    const med: any[] = []
    await ladda(EXEC, mocks).executeMatteActions(
      beslut('quote_request', false), entity, signal, 'biz_1', db({}, med), [], new Set(['quote_request']))
    expect(med.filter(o => o[0] === 'pending_approvals' && o[1] === 'insert').length,
      'två kort för samma SMS').toBe(0)

    // Och den AUTONOMA create_lead måste hoppas — annars kör den golden path
    // med notify:true och kunden får sitt andra "tack för din förfrågan".
    gyllene.length = 0
    await ladda(EXEC, mocks).executeMatteActions(
      beslut('create_lead', true), entity, signal, 'biz_1', db({}, []), [], new Set(['create_lead']))
    expect(gyllene.length, 'Mattes autonoma create_lead kördes ändå ⇒ andra SMS').toBe(0)
  })

  test('läsare som påstår "godkända av hantverkaren" filtrerar på confirmed_at', () => {
    // SMS-vägen skriver fångade fakta obekräftade. Prompterna nedan kallar
    // listan godkänd — då måste filtret finnas, annars ljuger vi för modellen.
    for (const fil of ['lib/matte/resolver.ts', 'lib/ai-quote-generator.ts']) {
      const s = las(fil)
      const i = s.indexOf("from('customer_fact')")
      expect(i, `${fil} läser inte customer_fact längre`).toBeGreaterThan(-1)
      expect(s.slice(i, i + 700), `${fil} saknar confirmed_at-filtret`).toContain(".not('confirmed_at', 'is', null)")
    }
  })

  test('migrationen v260 ger sms_conversation en identitet', () => {
    const s = las('sql/v260_sms_conversation_identitet.sql')
    expect(s).toContain('ADD COLUMN IF NOT EXISTS lead_id')
    expect(s).toContain('idx_sms_conversation_customer')
    expect(s).toContain('idx_sms_conversation_lead')
  })
})
