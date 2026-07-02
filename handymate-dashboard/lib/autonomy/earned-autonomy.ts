/**
 * Förtjänad autonomi — agenter graderas upp till att agera utan godkännande
 * per åtgärdstyp/företag, baserat på mätt godkännande-historik.
 *
 * Spec: tasks/earned-autonomy-spec.md. Kärnprinciper:
 *  - HÅRDKODAD allowlist (4 typer) — inga andra typer kan graderas, ens av misstag.
 *  - Streak härleds ur pending_approvals (approved/rejected) — ingen räknartabell.
 *  - Endast beviljande-state persisteras (v3_automation_settings.earned_autonomy).
 *  - Alltid reversibelt: manuell revoke + auto-nedgradering vid avvisning.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const STREAK_TARGET = 15
export const WINDOW_DAYS = 60
const OFFER_EXPIRES_DAYS = 14
const REJECTED_OFFER_COOLDOWN_DAYS = 30

export type AutonomyKey =
  | 'invoice_reminder'
  | 'booking_reminder'
  | 'quote_followup_sms'
  | 'review_request'

const ALLOWLIST: AutonomyKey[] = [
  'invoice_reminder', 'booking_reminder', 'quote_followup_sms', 'review_request',
]

/** Svenska etiketter + ansvarig agent (för erbjudande-copy + UI). */
export const AUTONOMY_META: Record<AutonomyKey, { label: string; agent: string; agentName: string }> = {
  invoice_reminder:  { label: 'fakturapåminnelser',      agent: 'karin',  agentName: 'Karin' },
  booking_reminder:  { label: 'bokningspåminnelser',     agent: 'lars',   agentName: 'Lars' },
  quote_followup_sms:{ label: 'offertuppföljningar',     agent: 'daniel', agentName: 'Daniel' },
  review_request:    { label: 'recensionsförfrågningar', agent: 'hanna',  agentName: 'Hanna' },
}

export function isAllowlistedKey(key: unknown): key is AutonomyKey {
  return typeof key === 'string' && (ALLOWLIST as string[]).includes(key)
}

/**
 * Mappa en v3-regel → autonomi-nyckel via trigger-SIGNATUR (inte namn — namn
 * är användarredigerbara). Endast de tre motor-typerna; review_request skapas
 * av cron, inte regler. Null = ej allowlistad → beteende oförändrat.
 */
export function deriveAutonomyKey(rule: {
  trigger_type: string
  action_type: string
  trigger_config: Record<string, unknown> | null
}): AutonomyKey | null {
  if (rule.trigger_type !== 'threshold' || rule.action_type !== 'send_sms') return null
  const cfg = rule.trigger_config || {}
  const sig = `${cfg.entity}/${cfg.field}`
  if (sig === 'invoice/days_overdue') return 'invoice_reminder'
  if (sig === 'booking/hours_until') return 'booking_reminder'
  if (sig === 'quote/days_since_sent') return 'quote_followup_sms'
  return null
}

export interface ResolvedApprovalRow {
  approval_type: string
  status: string
  payload: Record<string, unknown> | null
  created_at: string
}

/**
 * Nyckel ur en approval-rad. review_request → direkt via approval_type
 * (historiska rader räknas). automation → payload.autonomy_key (stämplas av
 * motorn fr.o.m. denna feature — äldre rader saknar den och hoppas över,
 * dvs. streak för motor-typerna räknas från deploy. Medvetet: robust utan
 * regel-uppslag mot ev. raderade regler).
 */
export function autonomyKeyFromApproval(row: {
  approval_type: string
  payload: Record<string, unknown> | null
}): AutonomyKey | null {
  if (row.approval_type === 'review_request') return 'review_request'
  if (row.approval_type === 'automation') {
    const k = row.payload?.autonomy_key
    return isAllowlistedKey(k) ? k : null
  }
  return null
}

/**
 * Räkna raka godkännanden av `key` ur rader SORTERADE PÅ BESLUTSTID
 * (resolved_at), NYAST FÖRST. Andra nycklar/nyckellösa rader hoppas över;
 * 'rejected' av samma nyckel stoppar. 'pending'/'expired' är inte beslut →
 * hoppas över. Redigerade godkännanden (payload.edited === true) hoppas
 * också över — de räknas inte i streaken men nollar den inte.
 */
export function computeStreakFromRows(rows: ResolvedApprovalRow[], key: AutonomyKey): number {
  let streak = 0
  for (const r of rows) {
    if (autonomyKeyFromApproval(r) !== key) continue
    // Redigerade godkännanden är korrigeringar — inte blind tillit. De räknas
    // inte i streaken (hoppar, nollar inte — användaren godkände ju ändå).
    if ((r.payload as Record<string, unknown> | null)?.edited === true) continue
    if (r.status === 'approved') { streak++; continue }
    if (r.status === 'rejected') break
    // pending/expired → inget beslut, hoppa
  }
  return streak
}

// ── DB-lager ────────────────────────────────────────────────────────────────

type AutonomyState = Record<string, { status: 'autonomous'; granted_at: string }>

