/**
 * FACIT — lib/mission/mission-progress.ts (Goal-to-Plan V1, Etapp A).
 *
 * Vaktposterna som låses här:
 *  - verifierat betalt är FAKTURANS belopp, aldrig planstegets frysta mått
 *  - bara direkt refererade fakturor räknas — ett sammanträffande attribuerar aldrig
 *  - betalning före uppdragets start räknas inte
 *  - en accepterad offert är RÖRELSE (antal), aldrig kronor in i betalt
 *  - inget klassöverskridande fält existerar
 *
 * Körs: npx playwright test tests/mission-progress.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { byggMissionProgress, type MissionRow } from '../lib/mission/mission-progress'
import type { ValidatedMissionStep } from '../lib/mission/plan-validation'

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
    deadline: '2026-09-30',
    status: 'active',
    plan_snapshot: {
      steps: [
        // OBS: snapshot-måttet (40 000) skiljer sig medvetet från fakturans
        // verkliga total (42 000) — facit kräver att fakturan vinner.
        steg({}),
        steg({
          item_id: 'pf_111111111111',
          truth_class: 'pipeline',
          title: 'Obesvarad offert OFF-42 — Svensson',
          measure: { kind: 'kr', amountKr: 55000 },
          evidence: { table: 'quotes', ref_id: 'q_1' },
          agent_key: 'daniel',
          approval_type: 'quote_nudge',
        }),
        steg({
          item_id: 'pf_222222222222',
          truth_class: 'ateraktivering',
          title: '7 tysta badrum-kunder',
          measure: { kind: 'count', count: 7 },
          evidence: { table: 'customer_group', ref_id: 'badrum' },
          agent_key: 'hanna',
          approval_type: null,
        }),
      ],
    },
    portfolio_generated_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    resolved_at: null,
    ...overrides,
  }
}

const tomIndata = () => ({ invoices: [], missionApprovals: [], quotes: [], nowMs: NOW_MS })

test.describe('byggMissionProgress — verifierat betalt', () => {
  test('betald direktrefererad faktura → fakturans belopp, inte snapshot-måttet', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      invoices: [{ invoice_id: 'inv_1', total: 42000, status: 'paid', paid_at: '2026-08-10T09:00:00Z' }],
    })
    expect(progress.per_class.indrivningsbart?.verified_paid_kr).toBe(42000)
    // Delmängdssemantiken (ledger-mönstret): betalt ingår i fakturerat.
    expect(progress.per_class.indrivningsbart?.invoiced_kr).toBe(42000)
  })

  test('obetald refererad faktura (sent) → bara fakturerat, inget betalt', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      invoices: [{ invoice_id: 'inv_1', total: 42000, status: 'sent', paid_at: null }],
    })
    expect(progress.per_class.indrivningsbart?.verified_paid_kr).toBe(0)
    expect(progress.per_class.indrivningsbart?.invoiced_kr).toBe(42000)
  })

  test('utkast-faktura räknas varken som fakturerad eller betald', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      invoices: [{ invoice_id: 'inv_1', total: 42000, status: 'draft', paid_at: null }],
    })
    expect(progress.per_class.indrivningsbart?.invoiced_kr).toBe(0)
    expect(progress.per_class.indrivningsbart?.verified_paid_kr).toBe(0)
  })

  test('betald faktura som INTE refereras någonstans bidrar med INGENTING', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      invoices: [{ invoice_id: 'inv_99', total: 80000, status: 'paid', paid_at: '2026-08-10T09:00:00Z' }],
    })
    for (const cls of Object.values(progress.per_class)) {
      expect(cls.verified_paid_kr).toBe(0)
      expect(cls.invoiced_kr).toBe(0)
    }
  })

  test('betalning FÖRE uppdragets start räknas aldrig som uppdragsvinst', () => {
    const progress = byggMissionProgress({
      mission: mission({ created_at: '2026-08-01T00:00:00Z' }),
      ...tomIndata(),
      invoices: [{ invoice_id: 'inv_1', total: 42000, status: 'paid', paid_at: '2026-07-15T09:00:00Z' }],
    })
    expect(progress.per_class.indrivningsbart?.verified_paid_kr).toBe(0)
  })

  test('faktura via mission-approvals execution_result.artifacts räknas — en gång', () => {
    const progress = byggMissionProgress({
      mission: mission({
        plan_snapshot: {
          steps: [steg({
            truth_class: 'faktureringsklart',
            measure: { kind: 'kr', amountKr: 12500 },
            evidence: { table: 'project', ref_id: 'proj_1' },
            approval_type: 'missad_intakt',
          })],
        },
      }),
      ...tomIndata(),
      invoices: [{ invoice_id: 'inv_7', total: 13000, status: 'paid', paid_at: '2026-08-12T09:00:00Z' }],
      missionApprovals: [
        {
          id: 'app_1',
          status: 'approved',
          approval_type: 'fakturera_projekt',
          payload: {
            mission_id: 'mis_abc123def456',
            execution_result: { artifacts: { invoice_id: 'inv_7' } },
          },
        },
        // Ett andra kort som pekar på SAMMA faktura — pengarna räknas en gång.
        {
          id: 'app_2',
          status: 'approved',
          approval_type: 'fakturera_projekt',
          payload: {
            mission_id: 'mis_abc123def456',
            execution_result: { artifacts: { invoice_id: 'inv_7' } },
          },
        },
      ],
    })
    expect(progress.per_class.faktureringsklart?.verified_paid_kr).toBe(13000)
    expect(progress.per_class.faktureringsklart?.invoiced_kr).toBe(13000)
  })
})

test.describe('byggMissionProgress — rörelse, beslut, utgång', () => {
  test('accepterad offert → moved_count 1 och NOLL kronor någonstans', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      quotes: [{ quote_id: 'q_1', status: 'accepted' }],
    })
    expect(progress.per_class.pipeline?.moved_count).toBe(1)
    for (const cls of Object.values(progress.per_class)) {
      expect(cls.verified_paid_kr).toBe(0)
      expect(cls.invoiced_kr).toBe(0)
    }
  })

  test('öppen offert (sent) → ingen rörelse', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      quotes: [{ quote_id: 'q_1', status: 'sent' }],
    })
    expect(progress.per_class.pipeline?.moved_count).toBe(0)
  })

  test('godkänt återaktiverings-kort → moved_count för ateraktivering', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      missionApprovals: [{
        id: 'app_3',
        status: 'approved',
        approval_type: 'customer_outreach',
        payload: { mission_id: 'mis_abc123def456', truth_class: 'ateraktivering' },
      }],
    })
    expect(progress.per_class.ateraktivering?.moved_count).toBe(1)
  })

  test('väntande mission-kort → decisions_outstanding', () => {
    const progress = byggMissionProgress({
      mission: mission(),
      ...tomIndata(),
      missionApprovals: [
        { id: 'app_1', status: 'pending', approval_type: 'invoice_reminder', payload: { mission_id: 'mis_abc123def456' } },
        { id: 'app_2', status: 'approved', approval_type: 'invoice_reminder', payload: { mission_id: 'mis_abc123def456' } },
      ],
    })
    expect(progress.decisions_outstanding).toBe(1)
  })

  test('utgång härleds vid läsning: passerad deadline på aktivt uppdrag', () => {
    const passerad = byggMissionProgress({ mission: mission({ deadline: '2026-08-10' }), ...tomIndata() })
    expect(passerad.is_expired).toBe(true)

    const idag = byggMissionProgress({ mission: mission({ deadline: '2026-08-20' }), ...tomIndata() })
    expect(idag.is_expired).toBe(false)

    const framtid = byggMissionProgress({ mission: mission({ deadline: '2026-09-30' }), ...tomIndata() })
    expect(framtid.is_expired).toBe(false)

    const redanAvslutad = byggMissionProgress({
      mission: mission({ deadline: '2026-08-10', status: 'completed', resolved_at: '2026-08-11T00:00:00Z' }),
      ...tomIndata(),
    })
    expect(redanAvslutad.is_expired).toBe(false)
  })

  test('tomma indata → nollor och stegräkning per klass', () => {
    const progress = byggMissionProgress({ mission: mission(), ...tomIndata() })
    expect(progress.decisions_outstanding).toBe(0)
    expect(progress.per_class.indrivningsbart).toEqual({
      verified_paid_kr: 0, invoiced_kr: 0, moved_count: 0, step_count: 1,
    })
    expect(progress.per_class.pipeline?.step_count).toBe(1)
    expect(progress.per_class.ateraktivering?.step_count).toBe(1)
    // Klasser utan steg finns inte i per_class — Partial är avsiktlig.
    expect(progress.per_class.marginalskydd).toBeUndefined()
  })
})

test.describe('inget klassöverskridande fält existerar', () => {
  test('progressen bär inget hopslaget kronfält under något känt namn', () => {
    const progress = byggMissionProgress({ mission: mission(), ...tomIndata() })
    expect(typeof (progress as any).totalKr).toBe('undefined')
    expect(typeof (progress as any).total).toBe('undefined')
    expect(typeof (progress as any).total_kr).toBe('undefined')
    expect(typeof (progress as any).grandTotal).toBe('undefined')
    expect(typeof (progress as any).summaKr).toBe('undefined')
  })
})
