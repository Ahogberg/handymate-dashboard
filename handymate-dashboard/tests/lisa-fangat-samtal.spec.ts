/**
 * Facit: ägaren får en push när Lisa fångar ett missat samtal
 * (lanseringsplanen, 2026-09-06).
 *
 * Före: den vanligaste vägen (vidarekoppling som ingen svarade på →
 * app/api/voice/missed) skickade catch-SMS till uppringaren men gav ägaren
 * ingenting — ingen notis, ingen push. Röstbrevlådegrenen skrev en in-app-
 * notis men pushade inte heller. Nu går båda vägarna genom
 * lib/voice/fangat-samtal.ts, som skriver notisen och pushar — och bara
 * påstår "Lisa fångade" när ett svar-SMS bevisligen gått ut.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { buildPushTemplate } from '../lib/notifications/approval-push'
import { byggDedupeNyckel, klassificeraPush } from '../lib/notifications/push-policy'
import { FANGAT_SAMTAL_TYP, meddelaFangatSamtal, svarSmsSkickat, visningsnamn } from '../lib/voice/fangat-samtal'

const ROOT = path.join(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** Fejkad supabase: sms_log svarar med givna rader, customer med given kund. */
function fakeSupabase(opts: { smsRows?: unknown[]; smsError?: string | null; customer?: { customer_id: string; name: string | null; phone_number: string | null } | null }) {
  const anrop: Array<{ table: string; filters: Array<[string, unknown]> }> = []
  return {
    anrop,
    client: {
      from: (table: string) => {
        const post = { table, filters: [] as Array<[string, unknown]> }
        anrop.push(post)
        const q: any = {}
        const kedja = (namn: string) => (...args: unknown[]) => { post.filters.push([namn, args]); return q }
        for (const m of ['select', 'eq', 'neq', 'not', 'is', 'in', 'gte', 'limit', 'order', 'or', 'ilike']) q[m] = kedja(m)
        q.maybeSingle = () => Promise.resolve({ data: table === 'customer' ? opts.customer ?? null : null, error: null })
        q.then = (ok: any, fail?: any) => {
          const res = table === 'sms_log'
            ? (opts.smsError ? { data: null, error: { message: opts.smsError } } : { data: opts.smsRows ?? [], error: null })
            : { data: table === 'customer' && opts.customer ? [opts.customer] : [], error: null }
          return Promise.resolve(res).then(ok, fail)
        }
        return q
      },
    } as any,
  }
}

test.describe('Push-mallen säger bara det som hänt', () => {
  test('SMS skickat ⇒ "Lisa fångade ett samtal", annars "Missat samtal" + ring upp', () => {
    const ja = buildPushTemplate(FANGAT_SAMTAL_TYP, { call_id: 'c1', customer_name: 'Anna Berg', phone_display: '070-123 45 67', sms_sent: true })!
    expect(ja.title).toBe('Lisa fångade ett samtal från Anna Berg')
    expect(ja.body).toContain('Svar-SMS är skickat')
    expect(ja.url).toBe('/dashboard/calls')

    const nej = buildPushTemplate(FANGAT_SAMTAL_TYP, { call_id: 'c1', customer_name: null, phone_display: '070-123 45 67', sms_sent: false })!
    expect(nej.title).toBe('Missat samtal från 070-123 45 67')
    expect(nej.title).not.toContain('Lisa')
    expect(nej.body).toContain('Inget svar-SMS gick ut')
  })

  test('tom payload ger ändå en mall (okänt nummer, inget påstående om SMS)', () => {
    const t = buildPushTemplate(FANGAT_SAMTAL_TYP, {})!
    expect(t.title).toBe('Missat samtal från okänt nummer')
  })

  test('klass hant (hålls under tyst tid) och dedupe per call_id', () => {
    expect(klassificeraPush(FANGAT_SAMTAL_TYP).klass).toBe('hant')
    const a = byggDedupeNyckel(FANGAT_SAMTAL_TYP, { call_id: 'abc123', customer_name: 'Anna' }, null)
    const b = byggDedupeNyckel(FANGAT_SAMTAL_TYP, { call_id: 'abc123', customer_name: 'Anna B' }, null)
    const c = byggDedupeNyckel(FANGAT_SAMTAL_TYP, { call_id: 'xyz789' }, null)
    expect(a).toBe(b)
    expect(a).toContain('call_id:abc123')
    expect(a).not.toBe(c)
  })

  test('visningsnamn: kundnamn före nummer, nummer i svensk form', () => {
    expect(visningsnamn('Anna Berg', '+46701234567')).toBe('Anna Berg')
    expect(visningsnamn('  ', '+46701234567')).toBe('070-123 45 67')
    expect(visningsnamn(null, '')).toBe('okänt nummer')
  })
})

