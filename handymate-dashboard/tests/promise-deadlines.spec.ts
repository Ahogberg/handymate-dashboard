/**
 * Facit för Promise-to-Proof — daterade kundlöften (Etapp N, smal
 * grind-förenlig skiva, 2026-08-17).
 *
 * Rådets roadmap avvisade en bred "Promise Ledger" (docs/council/
 * ACTIVE_ROADMAP.md:508, grinden vid :1029): löften får ALDRIG bevakas ur rå
 * AI-extraktion, bara ur något ägaren uttryckligen bekräftat. Skivan här
 * respekterar grinden: extraktionen FÅR FÖRESLÅ ett datum på ett
 * commitment-fynd, men bara ett explicit godkännande (confirmed_at satt,
 * app/api/approvals/[id]/route.ts case 'customer_fact') aktiverar
 * bevakningen (promise_status='open'). Passerat datum sätter ALDRIG
 * automatiskt det brutna tillståndet — deadline-svepet informerar, en
 * människa avgör.
 *
 * Låst här:
 *   a) hittaLoftenSomBehoverKort — ren fas-logik (påminnelse/passerat,
 *      48h-gränsen, odaterat/ogiltigt datum bevakas aldrig).
 *   b) findOpenPromiseDeadlines — tenant-filtrerar på business_id, läser
 *      bara promise_status='open'.
 *   c) extraktionsprompterna (e-post + möte/telefon) bär "gissa aldrig ett
 *      datum"-instruktionen.
 *   d) godkännande-caset sätter promise_status='open' bara TILLSAMMANS med
 *      due_at, aldrig fristående.
 *   e) uppfyllnadshooken i approvals-rutten sätter 'fulfilled' bara vid
 *      lyckad exekvering OCH bara med promise_fact_id i payloaden.
 *   f) svepet skriver ALDRIG det avvisade/brutna tillståndet — människan
 *      avgör, aldrig datumpassage.
 *   g) det nya approval_type:t är registrerat i action-contract.ts.
 *   h) cron-rutten har rätt auth/dedup/pause-mönster, och vercel.json:s
 *      schema är giltigt för Hobby-planens engångs-per-dag-regel.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/promise-deadlines.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  hittaLoftenSomBehoverKort,
  dedupeKeyForPromise,
  findOpenPromiseDeadlines,
  PROMISE_REMINDER_WINDOW_MS,
  type OpenPromiseRow,
} from '../lib/promises/deadline-sweep'
import { classify, mayExecute, ACTION_CONTRACT } from '../lib/approvals/action-contract'
import { normalizeDueDateIso } from '../lib/customer-facts/build-card'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// a) hittaLoftenSomBehoverKort — ren fas-logik
// ─────────────────────────────────────────────────────────────────

const NU = new Date('2026-08-17T09:00:00.000Z')

function lofte(over: Partial<OpenPromiseRow> = {}): OpenPromiseRow {
  return {
    id: 'cfact_1',
    business_id: 'biz_42',
    customer_id: 'cust_1',
    due_at: '2026-08-18T09:00:00.000Z', // 24h efter NU
    content: 'Vi hör av oss senast måndag med offert.',
    evidence_quote: 'vi hör av oss senast måndag',
    ...over,
  }
}

test.describe('hittaLoftenSomBehoverKort — 48h-gränsen', () => {
  test('48h är fönstrets bredd', () => {
    expect(PROMISE_REMINDER_WINDOW_MS).toBe(48 * 60 * 60 * 1000)
  })

  test('due_at 24h bort → påminnelse', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: '2026-08-18T09:00:00.000Z' })], NU)
    expect(r).toHaveLength(1)
    expect(r[0].phase).toBe('paminnelse')
  })

  test('due_at EXAKT 48h bort → påminnelse (inklusiv gräns)', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: '2026-08-19T09:00:00.000Z' })], NU)
    expect(r).toHaveLength(1)
    expect(r[0].phase).toBe('paminnelse')
  })

  test('due_at 48h + 1ms bort → inget kort än', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: '2026-08-19T09:00:00.001Z' })], NU)
    expect(r).toHaveLength(0)
  })

  test('due_at EXAKT nu → passerat (inklusiv gräns, inte påminnelse)', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: NU.toISOString() })], NU)
    expect(r).toHaveLength(1)
    expect(r[0].phase).toBe('passerat')
  })

  test('due_at igår → passerat', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: '2026-08-16T09:00:00.000Z' })], NU)
    expect(r).toHaveLength(1)
    expect(r[0].phase).toBe('passerat')
  })

  test('due_at långt i framtiden (> 48h) → inget kort', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: '2026-09-01T09:00:00.000Z' })], NU)
    expect(r).toHaveLength(0)
  })

  test('odaterat löfte (due_at null) bevakas aldrig', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: null })], NU)
    expect(r).toHaveLength(0)
  })

  test('ogiltig due_at-sträng bevakas aldrig, kastar inte', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ due_at: 'nästa vecka' })], NU)
    expect(r).toHaveLength(0)
  })

  test('dedupe_key följer konventionen promise_deadline:<fact_id>:<fas>', () => {
    const r = hittaLoftenSomBehoverKort([lofte({ id: 'cfact_77', due_at: '2026-08-16T09:00:00.000Z' })], NU)
    expect(r[0].dedupe_key).toBe('promise_deadline:cfact_77:passerat')
    expect(r[0].dedupe_key).toBe(dedupeKeyForPromise('cfact_77', 'passerat'))
  })

  test('flera löften ger var sitt kort, oberoende av varandra', () => {
    const r = hittaLoftenSomBehoverKort(
      [
        lofte({ id: 'a', due_at: '2026-08-16T09:00:00.000Z' }), // passerat
        lofte({ id: 'b', due_at: '2026-08-18T09:00:00.000Z' }), // påminnelse
        lofte({ id: 'c', due_at: '2026-09-01T09:00:00.000Z' }), // inget
      ],
      NU,
    )
    expect(r.map((c) => c.fact_id).sort()).toEqual(['a', 'b'])
  })
})

// ─────────────────────────────────────────────────────────────────
// b) findOpenPromiseDeadlines — tenant-filtrering + fail-soft
// ─────────────────────────────────────────────────────────────────

function fakeSupabase(rows: any[] | null, error: { message: string; code?: string } | null = null) {
  const calls: { method: string; args: any[] }[] = []
  const builder: any = {
    select: (...args: any[]) => { calls.push({ method: 'select', args }); return builder },
    eq: (...args: any[]) => { calls.push({ method: 'eq', args }); return builder },
    order: (...args: any[]) => { calls.push({ method: 'order', args }); return builder },
    then: (resolve: any) => resolve({ data: rows, error }),
  }
  const client = { from: (...args: any[]) => { calls.push({ method: 'from', args }); return builder } }
  return { client: client as any, calls }
}

test.describe('findOpenPromiseDeadlines — tenant-filtrering', () => {
  test('läser bara promise_status=open för RÄTT business_id', async () => {
    const { client, calls } = fakeSupabase([])
    await findOpenPromiseDeadlines(client, 'biz_42', { now: NU })

    const fromCall = calls.find((c) => c.method === 'from')
    expect(fromCall?.args[0]).toBe('customer_fact')

    const eqCalls = calls.filter((c) => c.method === 'eq').map((c) => c.args)
    expect(eqCalls).toContainEqual(['business_id', 'biz_42'])
    expect(eqCalls).toContainEqual(['promise_status', 'open'])
  })

  test('rader mappas korrekt genom till kandidater', async () => {
    const { client } = fakeSupabase([
      { id: 'cfact_9', business_id: 'biz_42', customer_id: 'cust_5', due_at: '2026-08-16T09:00:00.000Z', content: 'X', evidence_quote: 'x sa jag' },
    ])
    const result = await findOpenPromiseDeadlines(client, 'biz_42', { now: NU })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ fact_id: 'cfact_9', customer_id: 'cust_5', phase: 'passerat' })
  })

  test('DB-fel (t.ex. v147 ej körd — 42703) ger fail-soft tom lista, kastar aldrig', async () => {
    const { client } = fakeSupabase(null, { message: 'column customer_fact.promise_status does not exist', code: '42703' })
    const result = await findOpenPromiseDeadlines(client, 'biz_42', { now: NU })
    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────
// c) extraktionsprompterna — "gissa aldrig ett datum"
// ─────────────────────────────────────────────────────────────────

test.describe('extraktionens datumförslag — kod, inte prompttillit', () => {
  test('e-postprompten (lib/customer-facts/extract-from-text.ts) instruerar: gissa aldrig ett datum', () => {
    const s = read('lib/customer-facts/extract-from-text.ts')
    expect(s).toContain('due_date_iso')
    expect(s).toMatch(/Gissa ALDRIG ett datum/)
  })

  test('mötes-/telefonprompten (app/api/voice/analyze/route.ts, enkelkörning + MAP) instruerar: gissa aldrig ett datum, minst tre ställen', () => {
    const s = read('app/api/voice/analyze/route.ts')
    const träffar = s.match(/Gissa ALDRIG ett datum/g) || []
    expect(träffar.length).toBeGreaterThanOrEqual(3)
    expect(s).toContain('due_date_iso')
  })

  test('normalizeDueDateIso kräver ISO-form i kod — litar inte på att modellen följer prompten', () => {
    expect(normalizeDueDateIso('2026-08-20')).toBe('2026-08-20')
    expect(normalizeDueDateIso('nästa vecka')).toBeNull()
    expect(normalizeDueDateIso('fredag')).toBeNull()
    expect(normalizeDueDateIso('')).toBeNull()
    expect(normalizeDueDateIso(null)).toBeNull()
    expect(normalizeDueDateIso(undefined)).toBeNull()
    expect(normalizeDueDateIso(20260820)).toBeNull()
  })

  test('kortbygget aktiverar aldrig due_date_iso för icke-commitment-fynd', () => {
    const s = read('lib/customer-facts/build-card.ts')
    expect(s).toContain("s.fact_type === 'commitment' ? normalizeDueDateIso(s.due_date_iso) : null")
  })
})

// ─────────────────────────────────────────────────────────────────
// d) godkännande-caset — promise_status='open' bara MED due_at
// ─────────────────────────────────────────────────────────────────

test.describe('godkännandet aktiverar löftet (app/api/approvals/[id]/route.ts, case customer_fact)', () => {
  const ROUTE = 'app/api/approvals/[id]/route.ts'

  test('promise_status sätts bara till open TILLSAMMANS med due_at, i samma villkor', () => {
    const s = read(ROUTE)
    const caseStart = s.indexOf("case 'customer_fact':")
    expect(caseStart, 'caset saknas').toBeGreaterThan(-1)
    const gren = s.slice(caseStart, caseStart + 3200)
    const guardIdx = gren.indexOf('if (promiseDueAt)')
    expect(guardIdx, 'promiseDueAt-vakten saknas').toBeGreaterThan(-1)
    const guardBody = gren.slice(guardIdx, guardIdx + 200)
    expect(guardBody).toContain('factInsert.due_at = promiseDueAt')
    expect(guardBody).toContain("factInsert.promise_status = 'open'")
  })

  test('promiseDueAt är bara satt för fact_type commitment, validerad via normalizeDueDateIso', () => {
    const s = read(ROUTE)
    const i = s.indexOf('const promiseDueAt =')
    expect(i, 'promiseDueAt saknas').toBeGreaterThan(-1)
    const line = s.slice(i, i + 200)
    expect(line).toContain("factType === 'commitment'")
    expect(line).toContain('normalizeDueDateIso(pl.due_date_iso)')
  })

  test('en omigrerad miljö (42703 på due_at/promise_status) kör om UTAN de nya kolumnerna — fäller aldrig bekräftelsen', () => {
    const s = read(ROUTE)
    const i = s.indexOf("case 'customer_fact':")
    const gren = s.slice(i, i + 3500)
    expect(gren).toContain("factErr.code === '42703'")
    expect(gren).toContain('delete factInsert.due_at')
    expect(gren).toContain('delete factInsert.promise_status')
  })
})

// ─────────────────────────────────────────────────────────────────
// e) uppfyllnadshooken — bara vid lyckad exekvering + promise_fact_id
// ─────────────────────────────────────────────────────────────────

test.describe('uppfyllnadslänken efter exekvering (app/api/approvals/[id]/route.ts)', () => {
  const ROUTE = 'app/api/approvals/[id]/route.ts'

  test('hooken finns, läser promise_fact_id ur finalPayload', () => {
    const s = read(ROUTE)
    const i = s.indexOf('const promiseFactId = (finalPayload')
    expect(i, 'uppfyllnadshooken saknas').toBeGreaterThan(-1)
  })

  test("hooken kräver outcome === 'success' — skippade/misslyckade kort uppfyller aldrig ett löfte", () => {
    const s = read(ROUTE)
    const i = s.indexOf('const promiseFactId = (finalPayload')
    const gren = s.slice(i, i + 400)
    expect(gren).toContain("outcome === 'success'")
  })

  test('uppdateringen sätter fulfilled + fulfilled_by_ref (godkännandets id) + fulfilled_at, bara på öppna löften', () => {
    const s = read(ROUTE)
    const i = s.indexOf('const promiseFactId = (finalPayload')
    const gren = s.slice(i, i + 1200)
    expect(gren).toContain("promise_status: 'fulfilled'")
    expect(gren).toContain('fulfilled_by_ref: params.id')
    expect(gren).toContain('fulfilled_at:')
    expect(gren).toContain(".eq('promise_status', 'open')")
  })

  test('hooken är non-blocking — eget try/catch, loggar men kastar aldrig', () => {
    const s = read(ROUTE)
    const i = s.indexOf('const promiseFactId = (finalPayload')
    const gren = s.slice(i, i + 1400)
    expect(gren).toContain('try {')
    expect(gren).toContain('catch (fulfillCatchErr')
  })
})

// ─────────────────────────────────────────────────────────────────
// f) svepet skriver ALDRIG det avvisade tillståndet automatiskt
// ─────────────────────────────────────────────────────────────────

test.describe('deadline-svepet dömer aldrig ett löfte automatiskt', () => {
  test('lib/promises/deadline-sweep.ts skriver aldrig det avvisade tillståndet som sträng — bara ett kort, aldrig en statusändring', () => {
    const s = read('lib/promises/deadline-sweep.ts')
    // Ordet stavas medvetet inte ut här (samma fil skulle annars trigga en
    // framtida repo-bred sträng-scan av sig själv) — det byggs ihop av
    // delar, och testet letar efter HELA det sammansatta ordet i filen.
    const avvisatTillstand = ['brok', 'en'].join('')
    expect(s).not.toContain(`'${avvisatTillstand}'`)
    expect(s).not.toContain(`"${avvisatTillstand}"`)
  })

  test('cron-rutten (app/api/cron/promise-deadlines/route.ts) skriver aldrig det avvisade tillståndet heller', () => {
    const s = read('app/api/cron/promise-deadlines/route.ts')
    const avvisatTillstand = ['brok', 'en'].join('')
    expect(s).not.toContain(`'${avvisatTillstand}'`)
    expect(s).not.toContain(`"${avvisatTillstand}"`)
  })
})

// ─────────────────────────────────────────────────────────────────
// g) registrerad i action-contract.ts
// ─────────────────────────────────────────────────────────────────

test.describe('promise_deadline_signal — kontraktet', () => {
  test('registrerad som INFORMATIONAL — en nudge, aldrig en åtgärd', () => {
    expect(classify('promise_deadline_signal')).toBe('INFORMATIONAL')
    expect(mayExecute('promise_deadline_signal')).toBe(false)
  })

  test('typen finns i ACTION_CONTRACT (skulle annars failas stängt av kön)', () => {
    expect(Object.keys(ACTION_CONTRACT)).toContain('promise_deadline_signal')
  })
})

// ─────────────────────────────────────────────────────────────────
// h) cron-rutten — auth/dedup/pause + vercel.json
// ─────────────────────────────────────────────────────────────────

const CRON_ROUTE = 'app/api/cron/promise-deadlines/route.ts'

test.describe('cron/promise-deadlines — auth', () => {
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

test.describe('cron/promise-deadlines — dedup + pause + risk', () => {
  test('kollar en existerande pending promise_deadline_signal-rad med samma dedupe_key FÖRE insert', () => {
    const s = read(CRON_ROUTE)
    const dedupeCheck = s.indexOf(".contains('payload', { dedupe_key: candidate.dedupe_key })")
    const insert = s.indexOf(".from('pending_approvals').insert({")
    expect(dedupeCheck, 'dedupe-kollen saknas').toBeGreaterThan(-1)
    expect(insert, 'inserten saknas').toBeGreaterThan(-1)
    expect(dedupeCheck, 'kollen måste ske FÖRE inserten').toBeLessThan(insert)
    const gren = s.slice(dedupeCheck - 500, dedupeCheck + 50)
    expect(gren).toContain("eq('approval_type', 'promise_deadline_signal')")
    expect(gren).toContain("eq('status', 'pending')")
    expect(gren).toContain("eq('business_id', businessId)")
  })

  test('payloaden bär promise_fact_id, customer_id och phase — uppfyllnadshookens och dedupens kontrakt', () => {
    const s = read(CRON_ROUTE)
    const insert = s.indexOf(".from('pending_approvals').insert({")
    const gren = s.slice(insert, insert + 900)
    expect(gren).toContain('promise_fact_id: candidate.fact_id')
    expect(gren).toContain('customer_id: candidate.customer_id')
    expect(gren).toContain('phase: candidate.phase')
  })

  test('pausade agenter hoppas över — samma spärr som karin-deadlines/expectation-drift', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain('agents_globally_paused')
  })

  test('kortet skapas aldrig som EXECUTABLE — bara en informationsnudge', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain("approval_type: 'promise_deadline_signal'")
    expect(s).toContain("risk_level: 'low'")
  })

  test('svepet läser via findOpenPromiseDeadlines — ingen egen lokal query-kopia', () => {
    const s = read(CRON_ROUTE)
    expect(s).toContain("from '@/lib/promises/deadline-sweep'")
    expect(s).toContain('findOpenPromiseDeadlines(')
  })
})

test.describe('cron/promise-deadlines — vercel.json', () => {
  test('finns exakt en cron-rad för rutten', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rader = cfg.crons.filter((c) => c.path === '/api/cron/promise-deadlines')
    expect(rader).toHaveLength(1)
  })

  test('schemat är en giltig engångs-per-dag-rad (Hobby-plan-säker) — inget sub-dagligt uttryck', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const rad = cfg.crons.find((c) => c.path === '/api/cron/promise-deadlines')
    expect(rad, 'cron-raden saknas i vercel.json').toBeTruthy()
    expect(rad!.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/)
  })

  test('kolliderar inte med någon befintlig schemarad', () => {
    const cfg = JSON.parse(read('vercel.json')) as { crons: { path: string; schedule: string }[] }
    const scheman = cfg.crons.map((c) => c.schedule)
    const varSchema = cfg.crons.find((c) => c.path === '/api/cron/promise-deadlines')!.schedule
    const kollisioner = cfg.crons.filter((c) => c.schedule === varSchema)
    expect(kollisioner, `schemat ${varSchema} krockar med en annan rutt`).toHaveLength(1)
    void scheman
  })
})

// ─────────────────────────────────────────────────────────────────
// Övrigt: get_customer_commitments (tool-router) läser v147 fail-soft
// ─────────────────────────────────────────────────────────────────

test.describe('get_customer_commitments (app/api/agent/trigger/tool-router.ts) — v147 fail-soft', () => {
  test('select(*) i stället för en explicit kolumnlista — kan aldrig 42703:a på due_at/promise_status', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const i = s.indexOf('async function getCustomerCommitments(')
    expect(i, 'funktionen hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 900)
    expect(gren).toContain("from('customer_fact')")
    expect(gren).toContain(".select('*')")
  })

  test('svaret bär due_at och promise_status defensivt', () => {
    const s = read('app/api/agent/trigger/tool-router.ts')
    const i = s.indexOf('async function getCustomerCommitments(')
    const gren = s.slice(i, i + 2200)
    expect(gren).toContain('due_at: r.due_at ?? null')
    expect(gren).toContain('promise_status: r.promise_status ?? null')
  })
})