async function readState(
  supabase: SupabaseClient, businessId: string
): Promise<{ state: AutonomyState; error: string | null }> {
  const { data, error } = await supabase
    .from('v3_automation_settings')
    .select('earned_autonomy')
    .eq('business_id', businessId)
    .maybeSingle()
  // Fel (t.ex. v65 ej körd → kolumn saknas, eller transient) → surfa felet.
  // Läsaren avgör riktning: isAutonomous behandlar fel som gatad (fail-safe),
  // grant/revoke får ALDRIG skriva på ett misslyckat läs (skulle radera
  // syskon-nycklars beviljanden i read-modify-write).
  if (error) return { state: {}, error: error.message }
  return { state: (data?.earned_autonomy as AutonomyState) || {}, error: null }
}

export async function isAutonomous(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<boolean> {
  const { state } = await readState(supabase, businessId)
  return state[key]?.status === 'autonomous'
}

async function writeState(
  supabase: SupabaseClient, businessId: string, state: AutonomyState
): Promise<void> {
  // business_id är NOT NULL UNIQUE (sql/v3_automation_settings.sql) → upsert säkert.
  const { error } = await supabase
    .from('v3_automation_settings')
    .upsert({ business_id: businessId, earned_autonomy: state }, { onConflict: 'business_id' })
  if (error) throw new Error(`earned_autonomy write failed: ${error.message}`)
}

export async function grantAutonomy(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<void> {
  const { state, error: readError } = await readState(supabase, businessId)
  if (readError) throw new Error(`earned_autonomy read failed (skriver inte på trasigt läs): ${readError}`)
  state[key] = { status: 'autonomous', granted_at: new Date().toISOString() }
  await writeState(supabase, businessId, state)
}

export async function revokeAutonomy(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<void> {
  const { state, error: readError } = await readState(supabase, businessId)
  if (readError) throw new Error(`earned_autonomy read failed (skriver inte på trasigt läs): ${readError}`)
  if (!state[key]) return
  delete state[key]
  await writeState(supabase, businessId, state)
}

/** Hämta beslutade approvals i fönstret och räkna streak för nyckeln. */
export async function computeStreak(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<number> {
  const sinceIso = new Date(Date.now() - WINDOW_DAYS * 24 * 3600_000).toISOString()
  const { data } = await supabase
    .from('pending_approvals')
    .select('approval_type, status, payload, created_at')
    .eq('business_id', businessId)
    .in('approval_type', ['automation', 'review_request'])
    .in('status', ['approved', 'rejected'])
    .gte('created_at', sinceIso)
    .order('resolved_at', { ascending: false })
    // Delad budget över typer/nycklar i fönstret — kan UNDERskatta streak vid hög volym (aldrig överskatta = fail-safe).
    .limit(200)
  return computeStreakFromRows((data as ResolvedApprovalRow[]) || [], key)
}

/**
 * Skapa erbjudande om tröskeln nås. Dedup: ej om redan autonom, ej om ett
 * pending autonomy_offer för nyckeln finns. Returnerar true om skapat.
 */
export async function maybeCreateOffer(
  supabase: SupabaseClient, businessId: string, key: AutonomyKey
): Promise<boolean> {
  if (await isAutonomous(supabase, businessId, key)) return false

  const { count } = await supabase
    .from('pending_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('approval_type', 'autonomy_offer')
    .eq('status', 'pending')
    .contains('payload', { autonomy_key: key })
  if ((count || 0) > 0) return false

  // Tjat-skydd: ett AVVISAT erbjudande = "inte nu". Erbjud inte om igen förrän
  // cooldownen passerat — annars återkommer erbjudandet vid nästa godkännande
  // (streaken ligger kvar ≥ tröskeln). resolved_at sätts vid status-flippen.
  const cooldownIso = new Date(Date.now() - REJECTED_OFFER_COOLDOWN_DAYS * 24 * 3600_000).toISOString()
  const { count: rejectedRecently } = await supabase
    .from('pending_approvals')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('approval_type', 'autonomy_offer')
    .eq('status', 'rejected')
    .gte('resolved_at', cooldownIso)
    .contains('payload', { autonomy_key: key })
  if ((rejectedRecently || 0) > 0) return false

  const streak = await computeStreak(supabase, businessId, key)
  if (streak < STREAK_TARGET) return false

  const meta = AUTONOMY_META[key]
  const id = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
  const { error } = await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: 'autonomy_offer',
    title: `Låt ${meta.agentName} sköta ${meta.label} själv?`,
    description: `Du har godkänt de ${streak} senaste ${meta.label}na utan ändringar. Godkänner du detta skickas de automatiskt framöver — du ser allt i loggen och kan alltid ta tillbaka ratten under Förtroendetrappan.`,
    payload: { autonomy_key: key, streak, agent: meta.agent },
    status: 'pending',
    risk_level: 'low',
    expires_at: new Date(Date.now() + OFFER_EXPIRES_DAYS * 24 * 3600_000).toISOString(),
  })
  return !error
}
