import { expect, test } from '@playwright/test'
import { readFileSync } from 'fs'
import path from 'path'
import {
  deriveRevenueRecoveryCase,
  selectRevenueRecoveryCasesForDashboard,
  type RevenueRecoveryApproval,
  type RevenueRecoveryChange,
  type RevenueRecoveryInput,
  type RevenueRecoveryInvoice,
  type RevenueRecoveryProject,
} from '../lib/value/revenue-recovery-case'
import {
  loadRevenueRecoveryCasesFromRepository,
  type RevenueRecoveryRepository,
} from '../lib/value/load-revenue-recovery-cases'

const ROOT = path.resolve(__dirname, '..')

function approval(overrides: Partial<RevenueRecoveryApproval> = {}): RevenueRecoveryApproval {
  return {
    id: 'approval_1',
    approval_type: 'create_ata_draft',
    status: 'pending',
    title: 'Möjligt tilläggsarbete',
    payload: { project_id: 'project_1', amount_estimate: 4_500 },
    created_at: '2026-08-01T08:00:00.000Z',
    resolved_at: null,
    ...overrides,
  }
}

function project(overrides: Partial<RevenueRecoveryProject> = {}): RevenueRecoveryProject {
  return {
    project_id: 'project_1',
    name: 'Badrum — Andersson',
    status: 'active',
    completed_at: null,
    ...overrides,
  }
}

function change(overrides: Partial<RevenueRecoveryChange> = {}): RevenueRecoveryChange {
  return {
    change_id: 'change_1',
    project_id: 'project_1',
    status: 'draft',
    signed_at: null,
    declined_at: null,
    invoice_id: null,
    invoiced_at: null,
    total: 4_500,
    amount: 4_500,
    ...overrides,
  }
}

function invoice(overrides: Partial<RevenueRecoveryInvoice> = {}): RevenueRecoveryInvoice {
  return {
    invoice_id: 'invoice_1',
    project_id: 'project_1',
    invoice_number: '1042',
    status: 'draft',
    total: 5_625,
    sent_at: null,
    paid_at: null,
    ...overrides,
  }
}

function approvedAtaApproval(overrides: Partial<RevenueRecoveryApproval> = {}): RevenueRecoveryApproval {
  return approval({
    status: 'approved',
    resolved_at: '2026-08-01T09:00:00.000Z',
    payload: {
      project_id: 'project_1',
      amount_estimate: 4_500,
      execution_result: {
        outcome: 'success',
        error_text: null,
        artifacts: { ata_id: 'change_1' },
      },
    },
    ...overrides,
  })
}

function input(overrides: Partial<RevenueRecoveryInput> = {}): RevenueRecoveryInput {
  return {
    approval: approval(),
    project: project(),
    changes: [],
    invoice: null,
    ...overrides,
  }
}

