/**
 * Facit för Expectation Drift — Signal 1 (docs/audits/NEXT_MOAT_WAVE.md,
 * Koncept 3, 2026-08-16).
 *
 * Signal 1 är den smala, byggbara-nu delen av konceptet: ren kö-ålder på
 * BEFINTLIGA kundvända åtagande-kort (create_quote_draft/meeting_followup/
 * create_ata_draft) — ingen prognos, ingen jämförelse mot kundens faktiska
 * tro (den fulla versionen väntar på X2 + Company Memory).
 *
 * Låst här:
 *   a) daysStale — ren day-math, tidzonssäker.
 *   b) findStaleSignals — tenant-filtrerar på business_id.
 *   c) EXAKT den medvetet smala typmängden — växer den ska det synas här,
 *      inte glida in tyst (samma disciplin som andra "lås typmängden"-tester
 *      i denna svit).
 *   d) dedup — cron-svepet kollar en existerande pending-kort-nyckel innan
 *      det skapar ett nytt.
 *   e) det nya approval_type:t är registrerat i action-contract.ts, och
 *      korrekt klassat (INFORMATIONAL — en nudge, aldrig en åtgärd).
 *   f) cron-rutten kräver samma auth-mönster som resten av app/api/cron/*,
 *      och vercel.json:s schema är giltigt för Hobby-planens engångs-
 *      per-dag-regel (CLAUDE.md).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/expectation-drift-signal1.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  daysStale,
  findStaleSignals,
  STALE_SIGNAL_APPROVAL_TYPES,
  DEFAULT_STALE_THRESHOLD_DAYS,
  type StaleSignalRow,
} from '../lib/expectation-drift/stale-signals'
import { classify, mayExecute, ACTION_CONTRACT } from '../lib/approvals/action-contract'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// a) daysStale — ren day-math
// ─────────────────────────────────────────────────────────────────

test.describe('daysStale — ren day-math, tidzonssäker', () => {
  test('exakt N dygn senare → N', () => {
    expect(daysStale('2026-08-01T09:00:00.000Z', '2026-08-06T09:00:00.000Z')).toBe(5)
  })

  test('4 dygn och 23 timmar → 4 (avrundar neråt, inte uppåt)', () => {
    expect(daysStale('2026-08-01T09:00:00.000Z', '2026-08-06T08:00:00.000Z')).toBe(4)
  })

  test('samma tidpunkt → 0', () => {
    expect(daysStale('2026-08-01T09:00:00.000Z', '2026-08-01T09:00:00.000Z')).toBe(0)
  })

  test('olika UTC-offset på samma två faktiska tidpunkter ger samma svar', () => {
    // '2026-08-01T09:00:00Z' === '2026-08-01T11:00:00+02:00' — samma
    // faktiska ögonblick, olika textrepresentation. Date-subtraktion sker
    // alltid i UTC-epoch, så resultatet ska inte bero på vilken offset
    // strängen råkar bära.
    const a = daysStale('2026-08-01T09:00:00.000Z', '2026-08-06T09:00:00.000Z')
    const b = daysStale('2026-08-01T11:00:00.000+02:00', '2026-08-06T11:00:00.000+02:00')
    expect(a).toBe(5)
    expect(b).toBe(5)
  })

  test('en UTC-midnattsgräns korsad efter bara några timmar räknas INTE som ett helt dygn', () => {
    // Skapad 23:00 UTC, "nu" är 01:00 UTC nästa kalenderdag — bara 2 timmar
    // förflutna. Kalenderdags-räkning (som skiljer sig från faktisk
    // förfluten tid) hade felaktigt sagt 1 — funktionen mäter FAKTISK tid.
    expect(daysStale('2026-08-01T23:00:00.000Z', '2026-08-02T01:00:00.000Z')).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────
// c) exakt typmängden — låst
// ─────────────────────────────────────────────────────────────────

test.describe('STALE_SIGNAL_APPROVAL_TYPES — den medvetet smala mängden', () => {
  test('exakt dessa tre — ingen mer, ingen mindre', () => {
    // Ändras detta test måste det vara ett MEDVETET beslut (och en
    // motivering i lib/expectation-drift/stale-signals.ts filhuvud), inte
    // en tyst scope-glidning. "hellre missa än gissa" — en felaktig
    // inklusion (falsklarm om ett kundlöfte som inte är ett) kostar mer
    // förtroende än ett missat larm.
    expect([...STALE_SIGNAL_APPROVAL_TYPES].sort()).toEqual(
      ['create_ata_draft', 'create_quote_draft', 'meeting_followup'].sort(),
    )
  })

  test('medvetet UTESLUTNA typer som liknar kundlöften men inte räknas hit', () => {
    // customer_fact/autonomy_offer/review_request är inte kundvända
    // ÅTAGANDEN i samma mening — de får aldrig glida in i mängden av
    // misstag.
    const uteslutna = ['customer_fact', 'autonomy_offer', 'review_request', 'quote_request', 'quote_addition']
    for (const t of uteslutna) {
      expect((STALE_SIGNAL_APPROVAL_TYPES as readonly string[]).includes(t), `${t} ska INTE bevakas`).toBe(false)
    }
  })

  test('tröskeln är fem dagar (dokumenterad avvägning, inte en gissning)', () => {
    expect(DEFAULT_STALE_THRESHOLD_DAYS).toBe(5)
  })
})

// ─────────────────────────────────────────────────────────────────
// b) findStaleSignals — tenant-filtrering + expires_at-hänsyn
// ─────────────────────────────────────────────────────────────────

/**
 * Minimal fake Supabase-klient. Kedjan .from().select().eq().eq().in().lt()
 * speglar exakt anropet i lib/expectation-drift/stale-signals.ts. Fångar
 * alla .eq()/.in()/.lt()-anrop så testerna kan bevisa tenant-filtreringen
 * utan en riktig databas.
 */
