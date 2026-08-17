/**
 * FACIT — lib/mission/mission-facit.ts (Etapp H, uppdragshistorik + per-agent
 * + Mission Learning-läslagret, tasks/jaunty-pondering-hummingbird.md).
 *
 * Vaktposterna som låses här:
 *  - HARD RULE 1: ansvarar_steg kommer ENDAST ur plan_snapshot.agent_key;
 *    utforda/vantar/kunde_inte_verifieras kommer ENDAST ur approval-raderna
 *    (agentForApproval + execution_result.outcome) — de blandas aldrig.
 *  - HARD RULE 2: learning_eligible bara för status 'completed' utan
 *    degraderingsblockerare; alla andra statusar har en egen svensk
 *    blockerare och är ALDRIG eligible.
 *  - verifierat_betalt_kr återanvänder mission-progress.ts:s redan
 *    fakturadedupade per_class-summa — räknar aldrig om attributionen.
 *  - listMissionFacit: fail-soft (tabellfel → [], per-uppdrags-fel → nollfacit
 *    för just det uppdraget) + återanvänder loadMissionProgressInputs.
 *
 * Körs: npx playwright test tests/mission-facit.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  byggMissionFacit,
  listMissionFacit,
  type MissionFacit,
} from '../lib/mission/mission-facit'
import type { MissionRow, MissionApprovalInput } from '../lib/mission/mission-progress'
import type { ValidatedMissionStep } from '../lib/mission/plan-validation'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const NOW_MS = Date.parse('2026-08-20T12:00:00Z')

function steg(overrides: Partial<ValidatedMissionStep>): ValidatedMissionStep {
  return {
    item_id: 'pf_000000000000',
    truth_class: 'indrivningsbart',
    title: 'Förfallen faktura 2024-118 — Andersson',
    measure: { kind: 'kr', amountKr: 40000 },
    evidence: { table: 'invoice', ref_id: 'inv_1' },
    agent_key: 'karin',
    approval_type: 'invoice_reminder',
    motivation: 'Intjänat först',
    ...overrides,
  }
}

function mission(overrides: Partial<MissionRow> = {}): MissionRow {
  return {
    id: 'mis_abc123def456',
    business_id: 'biz_1',
    goal_kr: 150000,
    deadline: '2026-06-01',
    status: 'completed',
    plan_snapshot: { steps: [steg({})] },
    portfolio_generated_at: '2026-05-01T00:00:00Z',
    created_at: '2026-05-01T00:00:00Z',
    resolved_at: '2026-05-20T00:00:00Z',
    ...overrides,
  }
}

function approval(overrides: Partial<MissionApprovalInput> = {}): MissionApprovalInput {
  return {
    id: 'pa_1',
    status: 'pending',
    approval_type: 'invoice_reminder',
    payload: {},
    ...overrides,
  }
}

const tomIndata = () => ({ invoices: [], missionApprovals: [], quotes: [], nowMs: NOW_MS })

// ─────────────────────────────────────────────────────────────────────────
// HARD RULE 1 — plananvar ≠ utförande
// ─────────────────────────────────────────────────────────────────────────

test.describe('byggMissionFacit — plananvar ≠ utförande (HARD RULE 1)', () => {
  test('Karin äger 2 steg, noll godkännanden finns → ansvarar_steg 2, utforda 0', () => {
    const m = mission({
      plan_snapshot: {
        steps: [
          steg({ item_id: 'pf_1', agent_key: 'karin' }),
          steg({ item_id: 'pf_2', agent_key: 'karin', evidence: { table: 'invoice', ref_id: 'inv_2' } }),
        ],
      },
    })
    const facit = byggMissionFacit({ mission: m, ...tomIndata() })
    expect(facit.per_agent).toEqual([
      { agent_key: 'karin', ansvarar_steg: 2, utforda: 0, vantar: 0, kunde_inte_verifieras: 0 },
    ])
  })

  test('plan tilldelar Daniel, men godkännandet routas explicit till Karin → separata rader, aldrig hopblandade', () => {
    const m = mission({
      plan_snapshot: { steps: [steg({ agent_key: 'daniel', approval_type: 'quote_nudge' })] },
    })
    const facit = byggMissionFacit({
      mission: m,
      ...tomIndata(),
      missionApprovals: [
        approval({
          status: 'approved',
          approval_type: 'quote_nudge',
          payload: { mission_id: m.id, routed_agent: 'karin', execution_result: { outcome: 'success' } },
        }),
      ],
    })
    const byAgent = Object.fromEntries(facit.per_agent.map(a => [a.agent_key, a]))
    expect(byAgent.daniel).toEqual({ agent_key: 'daniel', ansvarar_steg: 1, utforda: 0, vantar: 0, kunde_inte_verifieras: 0 })
    expect(byAgent.karin).toEqual({ agent_key: 'karin', ansvarar_steg: 0, utforda: 1, vantar: 0, kunde_inte_verifieras: 0 })
  })

  test('pending-godkännande → vantar, aldrig utforda', () => {
    const m = mission({ plan_snapshot: { steps: [] } })
    const facit = byggMissionFacit({
      mission: m,
      ...tomIndata(),
      missionApprovals: [approval({ status: 'pending', approval_type: 'invoice_reminder' })],
    })
    expect(facit.per_agent).toEqual([
      { agent_key: 'karin', ansvarar_steg: 0, utforda: 0, vantar: 1, kunde_inte_verifieras: 0 },
    ])
  })

  test('avvisat godkännande (inget execution_result) → kunde_inte_verifieras', () => {
    const m = mission({ plan_snapshot: { steps: [] } })
    const facit = byggMissionFacit({
      mission: m,
      ...tomIndata(),
      missionApprovals: [approval({ status: 'rejected', approval_type: 'invoice_reminder' })],
    })
    expect(facit.per_agent).toEqual([
      { agent_key: 'karin', ansvarar_steg: 0, utforda: 0, vantar: 0, kunde_inte_verifieras: 1 },
    ])
  })

  test('godkänt men execution_result.outcome "failed" → kunde_inte_verifieras, inte utforda', () => {
    const m = mission({ plan_snapshot: { steps: [] } })
    const facit = byggMissionFacit({
      mission: m,
      ...tomIndata(),
      missionApprovals: [
        approval({ status: 'approved', approval_type: 'invoice_reminder', payload: { execution_result: { outcome: 'failed' } } }),
      ],
    })
    expect(facit.per_agent[0]).toMatchObject({ utforda: 0, kunde_inte_verifieras: 1 })
  })

  test('auto_approved med outcome "success" → utforda', () => {
    const m = mission({ plan_snapshot: { steps: [] } })
    const facit = byggMissionFacit({
      mission: m,
      ...tomIndata(),
      missionApprovals: [
        approval({ status: 'auto_approved', approval_type: 'invoice_reminder', payload: { execution_result: { outcome: 'success' } } }),
      ],
    })
    expect(facit.per_agent[0]).toMatchObject({ utforda: 1, kunde_inte_verifieras: 0, vantar: 0 })
  })

  test('per_agent sorteras deterministiskt på agent_key', () => {
    const m = mission({
      plan_snapshot: {
        steps: [steg({ agent_key: 'lars', item_id: 'pf_1' }), steg({ agent_key: 'daniel', item_id: 'pf_2', evidence: { table: 'invoice', ref_id: 'inv_2' } })],
      },
    })
    const facit = byggMissionFacit({ mission: m, ...tomIndata() })
    expect(facit.per_agent.map(a => a.agent_key)).toEqual(['daniel', 'lars'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// HARD RULE 2 — lärande-grinden
// ─────────────────────────────────────────────────────────────────────────

test.describe('byggMissionFacit — lärande-grinden (HARD RULE 2)', () => {
  test('completed, plan finns → eligible, inga blockerare', () => {
    const facit = byggMissionFacit({ mission: mission({ status: 'completed' }), ...tomIndata() })
    expect(facit.learning_eligible).toBe(true)
    expect(facit.learning_blockers).toEqual([])
  })

  test('completed men utan ett enda plansteg → INTE eligible, blockerare "ingen plan sattes"', () => {
    const facit = byggMissionFacit({
      mission: mission({ status: 'completed', plan_snapshot: { steps: [] } }),
      ...tomIndata(),
    })
    expect(facit.learning_eligible).toBe(false)
    expect(facit.learning_blockers).toContain('ingen plan sattes')
  })

  test('completed kapacitetsuppdrag utan konfigurerad kapacitet → INTE eligible, blockerare "kapacitet ej konfigurerad"', () => {
    const facit = byggMissionFacit({
      mission: mission({
        status: 'completed',
        goal_type: 'capacity',
        goal_kr: null,
        goal_hours: 10,
        plan_snapshot: { steps: [steg({})] },
      }),
      ...tomIndata(),
      capacityWeek: null,
    })
    expect(facit.learning_eligible).toBe(false)
    expect(facit.learning_blockers).toContain('kapacitet ej konfigurerad')
  })

  test('cancelled → ALDRIG eligible, blockerare "avbrutet uppdrag"', () => {
    const facit = byggMissionFacit({ mission: mission({ status: 'cancelled' }), ...tomIndata() })
    expect(facit.learning_eligible).toBe(false)
    expect(facit.learning_blockers).toEqual(['avbrutet uppdrag'])
  })

  test('expired → ALDRIG eligible, blockerare "utgånget uppdrag"', () => {
    const facit = byggMissionFacit({ mission: mission({ status: 'expired' }), ...tomIndata() })
    expect(facit.learning_eligible).toBe(false)
    expect(facit.learning_blockers).toEqual(['utgånget uppdrag'])
  })

  test('active → ALDRIG eligible, blockerare "uppdraget pågår fortfarande"', () => {
    const facit = byggMissionFacit({ mission: mission({ status: 'active', resolved_at: null }), ...tomIndata() })
    expect(facit.learning_eligible).toBe(false)
    expect(facit.learning_blockers).toEqual(['uppdraget pågår fortfarande'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// verifierat_betalt_kr — återanvänder mission-progress.ts:s dedup
// ─────────────────────────────────────────────────────────────────────────

test.describe('byggMissionFacit — verifierat_betalt_kr', () => {
  test('samma faktura refererad av både plansteg och godkännande-artefakt räknas EN gång', () => {
    const m = mission({
      status: 'completed',
      plan_snapshot: { steps: [steg({ evidence: { table: 'invoice', ref_id: 'inv_1' } })] },
    })
    const facit = byggMissionFacit({
      mission: m,
      invoices: [{ invoice_id: 'inv_1', total: 40000, status: 'paid', paid_at: '2026-05-10T09:00:00Z' }],
      missionApprovals: [
        approval({
          status: 'approved',
          payload: { mission_id: m.id, execution_result: { outcome: 'success', artifacts: { invoice_id: 'inv_1' } } },
        }),
      ],
      quotes: [],
      nowMs: NOW_MS,
    })
    expect(facit.verifierat_betalt_kr).toBe(40000)
  })

  test('obetald faktura ger 0 kr verifierat betalt', () => {
    const m = mission({ plan_snapshot: { steps: [steg({ evidence: { table: 'invoice', ref_id: 'inv_1' } })] } })
    const facit = byggMissionFacit({
      mission: m,
      invoices: [{ invoice_id: 'inv_1', total: 40000, status: 'sent', paid_at: null }],
      missionApprovals: [],
      quotes: [],
      nowMs: NOW_MS,
    })
    expect(facit.verifierat_betalt_kr).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// slutgap_kr / slutgap_hours — ömsesidigt uteslutande, samma facit som progress
// ─────────────────────────────────────────────────────────────────────────

test.describe('byggMissionFacit — slutgap', () => {
  test('pengauppdrag: slutgap_kr satt, slutgap_hours null', () => {
    const facit = byggMissionFacit({ mission: mission({ goal_kr: 100000 }), ...tomIndata() })
    expect(facit.slutgap_kr).not.toBeNull()
    expect(facit.slutgap_hours).toBeNull()
  })

  test('kapacitetsuppdrag: slutgap_hours satt, slutgap_kr null', () => {
    const facit = byggMissionFacit({
      mission: mission({ goal_type: 'capacity', goal_kr: null, goal_hours: 10 }),
      ...tomIndata(),
      capacityWeek: { bookedHours: 4, configured: true },
    })
    expect(facit.slutgap_hours).not.toBeNull()
    expect(facit.slutgap_kr).toBeNull()
  })

  test('headline speglar buildMissionHeadline (kapacitet ger "Boka …")', () => {
    const facit = byggMissionFacit({
      mission: mission({ goal_type: 'capacity', goal_kr: null, goal_hours: 10, deadline: '2026-06-08' }),
      ...tomIndata(),
      capacityWeek: { bookedHours: 4, configured: true },
    })
    expect(facit.headline).toContain('Boka')
  })

  test('kontaktuppdrag (Etapp I): slutgap_count satt, slutgap_kr/slutgap_hours null', () => {
    const facit = byggMissionFacit({
      mission: mission({ goal_type: 'contact', goal_kr: null, goal_count: 5 }),
      ...tomIndata(),
      contactOutcomes: [{ customer_id: 'c1', executed_at: '2026-05-05T00:00:00Z', replied_within_window: true }],
    })
    expect(facit.slutgap_count).toBe(4)
    expect(facit.slutgap_kr).toBeNull()
    expect(facit.slutgap_hours).toBeNull()
  })

  test('headline speglar buildMissionHeadline (kontaktmål ger "Kontakta …")', () => {
    const facit = byggMissionFacit({
      mission: mission({ goal_type: 'contact', goal_kr: null, goal_count: 5, deadline: '2026-06-08' }),
      ...tomIndata(),
    })
    expect(facit.headline).toContain('Kontakta')
  })

  test('completed kontaktuppdrag med plan → eligible (ingen egen okonfigurerad-degradering som kapacitet har)', () => {
    const facit = byggMissionFacit({
      mission: mission({ status: 'completed', goal_type: 'contact', goal_kr: null, goal_count: 5 }),
      ...tomIndata(),
    })
    expect(facit.learning_eligible).toBe(true)
    expect(facit.learning_blockers).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// listMissionFacit — fail-soft I/O + återanvänder loadMissionProgressInputs
// ─────────────────────────────────────────────────────────────────────────

type FakeResponse = { data: unknown; error: { message: string; code?: string } | null }

function fakeChain(response: FakeResponse) {
  const promise = Promise.resolve(response) as any
  const methods = ['select', 'eq', 'neq', 'not', 'gte', 'order', 'limit', 'in', 'contains', 'is', 'insert', 'maybeSingle']
  for (const m of methods) promise[m] = () => promise
  return promise
}

function fakeSupabase(responses: FakeResponse[]) {
  let calls = 0
  const tables: string[] = []
  const supabase = {
    from(table: string) {
      tables.push(table)
      const response = responses[calls] ?? { data: [], error: null }
      calls++
      return fakeChain(response)
    },
  }
  return { supabase, tables, callCount: () => calls }
}

const ok = (data: unknown): FakeResponse => ({ data, error: null })

function missionRowDb(overrides: Record<string, unknown> = {}) {
  return {
    id: 'mis_abc123def456',
    business_id: 'biz_1',
    goal_kr: 100000,
    deadline: '2026-06-01',
    status: 'completed',
    plan_snapshot: { steps: [] },
    portfolio_generated_at: '2026-05-01T00:00:00Z',
    created_at: '2026-05-01T00:00:00Z',
    resolved_at: '2026-05-20T00:00:00Z',
    ...overrides,
  }
}

test.describe('listMissionFacit — fail-soft', () => {
  test('schema saknas (42P01) → tom lista, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([{ data: null, error: { message: 'relation does not exist', code: '42P01' } }])
    const result = await listMissionFacit(supabase as any, 'biz_test')
    expect(result).toEqual([])
  })

  test('okänt DB-fel → tom lista, kastar aldrig', async () => {
    const { supabase } = fakeSupabase([{ data: null, error: { message: 'connection reset' } }])
    const result = await listMissionFacit(supabase as any, 'biz_test')
    expect(result).toEqual([])
  })

  test('inga uppdrag → tom lista', async () => {
    const { supabase, callCount } = fakeSupabase([ok([])])
    const result = await listMissionFacit(supabase as any, 'biz_test')
    expect(result).toEqual([])
    expect(callCount()).toBe(1)
  })

  test('ett uppdrag, dess approvals-läsning felar → uppdraget får ett nollfacit, kastar inte, resten av historiken består', async () => {
    const { supabase } = fakeSupabase([
      ok([missionRowDb({ id: 'mis_1' }), missionRowDb({ id: 'mis_2' })]),
      ok([]), // mis_1 pending_approvals: ok
      { data: null, error: { message: 'boom' } }, // mis_2 pending_approvals: fel
    ])
    const result = await listMissionFacit(supabase as any, 'biz_test')
    expect(result).toHaveLength(2)
    expect(result[0].mission_id).toBe('mis_1')
    expect(result[1].mission_id).toBe('mis_2')
    expect(result[1].per_agent).toEqual([])
  })

  test('normalfall: mission-raden läses, resolveGoalType defaultar saknad goal_type till money', async () => {
    const { supabase } = fakeSupabase([
      ok([missionRowDb({ id: 'mis_1', goal_type: undefined })]),
      ok([]),
    ])
    const result = await listMissionFacit(supabase as any, 'biz_test')
    expect(result).toHaveLength(1)
    expect(result[0].goal_type).toBe('money')
  })
})

test.describe('mission-facit.ts — återanvänder loadMissionProgressInputs, bygger inte om läsningen', () => {
  test('importerar loadMissionProgressInputs och byggMissionProgress från mission-progress.ts', () => {
    const src = read('lib/mission/mission-facit.ts')
    expect(src).toContain('loadMissionProgressInputs')
    expect(src).toContain('byggMissionProgress')
    expect(src).toContain("from './mission-progress'")
  })
})