test.describe('Revenue Recovery Case — ren tillståndshärledning', () => {
  test('pending ÄTA-förslag kräver granskning och utför ingenting', () => {
    const result = deriveRevenueRecoveryCase(input())
    expect(result.phase).toBe('needs_review')
    expect(result.evidence.ata_created).toBe(false)
    expect(result.next_action).toEqual({
      label: 'Öppna godkännandet',
      href: '/dashboard/approvals',
      kind: 'approval',
    })
  })

  test('skapat ÄTA-utkast väntar på den befintliga ÄTA-ytan', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approvedAtaApproval(),
      changes: [change()],
    }))
    expect(result.phase).toBe('needs_ata_send')
    expect(result.evidence.owner_verified).toBe(true)
    expect(result.evidence.ata_created).toBe(true)
    expect(result.next_action?.href).toContain('/dashboard/projects/project_1?tab=changes')
  })

  test('skickad ÄTA väntar på kundens svar', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approvedAtaApproval(),
      changes: [change({ status: 'sent' })],
    }))
    expect(result.phase).toBe('awaiting_customer')
    expect(result.evidence.customer_accepted).toBe(false)
  })

  test('signerad ÄTA på aktivt projekt väntar på leverans', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approvedAtaApproval(),
      changes: [change({ status: 'signed', signed_at: '2026-08-03T10:00:00.000Z' })],
    }))
    expect(result.phase).toBe('awaiting_delivery')
    expect(result.evidence.customer_accepted).toBe(true)
    expect(result.evidence.delivery_proven).toBe(false)
  })

  test('levererad betyder endast kanoniskt avslutat projekt', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approvedAtaApproval(),
      project: project({ status: 'completed', completed_at: '2026-08-08T15:00:00.000Z' }),
      changes: [change({ status: 'signed', signed_at: '2026-08-03T10:00:00.000Z' })],
    }))
    expect(result.phase).toBe('ready_to_invoice')
    expect(result.evidence.delivery_proven).toBe(true)
    expect(result.next_action?.href).toBe('/dashboard/projects/project_1/invoice-preview')
  })

  test('fakturautkast, skickad och betald härleds ur samma direkta faktura', () => {
    const stages = [
      { status: 'draft', paid_at: null, phase: 'invoice_draft' },
      { status: 'sent', paid_at: null, phase: 'awaiting_payment' },
      { status: 'paid', paid_at: '2026-08-15T12:00:00.000Z', phase: 'paid' },
    ] as const
    for (const stage of stages) {
      const result = deriveRevenueRecoveryCase(input({
        approval: approvedAtaApproval(),
        changes: [change({
          status: 'invoiced',
          signed_at: '2026-08-03T10:00:00.000Z',
          invoice_id: 'invoice_1',
          invoiced_at: '2026-08-10T10:00:00.000Z',
        })],
        invoice: invoice({ status: stage.status, paid_at: stage.paid_at }),
      }))
      expect(result.phase).toBe(stage.phase)
    }
  })

  test('betald kräver både paid-status och paid_at', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approvedAtaApproval(),
      changes: [change({ invoice_id: 'invoice_1', invoiced_at: '2026-08-10T10:00:00.000Z' })],
      invoice: invoice({ status: 'paid', paid_at: null }),
    }))
    expect(result.phase).toBe('unknown')
    expect(result.truth_note).toContain('motsäger')
    expect(result.evidence.payment_confirmed).toBe(false)
  })

  test('misslyckat execution-result blir synligt failed, aldrig skapat ÄTA', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approvedAtaApproval({
        payload: {
          project_id: 'project_1',
          amount_estimate: 4_500,
          execution_result: { outcome: 'failed', error_text: 'Kunde inte spara' },
        },
      }),
    }))
    expect(result.phase).toBe('failed')
    expect(result.truth_note).toBe('Kunde inte spara')
  })

  test('saknat eller främmande projekt failar stängt', () => {
    expect(deriveRevenueRecoveryCase(input({ project: null })).phase).toBe('unknown')
    expect(deriveRevenueRecoveryCase(input({ project: project({ project_id: 'project_other' }) })).phase).toBe('unknown')
  })

  test('saknad och projektfrämmande ÄTA-rad failar stängt', () => {
    const missedApproval = approval({
      approval_type: 'missad_intakt',
      status: 'approved',
      payload: { project_id: 'project_1', source_ids: ['change_1'], amount_kr: 4_500 },
    })
    expect(deriveRevenueRecoveryCase(input({ approval: missedApproval, changes: [] })).phase).toBe('unknown')
    expect(deriveRevenueRecoveryCase(input({
      approval: missedApproval,
      changes: [change({ project_id: 'project_other', status: 'signed' })],
    })).phase).toBe('unknown')
  })

  test('ogranskat materialfynd utan ÄTA-källrad är fortfarande en ärlig granskningssignal', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approval({
        approval_type: 'missad_intakt',
        payload: {
          project_id: 'project_1',
          kind: 'material_ej_fakturerat',
          amount_kr: 2_400,
        },
      }),
    }))
    expect(result.phase).toBe('needs_review')
    expect(result.evidence.ata_created).toBe(false)
  })

  test('tvetydiga fakturareferenser failar stängt', () => {
    const missedApproval = approval({
      approval_type: 'missad_intakt',
      status: 'approved',
      payload: {
        project_id: 'project_1',
        source_ids: ['change_1'],
        amount_kr: 4_500,
        draft_invoice_id: 'invoice_2',
      },
    })
    const result = deriveRevenueRecoveryCase(input({
      approval: missedApproval,
      changes: [change({ status: 'invoiced', signed_at: '2026-08-03T10:00:00.000Z', invoice_id: 'invoice_1' })],
    }))
    expect(result.phase).toBe('unknown')
    expect(result.truth_note).toContain('flera olika fakturor')
  })

  test('missad intäkt kan vara kundbevisad men fortfarande behöva ägargranskning', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approval({
        approval_type: 'missad_intakt',
        payload: { project_id: 'project_1', source_ids: ['change_1'], amount_kr: 4_500 },
      }),
      changes: [change({ status: 'signed', signed_at: '2026-08-03T10:00:00.000Z' })],
    }))
    expect(result.phase).toBe('needs_review')
    expect(result.evidence.customer_accepted).toBe(true)
    expect(result.evidence.owner_verified).toBe(false)
    expect(result.next_action?.href).toBe('/dashboard/pengar')
  })

  test('identifierat underlag och fakturans facit hålls som två olika belopp', () => {
    const result = deriveRevenueRecoveryCase(input({
      approval: approval({
        approval_type: 'missad_intakt',
        status: 'approved',
        payload: {
          project_id: 'project_1',
          source_ids: ['change_1'],
          amount_kr: 4_500,
          draft_invoice_id: 'invoice_1',
        },
      }),
      changes: [change({
        status: 'invoiced', signed_at: '2026-08-03T10:00:00.000Z',
        invoice_id: 'invoice_1', invoiced_at: '2026-08-10T10:00:00.000Z',
      })],
      invoice: invoice({ total: 5_625 }),
    }))
    expect(result.phase).toBe('invoice_draft')
    expect(result.identified_kr).toBe(4_500)
    expect(result.invoice_total_kr).toBe(5_625)
  })

  test('dashboarden prioriterar handling och visar betalt endast i 30 dagar', () => {
    const active = deriveRevenueRecoveryCase(input())
    const recentPaid = deriveRevenueRecoveryCase(input({
      approval: approvedAtaApproval({ id: 'approval_paid_recent' }),
      changes: [change({ invoice_id: 'invoice_1', invoiced_at: '2026-08-10T10:00:00.000Z' })],
      invoice: invoice({ status: 'paid', paid_at: '2026-08-15T12:00:00.000Z' }),
    }))
    const oldPaid = {
      ...recentPaid,
      case_id: 'recovery:old',
      approval_id: 'old',
      paid_at: '2026-06-01T12:00:00.000Z',
    }
    const selected = selectRevenueRecoveryCasesForDashboard(
      [recentPaid, oldPaid, active],
      new Date('2026-08-16T12:00:00.000Z').getTime(),
    )
    expect(selected.map(row => row.approval_id)).toEqual(['approval_1', 'approval_paid_recent'])
  })
})