function fakeSupabase(rows: any[]) {
  const calls: { method: string; args: any[] }[] = []
  const builder: any = {
    select: (...args: any[]) => { calls.push({ method: 'select', args }); return builder },
    eq: (...args: any[]) => { calls.push({ method: 'eq', args }); return builder },
    in: (...args: any[]) => { calls.push({ method: 'in', args }); return builder },
    lt: (...args: any[]) => { calls.push({ method: 'lt', args }); return builder },
    then: (resolve: any) => resolve({ data: rows, error: null }),
  }
  const client = { from: (...args: any[]) => { calls.push({ method: 'from', args }); return builder } }
  return { client: client as any, calls }
}

const NU = '2026-08-16T09:00:00.000Z'

function rad(over: Partial<Record<string, any>> = {}): Record<string, any> {
  return {
    id: 'appr_1',
    approval_type: 'create_quote_draft',
    title: 'Offert till Andersson',
    created_at: '2026-08-10T09:00:00.000Z', // 6 dagar före NU
    expires_at: null,
    payload: { entity: { customerId: 'cust_1' } },
    ...over,
  }
}

test.describe('findStaleSignals — tenant-filtrering och day-math', () => {
  test('filtrerar på business_id och status=pending och de rätta typerna', async () => {
    const { client, calls } = fakeSupabase([rad()])
    await findStaleSignals(client, 'biz_42', { now: new Date(NU) })

    const eqCalls = calls.filter(c => c.method === 'eq').map(c => c.args)
    expect(eqCalls).toContainEqual(['business_id', 'biz_42'])
    expect(eqCalls).toContainEqual(['status', 'pending'])

    const inCall = calls.find(c => c.method === 'in')
    expect(inCall?.args[0]).toBe('approval_type')
    expect([...inCall!.args[1]].sort()).toEqual(
      ['create_ata_draft', 'create_quote_draft', 'meeting_followup'].sort(),
    )
  })

  test('resultatet bär rätt days_stale och kund-id ur entity.customerId', async () => {
    const { client } = fakeSupabase([rad()])
    const result = await findStaleSignals(client, 'biz_42', { now: new Date(NU) })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'appr_1',
      approval_type: 'create_quote_draft',
      customer_id: 'cust_1',
      days_stale: 6,
    })
  })

  test('kund-id läses ur payload.customer_id (meeting_followup-konventionen) när entity saknas', async () => {
    const { client } = fakeSupabase([
      rad({ id: 'appr_2', approval_type: 'meeting_followup', payload: { customer_id: 'cust_9' } }),
    ])
    const result = await findStaleSignals(client, 'biz_42', { now: new Date(NU) })
    expect(result[0].customer_id).toBe('cust_9')
  })

  test('ett kort som redan passerat sitt EGET expires_at räknas inte som ett nytt fynd', async () => {
    const { client } = fakeSupabase([
      rad({ expires_at: '2026-08-11T00:00:00.000Z' }), // före NU
    ])
    const result = await findStaleSignals(client, 'biz_42', { now: new Date(NU) })
    expect(result).toHaveLength(0)
  })

  test('ett kort med expires_at i framtiden räknas fortfarande', async () => {
    const { client } = fakeSupabase([
      rad({ expires_at: '2026-09-01T00:00:00.000Z' }),
    ])
    const result = await findStaleSignals(client, 'biz_42', { now: new Date(NU) })
    expect(result).toHaveLength(1)
  })

  test('DB-fel ger fail-closed tom lista, kastar aldrig', async () => {
    const client = { from: () => ({
      select: function () { return this },
      eq: function () { return this },
      in: function () { return this },
      lt: function () { return this },
      then: (resolve: any) => resolve({ data: null, error: { message: 'boom' } }),
    }) } as any
    const result = await findStaleSignals(client, 'biz_42', { now: new Date(NU) })
    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────
// e) registrerad i action-contract.ts, rätt klass
// ─────────────────────────────────────────────────────────────────

test.describe('expectation_drift_signal — kontraktet', () => {
  test('registrerad som INFORMATIONAL — en nudge, aldrig en åtgärd', () => {
    expect(classify('expectation_drift_signal')).toBe('INFORMATIONAL')
    expect(mayExecute('expectation_drift_signal')).toBe(false)
  })

  test('typen finns i ACTION_CONTRACT (skulle annars failas stängt av kön)', () => {
    expect(Object.keys(ACTION_CONTRACT)).toContain('expectation_drift_signal')
  })
})

// ─────────────────────────────────────────────────────────────────
// d) dedup + f) cron-auth + schema — källkodsscanning av cron-rutten
// ─────────────────────────────────────────────────────────────────

const CRON_ROUTE = 'app/api/cron/expectation-drift/route.ts'

test.describe('cron/expectation-drift — auth', () => {
  test('kräver CRON_SECRET via den delade helpern, i BÅDE GET och POST', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain("from '@/lib/cron/verify-secret'")
    const getStart = s.indexOf('export async function GET')
    const postStart = s.indexOf('export async function POST')
    expect(getStart).toBeGreaterThan(-1)
    expect(postStart).toBeGreaterThan(-1)
    expect(s.slice(getStart, postStart)).toContain('verifyCronSecret(request)')
    expect(s.slice(postStart)).toContain('verifyCronSecret(request)')
  })
})

test.describe('cron/expectation-drift — dedup', () => {
  test('kollar en existerande pending expectation_drift_signal-rad med samma dedupe_key FÖRE insert', () => {
    const s = read(CRON_ROUTE)
    const dedupeCheck = s.indexOf(".contains('payload', { dedupe_key: dedupeKey })")
    const insert = s.indexOf(".from('pending_approvals').insert({")
    expect(dedupeCheck, 'dedupe-kollen saknas').toBeGreaterThan(-1)
    expect(insert, 'inserten saknas').toBeGreaterThan(-1)
    expect(dedupeCheck, 'kollen måste ske FÖRE inserten').toBeLessThan(insert)
    // Kollen är scopad till samma approval_type + status=pending + business_id
    // — annars skulle den kunna matcha fel korttyp eller redan avgjorda kort.
    const gren = s.slice(dedupeCheck - 500, dedupeCheck + 50)
    expect(gren).toContain("eq('approval_type', 'expectation_drift_signal')")
    expect(gren).toContain("eq('status', 'pending')")
    expect(gren).toContain("eq('business_id', businessId)")
  })

  test('dedupe-nyckeln är härledd ur KÄLLKORTETS id, inte ett svagare fält', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain('function dedupeKeyFor(sourceApprovalId: string): string')
    expect(s).toContain('`expectation_drift:${sourceApprovalId}`')
    expect(s).toContain('dedupeKeyFor(signal.id)')
  })

  test('pausade agenter hoppas över — samma spärr som karin-deadlines/missed-revenue', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain('agents_globally_paused')
  })

  test('kortet skapas aldrig som EXECUTABLE — bara en informationsnudge', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain("approval_type: 'expectation_drift_signal'")
    expect(s).toContain("risk_level: 'low'")
  })
})

