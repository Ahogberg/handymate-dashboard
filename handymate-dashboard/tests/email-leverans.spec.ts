/**
 * Facit: Resends leveranshändelser landar rätt (Spår 2, 2026-09-18).
 *
 * Felet som stängs: e-post hade ingen leveranskvittens alls. En studsad
 * adress, en spamanmälan och ett läst mejl såg identiska ut — hantverkaren
 * skickade påminnelse två på en adress som aldrig kunde ta emot påminnelse ett.
 *
 * Två saker som MÅSTE hålla:
 *   1. Signaturen. En webhook utan verifiering är en öppen skrivväg in i
 *      kundregistret. Svix-signaturen räknas över den RÅA kroppen.
 *   2. En studs får ALDRIG utlösa ett nytt utskick. Den skriver ett
 *      customer_fact och tiger. Att svara på en studs med ännu ett mejl är
 *      precis så en avsändardomän bränns.
 *
 * Körs: npx playwright test tests/email-leverans.spec.ts --no-deps --project=chromium --reporter=line
 */
import { test, expect } from '@playwright/test'
import { createHmac } from 'crypto'
import { NextRequest } from 'next/server'

const {
  verifieraSvixSignatur, tolkaEpostHandelse, LEVERANSSTATUS, SVIX_TOLERANS_SEKUNDER, POST,
} = require('../app/api/email/events/route')

const HEMLIGHET = 'whsec_' + Buffer.from('en-hemlighet-for-testet').toString('base64')
const SVIX_ID = 'msg_2abc'

function signera(rawBody: string, ts: number, hemlighet = HEMLIGHET, id = SVIX_ID) {
  const nyckel = Buffer.from(hemlighet.slice(6), 'base64')
  return 'v1,' + createHmac('sha256', nyckel).update(`${id}.${ts}.${rawBody}`).digest('base64')
}

// ── 1. Signaturen ────────────────────────────────────────────────────────

test.describe('Svix-signatur', () => {
  const kropp = '{"type":"email.delivered"}'
  const nu = 1_780_000_000

  test('rätt signatur släpps igenom', () => {
    const v = verifieraSvixSignatur(kropp, { id: SVIX_ID, timestamp: String(nu), signature: signera(kropp, nu) }, HEMLIGHET, nu)
    expect(v).toEqual({ ok: true })
  })

  test('signatur över en ANNAN kropp avvisas — annars kan vem som helst byta innehåll', () => {
    const v = verifieraSvixSignatur('{"type":"email.bounced"}', { id: SVIX_ID, timestamp: String(nu), signature: signera(kropp, nu) }, HEMLIGHET, nu)
    expect(v).toEqual({ ok: false, skal: 'fel_signatur' })
  })

  test('fel hemlighet avvisas', () => {
    const annan = 'whsec_' + Buffer.from('nagon-annans-hemlighet').toString('base64')
    const v = verifieraSvixSignatur(kropp, { id: SVIX_ID, timestamp: String(nu), signature: signera(kropp, nu, annan) }, HEMLIGHET, nu)
    expect(v.ok).toBe(false)
  })

  test('replay av en gammal signerad kropp avvisas', () => {
    const gammal = nu - SVIX_TOLERANS_SEKUNDER - 1
    const v = verifieraSvixSignatur(kropp, { id: SVIX_ID, timestamp: String(gammal), signature: signera(kropp, gammal) }, HEMLIGHET, nu)
    expect(v).toEqual({ ok: false, skal: 'for_gammal' })
  })

  test('hemlighet som saknas i miljön avvisar — aldrig fail-open', () => {
    const v = verifieraSvixSignatur(kropp, { id: SVIX_ID, timestamp: String(nu), signature: signera(kropp, nu) }, undefined, nu)
    expect(v).toEqual({ ok: false, skal: 'hemlighet_saknas' })
  })

  test('saknade headers avvisar', () => {
    expect(verifieraSvixSignatur(kropp, { id: null, timestamp: String(nu), signature: 'v1,x' }, HEMLIGHET, nu).ok).toBe(false)
  })

  test('flera signaturer i headern (nyckelrotation): en giltig räcker', () => {
    const header = 'v1,ogiltigbase64== ' + signera(kropp, nu)
    expect(verifieraSvixSignatur(kropp, { id: SVIX_ID, timestamp: String(nu), signature: header }, HEMLIGHET, nu).ok).toBe(true)
  })
})

