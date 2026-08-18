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
import type { MissionFacit, AgentUtfall } from '../lib/mission/mission-facit'
import type { MandateRow } from '../lib/mandates/mission-mandate'
import type { MandateFacitResult } from '../lib/mandates/mandate-facit'
import type { MandateDraft } from '../components/mission/MissionPanel'

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

function contactMission(): { mission: MissionRow; progress: ReturnType<typeof byggMissionProgress> } {
  const mission: MissionRow = {
    id: 'mis_con123456789',
    business_id: 'biz_1',
    goal_kr: null,
    deadline: '2026-08-24',
    status: 'active',
    plan_snapshot: { steps: [] },
    portfolio_generated_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    resolved_at: null,
    goal_type: 'contact',
    goal_count: 5,
  }
  const progress = byggMissionProgress({
    mission,
    invoices: [],
    missionApprovals: [],
    quotes: [],
    nowMs: NOW.getTime(),
    contactOutcomes: [
      { customer_id: 'c1', executed_at: '2026-08-01T00:00:00Z', replied_within_window: true },
      { customer_id: 'c2', executed_at: '2026-08-01T00:00:00Z', replied_within_window: false },
    ],
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

  test('Etapp I: kontaktuppdrag renderar aldrig "kr kvar till målet" eller "timmar" — visar "N av M kontaktade"', () => {
    const { mission, progress } = contactMission()
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
    expect(markup).not.toContain('timmar kvar att boka')
    expect(markup).toContain('2 av 5 kontaktade')
    expect(markup).toContain('1 svar inom 7 dagar')
    expect(markup).toContain('Kontakta 5 kunder')
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
// Etapp H — team (per-agent), historik, lärdomar
// ─────────────────────────────────────────────────────────────────────────

function baseViewProps(mission: MissionRow, progress: ReturnType<typeof byggMissionProgress>) {
  return {
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
  }
}

function missionFacit(overrides: Partial<MissionFacit> = {}): MissionFacit {
  return {
    mission_id: 'mis_prev_1',
    goal_type: 'money',
    status: 'completed',
    headline: 'Frigöra 80 000 kr före 2026-07-01',
    deadline: '2026-07-01',
    resolved_at: '2026-06-20T00:00:00Z',
    slutgap_kr: 0,
    slutgap_hours: null,
    slutgap_count: null,
    verifierat_betalt_kr: 80000,
    learning_eligible: true,
    learning_blockers: [],
    per_agent: [],
    ...overrides,
  }
}

test.describe('MissionPanel.tsx — källskanning (Etapp H)', () => {
  test('importerar MissionFacit/AgentUtfall och LearningRow-typerna från lib/mission', () => {
    expect(panelSrc).toContain("from '@/lib/mission/mission-facit'")
    expect(panelSrc).toContain("from '@/lib/mission/mission-learning'")
  })

  test('innehåller sektionsrubrikerna "Teamet", "Tidigare uppdrag" och "Lärdomar"', () => {
    expect(panelSrc).toContain('Teamet')
    expect(panelSrc).toContain('Tidigare uppdrag')
    expect(panelSrc).toContain('Lärdomar')
  })

  test('fortfarande inget klassöverskridande summeringsord efter Etapp H:s tillägg', () => {
    const banned = [/\btotalt\b/i, /\bsammanlagt\b/i, /\bsumma\b/i, /reduce\(/]
    for (const pattern of banned) {
      expect(pattern.test(panelSrc), `MissionPanel.tsx innehåller "${pattern}"`).toBe(false)
    }
  })
})

test.describe('MissionPanelView — team (per-agent), Etapp H', () => {
  test('läser UTESLUTANDE AgentUtfall-fälten — ansvarar_steg kommer ALDRIG från plan_snapshot-stegen', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    // Planen (plan_snapshot) har 2 steg, men agentUtfall-facit påstår ett
    // ANNAT tal (5) — om renderingen läste plan_snapshot i stället för
    // agentUtfall-propen skulle "ansvarar 5 steg" aldrig synas.
    const agentUtfall: AgentUtfall[] = [
      { agent_key: 'karin', ansvarar_steg: 5, utforda: 3, vantar: 1, kunde_inte_verifieras: 2 },
    ]
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      agentUtfall,
    }))
    expect(markup).toContain('ansvarar 5 steg')
    expect(markup).toContain('3 utförda')
    expect(markup).toContain('1 väntar')
    expect(markup).toContain('2 kunde inte verifieras')
  })

  test('kunde_inte_verifieras utelämnas ur texten när den är 0', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const agentUtfall: AgentUtfall[] = [
      { agent_key: 'karin', ansvarar_steg: 1, utforda: 1, vantar: 0, kunde_inte_verifieras: 0 },
    ]
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      agentUtfall,
    }))
    expect(markup).not.toContain('kunde inte verifieras')
  })

  test('tom agentUtfall-lista → Teamet-sektionen renderas inte alls', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, baseViewProps(mission, progress)))
    expect(markup).not.toContain('Teamet')
  })
})