function repository(overrides: Partial<RevenueRecoveryRepository> = {}): RevenueRecoveryRepository {
  return {
    listApprovals: async () => [approval()],
    findProjects: async () => [project()],
    findChanges: async () => [],
    findInvoices: async () => [],
    ...overrides,
  }
}

test.describe('Revenue Recovery Case — central loader', () => {
  test('repository-fel bubblar och blir aldrig en tom caselista', async () => {
    await expect(loadRevenueRecoveryCasesFromRepository(repository({
      findProjects: async () => { throw new Error('project-uppslag misslyckades') },
    }))).rejects.toThrow('project-uppslag misslyckades')
  })

  test('projektlös create_ata_draft-fallback ligger utanför V1', async () => {
    const result = await loadRevenueRecoveryCasesFromRepository(repository({
      listApprovals: async () => [approval({ payload: { amount_estimate: 4_500 } })],
      findProjects: async ids => {
        expect(ids).toEqual([])
        return []
      },
    }))
    expect(result).toEqual([])
  })

  test('loadern slår bara upp direkta artefakt-id:n', async () => {
    const approved = approvedAtaApproval()
    const result = await loadRevenueRecoveryCasesFromRepository(repository({
      listApprovals: async () => [approved],
      findProjects: async ids => {
        expect(ids).toEqual(['project_1'])
        return [project()]
      },
      findChanges: async ids => {
        expect(ids).toEqual(['change_1'])
        return [change({ invoice_id: 'invoice_1', invoiced_at: '2026-08-10T10:00:00.000Z' })]
      },
      findInvoices: async ids => {
        expect(ids).toEqual(['invoice_1'])
        return [invoice()]
      },
    }))
    expect(result).toHaveLength(1)
    expect(result[0].phase).toBe('invoice_draft')
  })
})

