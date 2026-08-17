/**
 * VAKTPOST — källskanning av lib/mission/* (Goal-to-Plan V1, Etapp A).
 *
 * Sanningsklasserna får ALDRIG slås ihop till en klassöverskridande siffra.
 * Typerna saknar fältet (typnivå-testerna nedan), och den här skanningen
 * hindrar att någon i framtiden smyger in ett hopslaget fält under de kända
 * namnen i just de här filerna. Samma mönster som källskanningsblocket i
 * tests/facit-document-scale.spec.ts.
 *
 * Körs: npx playwright test tests/mission-truth-guard.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { assembleOpportunityPortfolio, type OpportunityPortfolio } from '../lib/mission/opportunity-portfolio'
import { byggMissionProgress, type MissionProgress } from '../lib/mission/mission-progress'

const MISSION_FILES = [
  'opportunity-portfolio.ts',
  'plan-validation.ts',
  'mission-presentation.ts',
  'mission-progress.ts',
  'contact-outcomes.ts',
  'mission-outreach.ts',
]

// De hopslagna kronfältens kända namn. (Skrivs bara HÄR — implementations-
// filerna beskriver konceptet utan att stava namnen, annars fastnar de i sin
// egen fälla — det har hänt två gånger förr i kodbasen.)
const BANNED_IDENTIFIERS = ['totalKr', 'grandTotal', 'total_kr']

test.describe('källskanning — lib/mission/* innehåller inga hopslagna kronfält', () => {
  for (const file of MISSION_FILES) {
    test(`${file} är fri från bannade identifierare`, () => {
      const src = fs.readFileSync(
        path.join(__dirname, '..', 'lib', 'mission', file),
        'utf8',
      )
      for (const banned of BANNED_IDENTIFIERS) {
        expect(src.includes(banned), `${file} innehåller "${banned}"`).toBe(false)
      }
    })
  }
})

test.describe('Etapp F (kapacitetsmål) — timmar och kronor konverteras aldrig till varandra', () => {
  const missionDir = path.join(__dirname, '..', 'lib', 'mission')
  const files = fs.readdirSync(missionDir).filter(f => f.endsWith('.ts'))

  // Om en kr↔timmar-omvandling (t.ex. ett timpris) någonsin smyger sig in i
  // lib/mission/* har någon börjat räkna om ett kapacitetsmål till pengar
  // eller vice versa — exakt den klassblandning Etapp F:s design uttryckligen
  // förbjuder (Design-avsnittet i tasks/jaunty-pondering-hummingbird.md:
  // "Money and hours are NEVER mixed in one figure"). Etapp I (kontaktmål)
  // utökar samma förbud till antal↔kronor/timmar — ett kontaktmål mäter
  // ENDAST distinkta kunder, aldrig ett uppskattat värde per kontakt.
  const CONVERSION_IDENTIFIERS = [
    'hourly_rate', 'hourlyrate', 'timpris', 'kr_per_timme', 'kronorPerTimme',
    'kr_per_kontakt', 'kronor_per_kontakt', 'kontaktvarde', 'value_per_contact', 'per_contact_kr',
  ]

  for (const file of files) {
    test(`${file} innehåller ingen kr↔timmar-omvandling`, () => {
      const src = fs.readFileSync(path.join(missionDir, file), 'utf8').toLowerCase()
      for (const banned of CONVERSION_IDENTIFIERS) {
        expect(src.includes(banned.toLowerCase()), `${file} innehåller "${banned}"`).toBe(false)
      }
    })
  }
})

test.describe('typnivå — kontrakten exponerar inget hopslaget fält', () => {
  test('OpportunityPortfolio saknar total-fält (kompilatorbevis + runtime)', () => {
    const portfolio: OpportunityPortfolio = assembleOpportunityPortfolio({
      overdueInvoices: [],
      missedRevenue: [],
      staleQuotes: [],
      quietGroups: [],
      marginWarnings: [],
    }, new Date('2026-08-17T12:00:00Z'))

    // @ts-expect-error — fältet existerar inte i typen, och ska aldrig göra det
    void portfolio.total
    // @ts-expect-error — inte under det här namnet heller
    void portfolio.totalKr

    expect(typeof (portfolio as any).total).toBe('undefined')
    expect(typeof (portfolio as any).totalKr).toBe('undefined')
  })

  test('MissionProgress saknar total-fält (kompilatorbevis + runtime)', () => {
    const progress: MissionProgress = byggMissionProgress({
      mission: {
        id: 'mis_abc123def456',
        business_id: 'biz_1',
        goal_kr: 100000,
        deadline: '2026-09-30',
        status: 'active',
        plan_snapshot: { steps: [] },
        portfolio_generated_at: '2026-08-01T00:00:00Z',
        created_at: '2026-08-01T00:00:00Z',
        resolved_at: null,
      },
      invoices: [],
      missionApprovals: [],
      quotes: [],
      nowMs: Date.parse('2026-08-20T12:00:00Z'),
    })

    // @ts-expect-error — fältet existerar inte i typen, och ska aldrig göra det
    void progress.total
    // @ts-expect-error — inte under det här namnet heller
    void progress.totalKr

    expect(typeof (progress as any).total).toBe('undefined')
    expect(typeof (progress as any).totalKr).toBe('undefined')
  })
})
