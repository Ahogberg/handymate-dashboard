import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  kundReferensForApproval,
  hittaKundCase,
  type CustomerCaseResolvedApproval,
} from '../lib/jarvis/customer-case'

const ROOT = path.resolve(__dirname, '..')
const read = (relativePath: string) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')

const approval = (
  id: string,
  approvalType: string,
  customerId: string,
  extra: Partial<CustomerCaseResolvedApproval> = {},
): CustomerCaseResolvedApproval => ({
  id,
  approval_type: approvalType,
  title: `${approvalType} för kunden`,
  payload: {},
  package_data: null,
  customer_id: customerId,
  customer_name: 'Anna Andersson',
  ...extra,
})

test.describe('explicit kundresolver', () => {
  test('varje godkänd approval-typ har exakt en beslutad uppslagsväg', () => {
    expect(kundReferensForApproval({
      approval_type: 'quote_nudge', payload: { quote_id: 'quote-1' }, package_data: null,
    })).toEqual({ kind: 'quote', id: 'quote-1' })
    expect(kundReferensForApproval({
      approval_type: 'four_eyes_quote', payload: { quote_id: 'quote-2' }, package_data: null,
    })).toEqual({ kind: 'quote', id: 'quote-2' })
    expect(kundReferensForApproval({
      approval_type: 'invoice_reminder', payload: { invoice_id: 'invoice-1' }, package_data: null,
    })).toEqual({ kind: 'invoice', id: 'invoice-1' })
    expect(kundReferensForApproval({
      approval_type: 'review_auto_invoice', payload: { invoice_id: 'invoice-2' }, package_data: null,
    })).toEqual({ kind: 'invoice', id: 'invoice-2' })
    expect(kundReferensForApproval({
      approval_type: 'create_ata_draft', payload: { project_id: 'project-1' }, package_data: null,
    })).toEqual({ kind: 'project', id: 'project-1' })
    expect(kundReferensForApproval({
      approval_type: 'scheduled_review_request', payload: { customer_id: 'customer-1' }, package_data: null,
    })).toEqual({ kind: 'customer', id: 'customer-1' })
  })

  test('autopilot_package läser den riktiga kolumnen package_data, aldrig payload.package_data', () => {
    expect(kundReferensForApproval({
      approval_type: 'autopilot_package',
      payload: { package_data: { customer_id: 'fel-kund' } },
      package_data: { customer_id: 'rätt-kund' },
    })).toEqual({ kind: 'customer', id: 'rätt-kund' })
  })

  test('okänd typ eller saknad explicit nyckel hoppas över — ingen generell fallback', () => {
    expect(kundReferensForApproval({
      approval_type: 'unknown_type', payload: { customer_id: 'customer-1' }, package_data: null,
    })).toBeNull()
    expect(kundReferensForApproval({
      approval_type: 'quote_nudge', payload: { customer_id: 'customer-1' }, package_data: null,
    })).toBeNull()
  })
})

test.describe('kund-case', () => {
  test('kräver två distinkta approval_types, inte två rader eller agentnamn', () => {
    expect(hittaKundCase([
      approval('a1', 'quote_nudge', 'customer-1'),
      approval('a2', 'quote_nudge', 'customer-1'),
    ], new Set())).toEqual([])

    const cases = hittaKundCase([
      approval('a1', 'quote_nudge', 'customer-1'),
      approval('a2', 'invoice_reminder', 'customer-1'),
    ], new Set())
    expect(cases).toHaveLength(1)
    expect(cases[0].signals.map(signal => signal.approval_type)).toEqual([
      'quote_nudge', 'invoice_reminder',
    ])
  })

  test('projektägda approval-id:n exkluderas före tvåtypsgränsen', () => {
    const rows = [
      approval('project-owned', 'profitability_warning', 'customer-1'),
      approval('invoice', 'invoice_reminder', 'customer-1'),
    ]
    expect(hittaKundCase(rows, new Set(['project-owned']))).toEqual([])
  })

  test('kontaktvarningen kräver minst två olika kundriktade signaltyper', () => {
    const twoOutbound = hittaKundCase([
      approval('a1', 'quote_nudge', 'customer-1'),
      approval('a2', 'invoice_reminder', 'customer-1'),
    ], new Set())
    expect(twoOutbound[0].communication_overlap).toBe(true)

    const oneOutbound = hittaKundCase([
      approval('a1', 'quote_nudge', 'customer-1'),
      approval('a2', 'profitability_warning', 'customer-1'),
    ], new Set())
    expect(oneOutbound[0].communication_overlap).toBe(false)
  })

  test('signalen behåller producentens explicita agentmetadata', () => {
    const cases = hittaKundCase([
      approval('a1', 'warranty_followup', 'customer-1', { payload: { agent: 'hanna' } }),
      approval('a2', 'invoice_reminder', 'customer-1'),
    ], new Set())
    expect(cases[0].signals[0].agentId).toBe('hanna')
  })
})

test.describe('route- och UI-kontrakt', () => {
  test('routen är autentiserad, behörighetsfiltrerad och alla entitetsuppslag är tenantfiltrerade', () => {
    const route = read('app/api/customer-cases/route.ts')
    expect(route).toContain('getAuthenticatedBusiness(request)')
    expect(route).toContain('getCurrentUser(request, business.business_id)')
    expect(route).toContain('canActOnApproval')
    expect(route).toContain(".from('pending_approvals')")
    expect(route).toContain(".from('quotes')")
    expect(route).toContain(".from('invoice')")
    expect(route).toContain(".from('project')")
    expect(route).toContain(".from('customer')")
    expect((route.match(/\.eq\('business_id', business\.business_id\)/g) || []).length).toBeGreaterThanOrEqual(5)
    expect(route).toContain('if (lookup.error) throw lookup.error')
    expect(route).not.toMatch(/\.insert\(|\.update\(|\.delete\(/)
  })

  test('projekt-case räknas först och dess signal-id:n äger över kund-caset', () => {
    const route = read('app/api/customer-cases/route.ts')
    const projects = route.indexOf('hittaProjektCase(permittedRows)')
    const owned = route.indexOf('projectOwnedApprovalIds')
    const customers = route.indexOf('hittaKundCase(resolvedRows, projectOwnedApprovalIds)')
    expect(projects).toBeGreaterThan(-1)
    expect(owned).toBeGreaterThan(projects)
    expect(customers).toBeGreaterThan(owned)
  })

  test('kortet har bara sammanfattning och länk — aldrig egna beslutsknappar', () => {
    const card = read('components/jarvis/KundCaseKort.tsx')
    expect(card).toContain('Samordna kontakten')
    expect(card).toContain('/dashboard/customers/')
    expect(card).not.toContain('onApprove')
    expect(card).not.toContain('onReject')
    expect(card).not.toContain('<button')
  })

  test('Jarvis hämtar och visar kund-case vid projekt-case, före NBA', () => {
    const home = read('components/jarvis/JarvisHome.tsx')
    expect(home).toContain("fetch('/api/customer-cases'")
    expect(home).toContain('<KundCaseKort')
    expect(home.indexOf('<KundCaseKort')).toBeLessThan(home.indexOf('<GorDettaForst'))
    expect(home).toContain("new Set(c.signals.map(s => s.approval_type)).size >= 2")
  })
})
