/**
 * FACIT — components/mission/MissionPanel.tsx (Goal-to-Plan V2, Etapp G:
 * expansionspanelen, tasks/jaunty-pondering-hummingbird.md).
 *
 * Tre delar:
 *  1. Källskanning: footer-etiketterna, den delade groupStepsByClass/
 *     progressParts-återanvändningen, inget klassöverskridande
 *     summeringsord, det tvåstegs-bekräftade "Säker?"-läget.
 *  2. Renderingsfacit (MissionPanelView, samma renderToStaticMarkup-idiom
 *     som tests/mission-plan-card.spec.ts): två kr-klasser (40 000 +
 *     32 000) visar aldrig en hopslagen "72 000"; ett kapacitetsuppdrag
 *     visar aldrig pengaformuleringen "kr kvar till målet".
 *  3. Integrationspunkter: layout.tsx monterar panelen, MissionProvider
 *     exponerar panelOpen/setPanelOpen.
 *
 * Körs: npx playwright test tests/mission-panel.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MissionPanelView } from '../components/mission/MissionPanel'
import { byggMissionProgress, type MissionRow } from '../lib/mission/mission-progress'
import { assembleOpportunityPortfolio } from '../lib/mission/opportunity-portfolio'
import { validateMissionPlan, type MissionPlanInput } from '../lib/mission/plan-validation'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const NOW = new Date('2026-08-17T12:00:00Z')

const panelSrc = read('components/mission/MissionPanel.tsx')

// ─────────────────────────────────────────────────────────────────────────
// 1. Källskanning
// ─────────────────────────────────────────────────────────────────────────

test.describe('MissionPanel.tsx — källskanning', () => {
  test('innehåller "Fråga Matte" och "Avsluta uppdraget"', () => {
    expect(panelSrc).toContain('Fråga Matte')
    expect(panelSrc).toContain('Avsluta uppdraget')
  })

  test('återanvänder groupStepsByClass och progressParts — bygger inte om dem lokalt', () => {
    expect(panelSrc).toContain("import { groupStepsByClass } from '@/lib/mission/plan-contract-view'")
    expect(panelSrc).toContain("import { progressParts } from '@/lib/mission/progress-parts'")
  })

  test('inget klassöverskridande summeringsord ("totalt"/"sammanlagt"/"summa"/reduce()', () => {
    // Ordgräns, inte ren substräng: filen importerar legitimt från
    // lib/mission/mission-summary.ts (buildMissionHeadline), och "summary"
    // innehåller bokstäverna "summa" utan att vara ordet. Samma skäl som
    // MissionPlanCard.tsx/plan-contract-view.ts medvetet undviker ordet
    // "summa" i sin egen prosa (tests/mission-plan-card.spec.ts) — annars
    // biter vakten sig själv i svansen.
    const banned = [/\btotalt\b/i, /\bsammanlagt\b/i, /\bsumma\b/i, /reduce\(/]
    for (const pattern of banned) {
      expect(pattern.test(panelSrc), `MissionPanel.tsx innehåller "${pattern}"`).toBe(false)
    }
  })

  test('tvåstegs-bekräftelsen finns ("Säker?" innan avslut/klarmarkering körs)', () => {
    expect(panelSrc).toContain('Säker?')
  })

  test('"Markera klart" finns för gap-stängt läge', () => {
    expect(panelSrc).toContain('Markera klart')
  })

  test('länkar besluten till /dashboard/approvals — ingen egen godkänn/avvisa-mekanism', () => {
    expect(panelSrc).toContain('/dashboard/approvals')
    expect(panelSrc).not.toContain('Godkänn')
    expect(panelSrc).not.toContain('Avvisa')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. Renderingsfacit
// ─────────────────────────────────────────────────────────────────────────

const NOOP = () => {}
// AgentAvatar.tsx (som de flesta 'use client'-komponenter i kodbasen) saknar
// components/agents/MissionPlanCard.tsx:s @jsxImportSource-fix och går inte
// att renderToStaticMarkup:a direkt i Node (verifierat isolerat) — se
// defaultAgentChip-kommentaren i components/mission/MissionPanel.tsx. Testen
// injicerar en trivial stubb via renderAgentChip i stället; produktionsvägen
// (MissionPanel, ingen prop skickad) använder oförändrat den äkta avataren.
const NOOP_CHIP = () => null

function moneyMissionWithTwoKrClasses(): { mission: MissionRow; progress: ReturnType<typeof byggMissionProgress> } {
  const portfolio = assembleOpportunityPortfolio({
    overdueInvoices: [
      { invoice_id: 'inv_1', invoice_number: '2024-118', total: 40000, customer_name: 'Andersson' },
    ],
    missedRevenue: [
      {
        kind: 'material_ej_fakturerat',
        projectId: 'proj_1',
        projectName: 'Kök',
        amountKr: 32000,
        sourceAmountKr: 32000,
        confidence: 'LIKELY_UNBILLED',
        action: 'REVIEW_ONLY',
        sourceIds: ['mat_1'],
        evidence: 'test',
        dedupeKey: 'material:proj_1',
      },
    ],
    staleQuotes: [],
    quietGroups: [],
    marginWarnings: [],
  }, NOW)

  const plan: MissionPlanInput = {
    goal_kr: 100000,
    deadline: '2026-09-30',
    steps: [
      { item_id: portfolio.by_class.indrivningsbart[0].id, motivation: 'Förfallet, drivs in' },
      { item_id: portfolio.by_class.faktureringsklart[0].id, motivation: 'Klart att fakturera' },
    ],
  }
  const res = validateMissionPlan(plan, portfolio, NOW)
  if (!res.ok) throw new Error(`förutsättning brast: ${res.detail}`)

  const mission: MissionRow = {
    id: 'mis_abc123def456',
    business_id: 'biz_1',
    goal_kr: plan.goal_kr!,
    deadline: plan.deadline,
    status: 'active',
    plan_snapshot: { steps: res.steps },
    portfolio_generated_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    resolved_at: null,
  }
  const progress = byggMissionProgress({
    mission,
    invoices: [],
    missionApprovals: [],
    quotes: [],
    nowMs: NOW.getTime(),
  })
  return { mission, progress }
}

function capacityMission(): { mission: MissionRow; progress: ReturnType<typeof byggMissionProgress> } {
  const mission: MissionRow = {
    id: 'mis_cap123456789',
    business_id: 'biz_1',
    goal_kr: null,
    deadline: '2026-08-24',
    status: 'active',
    plan_snapshot: { steps: [] },
    portfolio_generated_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    resolved_at: null,
    goal_type: 'capacity',
    goal_hours: 12,
  }
  const progress = byggMissionProgress({
    mission,
    invoices: [],
    missionApprovals: [],
    quotes: [],
    nowMs: NOW.getTime(),
    capacityWeek: { bookedHours: 5, configured: true },
  })
  return { mission, progress }
}

test.describe('MissionPanelView — rendering', () => {
  test('två kr-klasser (40 000 + 32 000) visar båda beloppen, aldrig en hopslagen "72 000"', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      mission,
      progress,
      decisions: [],
      confirmAction: null,
      resolving: false,
      onClose: NOOP,
      onFragaMatte: NOOP,
      onRequestConfirm: NOOP,
      onCancelConfirm: NOOP,
      onConfirmResolve: NOOP,
      renderAgentChip: NOOP_CHIP,
    }))
    expect(markup).toContain(`${(40000).toLocaleString('sv-SE')} kr`)
    expect(markup).toContain(`${(32000).toLocaleString('sv-SE')} kr`)
    expect(markup).not.toContain(`${(72000).toLocaleString('sv-SE')}`)
  })

  test('kapacitetsuppdrag renderar aldrig pengaformuleringen "kr kvar till målet"', () => {
    const { mission, progress } = capacityMission()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      mission,
      progress,
      decisions: [],
      confirmAction: null,
      resolving: false,
      onClose: NOOP,
      onFragaMatte: NOOP,
      onRequestConfirm: NOOP,
      onCancelConfirm: NOOP,
      onConfirmResolve: NOOP,
      renderAgentChip: NOOP_CHIP,
    }))
    expect(markup).not.toContain('kr kvar till målet')
    expect(markup).toContain('timmar kvar att boka')
  })

  test('beslut renderas som länkar till /dashboard/approvals med titeln synlig', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      mission,
      progress,
      decisions: [{ id: 'pa_1', title: 'Skicka påminnelse till Andersson', status: 'pending', approval_type: 'invoice_reminder' }],
      confirmAction: null,
      resolving: false,
      onClose: NOOP,
      onFragaMatte: NOOP,
      onRequestConfirm: NOOP,
      onCancelConfirm: NOOP,
      onConfirmResolve: NOOP,
      renderAgentChip: NOOP_CHIP,
    }))
    expect(markup).toContain('Skicka påminnelse till Andersson')
    expect(markup).toContain('/dashboard/approvals')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. Integrationspunkter
// ─────────────────────────────────────────────────────────────────────────

test.describe('Integrationspunkter', () => {
  test('app/dashboard/layout.tsx importerar och monterar <MissionPanel />', () => {
    const src = read('app/dashboard/layout.tsx')
    expect(src).toContain("import { MissionPanel } from '@/components/mission/MissionPanel'")
    expect(src).toContain('<MissionPanel />')
  })

  test('MissionProvider exponerar panelOpen/setPanelOpen', () => {
    const src = read('lib/mission/MissionProvider.tsx')
    expect(src).toContain('panelOpen')
    expect(src).toContain('setPanelOpen')
  })
})