test.describe('cron/expectation-drift — vercel.json', () => {
  test('finns exakt en cron-rad för rutten', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rader = cfg.crons.filter(c => c.path === '/api/cron/expectation-drift')
    expect(rader).toHaveLength(1)
  })

  test('schemat är en giltig engångs-per-dag-rad (Hobby-plan-säker) — inget sub-dagligt uttryck', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rad = cfg.crons.find(c => c.path === '/api/cron/expectation-drift')
    expect(rad, 'cron-raden saknas i vercel.json').toBeTruthy()
    // CLAUDE.md: Hobby-planen tillåter max en körning per dag, format
    // "M H * * *" — aldrig */N eller flera fält med stjärnor utanför
    // veckodag/dag-i-månad-positionerna.
    expect(rad!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/)
  })

  test('kolliderar inte med någon befintlig schemarad', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const scheman = cfg.crons.map(c => c.schedule)
    const dubbletter = scheman.filter((s, i) => scheman.indexOf(s) !== i)
    // OK att flagga endast om VÅR rad är inblandad i en krock — andra
    // befintliga dubbletter (t.ex. två måndagsjobb kl 07:00) är inte den
    // här körningens ansvar att städa upp.
    const varSchema = cfg.crons.find(c => c.path === '/api/cron/expectation-drift')!.schedule
    const kollisioner = cfg.crons.filter(c => c.schedule === varSchema)
    expect(kollisioner, `schemat ${varSchema} krockar med en annan rutt`).toHaveLength(1)
  })
})