// ── 2. Tolkningen ────────────────────────────────────────────────────────

test.describe('tolkaEpostHandelse', () => {
  test('de fyra hanterade händelserna mappas till rätt leveransstatus', () => {
    expect(LEVERANSSTATUS).toEqual({
      'email.delivered': 'delivered',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
      'email.delivery_delayed': 'delayed',
    })
  })

  test('email_id, tidpunkt och mottagare läses ur Resends kropp', () => {
    const r = tolkaEpostHandelse(JSON.stringify({
      type: 'email.delivered', created_at: '2026-09-18T06:14:00Z',
      data: { email_id: 'em_1', to: ['Kund@Exempel.SE'] },
    }))
    expect(r).toEqual({ typ: 'email.delivered', emailId: 'em_1', tidpunkt: '2026-09-18T06:14:00.000Z', mottagare: 'kund@exempel.se' })
  })

  test('en händelse vi inte hanterar ger typ null — vi agerar aldrig på gissningar', () => {
    expect(tolkaEpostHandelse('{"type":"email.opened","data":{"email_id":"em_1"}}').typ).toBeNull()
  })

  test('trasig JSON kraschar inte', () => {
    expect(tolkaEpostHandelse('inte json')).toEqual({ typ: null, emailId: null, tidpunkt: null, mottagare: null })
  })
})

// ── 3. Rutten ────────────────────────────────────────────────────────────

type Handelse = { tabell: string; sort: 'update' | 'insert'; data: any; filter?: any }

function fakeDb(traffar: any[], handelser: Handelse[]) {
  return {
    from(tabell: string) {
      const q: any = {
        update(patch: any) { q._patch = patch; q._sort = 'update'; return q },
        insert(rad: any) {
          handelser.push({ tabell, sort: 'insert', data: rad })
          return Promise.resolve({ data: null, error: null })
        },
        select() { return q },
        eq(kolumn: string, varde: any) { q._filter = { [kolumn]: varde }; return q },
        maybeSingle: async () => ({ data: null, error: null }),
        then: (resolve: any) => {
          handelser.push({ tabell, sort: 'update', data: q._patch, filter: q._filter })
          return Promise.resolve({ data: traffar, error: null }).then(resolve)
        },
      }
      return q
    },
    rpc: async () => ({ data: null, error: null }),
  }
}

async function postaHandelse(kropp: any, opts: { signera?: boolean; traffar?: any[] } = {}) {
  const rawBody = JSON.stringify(kropp)
  const supabaseModule = require('../lib/supabase')
  const tidigareDb = supabaseModule.getServerSupabase
  const tidigareHemlighet = process.env.RESEND_WEBHOOK_SECRET
  const handelser: Handelse[] = []
  const nätanrop: string[] = []
  const tidigareFetch = global.fetch
  try {
    process.env.RESEND_WEBHOOK_SECRET = HEMLIGHET
    supabaseModule.getServerSupabase = () => fakeDb(
      opts.traffar ?? [{ id: 'cl_1', business_id: 'biz_1', customer_id: 'cust_1', message: 'kund@exempel.se' }],
      handelser,
    )
    // Varje utgående nätanrop ur den här rutten vore ett nytt utskick.
    global.fetch = (async (url: any) => { nätanrop.push(String(url)); throw new Error('Rutten får inte skicka något') }) as any
    const ts = Math.floor(Date.now() / 1000)
    const svar = await POST(new NextRequest('https://app.handymate.se/api/email/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': SVIX_ID,
        'svix-timestamp': String(ts),
        'svix-signature': opts.signera === false ? 'v1,fel' : signera(rawBody, ts),
      },
      body: rawBody,
    }))
    return { svar, handelser, nätanrop }
  } finally {
    supabaseModule.getServerSupabase = tidigareDb
    global.fetch = tidigareFetch
    if (tidigareHemlighet === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = tidigareHemlighet
  }
}

