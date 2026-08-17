/**
 * FACIT — lib/mission/opportunity-portfolio.ts (Goal-to-Plan V1, Etapp A,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Kärndisciplinen som låses här: fem sanningsklasser, var och en med sitt
 * eget mått, och INGET fält som slår ihop dem. En felande källa syns i
 * degraded_sources — den låtsas aldrig vara en tom möjlighetslista.
 *
 * Körs: npx playwright test tests/opportunity-portfolio.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  assembleOpportunityPortfolio,
  loadOpportunityPortfolio,
  TRUTH_CLASSES,
  type OpportunityPortfolio,
  type PortfolioAssemblyInput,
  type PortfolioRepository,
} from '../lib/mission/opportunity-portfolio'
import type { MissedRevenueFinding } from '../lib/value/missed-revenue'

const NOW = new Date('2026-08-17T12:00:00Z')

function tomInput(): PortfolioAssemblyInput {
  return {
    overdueInvoices: [],
    missedRevenue: [],
    staleQuotes: [],
    quietGroups: [],
    marginWarnings: [],
  }
}

function likelyFinding(overrides: Partial<MissedRevenueFinding> = {}): MissedRevenueFinding {
  return {
    kind: 'material_ej_fakturerat',
    projectId: 'proj_1',
    projectName: 'Badrum Andersson',
    amountKr: 12500,
    sourceAmountKr: 12500,
    confidence: 'LIKELY_UNBILLED',
    action: 'REVIEW_ONLY',
    sourceIds: ['mat_1'],
    evidence: 'Material är markerat ofakturerat på ett avslutat projekt',
    dedupeKey: 'material:proj_1',
    ...overrides,
  }
}

function needsReviewFinding(overrides: Partial<MissedRevenueFinding> = {}): MissedRevenueFinding {
  return {
    kind: 'projekt_utan_faktura',
    projectId: 'proj_9',
    projectName: 'Altan Berg',
    amountKr: 0,
    sourceAmountKr: 0,
    confidence: 'NEEDS_REVIEW',
    action: 'REVIEW_ONLY',
    sourceIds: [],
    evidence: 'Avslutat men ingen faktura finns',
    dedupeKey: 'projekt:proj_9',
    ...overrides,
  }
}

function fullInput(): PortfolioAssemblyInput {
  return {
    overdueInvoices: [
      { invoice_id: 'inv_1', invoice_number: '2024-118', total: 40000, customer_name: 'Andersson' },
    ],
    missedRevenue: [likelyFinding()],
    staleQuotes: [
      { quote_id: 'q_1', quote_number: 'OFF-42', total: 55000, customer_name: 'Svensson' },
    ],
    quietGroups: [{ job_type: 'badrum', count: 7 }],
    marginWarnings: [
      { project_id: 'proj_5', project_name: 'Kök Nilsson', projected_overrun: 9250, status: 'at_risk' },
    ],
  }
}

test.describe('assembleOpportunityPortfolio — klassrutt per källa', () => {
  test('varje källa hamnar i sin sanningsklass med rätt agent och kortkoppling', () => {
    const p = assembleOpportunityPortfolio(fullInput(), NOW)

    expect(p.by_class.indrivningsbart).toHaveLength(1)
    const indriv = p.by_class.indrivningsbart[0]
    expect(indriv.measure).toEqual({ kind: 'kr', amountKr: 40000 })
    expect(indriv.agent_key).toBe('karin')
    expect(indriv.approval_type).toBe('invoice_reminder')
    expect(indriv.evidence).toEqual({ table: 'invoice', ref_id: 'inv_1' })
    expect(indriv.title).toContain('2024-118')

    expect(p.by_class.faktureringsklart).toHaveLength(1)
    const fakt = p.by_class.faktureringsklart[0]
    expect(fakt.measure).toEqual({ kind: 'kr', amountKr: 12500 })
    expect(fakt.evidence).toEqual({ table: 'project', ref_id: 'proj_1' })

    expect(p.by_class.pipeline).toHaveLength(1)
    const pipe = p.by_class.pipeline[0]
    expect(pipe.measure).toEqual({ kind: 'kr', amountKr: 55000 })
    expect(pipe.agent_key).toBe('daniel')
    expect(pipe.evidence).toEqual({ table: 'quotes', ref_id: 'q_1' })

    expect(p.by_class.ateraktivering).toHaveLength(1)
    const ater = p.by_class.ateraktivering[0]
    expect(ater.measure).toEqual({ kind: 'count', count: 7 })
    expect(ater.agent_key).toBe('hanna')
    expect(ater.approval_type).toBeNull()
    expect(ater.evidence).toEqual({ table: 'customer_group', ref_id: 'badrum' })

    expect(p.by_class.marginalskydd).toHaveLength(1)
    const marg = p.by_class.marginalskydd[0]
    expect(marg.measure).toEqual({ kind: 'kr', amountKr: 9250 })
    expect(marg.agent_key).toBe('lars')
    expect(marg.approval_type).toBe('profitability_warning')

    expect(p.generated_at).toBe(NOW.toISOString())
    expect(p.degraded_sources).toEqual([])
  })

  test('beloppet kommer ur radens verkliga värde, avrundat — aldrig något annat', () => {
    const input = tomInput()
    input.overdueInvoices = [
      { invoice_id: 'inv_2', invoice_number: null, total: 1234.56, customer_name: null },
    ]
    const p = assembleOpportunityPortfolio(input, NOW)
    expect(p.by_class.indrivningsbart[0].measure).toEqual({ kind: 'kr', amountKr: 1235 })
  })

  test('ÄTA-fynd ansvarsmappas till lars, övriga fakturafynd till karin', () => {
    const input = tomInput()
    input.missedRevenue = [
      likelyFinding({ kind: 'ata_ej_fakturerad', dedupeKey: 'ata:ata_1', sourceIds: ['ata_1'] }),
      likelyFinding({ kind: 'material_ej_fakturerat', projectId: 'proj_2', dedupeKey: 'material:proj_2' }),
    ]
    const p = assembleOpportunityPortfolio(input, NOW)
    const byRef = new Map(p.by_class.faktureringsklart.map(i => [i.evidence.ref_id, i.agent_key]))
    expect(byRef.get('proj_1')).toBe('lars')   // ÄTA-fyndet (projektändring — Lars domän)
    expect(byRef.get('proj_2')).toBe('karin')  // materialfyndet (fakturering — Karins domän)
  })
})

test.describe('NEEDS_REVIEW — antal, aldrig kronor', () => {
  test('NEEDS_REVIEW-fynd blir ETT antalsmätt granskningsitem', () => {
    const input = tomInput()
    input.missedRevenue = [
      needsReviewFinding(),
      needsReviewFinding({ projectId: 'proj_10', dedupeKey: 'projekt:proj_10' }),
      likelyFinding(),
    ]
    const p = assembleOpportunityPortfolio(input, NOW)
    const countItems = p.by_class.faktureringsklart.filter(i => i.measure.kind === 'count')
    expect(countItems).toHaveLength(1)
    expect(countItems[0].measure).toEqual({ kind: 'count', count: 2 })
    // Det bekräftade fyndet finns kvar som kr-item bredvid.
    const krItems = p.by_class.faktureringsklart.filter(i => i.measure.kind === 'kr')
    expect(krItems).toHaveLength(1)
  })

  test('ett NEEDS_REVIEW-fynd med nominellt källbelopp får ALDRIG kind kr', () => {
    const input = tomInput()
    input.missedRevenue = [
      needsReviewFinding({ kind: 'ata_ej_fakturerad', amountKr: 0, sourceAmountKr: 25000, dedupeKey: 'ata:ata_9' }),
    ]
    const p = assembleOpportunityPortfolio(input, NOW)
    for (const item of p.by_class.faktureringsklart) {
      expect(item.measure.kind).toBe('count')
    }
  })
})

test.describe('återaktivering — alltid antal', () => {
  test('en tyst kundgrupp har aldrig kind kr, oavsett storlek', () => {
    const input = tomInput()
    input.quietGroups = [
      { job_type: 'badrum', count: 12 },
      { job_type: 'kök', count: 5 },
    ]
    const p = assembleOpportunityPortfolio(input, NOW)
    expect(p.by_class.ateraktivering).toHaveLength(2)
    for (const item of p.by_class.ateraktivering) {
      expect(item.measure.kind).toBe('count')
      expect(item.approval_type).toBeNull()
    }
  })
})

test.describe('marginalskydd — skyddade kronor, annars antal', () => {
  test('projected_overrun saknas/0 → antalsmätt item i stället för kr', () => {
    const input = tomInput()
    input.marginWarnings = [
      { project_id: 'proj_6', project_name: null, projected_overrun: null, status: 'over_budget' },
      { project_id: 'proj_7', project_name: 'Tak Ek', projected_overrun: 0, status: 'at_risk' },
    ]
    const p = assembleOpportunityPortfolio(input, NOW)
    expect(p.by_class.marginalskydd).toHaveLength(2)
    for (const item of p.by_class.marginalskydd) {
      expect(item.measure).toEqual({ kind: 'count', count: 1 })
    }
  })
})

test.describe('formen — alla klasser alltid närvarande, stabila id:n', () => {
  test('varje klassnyckel finns även när allt är tomt', () => {
    const p = assembleOpportunityPortfolio(tomInput(), NOW)
    for (const cls of TRUTH_CLASSES) {
      expect(Array.isArray(p.by_class[cls])).toBe(true)
      expect(p.by_class[cls]).toEqual([])
    }
  })

  test('samma indata två gånger → exakt samma id:n (stabil hash)', () => {
    const a = assembleOpportunityPortfolio(fullInput(), NOW)
    const b = assembleOpportunityPortfolio(fullInput(), new Date('2026-08-18T09:00:00Z'))
    for (const cls of TRUTH_CLASSES) {
      expect(a.by_class[cls].map(i => i.id)).toEqual(b.by_class[cls].map(i => i.id))
    }
  })

  test('id:t är pf_-prefixat och opåverkat av ORELATERADE källors innehåll', () => {
    const a = assembleOpportunityPortfolio(fullInput(), NOW)
    const utanOfferter = fullInput()
    utanOfferter.staleQuotes = []
    const b = assembleOpportunityPortfolio(utanOfferter, NOW)
    expect(a.by_class.indrivningsbart[0].id).toMatch(/^pf_[a-f0-9]{12}$/)
    expect(a.by_class.indrivningsbart[0].id).toBe(b.by_class.indrivningsbart[0].id)
  })

  test('två olika rader får två olika id:n', () => {
    const input = tomInput()
    input.overdueInvoices = [
      { invoice_id: 'inv_1', invoice_number: null, total: 100, customer_name: null },
      { invoice_id: 'inv_2', invoice_number: null, total: 100, customer_name: null },
    ]
    const p = assembleOpportunityPortfolio(input, NOW)
    const ids = p.by_class.indrivningsbart.map(i => i.id)
    expect(new Set(ids).size).toBe(2)
  })
})

test.describe('degraded_sources — en felande källa ser aldrig ut som en tom', () => {
  function stubRepo(overrides: Partial<PortfolioRepository> = {}): PortfolioRepository {
    return {
      listOverdueInvoices: async () => [
        { invoice_id: 'inv_1', invoice_number: '2024-118', total: 40000, customer_name: 'Andersson' },
      ],
      listMissedRevenue: async () => [likelyFinding()],
      listStaleQuotes: async () => [
        { quote_id: 'q_1', quote_number: null, total: 55000, customer_name: null },
      ],
      listQuietGroups: async () => [{ job_type: 'badrum', count: 7 }],
      listMarginWarnings: async () => [],
      ...overrides,
    }
  }

  test('källa som kastar → tom klass + namnet i degraded_sources, övriga intakta', async () => {
    const repo = stubRepo({
      listStaleQuotes: async () => { throw new Error('42P01: relation quotes does not exist') },
    })
    const p = await loadOpportunityPortfolio(repo, NOW)
    expect(p.by_class.pipeline).toEqual([])
    expect(p.degraded_sources).toContain('stale_quotes')
    expect(p.by_class.indrivningsbart).toHaveLength(1)
    expect(p.by_class.faktureringsklart.length).toBeGreaterThan(0)
    expect(p.by_class.ateraktivering).toHaveLength(1)
  })

  test('alla källor friska → degraded_sources tom', async () => {
    const p = await loadOpportunityPortfolio(stubRepo(), NOW)
    expect(p.degraded_sources).toEqual([])
  })

  test('flera felande källor listas var för sig', async () => {
    const repo = stubRepo({
      listOverdueInvoices: async () => { throw new Error('boom') },
      listQuietGroups: async () => { throw new Error('boom') },
    })
    const p = await loadOpportunityPortfolio(repo, NOW)
    expect(p.degraded_sources).toEqual(expect.arrayContaining(['overdue_invoices', 'quiet_groups']))
    expect(p.by_class.indrivningsbart).toEqual([])
    expect(p.by_class.ateraktivering).toEqual([])
  })
})

test.describe('inget klassöverskridande fält existerar', () => {
  test('portföljen bär inget hopslaget kronfält under något känt namn', () => {
    const p: OpportunityPortfolio = assembleOpportunityPortfolio(fullInput(), NOW)
    expect(typeof (p as any).totalKr).toBe('undefined')
    expect(typeof (p as any).total).toBe('undefined')
    expect(typeof (p as any).total_kr).toBe('undefined')
    expect(typeof (p as any).grandTotal).toBe('undefined')
    expect(typeof (p as any).summaKr).toBe('undefined')
    expect(typeof (p as any).sumKr).toBe('undefined')
  })
})
