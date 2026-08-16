/**
 * Presentationskontrakt för Business Twin-scenarier.
 *
 * Det här är ingen lagringsmodell. Samma lilla objekt går från den rena
 * räknemotorn via Mattes befintliga thread_message.metadata till de två
 * befintliga chattytorna.
 */

export type BusinessScenarioKind =
  | 'project_margin'
  | 'cash_delay'
  | 'revenue_pace'

export type ScenarioUnit = 'kr' | 'pct' | 'days'

export interface ScenarioMetric {
  key: string
  label: string
  unit: ScenarioUnit
  baseline: number
  scenario: number
  delta: number
  /** Styr bara färgen på delta — matematiken påverkas aldrig. */
  betterWhen: 'higher' | 'lower' | 'neutral'
}

export interface ScenarioEvidence {
  label: string
  value: string
  truth: 'known' | 'estimated'
}

export interface BusinessScenarioResult {
  version: 1
  kind: BusinessScenarioKind
  status: 'ready' | 'blocked'
  /** Alla kontrafaktiska resultat är uppskattningar, även när basen är känd. */
  confidence: 'estimated' | 'blocked'
  title: string
  subject: string
  summary: string
  primaryMetricKey: string | null
  metrics: ScenarioMetric[]
  assumptions: string[]
  evidence: ScenarioEvidence[]
  recommendation: string
  target?: { label: string; href: string }
  generatedAt: string
}

export interface BusinessScenarioPresentation {
  kind: 'business_scenario'
  scenario: BusinessScenarioResult
}

export function isBusinessScenarioPresentation(value: unknown): value is BusinessScenarioPresentation {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  if (p.kind !== 'business_scenario' || !p.scenario || typeof p.scenario !== 'object') return false
  const scenario = p.scenario as Record<string, unknown>
  return scenario.version === 1 &&
    ['project_margin', 'cash_delay', 'revenue_pace'].includes(String(scenario.kind)) &&
    ['ready', 'blocked'].includes(String(scenario.status))
}
