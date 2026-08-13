/**
 * Facit för Next Best Action Engine — payload-normaliseraren
 * (lib/jarvis/next-best-action-normalize.ts, 2026-08-13). Ren funktion,
 * ingen DB:
 *
 *   npx playwright test tests/next-best-action-normalize.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { normalize, type RawCandidateRow } from '../lib/jarvis/next-best-action-normalize'

const NOW = '2026-08-13T10:00:00.000Z'

function row(overrides: Partial<RawCandidateRow> = {}): RawCandidateRow {
  return {
    id: 'appr_1',
    approval_type: 'invoice_reminder',
    title: 'Test',
    created_at: '2026-08-10T10:00:00.000Z',
    payload: {},
    ...overrides,
  }
}

test.describe('normalize — invoice_reminder', () => {
  test('amount_kr blir KÄNT, days_overdue blir en läsbar svensk urgency_note', () => {
    const r = normalize(row({ payload: { amount_kr: 4800, days_overdue: 3, customer_name: 'Andersson' } }), NOW)
    expect(r?.financial_impact_kr).toBe(4800)
    expect(r?.financial_impact_kind).toBe('KÄNT')
    expect(r?.urgency_note).toBe('3 dagar försenad')
    expect(r?.project_or_customer).toBe('Andersson')
  })

  test('saknat amount_kr ger null, aldrig ett gissat belopp', () => {
    const r = normalize(row({ payload: { days_overdue: 1 } }), NOW)
    expect(r?.financial_impact_kr).toBeNull()
    expect(r?.financial_impact_kind).toBeNull()
    expect(r?.urgency_note).toBe('1 dag försenad')
  })
})

test.describe('normalize — quote_nudge', () => {
  test('bär INGET eget belopp — financial_impact_kr är null utan enrichment', () => {
    const r = normalize(row({ approval_type: 'quote_nudge', payload: { view_count: 3, customer_name: 'Svensson' } }), NOW)
    expect(r?.financial_impact_kr).toBeNull()
    expect(r?.urgency_note).toBe('Visad 3 gånger, inte accepterad')
  })

  test('enrichment.quoteTotal ger KÄNT (verkligt quotes.total, inte gissat)', () => {
    const r = normalize(row({ approval_type: 'quote_nudge', payload: {} }), NOW, { quoteTotal: 280000 })
    expect(r?.financial_impact_kr).toBe(280000)
    expect(r?.financial_impact_kind).toBe('KÄNT')
  })
})

test.describe('normalize — profitability_warning', () => {
  test('projected_overrun är alltid UPPSKATTAT — en prognos, inte ett facit', () => {
    const r = normalize(
      row({ approval_type: 'profitability_warning', payload: { projected_overrun: 42000, status: 'over_budget', cost_percent: 115, project_name: 'Kök Storgatan' } }),
      NOW,
    )
    expect(r?.financial_impact_kr).toBe(42000)
    expect(r?.financial_impact_kind).toBe('UPPSKATTAT')
    expect(r?.urgency_note).toBe('Redan över budget (115% av kalkylen förbrukad)')
    expect(r?.project_or_customer).toBe('Kök Storgatan')
  })

  test('at_risk (inte over_budget) ger annan urgency-text', () => {
    const r = normalize(row({ approval_type: 'profitability_warning', payload: { status: 'at_risk', cost_percent: 88 } }), NOW)
    expect(r?.urgency_note).toBe('Riskerar överskrida budget (88% av kalkylen förbrukad)')
  })
})

test.describe('normalize — create_ata_draft', () => {
  test('amount_estimate är UPPSKATTAT, saknas den → null (aldrig gissat)', () => {
    const utanBelopp = normalize(row({ approval_type: 'create_ata_draft', payload: { description: 'Extra eluttag' } }), NOW)
    expect(utanBelopp?.financial_impact_kr).toBeNull()

    const medBelopp = normalize(row({ approval_type: 'create_ata_draft', payload: { amount_estimate: 18000, description: 'Extra eluttag' } }), NOW)
    expect(medBelopp?.financial_impact_kr).toBe(18000)
    expect(medBelopp?.financial_impact_kind).toBe('UPPSKATTAT')
    expect(medBelopp?.project_or_customer).toBe('Extra eluttag')
  })

  test('enrichment.nextVisitIso ger en ärlig "bokat imorgon"-fakta, inte en påhittad', () => {
    const imorgon = new Date(new Date(NOW).getTime() + 24 * 3600_000).toISOString()
    const r = normalize(row({ approval_type: 'create_ata_draft', payload: {} }), NOW, { nextVisitIso: imorgon })
    expect(r?.urgency_note).toMatch(/^Bokat imorgon kl \d{2}:\d{2}$/)
  })

  test('inget kommande besök funnet → urgency_note null, gissas aldrig fram', () => {
    const r = normalize(row({ approval_type: 'create_ata_draft', payload: {} }), NOW, { nextVisitIso: null })
    expect(r?.urgency_note).toBeNull()
  })
})

test.describe('normalize — missad_intakt', () => {
  test('amount_kr är UPPSKATTAT (ett fynd som väntar på granskning)', () => {
    const r = normalize(row({ approval_type: 'missad_intakt', created_at: '2026-08-11T10:00:00.000Z', payload: { amount_kr: 6200 } }), NOW)
    expect(r?.financial_impact_kr).toBe(6200)
    expect(r?.financial_impact_kind).toBe('UPPSKATTAT')
    expect(r?.urgency_note).toBe('Upptäckt för 2 dagar sedan')
  })
})

test.describe('normalize — dispatch_suggestion', () => {
  test('bär ALDRIG ett belopp — bekräftat, ingen finansiell signal i typen', () => {
    const r = normalize(row({ approval_type: 'dispatch_suggestion', payload: { scheduled_start: NOW, job_title: 'Byte av kran' } }), NOW)
    expect(r?.financial_impact_kr).toBeNull()
    expect(r?.financial_impact_kind).toBeNull()
    expect(r?.project_or_customer).toBe('Byte av kran')
  })

  test('scheduled_start läses direkt ur payload, inget uppslag behövs', () => {
    const om3dagar = new Date(new Date(NOW).getTime() + 3 * 24 * 3600_000).toISOString()
    const r = normalize(row({ approval_type: 'dispatch_suggestion', payload: { scheduled_start: om3dagar } }), NOW)
    expect(r?.urgency_note).toMatch(/^Bokat om 3 dagar, kl \d{2}:\d{2}$/)
  })
})

test.describe('normalize — okänd typ', () => {
  test('returnerar null i stället för att gissa en form', () => {
    const r = normalize(row({ approval_type: 'något_helt_annat' }), NOW)
    expect(r).toBeNull()
  })
})
