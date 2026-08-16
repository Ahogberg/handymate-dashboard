/**
 * Business Twin Watch & Verify V1.
 *
 * En bevakning skapas bara av servern efter att samma scenario räknats om
 * mot aktuell tenantdata. Verifieringen använder bara Outcome Quality Gates
 * finansiellt godkända utfall. Ingen LLM deltar i matematiken.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ProjectOutcomeRow } from '@/lib/efterkalkyl/freeze-outcome'
import type {
  BusinessScenarioResult,
  ProjectMarginWatchRequest,
} from './scenario-contract'
import { runBusinessScenario } from './run-scenario'

export type ProjectForecastStatus = 'watching' | 'verified' | 'unverifiable'

export interface ProjectForecastView {
  id: string
  projectId: string
  fingerprint: string
  status: ProjectForecastStatus
  predictedMarginKr: number
  predictedMarginPct: number
  actualMarginKr: number | null
  actualMarginPct: number | null
  marginErrorKr: number | null
  marginErrorPp: number | null
  leadTimeDays: number | null
  verificationBlocker: string | null
  createdAt: string
  resolvedAt: string | null
}

interface ForecastRow {
  id: string
  business_id: string
  project_id: string
  fingerprint: string
  status: ProjectForecastStatus
  predicted_margin_kr: number
  predicted_margin_pct: number
  actual_margin_kr: number | null
  actual_margin_pct: number | null
  margin_error_kr: number | null
  margin_error_pp: number | null
  lead_time_days: number | null
  verification_blocker: string | null
  created_at: string
  resolved_at: string | null
}

export interface ForecastReadResult {
  ok: boolean
  available: boolean
  forecast: ProjectForecastView | null
  error?: string
}

export interface ForecastCreateResult extends ForecastReadResult {
  code?: 'invalid_request' | 'stale_scenario' | 'not_watchable' | 'storage_failed'
  latestScenario?: BusinessScenarioResult
}

export interface ForecastListResult {
  ok: boolean
  available: boolean
  forecasts: ProjectForecastView[]
  error?: string
}

export interface ForecastVerificationResult {
  ok: boolean
  available: boolean
  verified: number
  unverifiable: number
  error?: string
}

const FORECAST_COLUMNS = 'id, business_id, project_id, fingerprint, status, predicted_margin_kr, predicted_margin_pct, actual_margin_kr, actual_margin_pct, margin_error_kr, margin_error_pp, lead_time_days, verification_blocker, created_at, resolved_at' as const

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function roundKr(value: number): number {
  return Math.round(value)
}

function numberOrNull(value: unknown): number | null {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isMissingForecastTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return error?.code === '42P01'
    || error?.code === 'PGRST205'
    || /business_twin_forecast.*(does not exist|schema cache)/i.test(error?.message || '')
}

function toView(row: ForecastRow): ProjectForecastView {
  return {
    id: row.id,
    projectId: row.project_id,
    fingerprint: row.fingerprint,
    status: row.status,
    predictedMarginKr: Number(row.predicted_margin_kr),
    predictedMarginPct: Number(row.predicted_margin_pct),
    actualMarginKr: numberOrNull(row.actual_margin_kr),
    actualMarginPct: numberOrNull(row.actual_margin_pct),
    marginErrorKr: numberOrNull(row.margin_error_kr),
    marginErrorPp: numberOrNull(row.margin_error_pp),
    leadTimeDays: numberOrNull(row.lead_time_days),
    verificationBlocker: row.verification_blocker,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }
}

function metricScenario(result: BusinessScenarioResult, key: string): number | null {
  const value = result.metrics.find(metric => metric.key === key)?.scenario
  return Number.isFinite(value) ? Number(value) : null
}

export function isProjectMarginWatchRequest(value: unknown): value is ProjectMarginWatchRequest {
  if (!value || typeof value !== 'object') return false
  const input = value as Record<string, unknown>
  if (input.scenario_type !== 'project_margin' || typeof input.project_id !== 'string') return false
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(input.project_id)) return false
  return ['extra_hours', 'material_cost_change_pct', 'additional_revenue_kr']
    .every(key => typeof input[key] === 'number' && Number.isFinite(input[key]))
}

export async function readProjectMarginForecast(
  supabase: SupabaseClient,
  businessId: string,
  fingerprint: string,
): Promise<ForecastReadResult> {
  const { data, error } = await supabase
    .from('business_twin_forecast')
    .select(FORECAST_COLUMNS)
    .eq('business_id', businessId)
    .eq('fingerprint', fingerprint)
    .maybeSingle()

  if (isMissingForecastTable(error)) return { ok: true, available: false, forecast: null }
  if (error) return { ok: false, available: true, forecast: null, error: error.message }
  return {
    ok: true,
    available: true,
    forecast: data ? toView(data as ForecastRow) : null,
  }
}

export async function listProjectMarginForecasts(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<ForecastListResult> {
  const { data, error } = await supabase
    .from('business_twin_forecast')
    .select(FORECAST_COLUMNS)
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(5)

  if (isMissingForecastTable(error)) return { ok: true, available: false, forecasts: [] }
  if (error) return { ok: false, available: true, forecasts: [], error: error.message }
  return {
    ok: true,
    available: true,
    forecasts: (data || []).map(row => toView(row as ForecastRow)),
  }
}

export async function createProjectMarginForecast(params: {
  supabase: SupabaseClient
  businessId: string
  businessUserId: string
  expectedFingerprint: string
  request: ProjectMarginWatchRequest
  now?: Date
}): Promise<ForecastCreateResult> {
  const { supabase, businessId, businessUserId, expectedFingerprint, request } = params
  if (!isProjectMarginWatchRequest(request) || !/^btw_v1_[a-f0-9]{64}$/.test(expectedFingerprint)) {
    return { ok: false, available: true, forecast: null, code: 'invalid_request', error: 'Ogiltigt bevakningsunderlag' }
  }

  const scenario = await runBusinessScenario(supabase, businessId, request, params.now)
  if (scenario.status !== 'ready' || !scenario.watch) {
    return {
      ok: false,
      available: true,
      forecast: null,
      code: 'not_watchable',
      error: scenario.status === 'blocked' ? scenario.summary : 'Projektet är redan avslutat',
      latestScenario: scenario,
    }
  }
  if (scenario.watch.fingerprint !== expectedFingerprint) {
    return {
      ok: false,
      available: true,
      forecast: null,
      code: 'stale_scenario',
      error: 'Projektets underlag har ändrats. Kör scenariot igen innan det bevakas.',
      latestScenario: scenario,
    }
  }

  const predictedMarginKr = metricScenario(scenario, 'margin_kr')
  const predictedMarginPct = metricScenario(scenario, 'margin_pct')
  if (predictedMarginKr == null || predictedMarginPct == null) {
    return { ok: false, available: true, forecast: null, code: 'not_watchable', error: 'Scenariot saknar en verifierbar marginalprognos' }
  }

  const { data, error } = await supabase
    .from('business_twin_forecast')
    .insert({
      business_id: businessId,
      project_id: request.project_id,
      created_by_business_user_id: businessUserId,
      scenario_kind: 'project_margin',
      scenario_version: scenario.version,
      fingerprint: scenario.watch.fingerprint,
      request_snapshot: scenario.watch.request,
      scenario_snapshot: scenario,
      predicted_margin_kr: predictedMarginKr,
      predicted_margin_pct: predictedMarginPct,
      status: 'watching',
    })
    .select(FORECAST_COLUMNS)
    .single()

  if (error?.code === '23505') {
    return readProjectMarginForecast(supabase, businessId, expectedFingerprint)
  }
  if (isMissingForecastTable(error)) return { ok: false, available: false, forecast: null, code: 'storage_failed', error: 'Bevakning är inte aktiverad ännu' }
  if (error) return { ok: false, available: true, forecast: null, code: 'storage_failed', error: error.message }
  return { ok: true, available: true, forecast: toView(data as ForecastRow) }
}

export function buildForecastVerification(
  forecast: Pick<ForecastRow, 'predicted_margin_kr' | 'predicted_margin_pct' | 'created_at'>,
  outcome: ProjectOutcomeRow,
  resolvedAt: string,
):
  | { status: 'verified'; values: Record<string, string | number | null> }
  | { status: 'unverifiable'; blocker: string; values: Record<string, string | null> } {
  const actualMarginPct = numberOrNull(outcome.realized_margin_pct)
  const blocker = !outcome.financial_learning_eligible
    ? `Efterkalkylen är inte finansiellt verifierbar: ${outcome.learning_blockers.join(', ') || 'ofullständigt underlag'}`
    : actualMarginPct == null
      ? 'Efterkalkylen saknar realiserad marginalprocent'
      : null

  if (blocker) {
    return {
      status: 'unverifiable',
      blocker,
      values: {
        status: 'unverifiable',
        project_outcome_id: outcome.id,
        verification_blocker: blocker,
        resolved_at: resolvedAt,
      },
    }
  }

  const forecastAt = Date.parse(forecast.created_at)
  const closedAt = Date.parse(outcome.closed_at)
  if (!Number.isFinite(forecastAt) || !Number.isFinite(closedAt) || forecastAt > closedAt) {
    const dateBlocker = 'Prognosens tidpunkt kan inte verifieras mot projektets avslut'
    return {
      status: 'unverifiable',
      blocker: dateBlocker,
      values: {
        status: 'unverifiable',
        project_outcome_id: outcome.id,
        verification_blocker: dateBlocker,
        resolved_at: resolvedAt,
      },
    }
  }

  // Blocket ovan har redan returnerat när värdet saknas/är ogiltigt.
  const actualPct = round1(actualMarginPct as number)
  const actualKr = numberOrNull(outcome.realized_margin_kr)
  const predictedPct = Number(forecast.predicted_margin_pct)
  const predictedKr = Number(forecast.predicted_margin_kr)
  return {
    status: 'verified',
    values: {
      status: 'verified',
      project_outcome_id: outcome.id,
      actual_margin_kr: actualKr == null ? null : roundKr(actualKr),
      actual_margin_pct: actualPct,
      margin_error_kr: actualKr == null ? null : roundKr(actualKr - predictedKr),
      margin_error_pp: round1(actualPct - predictedPct),
      lead_time_days: Math.max(0, Math.floor((closedAt - forecastAt) / 86_400_000)),
      verification_blocker: null,
      resolved_at: resolvedAt,
    },
  }
}

export async function verifyProjectMarginForecasts(params: {
  supabase: SupabaseClient
  businessId: string
  projectId: string
  outcome: ProjectOutcomeRow
  now?: Date
}): Promise<ForecastVerificationResult> {
  const { supabase, businessId, projectId, outcome } = params
  const { data, error } = await supabase
    .from('business_twin_forecast')
    .select('id, predicted_margin_kr, predicted_margin_pct, created_at')
    .eq('business_id', businessId)
    .eq('project_id', projectId)
    .eq('status', 'watching')

  if (isMissingForecastTable(error)) return { ok: true, available: false, verified: 0, unverifiable: 0 }
  if (error) return { ok: false, available: true, verified: 0, unverifiable: 0, error: error.message }
  if (!data || data.length === 0) return { ok: true, available: true, verified: 0, unverifiable: 0 }

  let verified = 0
  let unverifiable = 0
  const resolvedAt = (params.now ?? new Date()).toISOString()
  for (const row of data) {
    const comparison = buildForecastVerification(row as ForecastRow, outcome, resolvedAt)
    const { data: updated, error: updateError } = await supabase
      .from('business_twin_forecast')
      .update(comparison.values)
      .eq('id', row.id)
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .eq('status', 'watching')
      .select('id')
      .maybeSingle()
    if (updateError) {
      return { ok: false, available: true, verified, unverifiable, error: updateError.message }
    }
    // Ett parallellt/idempotent avslutsanrop kan redan ha löst raden mellan
    // SELECT och UPDATE. Då redovisar just den här körningen ingen falsk träff.
    if (!updated) continue
    if (comparison.status === 'verified') verified += 1
    else unverifiable += 1
  }

  return { ok: true, available: true, verified, unverifiable }
}
