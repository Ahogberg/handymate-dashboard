import fs from 'node:fs'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import {
  deriveCloseoutCandidate,
  type CloseoutCandidateInput,
} from '../lib/agents/lars/closeout-copilot'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')
const NOW = new Date('2026-08-16T12:00:00.000Z')

function facts(overrides: Partial<CloseoutCandidateInput> = {}): CloseoutCandidateInput {
  return {
    project: {
      project_id: 'proj_123',
      name: 'Badrum Andersson',
      status: 'active',
      end_date: '2026-08-15',
      progress_percent: 80,
      quote_id: 'quote_123',
      job_type: 'badrum',
    },
    bookings: [
      { project_id: 'proj_123', scheduled_start: '2026-08-14T07:00:00.000Z', job_status: 'completed' },
      { project_id: 'proj_123', scheduled_start: '2026-08-15T07:00:00.000Z', job_status: 'completed' },
    ],
    milestones: [
      { project_id: 'proj_123', status: 'completed' },
    ],
    sources: {
      time_entries: 3,
      project_materials: 1,
      supplier_invoices: 0,
      project_costs: 0,
    },
    has_pending_close_approval: false,
    ...overrides,
  }
}

test.describe('Project Closeout Copilot — Lars sanningsgräns', () => {
  test('alla arbetstillfällen klara utan framtida bokning ger starkt granskningsförslag', () => {
    const candidate = deriveCloseoutCandidate(facts(), NOW)

    expect(candidate).toMatchObject({
      project_id: 'proj_123',
      project_name: 'Badrum Andersson',
      confidence: 'strong',
      learning_gaps: [],
      target_route: '/dashboard/projects/proj_123',
    })
    expect(candidate?.evidence).toContain('inget mer är planerat')
  })

  test('framtida arbete blockerar förslaget även om tidigare bokningar är klara', () => {
    const candidate = deriveCloseoutCandidate(facts({
      bookings: [
        ...facts().bookings,
        { project_id: 'proj_123', scheduled_start: '2026-08-20T07:00:00.000Z', job_status: 'scheduled' },
      ],
    }), NOW)

    expect(candidate).toBeNull()
  })

  test('passerat slutdatum ensamt får aldrig betyda klart', () => {
    const candidate = deriveCloseoutCandidate(facts({
      bookings: [],
      milestones: [],
      project: { ...facts().project, progress_percent: 70 },
    }), NOW)

    expect(candidate).toBeNull()
  })

  test('100 procent är en granskningssignal men aldrig starkt bevis', () => {
    const candidate = deriveCloseoutCandidate(facts({
      bookings: [],
      milestones: [],
      project: { ...facts().project, progress_percent: 100 },
    }), NOW)

    expect(candidate?.confidence).toBe('review')
    expect(candidate?.evidence).toContain('behöver din kontroll')
  })

  test('ett befintligt fyra-ögon-kort äger beslutet och dubbleras inte', () => {
    expect(deriveCloseoutCandidate(facts({ has_pending_close_approval: true }), NOW)).toBeNull()
  })

  test('dataluckor påverkar lärandet men påstås inte blockera avslut', () => {
    const candidate = deriveCloseoutCandidate(facts({
      project: { ...facts().project, quote_id: null, job_type: null },
      sources: { time_entries: 0, project_materials: 0, supplier_invoices: 0, project_costs: 0 },
    }), NOW)

    expect(candidate?.learning_gaps).toEqual([
      'kopplad offert',
      'jobbtyp',
      'rapporterad tid',
      'kostnadsunderlag',
    ])
    expect(candidate?.confidence).toBe('strong')
  })
})

test.describe('Project Closeout Copilot — ledningsdragning och säkerhet', () => {
  test('rutten autentiserar tenant och owner/admin före Lars-loadern', () => {
    const source = read('app/api/project-closeout-copilot/route.ts')
    const auth = source.indexOf('getAuthenticatedBusiness(request)')
    const user = source.indexOf('getCurrentUser(request, business.business_id)')
    const role = source.indexOf('isOwnerOrAdmin(currentUser)')
    const loader = source.indexOf('loadCloseoutCopilot(')

    expect(auth).toBeGreaterThan(-1)
    expect(user).toBeGreaterThan(auth)
    expect(role).toBeGreaterThan(user)
    expect(loader).toBeGreaterThan(role)
    expect(source).not.toMatch(/request\.(?:json|nextUrl\.searchParams)/)
  })

  test('varje service-role-källa är explicit tenantfiltrerad', () => {
    const source = read('lib/agents/lars/closeout-copilot.ts')
    for (const table of [
      'project',
      'booking',
      'project_milestone',
      'time_entry',
      'project_material',
      'supplier_invoices',
      'project_cost',
      'pending_approvals',
    ]) {
      const block = source.slice(source.indexOf(`.from('${table}')`), source.indexOf(`.from('${table}')`) + 320)
      expect(block, `${table} saknar business_id-filter`).toContain(".eq('business_id', businessId)")
    }
  })

  test('källfel blir otillgängligt, aldrig falskt tom lista', () => {
    const source = read('lib/agents/lars/closeout-copilot.ts')
    expect(source).toContain("available: false, reason: 'Projektunderlaget kunde inte läsas säkert.'")
    expect(source).toContain("available: false, reason: 'Avslutsunderlaget kunde inte verifieras.'")
  })

  test('Matte samordnar, Lars bedömer och CTA:n är endast en riktig projektlänk', () => {
    const card = read('components/jarvis/ProjectCloseoutCopilotCard.tsx')
    expect(card).toContain('agentKey="matte"')
    expect(card).toContain('agentKey="lars"')
    expect(card).toContain("agentIdentity('matte')")
    expect(card).toContain("agentIdentity('lars')")
    expect(card).toContain('{lars.shortVerb}')
    expect(card).toContain('href={candidate.target_route}')
    expect(card).toContain('Inget avslutas automatiskt')
    expect(card).not.toContain('completeProject')
    expect(card).not.toMatch(/fetch\(|axios|method:\s*['"]POST/)
  })

  test('hemskärmen monterar samma kort i beslutsytan', () => {
    const home = read('components/jarvis/JarvisHome.tsx')
    expect(home).toContain("fetch('/api/project-closeout-copilot'")
    expect(home).toContain('<ProjectCloseoutCopilotCard candidate={closeoutCandidates[0]} />')
    expect(home).toContain('(closeoutCandidates.length > 0 ? 1 : 0)')
  })

  test('ingen ny mutationsväg eller SQL införs', () => {
    const route = read('app/api/project-closeout-copilot/route.ts')
    const card = read('components/jarvis/ProjectCloseoutCopilotCard.tsx')
    expect(route).not.toMatch(/export async function (?:POST|PUT|PATCH|DELETE)/)
    expect(`${route}\n${card}`).not.toMatch(/\.insert\(|\.update\(|\.delete\(|\.rpc\(/)
  })
})
