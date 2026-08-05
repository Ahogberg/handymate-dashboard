import type { SupabaseClient } from '@supabase/supabase-js'
import { getRecoveredRevenue } from './value/recovered-revenue'

/**
 * "Din vecka med Handymate" — ETT ärligt veckovärde i tre nivåer, lett av den
 * HÅRDASTE siffran (bekräftade kronor), inte den mjukaste (tid). Epistemisk
 * hygien (samma princip som saved-scoreboard — vi hittar inte på kr):
 *   - confirmed_kr  BEKRÄFTAT: räknas av attributionskärnan i
 *     lib/value/recovered-revenue.ts (VP2 gap 2) — verifierade händelser
 *     (offert accepterad/faktura betald) attribuerade till godkända
 *     outbound-kort inom fönster, dubbelattribution förbjuden. Ersätter den
 *     tidigare logg-baserade beräkningen som saknade både tidsfönster och
 *     dubbelräkningsspärr (en offert accepterad månader efter ett utskick
 *     räknades ändå, och offert + dess faktura kunde räknas dubbelt).
 *   - captured      POTENTIAL: leads fångade senaste 7 dagarna × estimated_value
 *     (konservativ schablon när värde saknas). Märks tydligt som potential.
 *   - time_minutes  UPPSKATTNING: viktad per åtgärdstyp (mer trovärdig än platt
 *     15-min-schablon).
 *   - calls_captured: antal samtal/SMS Lisa fångat (agent_runs trigger_type
 *     phone_call/incoming_sms) — samma fönster, ingen extra query.
 *
 * Extraherad ur app/api/dashboard/weekly-value/route.ts (2026-07) så att
 * cron-jobbet för dag-7-mailet (app/api/cron/onboarding-followup) kan
 * återanvända EXAKT samma logik utan copy-paste.
 */

const ROLLING_DAYS = 7
const DEFAULT_LEAD_VALUE = 5000 // konservativ schablon när lead saknar estimated_value

// Viktad tidsåtgång per åtgärd (minuter) — mer trovärdig än en platt schablon.
const RUN_MINUTES: Record<string, number> = { phone_call: 12, incoming_sms: 6 }
const RUN_DEFAULT = 10
const ACTION_MINUTES: Record<string, number> = {
  send_sms: 6,
  send_email: 6,
  send_reminder: 12,
  send_invoice_reminder: 12,
  create_booking: 10,
  schedule_followup: 10,
  notify_owner: 4,
  create_approval: 4,
}
const ACTION_DEFAULT = 6

export interface WeeklyValue {
  range_days: number
  confirmed_kr: number
  confirmed_items: Array<{ label: string; amount: number }>
  captured_count: number
  captured_kr: number
  calls_captured: number
  time_minutes: number
  time_hours: number
  autonomous_count: number
}

export async function getWeeklyValue(supabase: SupabaseClient, businessId: string): Promise<WeeklyValue> {
  const sinceIso = new Date(Date.now() - ROLLING_DAYS * 24 * 3600_000).toISOString()

  const [runsRes, logsRes, leadsRes, autonomousRes] = await Promise.all([
    supabase
      .from('agent_runs')
      .select('trigger_type')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .limit(5000),
    supabase
      .from('v3_automation_logs')
      .select('action_type, rule_name, context, result, created_at')
      .eq('business_id', businessId)
      .eq('status', 'success')
      .gte('created_at', sinceIso)
      .limit(5000),
    supabase
      .from('leads')
      .select('estimated_value')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .limit(5000),
    supabase
      .from('v3_automation_logs')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'success')
      .gte('created_at', sinceIso)
      .contains('context', { earned_autonomy: true }),
  ])

  const runs = runsRes.data || []
  const logs = logsRes.data || []
  const leads = leadsRes.data || []

  // ── Nivå 3: viktad tid (uppskattning) ──
  let timeMinutes = 0
  for (const r of runs) timeMinutes += RUN_MINUTES[(r.trigger_type as string) || ''] ?? RUN_DEFAULT
  for (const l of logs) timeMinutes += ACTION_MINUTES[(l.action_type as string) || ''] ?? ACTION_DEFAULT

  // ── Samtal/SMS Lisa fångat (delmängd av runs, ingen extra query) ──
  const callsCaptured = runs.filter(
    (r: any) => r.trigger_type === 'phone_call' || r.trigger_type === 'incoming_sms'
  ).length

  // ── Nivå 2: fångad potential ──
  const capturedCount = leads.length
  let capturedKr = 0
  for (const l of leads) {
    const v = Number(l.estimated_value)
    capturedKr += v > 0 ? v : DEFAULT_LEAD_VALUE
  }

  // ── Nivå 1: bekräftade kronor (VP2 — attributionskärnan) ──
  // Händelser (accepterad offert / betald faktura) senaste 7 dagarna,
  // attribuerade till godkända outbound-kort. Bokningsattributioner (0 kr)
  // hålls utanför radlistan — de är händelser, inte kronor.
  const recovered = await getRecoveredRevenue(supabase, businessId, { sinceDays: ROLLING_DAYS })
  const confirmedItems: Array<{ label: string; amount: number }> = recovered.attributions
    .filter((a) => a.amount_kr > 0)
    .map((a) => ({ label: a.label, amount: Math.round(a.amount_kr) }))

  return {
    range_days: ROLLING_DAYS,
    confirmed_kr: recovered.total_recovered_kr,
    confirmed_items: confirmedItems,
    captured_count: capturedCount,
    captured_kr: Math.round(capturedKr),
    calls_captured: callsCaptured,
    time_minutes: timeMinutes,
    time_hours: Math.round((timeMinutes / 60) * 10) / 10,
    autonomous_count: autonomousRes.count || 0,
  }
}