test.describe('POST /api/email/events', () => {
  test('email.delivered ⇒ communication_log uppdateras på provider_message_id', async () => {
    const { svar, handelser } = await postaHandelse({
      type: 'email.delivered', created_at: '2026-09-18T06:14:00Z', data: { email_id: 'em_1', to: ['kund@exempel.se'] },
    })
    expect(svar.status).toBe(200)
    const u = handelser.find(h => h.tabell === 'communication_log' && h.sort === 'update')!
    expect(u.data).toMatchObject({ delivery_status: 'delivered', delivered_at: '2026-09-18T06:14:00.000Z' })
    expect(u.filter).toEqual({ provider_message_id: 'em_1' })
    // Sändningsstatusen (status-kolumnen) rörs aldrig.
    expect(Object.keys(u.data)).toEqual(['delivery_status', 'delivered_at'])
  })

  test('email.bounced ⇒ customer_fact av typen contact med källa email_bounce och confirmed_at null', async () => {
    const { handelser } = await postaHandelse({
      type: 'email.bounced', created_at: '2026-09-18T06:14:00Z', data: { email_id: 'em_2', to: ['kund@exempel.se'] },
    })
    const u = handelser.find(h => h.tabell === 'communication_log' && h.sort === 'update')!
    expect(u.data.delivery_status).toBe('bounced')
    const fakta = handelser.find(h => h.tabell === 'customer_fact')!
    expect(fakta.data).toMatchObject({
      business_id: 'biz_1', customer_id: 'cust_1', fact_type: 'contact',
      source_type: 'email_bounce', source_id: 'em_2', confirmed_at: null,
    })
    expect(fakta.data.content).toContain('kund@exempel.se')
  })

  test('en studs skickar ALDRIG ett nytt mejl', async () => {
    const { nätanrop } = await postaHandelse({
      type: 'email.bounced', data: { email_id: 'em_2', to: ['kund@exempel.se'] },
    })
    expect(nätanrop).toEqual([])
  })

  test('email.complained skriver också ett kundfaktum', async () => {
    const { handelser } = await postaHandelse({
      type: 'email.complained', data: { email_id: 'em_3', to: ['kund@exempel.se'] },
    })
    expect(handelser.find(h => h.tabell === 'customer_fact')!.data.content).toContain('skräppost')
  })

  test('email.delivered skriver inget kundfaktum', async () => {
    const { handelser } = await postaHandelse({ type: 'email.delivered', data: { email_id: 'em_1' } })
    expect(handelser.find(h => h.tabell === 'customer_fact')).toBeUndefined()
  })

  test('fel signatur ⇒ 401 och ingen skrivning alls', async () => {
    const { svar, handelser } = await postaHandelse(
      { type: 'email.bounced', data: { email_id: 'em_2' } }, { signera: false },
    )
    expect(svar.status).toBe(401)
    expect(handelser).toEqual([])
  })

  test('okänt email_id ⇒ 200 utan customer_fact (ingen kund att skriva på)', async () => {
    const { svar, handelser } = await postaHandelse(
      { type: 'email.bounced', data: { email_id: 'finns_inte' } }, { traffar: [] },
    )
    expect(svar.status).toBe(200)
    expect(handelser.find(h => h.tabell === 'customer_fact')).toBeUndefined()
  })

  test('ohanterad händelsetyp ⇒ 200 utan skrivning', async () => {
    const { svar, handelser } = await postaHandelse({ type: 'email.opened', data: { email_id: 'em_1' } })
    expect(svar.status).toBe(200)
    expect(handelser).toEqual([])
  })
})
