/**
 * Facit för kundminnet, pass 2 (2026-09-02, tasks/plan-kundminne-pass2.md).
 *
 * Bakgrund: docs/audits/KUNDMINNE_REVISION_2026-09-02.md gap 6 + 7.
 * Migrationen sql/v200_agent_memories_customer_id.sql är KÖRD — koden är
 * ändå fail-soft (samma isMissingColumnError-idiom som resten av
 * lib/agents/memory.ts, se tests/agent-memory.spec.ts).
 *
 * Låser:
 *   - gap 6: agent_memories.customer_id skrivs (med fail-soft-fallback),
 *     läses scopat (företagsnivå + kundens egna, aldrig andra kunders),
 *     rangordningen boostar kundens egna, buildMemoryPrompt märker dem.
 *   - trigger-route + matte/chat skickar customerId in i minnesvägarna,
 *     chat-routen bara det server-verifierade id:t.
 *   - gap 7: Hanna läser customer_fact innan hon föreslår kontakt, visar
 *     dem ärligt på kortet, och spärrar SMS vid "inte sms"/"ej sms"/"ring".
 *   - sql/v200 finns, schema-audit har posten.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/kundminne-pass2.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { rankByEffectiveScoreWithCustomerBoost, buildMemoryPrompt } from '../lib/agents/memory'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n')

const MEMORY = 'lib/agents/memory.ts'
const TRIGGER_ROUTE = 'app/api/agent/trigger/route.ts'
const CHAT_ROUTE = 'app/api/matte/chat/route.ts'
const HANNA = 'lib/agents/hanna-outbound.ts'
const SCHEMA_AUDIT = 'app/api/debug/schema-audit/route.ts'

// ─────────────────────────────────────────────────────────────────
// gap 6 — lib/agents/memory.ts
// ─────────────────────────────────────────────────────────────────

test.describe('gap 6 — agent_memories.customer_id skrivs, fail-soft', () => {
  test('huvudinserten (insertAgentMemoryRow) lägger med customer_id, med 42703-fallback utan fältet', () => {
    const s = read(MEMORY)
    const i = s.indexOf('async function insertAgentMemoryRow(')
    expect(i, 'insertAgentMemoryRow hittades inte').toBeGreaterThan(-1)
    const fn = s.slice(i, s.indexOf('\n}\n', i))
    expect(fn).toContain('customer_id: customerId')
    expect(fn).toContain('isMissingColumnError(attempt.error)')
    // Fallback-insert utan customer_id — samma `row`-objekt som skickades in.
    expect(fn).toMatch(/insert\(row\)/)
  })

  test('både huvud- och legacy-inserten går via insertAgentMemoryRow', () => {
    const s = read(MEMORY)
    const hits = s.match(/await insertAgentMemoryRow\(/g) || []
    expect(hits.length).toBe(2)
  })

  test('dedupe-jämförelsen scopar mot samma kund ELLER företagsnivå när customerId finns', () => {
    const s = read(MEMORY)
    const i = s.indexOf('const candidatesQuery = customerId')
    expect(i, 'candidatesQuery-grenen hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 200)
    expect(gren).toContain('customer_id.is.null,customer_id.eq.')
  })
})

test.describe('gap 6 — fetchRelevantMemories läser kundscopat', () => {
  test('med customerId: .or med customer_id.is.null OCH customer_id.eq.<id>', () => {
    const s = read(MEMORY)
    const i = s.indexOf('const scopedQuery = customerId')
    expect(i, 'scopedQuery-grenen hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 250)
    expect(gren).toContain('customer_id.is.null,customer_id.eq.')
    expect(gren).toContain(".is('customer_id', null)")
  })

  test('rangordningen (kund först) använder rankByEffectiveScoreWithCustomerBoost, inte längre bara rankByEffectiveScore', () => {
    const s = read(MEMORY)
    expect(s).toContain('rankByEffectiveScoreWithCustomerBoost(rows, customerId, now)')
  })
})

test.describe('gap 6 — rankByEffectiveScoreWithCustomerBoost (ren funktion, två fixturer)', () => {
  const NU = new Date('2026-09-02T12:00:00.000Z')

  test('kundens eget minne rankas FÖRE ett lika färskt/viktigt företagsminne', () => {
    const kundminne = { id: 'kund', importance_score: 0.5, created_at: NU.toISOString(), customer_id: 'kund_1' }
    const foretagsminne = { id: 'foretag', importance_score: 0.5, created_at: NU.toISOString(), customer_id: null }
    const ranked = rankByEffectiveScoreWithCustomerBoost([foretagsminne, kundminne], 'kund_1', NU)
    expect(ranked.map((m) => m.id)).toEqual(['kund', 'foretag'])
  })

  test('utan customerId (företagsnivå-frågan) är boosten alltid 0 — identisk ordning som utan boost', () => {
    const a = { id: 'a', importance_score: 0.9, created_at: NU.toISOString(), customer_id: null }
    const b = { id: 'b', importance_score: 0.3, created_at: NU.toISOString(), customer_id: 'kund_1' }
    const ranked = rankByEffectiveScoreWithCustomerBoost([b, a], null, NU)
    expect(ranked.map((m) => m.id)).toEqual(['a', 'b'])
  })

  test('en ANNAN kunds minne får ingen boost', () => {
    const minAv = { id: 'min', importance_score: 0.5, created_at: NU.toISOString(), customer_id: 'kund_1' }
    const annanKund = { id: 'annan', importance_score: 0.55, created_at: NU.toISOString(), customer_id: 'kund_2' }
    const ranked = rankByEffectiveScoreWithCustomerBoost([annanKund, minAv], 'kund_1', NU)
    // Boosten (0.2) på "min" (0.5+0.2=0.7) slår "annan"s råa 0.55 trots
    // annanKunds högre rå importance — men "annan" ska INTE själv boostas.
    expect(ranked.map((m) => m.id)).toEqual(['min', 'annan'])
  })
})

test.describe('gap 6 — buildMemoryPrompt märker kundminnen', () => {
  test('ett RelevantMemoryText med isCustomer=true får prefixet "Om kunden: "', () => {
    const s = buildMemoryPrompt([{ content: 'Vill ha ekparkett', isCustomer: true }])
    expect(s).toContain('Om kunden: Vill ha ekparkett')
  })

  test('isCustomer=false (företagsnivå) får INGET kundprefix', () => {
    const s = buildMemoryPrompt([{ content: 'Fakturerar i slutet av månaden', isCustomer: false }])
    expect(s).not.toContain('Om kunden:')
    expect(s).toContain('Fakturerar i slutet av månaden')
  })

  test('gamla rena strängar (företagsnivå, oförändrat kontrakt) märks aldrig', () => {
    const s = buildMemoryPrompt(['A', 'B'])
    expect(s).toContain('1. A')
    expect(s).toContain('2. B')
    expect(s).not.toContain('Om kunden:')
  })
})

// ─────────────────────────────────────────────────────────────────
// gap 6 — anroparna
// ─────────────────────────────────────────────────────────────────

test.describe('gap 6 — trigger-routen läser customerId från trigger_data, ovaliderat aldrig vidare', () => {
  test('customerId härleds från trigger_data.customer_id/customerId, bara om sträng', () => {
    const s = read(TRIGGER_ROUTE)
    const i = s.indexOf('const customerIdFromTrigger')
    expect(i, 'customerIdFromTrigger hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 350)
    expect(gren).toContain('trigger_data as any')
    expect(gren).toContain('customer_id')
    expect(gren).toContain('customerId')
    expect(gren).toContain("typeof raw === 'string'")
  })

  // Pass 3 (tasks/plan-kundminne-pass3.md, del 3): läsvägen
  // getRelevantMemories(...)+buildMemoryPrompt(...) i trigger-routen är
  // ERSATT av hamtaKundkontext(...) (lib/context/kundkontext.ts), som
  // skickar customerIdFromTrigger vidare — se tests/kundminne-pass3.spec.ts.
  // extractAndSaveMemory (SKRIVvägen) är oförändrad av pass 3.
  test('hamtaKundkontext (pass 3) och extractAndSaveMemory får customerIdFromTrigger', () => {
    const s = read(TRIGGER_ROUTE)
    expect(s).toContain('customerId: customerIdFromTrigger')
    expect(s).toContain('customerIdFromTrigger).catch((err) =>')
  })
})

test.describe('gap 6 — matte/chat skickar bara det server-verifierade sidkontext-id:t', () => {
  // Pass 3: läsvägen är ERSATT av hamtaKundkontext(supabase, { ...,
  // customerId, ... }) — se tests/kundminne-pass3.spec.ts.
  test('hamtaKundkontext (pass 3) får customerId (den verifierade variabeln), inte ett rått klient-fält', () => {
    const s = read(CHAT_ROUTE)
    expect(s).toContain('customerId,')
    expect(s).toContain('hamtaKundkontext(')
  })

  test('customerId kommer från verifyPageContextOwnership, inte direkt från body/context', () => {
    const s = read(CHAT_ROUTE)
    expect(s).toContain('const customerId = sidkontext.customerId')
    expect(s).not.toContain('getRelevantMemories(businessId, currentAgent, context?.customerId)')
    expect(s).not.toContain('getRelevantMemories(businessId, currentAgent, body.customerId)')
    expect(s).not.toContain('getRelevantMemories(businessId, currentAgent, rawCustomerId)')
  })

  test('extractAndSaveMemory-anropet får customerId sist, samma verifierade variabel', () => {
    const s = read(CHAT_ROUTE)
    const i = s.indexOf("extractAndSaveMemory(businessId, currentAgent, cleanReply, 'chat'")
    expect(i, 'anropet hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 800)
    expect(gren).toContain('}, customerId).catch(')
  })
})

// ─────────────────────────────────────────────────────────────────
// gap 7 — lib/agents/hanna-outbound.ts
// ─────────────────────────────────────────────────────────────────

test.describe('gap 7 — Hanna läser customer_fact innan förslag', () => {
  test('fetchCareCustomerFacts frågar customer_fact scopat på business/kund, superseded_by null, rätt fact_type-lista', () => {
    const s = read(HANNA)
    const i = s.indexOf("from('customer_fact')")
    expect(i, 'customer_fact-frågan saknas').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 400)
    expect(gren).toContain("eq('business_id', businessId)")
    expect(gren).toContain("eq('customer_id', customerId)")
    expect(gren).toContain(".is('superseded_by', null)")
    expect(gren).toContain("in('fact_type', ['preference', 'constraint', 'contact'])")
    expect(gren).toContain(".order('created_at', { ascending: false })")
    expect(gren).toContain('.limit(5)')
  })

  test('fail-soft: läsningen är omsluten av try/catch och returnerar tom lista, kraschar aldrig', () => {
    const s = read(HANNA)
    const i = s.indexOf('async function fetchCareCustomerFacts(')
    const fn = s.slice(i, s.indexOf('\n}\n', i))
    expect(fn).toContain('try {')
    expect(fn).toContain('catch (err: unknown)')
    expect((fn.match(/return \[\]/g) || []).length).toBeGreaterThanOrEqual(2)
    expect(fn).toContain('arSchemaSaknas(')
  })

  test('kundfakta läses EFTER frekvenstaket, inte före', () => {
    const s = read(HANNA)
    const freqIdx = s.indexOf('if (!freq.allowed) return')
    const kundfaktaIdx = s.indexOf('const kundfakta = await fetchCareCustomerFacts(')
    expect(freqIdx).toBeGreaterThan(-1)
    expect(kundfaktaIdx).toBeGreaterThan(-1)
    expect(freqIdx).toBeLessThan(kundfaktaIdx)
  })
})

test.describe('gap 7 — kundfakta visas ärligt på kortet, aldrig i SMS-texten', () => {
  test('payload.kundfakta finns med fact_type + content', () => {
    const s = read(HANNA)
    expect(s).toContain('kundfakta: kundfakta.map((f) => ({ fact_type: f.fact_type, content: f.content }))')
  })

  test('SMS-mallen (const sms = ...) refererar inte till kundfakta', () => {
    const s = read(HANNA)
    const i = s.indexOf('const sms = `Hej')
    expect(i, 'SMS-mallen hittades inte').toBeGreaterThan(-1)
    const rad = s.slice(i, s.indexOf('\n', i))
    expect(rad).not.toContain('kundfakta')
  })

  test('description får max två "Att tänka på: …"-rader, constraint prioriterat först', () => {
    const s = read(HANNA)
    const i = s.indexOf('const attTankaPa = kundfakta')
    expect(i, 'attTankaPa hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 300)
    expect(gren).toContain("filter((f) => f.fact_type === 'constraint')")
    expect(gren).toContain('.slice(0, 2)')
    expect(gren).toContain('Att tänka på: ')
  })
})

test.describe('gap 7 — SMS-spärren vid "inte sms"/"ej sms"/"ring"', () => {
  test('isSmsBlockingFact matchar exakt de tre fraserna, case-insensitive via toLowerCase', () => {
    const s = read(HANNA)
    const i = s.indexOf('function isSmsBlockingFact(')
    expect(i, 'isSmsBlockingFact hittades inte').toBeGreaterThan(-1)
    const fn = s.slice(i, s.indexOf('\n}\n', i))
    expect(fn).toContain('toLowerCase()')
    expect(fn).toContain("includes('inte sms')")
    expect(fn).toContain("includes('ej sms')")
    expect(fn).toContain("includes('ring')")
    // Bara contact/constraint kan spärra — en preference (t.ex. golvtyp) ska inte.
    expect(fn).toContain("fact.fact_type !== 'contact' && fact.fact_type !== 'constraint'")
  })

  test('en spärrad kund får INGET kort — factBlocked:true, inserted:false, ingen pending_approvals-insert i den grenen', () => {
    const s = read(HANNA)
    const i = s.indexOf('if (kundfakta.some(isSmsBlockingFact))')
    expect(i, 'spärr-grenen hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 300)
    expect(gren).toContain('return { inserted: false, freqBlocked: false, factBlocked: true }')
  })

  test('ProposeCareCardResult har fältet factBlocked', () => {
    const s = read(HANNA)
    const i = s.indexOf('interface ProposeCareCardResult')
    const gren = s.slice(i, i + 300)
    expect(gren).toContain('factBlocked: boolean')
  })

  test('factBlocked räknas mot skipped_recent i BÅDA batch-looparna (mission + vanlig)', () => {
    const s = read(HANNA)
    const hits = s.match(/if \(result\.freqBlocked \|\| result\.factBlocked\) \{\s*\n\s*skipped_recent\+\+/g) || []
    expect(hits.length).toBe(2)
  })
})

// ─────────────────────────────────────────────────────────────────
// sql/v200 + schema-audit
// ─────────────────────────────────────────────────────────────────

test.describe('sql/v200 + schema-audit', () => {
  test('migrationsfilen finns och lägger till en nullbar customer_id-kolumn', () => {
    const s = read('sql/v200_agent_memories_customer_id.sql')
    expect(s).toContain('ADD COLUMN IF NOT EXISTS customer_id TEXT')
  })

  test('schema-audit har en post för agent_memories.customer_id', () => {
    const s = read(SCHEMA_AUDIT)
    expect(s).toContain(
      "{ table: 'agent_memories', column: 'customer_id', migration: 'v200_agent_memories_customer_id', critical: false }",
    )
  })
})

test('v200: kund-id:t som interpoleras i .or-filtret släpps bara igenom med säkra tecken', async () => {
  const { safeMemoryCustomerId } = await import('../lib/agents/memory')
  expect(safeMemoryCustomerId('cust_abc-123')).toBe('cust_abc-123')
  expect(safeMemoryCustomerId('x,business_id.eq.annan')).toBeNull()
  expect(safeMemoryCustomerId('')).toBeNull()
  expect(safeMemoryCustomerId(undefined)).toBeNull()
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/agents/memory.ts'), 'utf8').replace(/\r\n/g, '\n')
  expect(src).toContain('const customerId = safeMemoryCustomerId(input.customerId)')
  expect(src).toContain('const customerId = safeMemoryCustomerId(opts.customerId)')
})
