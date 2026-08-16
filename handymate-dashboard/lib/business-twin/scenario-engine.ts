/**
 * Business Twin Scenario Engine V1 — ren, deterministisk matematik.
 *
 * Modellen väljer scenario och argument. Den räknar aldrig. Alla tal i
 * kortet byggs här ur namngivna källor och användarens uttryckliga antaganden.
 */

import type { RadarWeek } from '@/lib/cash-radar'
import type { ProjectEconomics } from '@/lib/projects/compute-economics'
import { computeRevenuePace } from '@/lib/economy/revenue-pace'
import type {
  BusinessScenarioKind,
  BusinessScenarioResult,
  ScenarioMetric,
} from './scenario-contract'

const VERSION = 1 as const

function roundKr(value: number): number {
  return Math.round(value)
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function metric(input: Omit<ScenarioMetric, 'delta'>): ScenarioMetric {
  return { ...input, delta: round1(input.scenario - input.baseline) }
}

export function buildBlockedBusinessScenario(input: {
  kind: BusinessScenarioKind
  title: string
  subject: string
  reason: string
  assumptions?: string[]
  target?: { label: string; href: string }
  nowIso: string
}): BusinessScenarioResult {
  return {
    version: VERSION,
    kind: input.kind,
    status: 'blocked',
    confidence: 'blocked',
    title: input.title,
    subject: input.subject,
    summary: input.reason,
    primaryMetricKey: null,
    metrics: [],
    assumptions: input.assumptions ?? [],
    evidence: [],
    recommendation: 'Komplettera underlaget och kör scenariot igen.',
    ...(input.target ? { target: input.target } : {}),
    generatedAt: input.nowIso,
  }
}

export interface ProjectMarginScenarioInput {
  projectId: string
  projectName: string
  economics: ProjectEconomics
  extraHours: number
  materialCostChangePct: number
  additionalRevenueKr: number
  explicitMarginTargetPct: number | null
  nowIso: string
}

export function simulateProjectMargin(input: ProjectMarginScenarioInput): BusinessScenarioResult {
  const title = 'Om jobbet förändras'
  const target = { label: 'Öppna projektet', href: `/dashboard/projects/${input.projectId}` }
  const extraHours = Number(input.extraHours)
  const materialPct = Number(input.materialCostChangePct)
  const additionalRevenue = Number(input.additionalRevenueKr)

  if (![extraHours, materialPct, additionalRevenue].every(Number.isFinite)) {
    return buildBlockedBusinessScenario({ kind: 'project_margin', title, subject: input.projectName, reason: 'Scenariot innehåller ett ogiltigt tal.', target, nowIso: input.nowIso })
  }
  if (extraHours < 0 || extraHours > 1000 || materialPct < -100 || materialPct > 500 || Math.abs(additionalRevenue) > 10_000_000) {
    return buildBlockedBusinessScenario({ kind: 'project_margin', title, subject: input.projectName, reason: 'Scenariot ligger utanför säkra beräkningsgränser.', target, nowIso: input.nowIso })
  }
  if (extraHours === 0 && materialPct === 0 && additionalRevenue === 0) {
    return buildBlockedBusinessScenario({ kind: 'project_margin', title, subject: input.projectName, reason: 'Ange extra timmar, materialförändring eller ändrad intäkt.', target, nowIso: input.nowIso })
  }

  const e = input.economics
  if (e.kostnader.total_kr == null || !e.marginal.arbetskostnad_konfigurerad) {
    return buildBlockedBusinessScenario({
      kind: 'project_margin', title, subject: input.projectName,
      reason: 'Intern timkostnad saknas för minst en tidrad. Då går det inte att räkna en trovärdig marginal.',
      target, nowIso: input.nowIso,
    })
  }
  if (e.meta.supplier_invoice_count > 0 && e.meta.project_material_count > 0) {
    return buildBlockedBusinessScenario({
      kind: 'project_margin', title, subject: input.projectName,
      reason: 'Projektet har både leverantörsfakturor och manuella materialrader. Samma inköp kan vara dubbelräknat, så marginalscenariot stoppas.',
      target, nowIso: input.nowIso,
    })
  }

  const actualHours = e.kostnader.arbete_timmar
  const laborCost = e.kostnader.arbete_kr ?? 0
  const effectiveHourlyCost = actualHours > 0 ? laborCost / actualHours : null
  if (extraHours > 0 && (!(effectiveHourlyCost != null) || !(effectiveHourlyCost > 0))) {
    return buildBlockedBusinessScenario({
      kind: 'project_margin', title, subject: input.projectName,
      reason: 'Projektet saknar verifierad faktisk kostnad per arbetstimme. Extra timmar skulle därför kräva en gissad kostnad.',
      target, nowIso: input.nowIso,
    })
  }

  const baselineRevenue = e.intakter.forvantad_intakt_kr
  const baselineCost = e.kostnader.total_kr
  if (!(baselineRevenue > 0)) {
    return buildBlockedBusinessScenario({ kind: 'project_margin', title, subject: input.projectName, reason: 'Projektet saknar en positiv intäktsbas.', target, nowIso: input.nowIso })
  }

  const extraLaborCost = extraHours * (effectiveHourlyCost ?? 0)
  const materialDelta = e.kostnader.material_inkop_kr * (materialPct / 100)
  const scenarioRevenue = baselineRevenue + additionalRevenue
  const scenarioCost = baselineCost + extraLaborCost + materialDelta
  if (!(scenarioRevenue > 0)) {
    return buildBlockedBusinessScenario({ kind: 'project_margin', title, subject: input.projectName, reason: 'Scenariointäkten blir noll eller negativ.', target, nowIso: input.nowIso })
  }

  const baselineMarginKr = baselineRevenue - baselineCost
  const scenarioMarginKr = scenarioRevenue - scenarioCost
  const baselineMarginPct = round1((baselineMarginKr / baselineRevenue) * 100)
  const scenarioMarginPct = round1((scenarioMarginKr / scenarioRevenue) * 100)
  const deltaPct = round1(scenarioMarginPct - baselineMarginPct)

  const assumptions: string[] = []
  if (extraHours > 0) assumptions.push(`${round1(extraHours)} extra timmar till projektets kända snittkostnad ${roundKr(effectiveHourlyCost ?? 0).toLocaleString('sv-SE')} kr/tim`)
  if (materialPct !== 0) assumptions.push(`Materialets inköpskostnad förändras ${materialPct > 0 ? '+' : ''}${round1(materialPct)} %`)
  if (additionalRevenue !== 0) assumptions.push(`Intäkten förändras ${additionalRevenue > 0 ? '+' : ''}${roundKr(additionalRevenue).toLocaleString('sv-SE')} kr`)
  assumptions.push('Ingen annan tid, kostnad eller intäkt förändras')

  const targetGap = input.explicitMarginTargetPct == null
    ? null
    : round1(scenarioMarginPct - input.explicitMarginTargetPct)
  const recommendation = targetGap != null && targetGap < 0
    ? `Scenariot hamnar ${Math.abs(targetGap).toLocaleString('sv-SE')} procentenheter under ert marginalmål. Säkra mer intäkt eller minska omfattningen innan arbetet godkänns.`
    : deltaPct < 0
      ? 'Marginalen försämras i scenariot. Kontrollera om förändringen ska bli en ÄTA innan arbetet fortsätter.'
      : 'Scenariot försämrar inte projektets förväntade marginal.'

  return {
    version: VERSION,
    kind: 'project_margin',
    status: 'ready',
    confidence: 'estimated',
    title,
    subject: input.projectName,
    summary: `Förväntad marginal går från ${baselineMarginPct.toLocaleString('sv-SE')} % till ${scenarioMarginPct.toLocaleString('sv-SE')} % (${deltaPct > 0 ? '+' : ''}${deltaPct.toLocaleString('sv-SE')} procentenheter).`,
    primaryMetricKey: 'margin_pct',
    metrics: [
      metric({ key: 'revenue_kr', label: 'Förväntad intäkt', unit: 'kr', baseline: roundKr(baselineRevenue), scenario: roundKr(scenarioRevenue), betterWhen: 'higher' }),
      metric({ key: 'cost_kr', label: 'Känd kostnad', unit: 'kr', baseline: roundKr(baselineCost), scenario: roundKr(scenarioCost), betterWhen: 'lower' }),
      metric({ key: 'margin_kr', label: 'Förväntad marginal', unit: 'kr', baseline: roundKr(baselineMarginKr), scenario: roundKr(scenarioMarginKr), betterWhen: 'higher' }),
      metric({ key: 'margin_pct', label: 'Marginal', unit: 'pct', baseline: baselineMarginPct, scenario: scenarioMarginPct, betterWhen: 'higher' }),
    ],
    assumptions,
    evidence: [
      { label: 'Ekonomin beräknad', value: new Date(e.meta.computed_at).toLocaleString('sv-SE'), truth: 'known' },
      { label: 'Tid registrerad', value: `${round1(actualHours).toLocaleString('sv-SE')} tim`, truth: 'known' },
      { label: 'Material inköp', value: `${roundKr(e.kostnader.material_inkop_kr).toLocaleString('sv-SE')} kr`, truth: 'known' },
      ...(input.explicitMarginTargetPct == null ? [] : [{ label: 'Ägarens marginalmål', value: `${input.explicitMarginTargetPct.toLocaleString('sv-SE')} %`, truth: 'known' as const }]),
      ...(!e.marginal.kostnad_sannolikt_komplett ? [{ label: 'Kostnadsunderlag', value: 'Kan vara ofullständigt', truth: 'estimated' as const }] : []),
    ],
    recommendation,
    target,
    generatedAt: input.nowIso,
  }
}

export function simulateCashDelay(input: {
  weeks: RadarWeek[]
  normalKr: number
  normalReady: boolean
  delayDays: number
  nowIso: string
}): BusinessScenarioResult {
  const title = 'Om kundbetalningarna dröjer'
  const target = { label: 'Öppna pengaröversikten', href: '/dashboard/pengar' }
  const delayDays = Number(input.delayDays)
  if (!Number.isFinite(delayDays) || delayDays < 1 || delayDays > 180) {
    return buildBlockedBusinessScenario({ kind: 'cash_delay', title, subject: 'Kommande fem veckor', reason: 'Ange en försening mellan 1 och 180 dagar.', target, nowIso: input.nowIso })
  }
  const baseline = input.weeks.slice(0, 5)
  const knownTotal = baseline.reduce((sum, week) => sum + Math.max(0, Number(week.invoiced_kr) || 0), 0)
  if (!(knownTotal > 0)) {
    return buildBlockedBusinessScenario({ kind: 'cash_delay', title, subject: 'Kommande fem veckor', reason: 'Det finns inga kända fakturerade inbetalningar i femveckorsfönstret att flytta.', target, nowIso: input.nowIso })
  }

  const shift = Math.ceil(delayDays / 7)
  const shiftedKnown = baseline.map(() => 0)
  baseline.forEach((week, index) => {
    if (index + shift < shiftedKnown.length) shiftedKnown[index + shift] += Math.max(0, Number(week.invoiced_kr) || 0)
  })
  const scenarioTotal = shiftedKnown.reduce((sum, amount) => sum + amount, 0)
  const baselineFirst = Math.max(0, Number(baseline[0]?.invoiced_kr) || 0)
  const scenarioFirst = shiftedKnown[0] || 0
  const baselineWeakest = Math.min(...baseline.map(w => Math.max(0, Number(w.invoiced_kr) || 0)))
  const scenarioWeakest = Math.min(...shiftedKnown)

  return {
    version: VERSION,
    kind: 'cash_delay',
    status: 'ready',
    confidence: 'estimated',
    title,
    subject: 'Kommande fem veckor',
    summary: `${roundKr(knownTotal - scenarioTotal).toLocaleString('sv-SE')} kr av kända inbetalningar flyttas utanför femveckorsfönstret om betalningarna dröjer ${roundKr(delayDays)} dagar.`,
    primaryMetricKey: 'known_5w_kr',
    metrics: [
      metric({ key: 'known_5w_kr', label: 'Kända inbetalningar · 5 veckor', unit: 'kr', baseline: roundKr(knownTotal), scenario: roundKr(scenarioTotal), betterWhen: 'higher' }),
      metric({ key: 'first_week_kr', label: 'Första veckan', unit: 'kr', baseline: roundKr(baselineFirst), scenario: roundKr(scenarioFirst), betterWhen: 'higher' }),
      metric({ key: 'weakest_week_kr', label: 'Svagaste veckan', unit: 'kr', baseline: roundKr(baselineWeakest), scenario: roundKr(scenarioWeakest), betterWhen: 'higher' }),
    ],
    assumptions: [
      `Alla kända, redan fakturerade inbetalningar flyttas ${shift} hela veckor`,
      'Pipelinepotential lämnas orörd och summeras aldrig ihop med kända inbetalningar i kortet',
      'Inga nya fakturor, betalningar eller affärer tillkommer i perioden',
    ],
    evidence: [
      { label: 'Kända fakturainflöden', value: `${roundKr(knownTotal).toLocaleString('sv-SE')} kr`, truth: 'known' },
      { label: 'Historisk veckonormal', value: input.normalReady ? `${roundKr(input.normalKr).toLocaleString('sv-SE')} kr` : 'För litet underlag', truth: input.normalReady ? 'known' : 'estimated' },
    ],
    recommendation: 'Prioritera de största säkra inbetalningarna före periodens svagaste vecka. Skicka inget utan ordinarie godkännande och kundskydd.',
    target,
    generatedAt: input.nowIso,
  }
}

export function simulateRevenuePace(input: {
  revenueTargetAnnualSek: number | null
  invoicedYtdSek: number
  additionalInvoiceKr: number
  todayIso: string
  nowIso: string
}): BusinessScenarioResult {
  const title = 'Om ni fakturerar mer nu'
  const target = { label: 'Öppna översikten', href: '/dashboard/oversikt' }
  const amount = Number(input.additionalInvoiceKr)
  if (!Number.isFinite(amount) || !(amount > 0) || amount > 10_000_000) {
    return buildBlockedBusinessScenario({ kind: 'revenue_pace', title, subject: 'Årsmålet', reason: 'Ange ett positivt fakturabelopp upp till 10 000 000 kr.', target, nowIso: input.nowIso })
  }
  const before = computeRevenuePace({ revenueTargetAnnualSek: input.revenueTargetAnnualSek, invoicedYtdSek: input.invoicedYtdSek, todayIso: input.todayIso })
  const after = computeRevenuePace({ revenueTargetAnnualSek: input.revenueTargetAnnualSek, invoicedYtdSek: input.invoicedYtdSek + amount, todayIso: input.todayIso })
  if (!before || !after || input.revenueTargetAnnualSek == null) {
    return buildBlockedBusinessScenario({ kind: 'revenue_pace', title, subject: 'Årsmålet', reason: 'Företaget har inget uttryckligt omsättningsmål att simulera mot.', target, nowIso: input.nowIso })
  }

  const afterYtd = input.invoicedYtdSek + amount
  return {
    version: VERSION,
    kind: 'revenue_pace',
    status: 'ready',
    confidence: 'estimated',
    title,
    subject: `Årsmål ${before.year}`,
    summary: `Ett ytterligare fakturabelopp på ${roundKr(amount).toLocaleString('sv-SE')} kr flyttar takten från ${before.pacePct} % till ${after.pacePct} % av förväntad årstakt.`,
    primaryMetricKey: 'pace_pct',
    metrics: [
      metric({ key: 'invoiced_ytd_kr', label: 'Fakturerat i år', unit: 'kr', baseline: roundKr(input.invoicedYtdSek), scenario: roundKr(afterYtd), betterWhen: 'higher' }),
      metric({ key: 'pace_pct', label: 'Andel av förväntad takt', unit: 'pct', baseline: before.pacePct, scenario: after.pacePct, betterWhen: 'higher' }),
      metric({ key: 'pace_gap_kr', label: 'Avstånd till dagens måltakt', unit: 'kr', baseline: roundKr(Math.max(0, before.paceTargetSek - input.invoicedYtdSek)), scenario: roundKr(Math.max(0, after.paceTargetSek - afterYtd)), betterWhen: 'lower' }),
    ],
    assumptions: [
      'Beloppet faktureras i år och räknas som fakturerat, inte som betalt',
      'Årsmålet fördelas linjärt över kalenderåret',
      'Inga andra fakturor eller måländringar ingår i scenariot',
    ],
    evidence: [
      { label: 'Uttryckligt årsmål', value: `${roundKr(input.revenueTargetAnnualSek).toLocaleString('sv-SE')} kr`, truth: 'known' },
      { label: 'Fakturerat hittills', value: `${roundKr(input.invoicedYtdSek).toLocaleString('sv-SE')} kr`, truth: 'known' },
      { label: 'Dagens måltakt', value: `${roundKr(before.paceTargetSek).toLocaleString('sv-SE')} kr`, truth: 'known' },
    ],
    recommendation: after.pacePct >= 100
      ? 'Scenariot når eller passerar dagens förväntade årstakt. Kontrollera att beloppet verkligen är faktureringsklart innan något skapas.'
      : 'Scenariot förbättrar takten men når inte dagens målnivå. Använd Pengar på bordet för att hitta nästa verifierbara underlag.',
    target,
    generatedAt: input.nowIso,
  }
}
