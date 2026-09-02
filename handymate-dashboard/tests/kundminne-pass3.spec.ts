/**
 * Facit för kundminnet, pass 3 (2026-09-02, tasks/plan-kundminne-pass3.md).
 *
 * Bakgrund: docs/audits/KUNDMINNE_REVISION_2026-09-02.md, pass 1 (9788dca),
 * pass 2 (6c8cdb8). Minnet fanns i tre lager som inte pratade med varandra
 * (agent_memories, customer_fact, Företagsmodellen) och varje promptbyggare
 * hämtade själv. Detta pass ger EN läsfunktion (lib/context/kundkontext.ts)
 * och relevans i agentminnet i stället för "topp fem på viktighet".
 *
 * Migrationen sql/v201_agent_memories_fts.sql är KÖRD — koden är ändå
 * fail-soft (samma isMissingColumnError-idiom som resten av
 * lib/agents/memory.ts).
 *
 * Låser:
 *   - del 1: byggMinnesfraga (ren funktion), relevansfrågan i
 *     fetchRelevantMemories (textSearch/content_tsv/config swedish,
 *     fail-soft, dedupe på id), "Relevant för det här:" i buildMemoryPrompt.
 *   - del 2: lib/context/kundkontext.ts — hamtaKundkontext slår ihop
 *     Företagsmodellen + kundfakta/-kanaler + minnen, tomt allt ⇒ '',
 *     tak på total längd, formateraKontextrad ren och testbar.
 *   - del 3: matte/chat + agent/trigger anropar hamtaKundkontext i stället
 *     för getRelevantMemories/buildMemoryPrompt; voice/analyze och
 *     tool-router (get_customer) injicerar samma block.
 *   - sql/v201 finns, schema-audit har content_tsv.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/kundminne-pass3.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  byggMinnesfraga,
  fetchRelevantMemories,
  buildMemoryPrompt,
  type RelevantMemoryRow,
} from '../lib/agents/memory'
import { hamtaKundkontext, formateraKontextrad, MAX_BLOCK_LENGTH } from '../lib/context/kundkontext'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const MEMORY = 'lib/agents/memory.ts'
const KUNDKONTEXT = 'lib/context/kundkontext.ts'
const CHAT_ROUTE = 'app/api/matte/chat/route.ts'
const TRIGGER_ROUTE = 'app/api/agent/trigger/route.ts'
const VOICE_ANALYZE = 'app/api/voice/analyze/route.ts'
const TOOL_ROUTER = 'app/api/agent/trigger/tool-router.ts'
const SCHEMA_AUDIT = 'app/api/debug/schema-audit/route.ts'

// ─────────────────────────────────────────────────────────────────
// Del 1 — byggMinnesfraga (ren funktion)
// ─────────────────────────────────────────────────────────────────

test.describe('byggMinnesfraga — ren funktion, ingen I/O', () => {
  test('"Vad kostar en offert på badrum?" ⇒ ord ≥ 4 tecken, OR-ihopsatta', () => {
    expect(byggMinnesfraga('Vad kostar en offert på badrum?')).toBe('kostar OR offert OR badrum')
  })

  test('tom sträng ⇒ null', () => {
    expect(byggMinnesfraga('')).toBeNull()
  })

  test('bara korta ord (< 4 tecken) ⇒ null', () => {
    expect(byggMinnesfraga('en på ok du')).toBeNull()
  })

  test('max 12 ord, resten klipps', () => {
    const text = Array.from({ length: 20 }, (_, i) => `ord${i}xxxx`).join(' ')
    const result = byggMinnesfraga(text)
    expect(result).not.toBeNull()
    expect((result as string).split(' OR ')).toHaveLength(12)
  })

  test('unika ord — dubbletter räknas en gång', () => {
    expect(byggMinnesfraga('badrum badrum badrum kostar')).toBe('badrum OR kostar')
  })

  test('specialtecken utanför [a-zåäöéA-ZÅÄÖÉ0-9] strippas', () => {
    expect(byggMinnesfraga('kostar? offert! badrum...')).toBe('kostar OR offert OR badrum')
  })
})

// ─────────────────────────────────────────────────────────────────
// Del 1 — relevanssökningen i fetchRelevantMemories
// ─────────────────────────────────────────────────────────────────

function fakeMemorySupabase(steg: Array<{ data: any; error: any }>) {
  const calls: { table: string; ops: { method: string; args: any[] }[] }[] = []
  let i = 0
  const client: any = {
    from(table: string) {
      const record = { table, ops: [] as { method: string; args: any[] }[] }
      calls.push(record)
      const resp = steg[Math.min(i, steg.length - 1)] || { data: null, error: null }
      i++
      const builder: any = {}
      const methods = ['select', 'eq', 'is', 'not', 'or', 'order', 'limit', 'update', 'in', 'textSearch']
      for (const m of methods) {
        builder[m] = (...args: any[]) => {
          record.ops.push({ method: m, args })
          return builder
        }
      }
      builder.then = (resolve: any) => resolve(resp)
      return builder
    },
  }
  return { client, calls }
}

test.describe('fetchRelevantMemories — relevansfrågan (opts.query)', () => {
  test('utan query: byte-identiskt (ingen textSearch-fråga körs)', async () => {
    const rows: RelevantMemoryRow[] = [
      { id: 'a', content: 'A', importance_score: 0.9, memory_type: 'fact', created_at: '2026-08-18T00:00:00.000Z' },
    ]
    const { client, calls } = fakeMemorySupabase([{ data: rows, error: null }, { data: null, error: null }])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte')
    expect(result.map((r) => r.id)).toEqual(['a'])
    expect(calls).toHaveLength(2) // huvudfrågan + last_accessed_at-uppdateringen, ingen tredje
  })

  test('med query: en andra fråga körs mot content_tsv med config swedish, websearch', async () => {
    const rows: RelevantMemoryRow[] = [
      { id: 'a', content: 'A', importance_score: 0.5, memory_type: 'fact', created_at: '2026-08-18T00:00:00.000Z' },
    ]
    const relevant: RelevantMemoryRow[] = [
      { id: 'b', content: 'Kunden vill ha badrumsoffert', importance_score: 0.3, memory_type: 'fact', created_at: '2026-08-01T00:00:00.000Z' },
    ]
    const { client, calls } = fakeMemorySupabase([
      { data: rows, error: null }, // huvudfrågan
      { data: relevant, error: null }, // relevansfrågan
      { data: null, error: null }, // last_accessed_at
    ])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte', { query: 'Vad kostar en badrumsoffert?' })
    // Relevansträffen FÖRE viktighetstoppen.
    expect(result.map((r) => r.id)).toEqual(['b', 'a'])
    expect(result[0].relevant).toBe(true)
    expect(result[1].relevant).toBeFalsy()

    const relevansOps = calls[1].ops
    expect(relevansOps.find((o) => o.method === 'textSearch')?.args).toEqual([
      'content_tsv',
      'kostar OR badrumsoffert',
      { config: 'swedish', type: 'websearch' },
    ])
  })

  test('dedupe på id — en rad som finns i BÅDA frågorna räknas en gång, relevans vinner', async () => {
    const rows: RelevantMemoryRow[] = [
      { id: 'delad', content: 'Delad rad', importance_score: 0.9, memory_type: 'fact', created_at: '2026-08-18T00:00:00.000Z' },
    ]
    const relevant: RelevantMemoryRow[] = [
      { id: 'delad', content: 'Delad rad', importance_score: 0.9, memory_type: 'fact', created_at: '2026-08-18T00:00:00.000Z' },
    ]
    const { client } = fakeMemorySupabase([
      { data: rows, error: null },
      { data: relevant, error: null },
      { data: null, error: null },
    ])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte', { query: 'delad rad' })
    expect(result).toHaveLength(1)
    expect(result[0].relevant).toBe(true)
  })

  test('fail-soft: relevansfrågan svarar med fel ⇒ tom relevanslista, viktighetstoppen används ändå', async () => {
    const rows: RelevantMemoryRow[] = [
      { id: 'a', content: 'A', importance_score: 0.9, memory_type: 'fact', created_at: '2026-08-18T00:00:00.000Z' },
    ]
    const { client } = fakeMemorySupabase([
      { data: rows, error: null },
      { data: null, error: { message: 'boom' } }, // relevansfrågan kraschar
      { data: null, error: null },
    ])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte', { query: 'något' })
    expect(result.map((r) => r.id)).toEqual(['a'])
  })

  test('tom tsQuery (byggMinnesfraga ⇒ null, t.ex. bara korta ord) kör ALDRIG relevansfrågan', async () => {
    const rows: RelevantMemoryRow[] = [
      { id: 'a', content: 'A', importance_score: 0.9, memory_type: 'fact', created_at: '2026-08-18T00:00:00.000Z' },
    ]
    const { client, calls } = fakeMemorySupabase([{ data: rows, error: null }, { data: null, error: null }])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte', { query: 'en på ok' })
    expect(result.map((r) => r.id)).toEqual(['a'])
    expect(calls).toHaveLength(2)
  })

  test('sammanslagningen klipps till RELEVANT_MEMORIES_TOP_N + headroom (max 8)', async () => {
    const rows: RelevantMemoryRow[] = Array.from({ length: 5 }, (_, i) => ({
      id: `topp_${i}`,
      content: `Topp ${i}`,
      importance_score: 0.9 - i * 0.01,
      memory_type: 'fact',
      created_at: '2026-08-18T00:00:00.000Z',
    }))
    const relevant: RelevantMemoryRow[] = Array.from({ length: 10 }, (_, i) => ({
      id: `rel_${i}`,
      content: `Relevant ${i}`,
      importance_score: 0.5,
      memory_type: 'fact',
      created_at: '2026-08-18T00:00:00.000Z',
    }))
    const { client } = fakeMemorySupabase([
      { data: rows, error: null },
      { data: relevant, error: null },
      { data: null, error: null },
    ])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte', { query: 'sök' })
    expect(result.length).toBeLessThanOrEqual(8)
  })
})

test.describe('relevanssökningen i memory.ts — källskanning', () => {
  test('textSearch mot content_tsv med config swedish', () => {
    const s = read(MEMORY)
    expect(s).toContain("textSearch('content_tsv', tsQuery, { config: 'swedish', type: 'websearch' })")
  })

  test('fail-soft runt relevansfrågan (try/catch, ingen kastad fråga)', () => {
    const s = read(MEMORY)
    const i = s.indexOf('async function fetchRelevanceMatches(')
    expect(i, 'fetchRelevanceMatches hittades inte').toBeGreaterThan(-1)
    const fn = s.slice(i, s.indexOf('\n}\n', i))
    expect(fn).toContain('try {')
    expect(fn).toContain('catch (err)')
    expect((fn.match(/return \[\]/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  test('dedupe på id i fetchRelevantMemories (setta/ihopslaget)', () => {
    const s = read(MEMORY)
    expect(s).toContain('if (setta.has(r.id)) continue')
  })
})

test.describe('buildMemoryPrompt — "Relevant för det här:" (pass 3)', () => {
  test('en rad med isRelevant=true hamnar under rubriken "Relevant för det här:"', () => {
    const s = buildMemoryPrompt([{ content: 'Vill ha badrumsrenovering', isCustomer: false, isRelevant: true }])
    expect(s).toContain('Relevant för det här:')
    expect(s).toContain('Vill ha badrumsrenovering')
  })

  test('blandning: relevanta FÖRE övriga, ingen rubrik när inga relevanta finns', () => {
    const s = buildMemoryPrompt([
      { content: 'Firmanivå', isCustomer: false },
      { content: 'Relevant sak', isCustomer: false, isRelevant: true },
    ])
    const relevantIdx = s.indexOf('Relevant för det här:')
    const firmaIdx = s.indexOf('Firmanivå')
    expect(relevantIdx).toBeGreaterThan(-1)
    expect(relevantIdx).toBeLessThan(firmaIdx)

    const utanRelevanta = buildMemoryPrompt([{ content: 'Bara firmanivå', isCustomer: false }])
    expect(utanRelevanta).not.toContain('Relevant för det här:')
  })

  test('gamla anrop (pass 2-testerna) är fortfarande gröna — se tests/kundminne-pass2.spec.ts', () => {
    const s = buildMemoryPrompt(['A', 'B'])
    expect(s).toContain('1. A')
    expect(s).toContain('2. B')
  })
})

// ─────────────────────────────────────────────────────────────────
// sql/v201 + schema-audit
// ─────────────────────────────────────────────────────────────────

test.describe('sql/v201 + schema-audit', () => {
  test('migrationsfilen finns och lägger till content_tsv + GIN-index', () => {
    const s = read('sql/v201_agent_memories_fts.sql')
    expect(s).toContain('ADD COLUMN IF NOT EXISTS content_tsv tsvector')
    expect(s).toContain('USING GIN (content_tsv)')
  })

  test('schema-audit har en post för agent_memories.content_tsv', () => {
    const s = read(SCHEMA_AUDIT)
    expect(s).toContain(
      "{ table: 'agent_memories', column: 'content_tsv', migration: 'v201_agent_memories_fts', critical: false }",
    )
  })
})

// ─────────────────────────────────────────────────────────────────
// Del 2 — lib/context/kundkontext.ts
// ─────────────────────────────────────────────────────────────────

test.describe('kundkontext.ts — källskanning', () => {
  test('läser customer_fact, call_recording, phoneCandidates och loadCompanyModel', () => {
    const s = read(KUNDKONTEXT)
    expect(s).toContain(".from('customer_fact')")
    expect(s).toContain(".from('call_recording')")
    expect(s).toContain('phoneCandidates(')
    expect(s).toContain('loadCompanyModel(')
  })

  test('blockets rubrik är "## Vad Handymate vet"', () => {
    const s = read(KUNDKONTEXT)
    expect(s).toContain('## Vad Handymate vet')
  })
})

test.describe('formateraKontextrad — ren funktion, ingen I/O', () => {
  test('DATUM · KANAL: text', () => {
    expect(formateraKontextrad('2026-08-01T10:00:00Z', 'Samtal', 'Kunden vill ha offert')).toBe(
      '2026-08-01 · Samtal: Kunden vill ha offert',
    )
  })

  test('text över maxLen klipps med ellips', () => {
    const langText = 'x'.repeat(200)
    const rad = formateraKontextrad('2026-08-01T10:00:00Z', 'SMS', langText, 160)
    const textDel = rad.split(': ').slice(1).join(': ')
    expect(textDel.length).toBe(160)
    expect(textDel.endsWith('…')).toBe(true)
  })

  test('saknat/ogiltigt datum ⇒ "okänt datum", raden hoppas inte över', () => {
    expect(formateraKontextrad(null, 'Mejl', 'Hej')).toBe('okänt datum · Mejl: Hej')
  })
})

// Enkel fixtur-driven Supabase-attrapp: en respons per tabellnamn, samma
// idiom som resten av kundminnets facit (kösvarssekvens per .from()).
function fakeKundkontextSupabase(tables: Record<string, { data: any; error?: any }>) {
  return {
    from(table: string) {
      const resp = tables[table] ?? { data: null, error: null }
      const builder: any = {}
      const methods = ['select', 'eq', 'is', 'not', 'or', 'order', 'limit', 'in']
      for (const m of methods) builder[m] = () => builder
      builder.maybeSingle = () => Promise.resolve(resp)
      builder.then = (resolve: any) => resolve(resp)
      return builder
    },
  } as any
}

test.describe('hamtaKundkontext — tomt allt ⇒ block=\'\' (ren funktion testad med fixtur)', () => {
  test('ingen customerId, tomt företag ⇒ block är en tom sträng, aldrig en bar rubrik', async () => {
    const supabase = fakeKundkontextSupabase({})
    const kontext = await hamtaKundkontext(supabase, { businessId: 'biz_tom', agentId: 'matte' })
    expect(kontext.block).toBe('')
    expect(kontext.kallor).toEqual([])
  })

  test('känd kund men noll fakta/kanaler ⇒ ingen bar "Om <namn>:"-rubrik heller', async () => {
    const supabase = fakeKundkontextSupabase({
      customer: { data: { name: 'Anna Andersson', phone_number: '0701234567' }, error: null },
    })
    const kontext = await hamtaKundkontext(supabase, { businessId: 'biz_tom', customerId: 'cust_1', agentId: 'matte' })
    expect(kontext.block).toBe('')
  })
})

test.describe('hamtaKundkontext — med innehåll', () => {
  test('företagsfakta (bransch/timpris/betalvillkor/marginalmål) med källa i parentes', async () => {
    const supabase = fakeKundkontextSupabase({
      business_config: {
        data: {
          revenue_target_annual_sek: null,
          margin_target_percent: 25,
          margin_target_set_at: '2026-01-01T00:00:00Z',
          pricing_settings: { hourly_rate: 650, vat_rate: 25 },
          branch: 'electrician',
          secondary_branches: [],
          knowledge_base: {},
          default_payment_days: 45,
        },
        error: null,
      },
    })
    const kontext = await hamtaKundkontext(supabase, { businessId: 'biz_a', agentId: 'matte' })
    expect(kontext.block).toContain('## Vad Handymate vet')
    expect(kontext.block).toContain('Om företaget:')
    expect(kontext.block).toMatch(/Timpris: 650 kr\/tim \(\w+\)/)
    expect(kontext.block).toMatch(/Betalvillkor: 45 dagar \(owner_set\)/)
    expect(kontext.block).toMatch(/Marginalmål: 25% \(\w+\)/)
    expect(kontext.kallor.some((k) => k.typ === 'foretagsmodell')).toBe(true)
  })

  test('betalvillkor med systemets hardcoded default (30 dagar, ej satt av ägaren) visas INTE — ett generiskt systemdefault är inte "vad Handymate vet"', async () => {
    const supabase = fakeKundkontextSupabase({
      business_config: {
        data: {
          revenue_target_annual_sek: null,
          margin_target_percent: null,
          margin_target_set_at: null,
          pricing_settings: {},
          branch: null,
          secondary_branches: [],
          knowledge_base: {},
          default_payment_days: 30,
        },
        error: null,
      },
    })
    const kontext = await hamtaKundkontext(supabase, { businessId: 'biz_utan_config', agentId: 'matte' })
    expect(kontext.block).not.toContain('Betalvillkor')
    expect(kontext.block).toBe('')
  })

  test('kundfakta renderas under "Om <namn>:" med källa kundfakta', async () => {
    const supabase = fakeKundkontextSupabase({
      customer: { data: { name: 'Anna Andersson', phone_number: '0701234567' }, error: null },
      customer_fact: {
        data: [
          { id: 'cfact_1', content: 'Vill ha ekparkett', fact_type: 'preference', created_at: '2026-08-01T00:00:00Z' },
        ],
        error: null,
      },
    })
    const kontext = await hamtaKundkontext(supabase, { businessId: 'biz_a', customerId: 'cust_1', agentId: 'matte' })
    expect(kontext.block).toContain('Om Anna Andersson:')
    expect(kontext.block).toContain('Vill ha ekparkett')
    expect(kontext.kallor.some((k) => k.typ === 'kundfakta' && k.id === 'cfact_1')).toBe(true)
  })

  test('kanalrader (samtal) formateras via formateraKontextrad och räknas som källor', async () => {
    const supabase = fakeKundkontextSupabase({
      customer: { data: { name: 'Anna Andersson', phone_number: '0701234567' }, error: null },
      call_recording: {
        data: [
          { recording_id: 'rec_1', transcript_summary: 'Pratade om badrumsrenovering', created_at: '2026-08-01T10:00:00Z' },
        ],
        error: null,
      },
    })
    const kontext = await hamtaKundkontext(supabase, { businessId: 'biz_a', customerId: 'cust_1', agentId: 'matte' })
    expect(kontext.block).toContain('2026-08-01 · Samtal: Pratade om badrumsrenovering')
    expect(kontext.kallor.some((k) => k.typ === 'samtal' && k.id === 'rec_1')).toBe(true)
  })
})

test.describe('hamtaKundkontext — tak på längd', () => {
  test('blocket överskrider ALDRIG MAX_BLOCK_LENGTH, oavsett hur mycket fixturdata som ges', async () => {
    const langtFaktum = (i: number) => 'x'.repeat(400) + `_fakta_${i}`
    const supabase = fakeKundkontextSupabase({
      customer: { data: { name: 'Storkund AB', phone_number: '0701234567' }, error: null },
      customer_fact: {
        data: Array.from({ length: 8 }, (_, i) => ({
          id: `cfact_${i}`,
          content: langtFaktum(i),
          fact_type: 'preference',
          created_at: `2026-08-0${(i % 9) + 1}T00:00:00Z`,
        })),
        error: null,
      },
      call_recording: {
        data: Array.from({ length: 3 }, (_, i) => ({
          recording_id: `rec_${i}`,
          transcript_summary: 'y'.repeat(400),
          created_at: '2026-08-01T00:00:00Z',
        })),
        error: null,
      },
      sms_conversation: {
        data: Array.from({ length: 3 }, (_, i) => ({ id: `sms_${i}`, role: 'user', content: 'z'.repeat(400), created_at: '2026-08-01T00:00:00Z' })),
        error: null,
      },
    })
    const kontext = await hamtaKundkontext(supabase, { businessId: 'biz_stor', customerId: 'cust_stor', agentId: 'matte' })
    expect(kontext.block.length).toBeLessThanOrEqual(MAX_BLOCK_LENGTH)
  })
})

// ─────────────────────────────────────────────────────────────────
// Del 3 — läs-API:et inkopplat (ersätter, inte lägger ovanpå)
// ─────────────────────────────────────────────────────────────────

test.describe('del 3 — matte/chat och agent/trigger använder hamtaKundkontext, inte längre buildMemoryPrompt', () => {
  for (const fil of [CHAT_ROUTE, TRIGGER_ROUTE]) {
    test(`${fil}: hamtaKundkontext( finns, buildMemoryPrompt( finns INTE längre`, () => {
      const s = read(fil)
      expect(s).toContain('hamtaKundkontext(')
      expect(s).not.toContain('buildMemoryPrompt(')
    })
  }

  test('matte/chat skickar det verifierade sidkontext-customerId:t (inte ett rått klientfält)', () => {
    const s = read(CHAT_ROUTE)
    const i = s.indexOf('await hamtaKundkontext(supabase, {')
    expect(i, 'hamtaKundkontext-anropet hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 250)
    expect(gren).toContain('customerId,')
    expect(gren).not.toContain('rawCustomerId')
    expect(gren).not.toContain('context?.customerId')
  })

  test('agent/trigger skickar customerIdFromTrigger och fragaFromTrigger (text/message/transcript)', () => {
    const s = read(TRIGGER_ROUTE)
    expect(s).toContain('customerId: customerIdFromTrigger')
    const i = s.indexOf('const fragaFromTrigger')
    expect(i, 'fragaFromTrigger hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 250)
    expect(gren).toContain('trigger_data as any')
    expect(gren).toContain('.text')
    expect(gren).toContain('.message')
    expect(gren).toContain('.transcript')
  })
})

test.describe('del 3 — voice/analyze injicerar kundkontext efter branschblocket', () => {
  test('hamtaKundkontext( anropas bara med känd customer_id', () => {
    const s = read(VOICE_ANALYZE)
    expect(s).toContain('hamtaKundkontext(')
    const i = s.indexOf('if (recording.customer_id) {')
    expect(i, 'customer_id-vakten hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 400)
    expect(gren).toContain('hamtaKundkontext(')
  })

  test('kundkontextBlock injiceras direkt efter branschblocket i prompten', () => {
    const s = read(VOICE_ANALYZE)
    expect(s).toContain('${branschBlock}${kundkontextBlock}')
  })
})

test.describe('del 3 — tool-router get_customer bär kontext-fältet', () => {
  test('getCustomer anropar hamtaKundkontext och lägger till fältet "kontext" utan att röra övriga fält', () => {
    const s = read(TOOL_ROUTER)
    const i = s.indexOf('async function getCustomer(')
    expect(i, 'getCustomer hittades inte').toBeGreaterThan(-1)
    const naestaFunktion = s.indexOf('\nasync function ', i + 10)
    const fn = s.slice(i, naestaFunktion > -1 ? naestaFunktion : i + 2000)
    expect(fn).toContain('hamtaKundkontext(')
    expect(fn).toContain('recent_calls: recentCalls, kontext')
  })

  test('get_customer-caset skickar med context så getCustomer kan läsa context.agentId', () => {
    const s = read(TOOL_ROUTER)
    expect(s).toContain("case 'get_customer':\n        return await getCustomer(supabase, businessId, input, context)")
  })
})