test.describe('Beviset för svar-SMS', () => {
  test('en lyckad automationsregel-rad till uppringaren sedan tidsstämpeln ⇒ true', async () => {
    const f = fakeSupabase({ smsRows: [{ sms_id: 's1' }] })
    expect(await svarSmsSkickat(f.client, 'biz_1', '+46701234567', '2026-09-06T10:00:00Z')).toBe(true)
    const sms = f.anrop.find(a => a.table === 'sms_log')!
    const filter = Object.fromEntries(sms.filters.filter(([n]) => n === 'eq').map(([, args]) => (args as unknown[]) as [string, unknown]))
    expect(filter.status).toBe('sent')
    expect(filter.direction).toBe('outbound')
    expect(filter.message_type).toBe('automation_rule')
    expect(filter.business_id).toBe('biz_1')
    const gte = sms.filters.find(([n]) => n === 'gte')![1] as unknown[]
    expect(gte).toEqual(['created_at', '2026-09-06T10:00:00Z'])
    const inn = sms.filters.find(([n]) => n === 'in')![1] as [string, string[]]
    expect(inn[0]).toBe('phone_to')
    expect(inn[1]).toContain('+46701234567')
  })

  test('ingen rad, fel i uppslaget eller ogiltigt nummer ⇒ false (aldrig ett falskt "skickat")', async () => {
    expect(await svarSmsSkickat(fakeSupabase({ smsRows: [] }).client, 'b', '+46701234567', '2026-09-06T10:00:00Z')).toBe(false)
    expect(await svarSmsSkickat(fakeSupabase({ smsError: 'nere' }).client, 'b', '+46701234567', '2026-09-06T10:00:00Z')).toBe(false)
    expect(await svarSmsSkickat(fakeSupabase({ smsRows: [{ sms_id: 's1' }] }).client, 'b', '123', '2026-09-06T10:00:00Z')).toBe(false)
  })
})

test.describe('meddelaFangatSamtal — notis + push, aldrig ett kast', () => {
  test('skriver notisen och pushar med bevisat sms_sent och kundnamn', async () => {
    const f = fakeSupabase({ smsRows: [{ sms_id: 's1' }], customer: { customer_id: 'cust_1', name: 'Anna Berg', phone_number: '+46701234567' } })
    const pushar: any[] = []
    const notiser: any[] = []
    const res = await meddelaFangatSamtal(
      { supabase: f.client, businessId: 'biz_1', phone: '+46701234567', callId: 'call_9', sedanIso: '2026-09-06T10:00:00Z' },
      { skickaPush: async a => { pushar.push(a) }, skapaNotis: async n => { notiser.push(n) } },
    )
    expect(res).toEqual({ sms_sent: true, customer_name: 'Anna Berg' })
    expect(notiser).toEqual([{ businessId: 'biz_1', phoneNumber: '+46701234567', customerName: 'Anna Berg' }])
    expect(pushar).toHaveLength(1)
    expect(pushar[0].approval_type).toBe(FANGAT_SAMTAL_TYP)
    expect(pushar[0].business_id).toBe('biz_1')
    expect(pushar[0].payload).toEqual({ call_id: 'call_9', customer_name: 'Anna Berg', phone_display: '070-123 45 67', sms_sent: true })
  })

  test('okänd uppringare utan SMS ⇒ sms_sent false, namn null — och pushen går ändå', async () => {
    const f = fakeSupabase({ smsRows: [], customer: null })
    const pushar: any[] = []
    const res = await meddelaFangatSamtal(
      { supabase: f.client, businessId: 'biz_1', phone: '+46701234567', callId: 'call_9', sedanIso: '2026-09-06T10:00:00Z' },
      { skickaPush: async a => { pushar.push(a) }, skapaNotis: async () => {} },
    )
    expect(res).toEqual({ sms_sent: false, customer_name: null })
    expect(pushar[0].payload.sms_sent).toBe(false)
  })

  test('en notis som kastar stoppar inte pushen, och en push som kastar stoppar inte returen', async () => {
    const f = fakeSupabase({ smsRows: [] })
    const pushar: any[] = []
    const res = await meddelaFangatSamtal(
      { supabase: f.client, businessId: 'biz_1', phone: '+46701234567', callId: 'call_9', sedanIso: '2026-09-06T10:00:00Z' },
      { skickaPush: async a => { pushar.push(a); throw new Error('push nere') }, skapaNotis: async () => { throw new Error('notis nere') } },
    )
    expect(pushar).toHaveLength(1)
    expect(res.sms_sent).toBe(false)
  })
})

test.describe('Inkoppling: båda vägarna för missat samtal går genom helpern', () => {
  for (const f of ['app/api/voice/missed/route.ts', 'app/api/voice/incoming/route.ts']) {
    test(`${f}: tidsstämpel före fireEvent, helper efter`, () => {
      const src = utanKommentarer(read(f))
      const stampel = src.indexOf("const sedanIso = new Date(Date.now() - 5_000).toISOString()")
      const fire = src.indexOf("'call_missed'")
      const helper = src.indexOf('meddelaFangatSamtal({')
      expect(stampel, 'ingen tidsstämpel').toBeGreaterThan(-1)
      expect(fire).toBeGreaterThan(stampel)
      expect(helper).toBeGreaterThan(fire)
      expect(src).toContain('sedanIso })')
    })
  }

  test('voice/incoming skriver inte notisen separat längre — helpern äger både notis och push', () => {
    const src = utanKommentarer(read('app/api/voice/incoming/route.ts'))
    expect(src).not.toContain('notifyMissedCall')
  })

  test('helpern använder sendApprovalPush (strypunkten: tyst tid, dedupe, frånvaro) — aldrig /api/push/send direkt', () => {
    const src = utanKommentarer(read('lib/voice/fangat-samtal.ts'))
    expect(src).toContain('skickaPush: sendApprovalPush')
    expect(src).not.toContain('/api/push/send')
  })
})