test.describe('MissionPanelView — historik, Etapp H', () => {
  test('statuschip Slutfört/Avbrutet/Utgånget renderas per rad, med rubrik och verifierat betalt', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const history: MissionFacit[] = [
      missionFacit({ mission_id: 'a', status: 'completed', headline: 'Frigöra 50 000 kr före 2026-05-01', slutgap_kr: 0, verifierat_betalt_kr: 50000 }),
      missionFacit({ mission_id: 'b', status: 'cancelled', headline: 'Frigöra 20 000 kr före 2026-04-01', slutgap_kr: 5000, verifierat_betalt_kr: 0, learning_eligible: false, learning_blockers: ['avbrutet uppdrag'] }),
      missionFacit({ mission_id: 'c', status: 'expired', headline: 'Frigöra 10 000 kr före 2026-03-01', slutgap_kr: 10000, verifierat_betalt_kr: 0, learning_eligible: false, learning_blockers: ['utgånget uppdrag'] }),
    ]
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      history,
    }))
    expect(markup).toContain('Slutfört')
    expect(markup).toContain('Avbrutet')
    expect(markup).toContain('Utgånget')
    expect(markup).toContain('Frigöra 50 000 kr före 2026-05-01')
    expect(markup).toContain('målet nått')
    expect(markup).toContain(`${(50000).toLocaleString('sv-SE')} kr verifierat betalt`)
    expect(markup).toContain(`${(5000).toLocaleString('sv-SE')} kr kvar`)
  })

  test('kapacitetsuppdrag i historiken visar aldrig pengaformuleringen "kr kvar" (aktivt uppdrag är också ett kapacitetsmål, så ingen sida av markupen kan läcka en penningsiffra)', () => {
    const { mission, progress } = capacityMission()
    const history: MissionFacit[] = [
      missionFacit({ mission_id: 'cap', goal_type: 'capacity', headline: 'Boka 8 timmar till vecka 30', slutgap_kr: null, slutgap_hours: 2, verifierat_betalt_kr: 0 }),
    ]
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      history,
    }))
    expect(markup).toContain('2 timmar kvar')
    expect(markup).not.toContain('kr kvar')
  })

  test('kontaktuppdrag i historiken (Etapp I) visar "N kontakter kvar"/"målet nått", aldrig "kr kvar"', () => {
    const { mission, progress } = contactMission()
    const history: MissionFacit[] = [
      missionFacit({ mission_id: 'con', goal_type: 'contact', headline: 'Kontakta 5 kunder före 2026-07-01', slutgap_kr: null, slutgap_count: 2, verifierat_betalt_kr: 0 }),
    ]
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      history,
    }))
    expect(markup).toContain('2 kontakter kvar')
    expect(markup).not.toContain('kr kvar')
  })

  test('tom historik-lista → "Tidigare uppdrag"-sektionen renderas inte', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, baseViewProps(mission, progress)))
    expect(markup).not.toContain('Tidigare uppdrag')
  })
})

