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

export interface ProjectMarginWatchRequest {
  scenario_type: 'project_margin'
  project_id: string
  extra_hours: number
  material_cost_change_pct: number
  additional_revenue_kr: number
}

export interface ProjectMarginWatchRef {
  projectId: string
  /** Servergenererat av exakt request + scenarioresultat. Inget authbevis. */
  fingerprint: string
  request: ProjectMarginWatchRequest
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
  /** Finns bara för ett öppet projektmarginalscenario med framtida facit. */
  watch?: ProjectMarginWatchRef
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
  const watch = scenario.watch
  const validWatch = watch == null || (
    typeof watch === 'object'
    && typeof (watch as Record<string, unknown>).projectId === 'string'
    && /^btw_v1_[a-f0-9]{64}$/.test(String((watch as Record<string, unknown>).fingerprint || ''))
    && typeof (watch as Record<string, unknown>).request === 'object'
  )
  return validWatch && scenario.version === 1 &&
    ['project_margin', 'cash_delay', 'revenue_pace'].includes(String(scenario.kind)) &&
    ['ready', 'blocked'].includes(String(scenario.status))
}
