/**
 * Facit för Agentminnets härdning (Etapp U, 2026-08-18,
 * sql/v149_agent_memory_hardening.sql).
 *
 * Dom: agent_memories var append-only rå modelloutput — ingen bekräftelse,
 * ingen ersättningskedja, ingen färskhet, inget källspår, ingen PII-städ.
 * Det customer_fact (v122) redan gör rätt görs nu här. Filen är fail-soft
 * genomgående: körs v149 inte än faller varje skriv-/läsväg tillbaka till
 * gårdagens exakta form (byte-identiskt beteende) tills Andreas kör
 * migrationen.
 *
 * Låst här:
 *   a) classifyMemoryType/calculateImportance/bumpedImportance —
 *      characterization (LÅSER befintligt beteende, ändrar det inte).
 *   b) decayFactor/effectiveImportance/rankByEffectiveScore — färskhet.
 *   c) normalizeForOverlap/jaccardOverlap/decideDedupeAction — dedupe/
 *      supersede-reglerna, deterministiska, aldrig LLM-dömda.
 *   d) saveExtractedMemory — full skrivväg (v149 + 42703-fallback), PII-
 *      scrub, bekräftelsegrind, källspår.
 *   e) fetchRelevantMemories — läsväg, confirmed/superseded-filter (v149 +
 *      42703-fallback), färskhetsrankning.
 *   f) action-contract-registreringen + approvals-caset.
 *   g) död kod verkligen borta (generateEmbedding, embedding-skrivning,
 *      context-argumentet).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/agent-memory.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  classifyMemoryType,
  calculateImportance,
  bumpedImportance,
  requiresConfirmation,
  MEMORY_HALF_LIFE_DAYS,
  decayFactor,
  effectiveImportance,
  rankByEffectiveScore,
  normalizeForOverlap,
  normalizedText,
  jaccardOverlap,
  SUPERSEDE_OVERLAP_THRESHOLD,
  decideDedupeAction,
  isMissingColumnError,
  saveExtractedMemory,
  fetchRelevantMemories,
  buildMemoryPrompt,
  AGENT_MEMORY_CONFIRMATION_TYPE,
  type DedupeCandidate,
} from '../lib/agents/memory'
import { classify, mayExecute, ACTION_CONTRACT } from '../lib/approvals/action-contract'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// ─────────────────────────────────────────────────────────────────
// Fake Supabase — kösvarssekvens per .from()-anrop (samma thenable-
// builder-idiom som tests/promise-deadlines.spec.ts, generaliserad till
// flera sekventiella anrop eftersom saveExtractedMemory/fetchRelevant-
// Memories gör flera .from()-anrop i tur och ordning).
// ─────────────────────────────────────────────────────────────────

interface QueuedResponse {
  data: any
  error: { message: string; code?: string } | null
}

interface FromCall {
  table: string
  ops: { method: string; args: any[] }[]
}

function fakeSupabaseSeq(responses: QueuedResponse[]) {
  const calls: FromCall[] = []
  let i = 0
  const client: any = {
    from(table: string) {
      const record: FromCall = { table, ops: [] }
      calls.push(record)
      const resp = responses[Math.min(i, responses.length - 1)] || { data: null, error: null }
      i++
      const builder: any = {}
      const methods = ['select', 'eq', 'is', 'not', 'or', 'order', 'limit', 'update', 'insert', 'neq', 'contains', 'gte', 'ilike', 'in']
      for (const m of methods) {
        builder[m] = (...args: any[]) => {
          record.ops.push({ method: m, args })
          return builder
        }
      }
      builder.single = () => {
        record.ops.push({ method: 'single', args: [] })
        return builder
      }
      builder.then = (resolve: any) => resolve(resp)
      return builder
    },
  }
  return { client, calls }
}

// ─────────────────────────────────────────────────────────────────
// a) classifyMemoryType / calculateImportance / bumpedImportance —
//    characterization: LÅSER befintligt beteende.
// ─────────────────────────────────────────────────────────────────

test.describe('classifyMemoryType — LÅST beteende', () => {
  test('"föredrar"/"vill ha"/"gillar" → preference', () => {
    expect(classifyMemoryType('Kunden föredrar SMS framför mejl.', 'manual')).toBe('preference')
    expect(classifyMemoryType('Ägaren vill ha alla fakturor i PDF.', 'manual')).toBe('preference')
    expect(classifyMemoryType('Kunden gillar tidiga morgonbesök.', 'manual')).toBe('preference')
  })

  test('"brukar"/"tenderar"/"mönster" → pattern', () => {
    expect(classifyMemoryType('Företaget brukar fakturera i slutet av månaden.', 'manual')).toBe('pattern')
    expect(classifyMemoryType('Kunden tenderar att betala sent.', 'manual')).toBe('pattern')
    expect(classifyMemoryType('Ett återkommande mönster i offerterna.', 'manual')).toBe('pattern')
  })

  test('"har "/"är "/"finns" → fact', () => {
    expect(classifyMemoryType('Kunden har en hund i trädgården.', 'manual')).toBe('fact')
    expect(classifyMemoryType('Adressen är svårparkerad.', 'manual')).toBe('fact')
    expect(classifyMemoryType('Det finns en nyckel hos grannen.', 'manual')).toBe('fact')
  })

  test('inget nyckelord → observation (default)', () => {
    expect(classifyMemoryType('Offerten skickades igår.', 'manual')).toBe('observation')
  })
})

test.describe('calculateImportance — LÅST beteende', () => {
  test('bas 0.5, phone_call +0.2, manual +0.1', () => {
    expect(calculateImportance('other', 'kort text')).toBeCloseTo(0.5, 5)
    expect(calculateImportance('phone_call', 'kort text')).toBeCloseTo(0.7, 5)
    expect(calculateImportance('manual', 'kort text')).toBeCloseTo(0.6, 5)
  })

  test('"viktigt"/"kritisk" +0.15, längd >100 tecken +0.05', () => {
    expect(calculateImportance('other', 'Detta är viktigt.')).toBeCloseTo(0.65, 5)
    expect(calculateImportance('other', 'En kritisk detalj.')).toBeCloseTo(0.65, 5)
    const langText = 'x'.repeat(101)
    expect(calculateImportance('other', langText)).toBeCloseTo(0.55, 5)
  })

  test('bonusarna staplas additivt (formeln har ett Math.min(1.0,…)-tak, om än inte nåbart via dessa fyra villkor)', () => {
    // viktigt/kritisk är EN gemensam +0.15-gren (||, inte två separata) —
    // maximalt observerbart är 0.5 + 0.2 (phone_call) + 0.15 + 0.05 = 0.9.
    const langOchViktig = 'Detta är MYCKET viktigt och kritiskt. ' + 'x'.repeat(101)
    expect(calculateImportance('phone_call', langOchViktig)).toBeCloseTo(0.9, 5)
    const s = read('lib/agents/memory.ts')
    expect(s).toContain('Math.min(1.0, score)')
  })
})

test.describe('bumpedImportance — LÅST formel (0.5 + access_count*0.1, tak 1.0)', () => {
  test('0 tidigare åtkomster → 0.5', () => {
    expect(bumpedImportance(0)).toBeCloseTo(0.5, 5)
  })
  test('3 tidigare åtkomster → 0.8', () => {
    expect(bumpedImportance(3)).toBeCloseTo(0.8, 5)
  })
  test('taket är 1.0', () => {
    expect(bumpedImportance(20)).toBe(1.0)
  })
})

test.describe('requiresConfirmation — bekräftelsegrinden', () => {
  test('pattern och preference kräver bekräftelse', () => {
    expect(requiresConfirmation('pattern')).toBe(true)
    expect(requiresConfirmation('preference')).toBe(true)
  })
  test('observation och fact auto-bekräftas (körningsobservationer)', () => {
    expect(requiresConfirmation('observation')).toBe(false)
    expect(requiresConfirmation('fact')).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// b) Färskhet — decayFactor/effectiveImportance/rankByEffectiveScore
// ─────────────────────────────────────────────────────────────────

test.describe('decayFactor — recency-decay, halveringstid 90 dagar', () => {
  test('halveringstiden är dokumenterad som 90 dagar', () => {
    expect(MEMORY_HALF_LIFE_DAYS).toBe(90)
  })

  test('ålder 0 → decay 1.0 (ingen förfalskning av ett nyss skapat minne)', () => {
    expect(decayFactor(0)).toBeCloseTo(1.0, 5)
  })

  test('ålder exakt en halveringstid → decay 0.5', () => {
    const enHalveringstidMs = MEMORY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000
    expect(decayFactor(enHalveringstidMs)).toBeCloseTo(0.5, 5)
  })

  test('ålder två halveringstider → decay 0.25', () => {
    const tvaHalveringstiderMs = 2 * MEMORY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000
    expect(decayFactor(tvaHalveringstiderMs)).toBeCloseTo(0.25, 5)
  })

  test('negativ ålder klampas till 0 (kastar aldrig, förfalskar aldrig uppåt)', () => {
    expect(decayFactor(-1000)).toBeCloseTo(1.0, 5)
  })
})

test.describe('effectiveImportance — importance * decay(age)', () => {
  const NU = new Date('2026-08-18T12:00:00.000Z')

  test('ett nyss skapat minne behåller full importance', () => {
    expect(effectiveImportance(0.8, NU.toISOString(), NU)).toBeCloseTo(0.8, 5)
  })

  test('ett minne en halveringstid gammalt väger hälften', () => {
    const skapad = new Date(NU.getTime() - MEMORY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000)
    expect(effectiveImportance(0.8, skapad.toISOString(), NU)).toBeCloseTo(0.4, 5)
  })

  test('ogiltigt datum kraschar aldrig — faller tillbaka till rå importance', () => {
    expect(effectiveImportance(0.7, 'inte-ett-datum', NU)).toBe(0.7)
  })
})

test.describe('rankByEffectiveScore — ett färskt lågviktigt minne kan gå om ett gammalt högviktigt', () => {
  const NU = new Date('2026-08-18T12:00:00.000Z')

  test('ett minne från i höstas (låg decay) rankas under ett färskt, trots lägre rå importance', () => {
    const gammalt = { id: 'old', importance_score: 0.9, created_at: '2025-11-01T00:00:00.000Z' }
    const farskt = { id: 'new', importance_score: 0.55, created_at: '2026-08-17T12:00:00.000Z' }
    const ranked = rankByEffectiveScore([gammalt, farskt], NU)
    expect(ranked.map((m) => m.id)).toEqual(['new', 'old'])
  })

  test('två minnen med samma ålder rankas på rå importance', () => {
    const a = { id: 'a', importance_score: 0.9, created_at: NU.toISOString() }
    const b = { id: 'b', importance_score: 0.3, created_at: NU.toISOString() }
    const ranked = rankByEffectiveScore([b, a], NU)
    expect(ranked.map((m) => m.id)).toEqual(['a', 'b'])
  })
})

// ─────────────────────────────────────────────────────────────────
// c) Dedupe/supersede — deterministiska, ALDRIG LLM-dömda
// ─────────────────────────────────────────────────────────────────

test.describe('normalizeForOverlap / jaccardOverlap', () => {
  test('gemener + skiljetecken bortstädat, samma tokens oavsett formattering', () => {
    expect(normalizeForOverlap('Kunden, vill HA ek-parkett!')).toEqual(['kunden', 'vill', 'ha', 'ek', 'parkett'])
  })

  test('jaccardOverlap 1.0 för identiska tokenmängder', () => {
    const a = normalizeForOverlap('kunden vill ha ekparkett')
    expect(jaccardOverlap(a, a)).toBe(1)
  })

  test('jaccardOverlap 0 för helt disjunkta mängder', () => {
    expect(jaccardOverlap(['a', 'b'], ['c', 'd'])).toBe(0)
  })

  test('tröskeln är 0.6', () => {
    expect(SUPERSEDE_OVERLAP_THRESHOLD).toBe(0.6)
  })
})

test.describe('decideDedupeAction', () => {
  test('exakt normaliserad matchning (olika skiljetecken/versaler) → skip', () => {
    const candidates: DedupeCandidate[] = [{ id: 'm1', content: 'kunden vill ha ekparkett', memory_type: 'preference' }]
    const decision = decideDedupeAction('Kunden vill ha EKPARKETT!', 'preference', candidates)
    expect(decision).toEqual({ action: 'skip', matchId: 'm1' })
  })

  test('samma memory_type + hög överlapp (≥0.6) → supersede', () => {
    const candidates: DedupeCandidate[] = [
      { id: 'm1', content: 'kunden föredrar att bli kontaktad på förmiddagen via sms', memory_type: 'preference' },
    ]
    const decision = decideDedupeAction(
      'kunden föredrar att bli kontaktad på förmiddagen via telefon',
      'preference',
      candidates,
    )
    expect(decision.action).toBe('supersede')
    expect((decision as any).matchId).toBe('m1')
  })

  test('låg överlapp → ny rad (insert), känd V2-begränsning: sant motsägande innehåll med lite gemensamt vokabulär coexisterar', () => {
    const candidates: DedupeCandidate[] = [
      { id: 'm1', content: 'kunden vill ha ekparkett i vardagsrummet', memory_type: 'preference' },
    ]
    const decision = decideDedupeAction('kunden ändrade sig, vill nu ha halkfritt klinkergolv i badrummet', 'preference', candidates)
    expect(decision).toEqual({ action: 'insert' })
  })

  test('hög överlapp men ANNAN memory_type → ny rad, superseder inte tvärs typer', () => {
    // Nära nog identiskt (7/8 gemensamma tokens, overlap 0.75 ≥ tröskeln)
    // men INTE exakt normaliserad matchning (regel 1 gäller typ-oberoende,
    // regel 2 — overlap-supersede — kräver uttryckligen samma memory_type).
    const candidates: DedupeCandidate[] = [
      { id: 'm1', content: 'kunden brukar betala fakturor sent varje månad', memory_type: 'pattern' },
    ]
    const decision = decideDedupeAction('kunden brukar betala fakturor sent varje kvartal', 'fact', candidates)
    expect(decision).toEqual({ action: 'insert' })
  })

  test('exakt normaliserad matchning slår igenom OAVSETT memory_type (regel 1 är typ-oberoende, precis som substring-hacket den ersätter)', () => {
    const candidates: DedupeCandidate[] = [
      { id: 'm1', content: 'kunden brukar betala fakturor sent varje månad', memory_type: 'pattern' },
    ]
    const decision = decideDedupeAction('Kunden brukar betala fakturor sent varje månad.', 'fact', candidates)
    expect(decision).toEqual({ action: 'skip', matchId: 'm1' })
  })

  test('tomma kandidater → alltid insert', () => {
    expect(decideDedupeAction('vad som helst', 'fact', [])).toEqual({ action: 'insert' })
  })

  test('flera kandidater över tröskeln → väljer den med HÖGST överlapp', () => {
    const candidates: DedupeCandidate[] = [
      { id: 'low', content: 'kunden brukar betala sent ibland', memory_type: 'pattern' },
      { id: 'high', content: 'kunden brukar betala fakturor sent varje månad utan påminnelse', memory_type: 'pattern' },
    ]
    const decision = decideDedupeAction('kunden brukar betala fakturor sent varje månad utan påminnelse alls', 'pattern', candidates)
    expect(decision.action).toBe('supersede')
    expect((decision as any).matchId).toBe('high')
  })
})

// ─────────────────────────────────────────────────────────────────
// d) isMissingColumnError
// ─────────────────────────────────────────────────────────────────

test.describe('isMissingColumnError', () => {
  test('42703-koden känns igen', () => {
    expect(isMissingColumnError({ code: '42703', message: 'x' })).toBe(true)
  })
  test('"does not exist"-meddelandet känns igen utan kod', () => {
    expect(isMissingColumnError({ message: 'column agent_memories.confirmed_at does not exist' })).toBe(true)
  })
  test('"schema cache"-meddelandet känns igen', () => {
    expect(isMissingColumnError({ message: 'Could not find the column in the schema cache' })).toBe(true)
  })
  test('null/annat fel → false', () => {
    expect(isMissingColumnError(null)).toBe(false)
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key' })).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────
// e) saveExtractedMemory — full skrivväg
// ─────────────────────────────────────────────────────────────────

test.describe('saveExtractedMemory — grundvalidering', () => {
  test('tomt/kort/"INGEN" innehåll kastas tyst, ingen DB-träff', async () => {
    const { client, calls } = fakeSupabaseSeq([])
    const r1 = await saveExtractedMemory(client, { businessId: 'biz_1', agentId: 'matte', rawContent: '', triggerType: 'manual' })
    const r2 = await saveExtractedMemory(client, { businessId: 'biz_1', agentId: 'matte', rawContent: 'INGEN', triggerType: 'manual' })
    const r3 = await saveExtractedMemory(client, { businessId: 'biz_1', agentId: 'matte', rawContent: 'kort', triggerType: 'manual' })
    expect(r1).toEqual({ action: 'discarded' })
    expect(r2).toEqual({ action: 'discarded' })
    expect(r3).toEqual({ action: 'discarded' })
    expect(calls).toHaveLength(0)
  })
})

test.describe('saveExtractedMemory — PII-scrub', () => {
  test('en mening med ett svenskt mobilnummer maskas innan den sparas', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: [], error: null }, // dedupe-kandidater
      { data: { id: 'mem_1' }, error: null }, // insert
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'matte',
      rawContent: 'Kunden nås bäst på 0701234567 efter kl 17.',
      triggerType: 'manual',
    })
    expect(r.action).toBe('inserted')
    const insertCall = calls[1].ops.find((o) => o.method === 'insert')
    expect(insertCall).toBeTruthy()
    const payload = insertCall!.args[0]
    expect(payload.content).not.toContain('0701234567')
    // scrubPII:s personnummer-regex (6 siffror + valfritt bindestreck + 4
    // siffror) matchar ett 10-siffrigt mobilnummer FÖRE den generiska
    // kontonummer-regeln — samma maskering, bara etiketten skiljer sig.
    expect(payload.content).toContain('[personnummer]')
  })
})

test.describe('saveExtractedMemory — confirmed_at-semantik', () => {
  test('observation/fact auto-bekräftas vid skrivning (confirmed_at satt, ingen kortskapelse)', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: [], error: null }, // dedupe
      { data: { id: 'mem_2' }, error: null }, // insert
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'karin',
      rawContent: 'Det finns en extra nyckel hos grannen på baksidan.',
      triggerType: 'manual',
    })
    expect(r).toMatchObject({ action: 'inserted', memoryId: 'mem_2', confirmationPending: false })
    const insertPayload = calls[1].ops.find((o) => o.method === 'insert')!.args[0]
    expect(insertPayload.confirmed_at).not.toBeNull()
    expect(typeof insertPayload.confirmed_at).toBe('string')
    // Ingen tredje .from()-anrop — inget pending_approvals-kort skapat.
    expect(calls).toHaveLength(2)
  })

  test('pattern/preference skrivs UNBEKRÄFTADE och skapar ett pending_approvals-kort', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: [], error: null }, // dedupe
      { data: { id: 'mem_3' }, error: null }, // insert
      { data: { id: 'appr_x' }, error: null }, // pending_approvals insert
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'hanna',
      rawContent: 'Kunden föredrar alltid att bli kontaktad via SMS, aldrig telefon.',
      triggerType: 'manual',
    })
    expect(r).toMatchObject({ action: 'inserted', memoryId: 'mem_3', confirmationPending: true })
    const insertPayload = calls[1].ops.find((o) => o.method === 'insert')!.args[0]
    expect(insertPayload.confirmed_at).toBeNull()

    expect(calls[2].table).toBe('pending_approvals')
    const cardPayload = calls[2].ops.find((o) => o.method === 'insert')!.args[0]
    expect(cardPayload.approval_type).toBe(AGENT_MEMORY_CONFIRMATION_TYPE)
    expect(cardPayload.status).toBe('pending')
    expect(cardPayload.payload.memory_id).toBe('mem_3')
    // Svenska, inga tekniska termer läckta till kortet.
    expect(cardPayload.title).not.toMatch(/agent_memory_confirmation|payload|webhook|token/i)
  })
})

test.describe('saveExtractedMemory — källspår (source_type/source_id)', () => {
  test('trådar anroparens källref in i inserten', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: [], error: null },
      { data: { id: 'mem_4' }, error: null },
    ])
    await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'matte',
      rawContent: 'Det finns en fungerande larm-kod hos kunden.',
      triggerType: 'chat',
      source: { type: 'chat_thread', id: 'thread_77' },
    })
    const insertPayload = calls[1].ops.find((o) => o.method === 'insert')!.args[0]
    expect(insertPayload.source_type).toBe('chat_thread')
    expect(insertPayload.source_id).toBe('thread_77')
  })

  test('utan källref skrivs null, kastar inte', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: [], error: null },
      { data: { id: 'mem_5' }, error: null },
    ])
    await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'matte',
      rawContent: 'Det finns en fungerande larm-kod hos kunden.',
      triggerType: 'chat',
    })
    const insertPayload = calls[1].ops.find((o) => o.method === 'insert')!.args[0]
    expect(insertPayload.source_type).toBeNull()
    expect(insertPayload.source_id).toBeNull()
  })
})

test.describe('saveExtractedMemory — dedupe-vägar (v149)', () => {
  test('exakt matchning → bump, ingen ny rad, samma bumpedImportance-formel', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: [{ id: 'existing_1', content: 'kunden vill ha ekparkett', memory_type: 'preference', access_count: 2 }], error: null },
      { data: null, error: null }, // update
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'hanna',
      rawContent: 'Kunden vill ha ekparkett!',
      triggerType: 'manual',
    })
    expect(r).toEqual({ action: 'bumped', memoryId: 'existing_1' })
    const updatePayload = calls[1].ops.find((o) => o.method === 'update')!.args[0]
    expect(updatePayload.access_count).toBe(3)
    expect(updatePayload.importance_score).toBeCloseTo(0.7, 5) // bumpedImportance(2)
  })

  test('hög överlapp, samma typ → supersede: ny rad infogas, gamla markeras superseded_by', async () => {
    const { client, calls } = fakeSupabaseSeq([
      {
        data: [{ id: 'old_1', content: 'kunden föredrar förmiddagsbesök på tisdagar', memory_type: 'preference', access_count: 0 }],
        error: null,
      },
      { data: { id: 'new_1' }, error: null }, // insert
      { data: null, error: null }, // supersede-update
      { data: { id: 'appr_y' }, error: null }, // confirmation card
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'hanna',
      rawContent: 'kunden föredrar förmiddagsbesök på onsdagar numera',
      triggerType: 'manual',
    })
    expect(r).toMatchObject({ action: 'superseded', memoryId: 'new_1', supersededId: 'old_1' })
    const supersedeOps = calls[2].ops
    expect(supersedeOps.find((o) => o.method === 'update')!.args[0]).toEqual({ superseded_by: 'new_1' })
    expect(supersedeOps.find((o) => o.method === 'eq' && o.args[0] === 'id')!.args[1]).toBe('old_1')
  })
})

test.describe('saveExtractedMemory — 42703-fallback (pre-migration, byte-identiskt med gårdagen)', () => {
  test('dedupe-frågans 42703 → legacy substring-dedupe, ingen confirmed_at/källspår/kort', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: null, error: { message: 'column agent_memories.superseded_by does not exist', code: '42703' } },
      { data: [], error: null }, // legacy ilike-dedupe, ingen träff
      { data: { id: 'legacy_1' }, error: null }, // legacy insert
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'hanna',
      rawContent: 'Kunden föredrar SMS framför mejl alltid.',
      triggerType: 'manual',
      source: { type: 'chat_thread', id: 'thread_1' },
    })
    expect(r).toEqual({ action: 'inserted', memoryId: 'legacy_1', legacy: true, confirmationPending: false })

    const legacyInsertOps = calls[2].ops
    expect(legacyInsertOps.find((o) => o.method === 'ilike')).toBeFalsy()
    const insertPayload = legacyInsertOps.find((o) => o.method === 'insert')!.args[0]
    // Gårdagens exakta fält — inga v149-kolumner, ingen embedding.
    expect(insertPayload).toEqual({
      business_id: 'biz_1',
      agent_id: 'hanna',
      memory_type: 'preference',
      content: 'Kunden föredrar SMS framför mejl alltid.',
      importance_score: expect.any(Number),
    })
    expect(insertPayload.confirmed_at).toBeUndefined()
    expect(insertPayload.source_type).toBeUndefined()
    expect(insertPayload.embedding).toBeUndefined()
    // Bara 3 anrop totalt — inget fjärde .from('pending_approvals').
    expect(calls).toHaveLength(3)
  })

  test('42703-läget: befintlig substring-träff bumpas exakt som innan', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: null, error: { code: '42703', message: 'column does not exist' } },
      { data: [{ id: 'old_legacy', content: 'kunden vill ha ekparkett i hela huset', access_count: 1 }], error: null },
      { data: null, error: null }, // update
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'hanna',
      rawContent: 'Kunden vill ha ekparkett',
      triggerType: 'manual',
    })
    expect(r).toEqual({ action: 'bumped', memoryId: 'old_legacy' })
  })

  test('ett OVÄNTAT (icke-42703) DB-fel på dedupe-frågan failar stängt, kastar inte', async () => {
    const { client } = fakeSupabaseSeq([
      { data: null, error: { code: '08006', message: 'connection refused' } },
    ])
    const r = await saveExtractedMemory(client, {
      businessId: 'biz_1',
      agentId: 'hanna',
      rawContent: 'Ett innehåll som är tillräckligt långt för att passera valideringen.',
      triggerType: 'manual',
    })
    expect(r.action).toBe('error')
  })
})

// ─────────────────────────────────────────────────────────────────
// f) fetchRelevantMemories — läsväg
// ─────────────────────────────────────────────────────────────────

test.describe('fetchRelevantMemories — v149 confirmed/superseded-filter', () => {
  test('frågar superseded_by IS NULL och confirmed_at IS NOT NULL, scopat på business_id', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: [], error: null },
    ])
    await fetchRelevantMemories(client, 'biz_9', 'matte')
    const ops = calls[0].ops
    expect(ops.find((o) => o.method === 'is' && o.args[0] === 'superseded_by')?.args[1]).toBeNull()
    expect(ops.find((o) => o.method === 'not' && o.args[0] === 'confirmed_at')).toBeTruthy()
    expect(ops.find((o) => o.method === 'eq' && o.args[0] === 'business_id')?.args[1]).toBe('biz_9')
  })

  test('rankar på färskhetsviktad poäng och returnerar max 5', async () => {
    const NU = new Date('2026-08-18T12:00:00.000Z')
    const rows = [
      { id: 'a', content: 'A', importance_score: 0.9, memory_type: 'fact', created_at: '2025-01-01T00:00:00.000Z' }, // gammal
      { id: 'b', content: 'B', importance_score: 0.6, memory_type: 'fact', created_at: '2026-08-18T11:00:00.000Z' }, // färsk
      { id: 'c', content: 'C', importance_score: 0.5, memory_type: 'fact', created_at: '2026-08-18T10:00:00.000Z' },
      { id: 'd', content: 'D', importance_score: 0.4, memory_type: 'fact', created_at: '2026-08-18T09:00:00.000Z' },
      { id: 'e', content: 'E', importance_score: 0.3, memory_type: 'fact', created_at: '2026-08-18T08:00:00.000Z' },
      { id: 'f', content: 'F', importance_score: 0.2, memory_type: 'fact', created_at: '2026-08-18T07:00:00.000Z' },
    ]
    const { client } = fakeSupabaseSeq([
      { data: rows, error: null },
      { data: null, error: null }, // last_accessed_at update
    ])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte', { now: NU })
    expect(result).toHaveLength(5)
    expect(result[0].id).toBe('b') // färskast, hög importance
    expect(result.map((r) => r.id)).not.toContain('a') // gammal + låg decay ska rankas ut till plats 6
  })

  test('42703 → legacy ofiltrerad fråga, sorterad på rå importance_score (byte-identisk MED efterföljande decay-rankning)', async () => {
    const { client, calls } = fakeSupabaseSeq([
      { data: null, error: { code: '42703', message: 'column does not exist' } },
      { data: [{ id: 'x', content: 'X', importance_score: 0.9, memory_type: 'fact', created_at: '2026-08-18T00:00:00.000Z' }], error: null },
      { data: null, error: null }, // last_accessed_at update
    ])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte')
    expect(result.map((r) => r.id)).toEqual(['x'])
    // Legacy-frågan är ofiltrerad — ingen is('superseded_by',...) i det andra anropet.
    expect(calls[1].ops.find((o) => o.method === 'is')).toBeFalsy()
    expect(calls[1].ops.find((o) => o.method === 'order')?.args).toEqual(['importance_score', { ascending: false }])
  })

  test('tom träfflista → tom array, ingen update-krasch', async () => {
    const { client } = fakeSupabaseSeq([{ data: [], error: null }])
    const result = await fetchRelevantMemories(client, 'biz_9', 'matte')
    expect(result).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────
// g) action-contract-registreringen + approvals-caset
// ─────────────────────────────────────────────────────────────────

test.describe('agent_memory_confirmation — kontraktet', () => {
  test('registrerad som EXECUTABLE_ACTION (godkännande utför en riktig skrivning: confirmed_at)', () => {
    expect(classify(AGENT_MEMORY_CONFIRMATION_TYPE)).toBe('EXECUTABLE_ACTION')
    expect(mayExecute(AGENT_MEMORY_CONFIRMATION_TYPE)).toBe(true)
  })
  test('typen finns i ACTION_CONTRACT', () => {
    expect(Object.keys(ACTION_CONTRACT)).toContain(AGENT_MEMORY_CONFIRMATION_TYPE)
  })
})

test.describe('approvals-caset (app/api/approvals/[id]/route.ts, case agent_memory_confirmation)', () => {
  const ROUTE = 'app/api/approvals/[id]/route.ts'

  test('caset finns och sätter confirmed_at på agent_memories via memory_id', () => {
    const s = read(ROUTE)
    const i = s.indexOf("case 'agent_memory_confirmation':")
    expect(i, 'caset saknas').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 1200)
    expect(gren).toContain("from('agent_memories')")
    expect(gren).toContain('confirmed_at: new Date().toISOString()')
    expect(gren).toContain("eq('id', pl.memory_id)")
    expect(gren).toContain("eq('business_id', businessId)")
  })

  test('saknat memory_id failar stängt med ett svenskt fel, kraschar inte', () => {
    const s = read(ROUTE)
    const i = s.indexOf("case 'agent_memory_confirmation':")
    const gren = s.slice(i, i + 1200)
    expect(gren).toContain('if (!pl.memory_id)')
  })
})

// ─────────────────────────────────────────────────────────────────
// h) död kod verkligen borta
// ─────────────────────────────────────────────────────────────────

test.describe('död embedding-kod borttagen (Etapp U — ärlighet före ambition)', () => {
  test('generateEmbedding-funktionen finns inte längre (filhuvudets historik-omnämnande av namnet är OK, en levande deklaration/anrop är det inte)', () => {
    const s = read('lib/agents/memory.ts')
    expect(s).not.toMatch(/function generateEmbedding/)
    expect(s).not.toMatch(/generateEmbedding\(/)
    expect(s).not.toContain('embedding:')
  })

  test('getRelevantMemories tar bara (businessId, agentId) — inget context-argument', () => {
    const s = read('lib/agents/memory.ts')
    const i = s.indexOf('export async function getRelevantMemories(')
    expect(i).toBeGreaterThan(-1)
    const signatureLine = s.slice(i, s.indexOf(')', i) + 1)
    expect(signatureLine).not.toContain('context')
  })

  test('anroparna (trigger-route + matte/chat) skickar aldrig ett tredje argument till getRelevantMemories', () => {
    const trigger = read('app/api/agent/trigger/route.ts')
    const chat = read('app/api/matte/chat/route.ts')
    expect(trigger).toContain('getRelevantMemories(businessId, agentId)')
    expect(chat).toContain('getRelevantMemories(businessId, currentAgent)')
  })
})

// ─────────────────────────────────────────────────────────────────
// i) buildMemoryPrompt — oförändrad
// ─────────────────────────────────────────────────────────────────

test.describe('buildMemoryPrompt — oförändrat kontrakt', () => {
  test('tom lista → tom sträng', () => {
    expect(buildMemoryPrompt([])).toBe('')
  })
  test('numrerar minnena', () => {
    const s = buildMemoryPrompt(['A', 'B'])
    expect(s).toContain('1. A')
    expect(s).toContain('2. B')
  })
})

// ─────────────────────────────────────────────────────────────────
// j) källref trådad från anroparna
// ─────────────────────────────────────────────────────────────────

test.describe('källref trådad in i extractAndSaveMemory-anropen', () => {
  test('trigger-routen skickar sin run-referens', () => {
    const s = read('app/api/agent/trigger/route.ts')
    const i = s.indexOf('extractAndSaveMemory(businessId, agentId, finalResponse, trigger_type, trigger_data || {}')
    expect(i, 'anropet hittades inte').toBeGreaterThan(-1)
    const gren = s.slice(i, i + 300)
    expect(gren).toContain("type: 'agent_run'")
    expect(gren).toContain('id: runId')
  })

  test('matte/chat skickar sin tråd-referens', () => {
    const s = read('app/api/matte/chat/route.ts')
    const i = s.indexOf("extractAndSaveMemory(businessId, currentAgent, cleanReply, 'chat'")
    expect(i, 'anropet hittades inte').toBeGreaterThan(-1)
    // 2026-08-25: 400-teckensfönstret var för snålt — förklarande
    // kommentarsrader i källref-blocket sköt id-raden precis förbi kanten
    // och facitet blev rött trots att referensen (som är poängen) fanns.
    const gren = s.slice(i, i + 700)
    expect(gren).toContain("type: 'chat_thread'")
    expect(gren).toContain('id: thread?.id ?? null')
  })
})