test.describe('MissionPanelView — lärdomar, Etapp H', () => {
  test('forTidigt renderar "För tidigt att se mönster" med antalEligible', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      learning: { rows: [], forTidigt: true, antalEligible: 2 },
    }))
    expect(markup).toContain('För tidigt att se mönster — 2 genomförda uppdrag hittills.')
  })

  test('lärdomsrader renderar text OCH sin grund', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      learning: {
        rows: [{ text: '3 av 3 pengamål nådde målet före deadline', grund: '3 avslutade uppdrag' }],
        forTidigt: false,
        antalEligible: 3,
      },
    }))
    expect(markup).toContain('3 av 3 pengamål nådde målet före deadline')
    expect(markup).toContain('3 avslutade uppdrag')
  })

  test('learning === null (API:t har inte svarat/felade) → Lärdomar-sektionen renderas ALDRIG', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      learning: null,
    }))
    expect(markup).not.toContain('Lärdomar')
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

  test('MissionProvider exponerar mandate/mandateFacit (Etapp X)', () => {
    const src = read('lib/mission/MissionProvider.tsx')
    expect(src).toContain('mandate')
    expect(src).toContain('mandateFacit')
  })

  test('GET /api/mission/active svarar med mandate + mandateFacit i samma svar (ingen ny lazy-rutt)', () => {
    const src = read('app/api/mission/active/route.ts')
    expect(src).toContain('loadActiveMandateForMission')
    expect(src).toContain('loadMandateFacit')
    expect(src).toContain('mandate, mandateFacit')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Etapp X — Mission Mandates V1, ägarens upplevelse
// ─────────────────────────────────────────────────────────────────────────

function missionWithoutMandateEligibleSteps(): { mission: MissionRow; progress: ReturnType<typeof byggMissionProgress> } {
  const mission: MissionRow = {
    id: 'mis_nomandate',
    business_id: 'biz_1',
    goal_kr: 30000,
    deadline: '2026-09-30',
    status: 'active',
    plan_snapshot: {
      steps: [
        {
          item_id: 'pf_x',
          truth_class: 'faktureringsklart',
          title: 'Material ej fakturerat — Kök',
          measure: { kind: 'kr', amountKr: 30000 },
          evidence: { table: 'project', ref_id: 'proj_1' },
          agent_key: 'karin',
          approval_type: 'missad_intakt',
          motivation: '',
        },
      ],
    },
    portfolio_generated_at: NOW.toISOString(),
    created_at: NOW.toISOString(),
    resolved_at: null,
  }
  const progress = byggMissionProgress({ mission, invoices: [], missionApprovals: [], quotes: [], nowMs: NOW.getTime() })
  return { mission, progress }
}

function mandateRow(over: Partial<MandateRow> = {}): MandateRow {
  return {
    id: 'mnd_mis_abc123def456',
    business_id: 'biz_1',
    mission_id: 'mis_abc123def456',
    plan_hash: 'mndh_v1_abc',
    allowed_action_types: ['invoice_reminder'],
    targets: { invoice_ids: ['inv_1'] },
    daily_cap: 5,
    total_cap: 20,
    amount_cap_kr: null,
    expires_at: '2026-09-15',
    status: 'active',
    pause_reason: null,
    created_by: 'bu_1',
    created_at: '2026-08-01T00:00:00.000Z',
    revoked_at: null,
    paused_at: null,
    ...over,
  }
}

function mandateFacitResult(over: Partial<MandateFacitResult> = {}): MandateFacitResult {
  return {
    mandate_id: 'mnd_mis_abc123def456',
    per_type: [{ action_type: 'invoice_reminder', utforda: 4, leveransfel: 0, stopp_inom_7d: 0, ej_bedombart: 0 }],
    agaraterkallelse: false,
    pausorsaker: [],
    ...over,
  }
}

function mandateDraft(over: Partial<MandateDraft> = {}): MandateDraft {
  return {
    selectedTypes: ['invoice_reminder'],
    daily_cap: 2,
    total_cap: 2,
    amount_cap_kr: '',
    expires_at: '2026-09-30',
    ...over,
  }
}

test.describe('MissionPanel.tsx — källskanning (Etapp X)', () => {
  test('innehåller rubriken "Mandat" och knappen "Låt teamet genomföra inom mina gränser"', () => {
    expect(panelSrc).toContain('Mandat')
    expect(panelSrc).toContain('Låt teamet genomföra inom mina gränser')
  })

  test('den ALLTID-SYNLIGA "kräver alltid separat godkännande"-listan finns i källan', () => {
    expect(panelSrc).toContain('Kräver alltid separat godkännande')
    for (const item of ['Fakturaskapande', 'Prisändringar', 'ÄTA', 'Nya mottagare', 'Pengaförflyttningar']) {
      expect(panelSrc).toContain(item)
    }
  })

  test('"Återkalla mandatet" finns och är alltid nåbar (ingen villkorad bortgömning bakom en flagga i källan)', () => {
    expect(panelSrc).toContain('Återkalla mandatet')
  })

  test('kandidaterna härleds via den delade deriveMandateCandidates, byggs inte om lokalt', () => {
    expect(panelSrc).toContain("from '@/lib/mandates/create'")
    expect(panelSrc).toContain('deriveMandateCandidates(')
  })

  test('läser Swenska etiketter ur AUTONOMY_META, hårdkodar inte typ-namnen på nytt', () => {
    expect(panelSrc).toContain("from '@/lib/autonomy/earned-autonomy'")
    expect(panelSrc).toContain('AUTONOMY_META')
  })

  test('varken "Godkänn" eller "Avvisa" — mandatformuläret återanvänder inte approval-vokabulären', () => {
    expect(panelSrc).not.toContain('Godkänn')
    expect(panelSrc).not.toContain('Avvisa')
  })

  test('fortfarande inget klassöverskridande summeringsord efter Etapp X:s tillägg', () => {
    const banned = [/\btotalt\b/i, /\bsammanlagt\b/i, /\bsumma\b/i, /reduce\(/]
    for (const pattern of banned) {
      expect(pattern.test(panelSrc), `MissionPanel.tsx innehåller "${pattern}"`).toBe(false)
    }
  })
})

test.describe('MissionPanelView — Mandat, Etapp X', () => {
  test('planen har inga mandat-bara typer i planen → Mandat-sektionen renderas inte alls', () => {
    const { mission, progress } = missionWithoutMandateEligibleSteps()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, baseViewProps(mission, progress)))
    expect(markup).not.toContain('Mandat')
  })

  test('kandidater finns, inget mandat, formuläret stängt → knappen "Låt teamet genomföra inom mina gränser" visas, inte formuläret', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, baseViewProps(mission, progress)))
    expect(markup).toContain('Låt teamet genomföra inom mina gränser')
    expect(markup).not.toContain('Kräver alltid separat godkännande')
    expect(markup).not.toContain('Ge mandatet')
  })

  test('formuläret öppet → kryssrutor per kandidat-typ med planens egna mål-titlar, tak-fält och alltid-separat-listan', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandateFormOpen: true,
      mandateDraft: mandateDraft(),
    }))
    expect(markup).toContain('Andersson') // fakturans/steget titel (den namngivna målet, inte fritext)
    expect(markup).toContain('Kräver alltid separat godkännande')
    expect(markup).toContain('Ge mandatet')
  })

  test('aktivt mandat → gränssammanfattning + mätningen (utförda/leveransfel/STOPP) + Återkalla-knapp', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandate: mandateRow(),
      mandateFacit: mandateFacitResult(),
    }))
    expect(markup).toContain('4 utförda')
    expect(markup).toContain('0 leveransfel')
    expect(markup).toContain('0 STOPP inom 7 dagar')
    expect(markup).toContain('Återkalla mandatet')
    expect(markup).not.toContain('Låt teamet genomföra inom mina gränser')
  })

  test('beloppstak null → "standardtak gäller" (aldrig taklöst påstått)', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandate: mandateRow({ amount_cap_kr: null }),
      mandateFacit: mandateFacitResult(),
    }))
    expect(markup).toContain('standardtak gäller')
  })

  test('explicit beloppstak → beloppet visas, inte "standardtak gäller"', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandate: mandateRow({ amount_cap_kr: 15000 }),
      mandateFacit: mandateFacitResult(),
    }))
    expect(markup).toContain(`${(15000).toLocaleString('sv-SE')} kr`)
    expect(markup).not.toContain('standardtak gäller')
  })

  test('återkalla-bekräftelsen visar "Säker?" och Ja/Avbryt, samma idiom som avsluta-uppdraget-flödet', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandate: mandateRow(),
      mandateFacit: mandateFacitResult(),
      mandateConfirmRevoke: true,
    }))
    expect(markup).toContain('Säker?')
    expect(markup).toContain('Ja, återkalla')
    expect(markup).toContain('Avbryt')
  })

  test('pausat (leveransfel) → amber-banner på svenska + "Starta om mandatet"', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandate: mandateRow({ status: 'paused', pause_reason: 'delivery_failures' }),
      mandateFacit: mandateFacitResult(),
    }))
    expect(markup).toContain('leveransfel')
    expect(markup).toContain('Starta om mandatet')
  })

  test('pausat (plan_changed) → INGEN "Starta om"-knapp, texten pekar mot ett nytt mandat', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandate: mandateRow({ status: 'paused', pause_reason: 'plan_changed' }),
      mandateFacit: mandateFacitResult(),
    }))
    expect(markup).not.toContain('Starta om mandatet')
    expect(markup).toContain('nytt mandat')
  })

  test('återkallat mandat → notis + möjlighet att ge ett nytt mandat, mätningen finns kvar', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandate: mandateRow({ status: 'revoked', revoked_at: '2026-08-18T00:00:00.000Z' }),
      mandateFacit: mandateFacitResult({ agaraterkallelse: true }),
    }))
    expect(markup).toContain('4 utförda')
    expect(markup).not.toContain('Återkalla mandatet')
  })

  test('mandateError sätter en synlig felrad', () => {
    const { mission, progress } = moneyMissionWithTwoKrClasses()
    const markup = renderToStaticMarkup(createElement(MissionPanelView, {
      ...baseViewProps(mission, progress),
      mandateFormOpen: true,
      mandateDraft: mandateDraft(),
      mandateError: 'Sista giltighetsdag kan inte vara efter uppdragets deadline.',
    }))
    expect(markup).toContain('Sista giltighetsdag kan inte vara efter uppdragets deadline.')
  })
})