test.describe('Revenue Recovery Case — källkontrakt', () => {
  const loaderSource = readFileSync(path.join(ROOT, 'lib/value/load-revenue-recovery-cases.ts'), 'utf8')
  const routeSource = readFileSync(path.join(ROOT, 'app/api/revenue-recovery-cases/route.ts'), 'utf8')
  const cardSource = readFileSync(path.join(ROOT, 'components/jarvis/RevenueRecoveryCaseKort.tsx'), 'utf8')
  const homeSource = readFileSync(path.join(ROOT, 'components/jarvis/JarvisHome.tsx'), 'utf8')

  test('varje service-role-tabell är explicit tenantfiltrerad och varje error läses', () => {
    expect((loaderSource.match(/\.eq\('business_id', businessId\)/g) || []).length).toBe(4)
    for (const table of ['pending_approvals', 'project', 'project_change', 'invoice']) {
      expect(loaderSource).toContain(`.from('${table}')`)
    }
    expect((loaderSource.match(/if \(error\) throw new Error/g) || []).length).toBe(4)
    expect(loaderSource).not.toContain('customer_id')
  })

  test('API:t kräver auth + owner/admin och är endast GET', () => {
    expect(routeSource).toContain('getAuthenticatedBusiness(request)')
    expect(routeSource).toContain('getCurrentUser(request, business.business_id)')
    expect(routeSource).toContain('isOwnerOrAdmin(currentUser)')
    expect(routeSource).not.toMatch(/export async function (POST|PUT|PATCH|DELETE)/)
  })

  test('kortet utför inget och blandar aldrig identifierat med fakturafacit', () => {
    expect(cardSource).not.toContain('<button')
    expect(cardSource).not.toContain('fetch(')
    expect(cardSource).toContain('Identifierat underlag:')
    expect(cardSource).toContain('Fakturans belopp:')
    expect(cardSource).not.toMatch(/identified_kr\s*\+\s*data\.invoice_total_kr/)
  })

  test('Jarvis monterar caset under Pengar just nu och prenumererar på sanningskällorna', () => {
    const moneyIndex = homeSource.indexOf('Pengar just nu')
    const cardIndex = homeSource.indexOf('<RevenueRecoveryCaseKort')
    expect(moneyIndex).toBeGreaterThan(-1)
    expect(cardIndex).toBeGreaterThan(moneyIndex)
    expect(homeSource).toContain("table: 'project_change'")
    expect(homeSource).toContain("table: 'project'")
    expect(homeSource).toContain("table: 'invoice'")
    expect(homeSource).toContain('res.status >= 500')
    expect(homeSource).toContain('Intäktskedjan kunde inte läsas')
  })
})
