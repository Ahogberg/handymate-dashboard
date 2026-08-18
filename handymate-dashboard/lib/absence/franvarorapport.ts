/**
 * Återkomstrapporten (Etapp Å) — deterministiskt härledd sammanfattning av
 * ett passerat frånvarofönster: gjort (per agent), väntar (kön),
 * misslyckades (ärligt), behöver beslut. INGEN LLM, INGEN plan-/prosatext
 * som källa — bara execution-utfall/facit-källor, samma regel som
 * dygnsdigesten. Matte får PRESENTERA rapporten (UI-lagret), men allt
 * INNEHÅLL härleds här, deterministiskt.
 *
 * "Gjort" återanvänder byggDygnsdigest (lib/jarvis/dygnsdigest.ts) med dess
 * `from`-fält (Etapp Å-tillägget) i stället för dess normala 24h-fönster —
 * SAMMA grindar (brus/misslyckanden/tom beskrivning), bara ett annat
 * fönster. Ingen ny "vad räknas som gjort"-sanning skrivs här.
 *
 * "Behöver beslut" återanvänder classifyAbsenceEvent (samma auktoritet som
 * push-strypunkten) — ett kort som skulle ha eskalerat en push under
 * frånvaron är exakt det som listas här som "behövde ditt beslut".
 *
 * LÄS-ONLY: den här filen importerar aldrig någon av agentsystemets
 * exekveringsvägar och skriver aldrig pending_approvals till ett godkänt
 * tillstånd. Frånvaron ger ingen ny behörighet. Källskanningslåst — se
 * tests/absence-push-gate.spec.ts för exakt vilka namn som är förbjudna.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { arTestNamn } from '@/lib/testdata'
import { byggDygnsdigest, type DigestAktivitet, type DigestRad } from '@/lib/jarvis/dygnsdigest'
import { classifyAbsenceEvent, type EscalationClass } from './escalation'
import type { AbsenceWindow } from './absence-window'

export interface FranvarorapportGjortRad {
  agentId: string
  antal: number
}

export interface FranvarorapportMisslyckadRad {
  key: string
  tid: string
  agentId: string
  text: string
}

export interface FranvarorapportVantarRad {
  id: string
  approvalType: string
  title: string
  riskLevel: string | null
}

export interface FranvarorapportBeslutRad {
  id: string
  approvalType: string
  title: string
  escalationClass: EscalationClass
}

export interface Franvarorapport {
  from: string
  to: string
  gjort: FranvarorapportGjortRad[]
  vantar: FranvarorapportVantarRad[]
  misslyckades: FranvarorapportMisslyckadRad[]
  behoverBeslut: FranvarorapportBeslutRad[]
}

export interface FranvarorapportApprovalRow {
  id: string
  approval_type: string
  title: string
  risk_level: string | null
  payload: Record<string, unknown> | null
  status: string
  created_at: string
}

export interface FranvarorapportInput {
  window: { from: Date; to: Date }
  /**
   * Den slagna aktivitetsloggen (samma källor som /api/automations/activity
   * mergar för dygnsdigesten) — status='failed'-raderna BLIR
   * misslyckades-raderna, exakt komplementet till byggDygnsdigests filter.
   */
  aktiviteter: DigestAktivitet[]
  /**
   * pending_approvals-rader. Funktionen delar själv upp dem på status/klass
   * (väntar = öppna just nu, behöver beslut = öppna OCH skapade i fönstret
   * OCH eskaleringsklassade) — anroparen filtrerar inte i förväg.
   */
  approvals: FranvarorapportApprovalRow[]
}

/** Ren derivation — testbar utan Supabase. */
export function deriveFranvarorapport(input: FranvarorapportInput): Franvarorapport {
  const { window, aktiviteter, approvals } = input
  const fromMs = window.from.getTime()
  const toMs = window.to.getTime()

  // Gjort: dygnsdigestens grindar över det EXPLICITA fönstret i stället för
  // "senaste dygnet" — samma härledning, inget nytt filter.
  const rader: DigestRad[] = byggDygnsdigest({ aktiviteter, nu: window.to, from: window.from })
  const perAgent = new Map<string, number>()
  for (const r of rader) perAgent.set(r.agentId, (perAgent.get(r.agentId) ?? 0) + 1)
  const gjort: FranvarorapportGjortRad[] = Array.from(perAgent.entries())
    .map(([agentId, antal]) => ({ agentId, antal }))
    .sort((a, b) => b.antal - a.antal)

  // Misslyckades: komplementet till byggDygnsdigests success-filter — samma
  // källa, bara status==='failed' i stället för !=='failed'.
  const misslyckades: FranvarorapportMisslyckadRad[] = aktiviteter
    .filter(a => {
      const t = Date.parse(a.created_at)
      if (!Number.isFinite(t) || t < fromMs || t > toMs) return false
      return a.status === 'failed'
    })
    .map(a => ({
      key: `${a.source || 'akt'}-${a.id}`,
      tid: a.created_at,
      agentId: a.agent_id || 'matte',
      text: (typeof a.description === 'string' ? a.description.trim() : '') || 'Misslyckades utan felmeddelande',
    }))

  // Väntar: öppna kort i kön just nu — kön är ett NUlägestillstånd, inte
  // fönsterbundet (ett kort från förra veckan som fortfarande väntar hör
  // hemma här, oavsett när det skapades).
  const vantar: FranvarorapportVantarRad[] = approvals
    .filter(a => a.status === 'pending')
    .map(a => ({ id: a.id, approvalType: a.approval_type, title: a.title, riskLevel: a.risk_level }))

  // Behöver beslut: öppna kort SKAPADE i fönstret som klassar som en
  // eskalering (samma slutna klassare som push-strypunkten) — samma
  // sanning på båda ställena, aldrig en egen bedömning här.
  const behoverBeslut: FranvarorapportBeslutRad[] = []
  for (const a of approvals) {
    if (a.status !== 'pending') continue
    const t = Date.parse(a.created_at)
    if (!Number.isFinite(t) || t < fromMs || t > toMs) continue
    const cls = classifyAbsenceEvent({
      kind: 'pending_approval',
      approvalType: a.approval_type,
      riskLevel: a.risk_level,
      payload: a.payload,
    })
    if (cls === 'samlas') continue
    behoverBeslut.push({ id: a.id, approvalType: a.approval_type, title: a.title, escalationClass: cls })
  }

  return {
    from: window.from.toISOString(),
    to: window.to.toISOString(),
    gjort,
    vantar,
    misslyckades,
    behoverBeslut,
  }
}

/**
 * I/O — hämtar den slagna aktivitetsloggen för fönstret. SAMMA fyra källor
 * som /api/automations/activity/route.ts mergar för dygnsdigesten
 * (automation_activity, v3_automation_logs, pipeline_activity,
 * communication_log), bara windowat till [from, to] i stället för
 * "senaste veckan/limit N". Duplicerad avsiktligt i stället för att
 * refaktorera den levande routen under den här etappen — samma `auto`-regel
 * (bara v3_automation_logs kan svara säkert via approval_id, de tre andra
 * skrivs bara av automationsvägar).
 */
async function hamtaAktiviteterIFonster(
  supabase: SupabaseClient,
  businessId: string,
  window: { from: Date; to: Date },
): Promise<DigestAktivitet[]> {
  const sinceIso = window.from.toISOString()
  const untilIso = window.to.toISOString()

  const [activityRes, ruleRes, pipelineRes, commRes] = await Promise.all([
    supabase
      .from('automation_activity')
      .select('id, automation_type, action, description, status, created_at')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso),
    supabase
      .from('v3_automation_logs')
      .select('id, rule_name, action_type, status, approval_id, agent_id, created_at')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso),
    supabase
      .from('pipeline_activity')
      .select('id, activity_type, description, triggered_by, ai_reason, created_at')
      .eq('business_id', businessId)
      .in('triggered_by', ['ai', 'system'])
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso),
    supabase
      .from('communication_log')
      .select('id, channel, message, ai_reason, status, created_at')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .lte('created_at', untilIso),
  ])

  const merged: DigestAktivitet[] = [
    ...((activityRes.data || []) as any[]).map(a => ({
      id: a.id,
      source: 'automation',
      description: a.description,
      status: a.status,
      created_at: a.created_at,
      auto: true,
    })),
    ...((ruleRes.error ? [] : ruleRes.data || []) as any[]).map(a => ({
      id: a.id,
      source: 'rule',
      agent_id: a.agent_id || undefined,
      description: a.rule_name,
      status: a.status,
      created_at: a.created_at,
      auto: !a.approval_id,
    })),
    ...((pipelineRes.data || []) as any[]).map(a => ({
      id: a.id,
      source: 'pipeline',
      description: a.description || a.ai_reason,
      status: 'success',
      created_at: a.created_at,
      auto: true,
    })),
    ...((commRes.data || []) as any[]).map(a => ({
      id: a.id,
      source: 'communication',
      description: a.ai_reason || (typeof a.message === 'string' ? a.message.slice(0, 80) : null),
      status: a.status === 'sent' || a.status === 'delivered' ? 'success' : a.status === 'failed' ? 'failed' : 'skipped',
      created_at: a.created_at,
      auto: true,
    })),
  ]

  return merged.filter(a => !arTestNamn(a.description))
}

async function hamtaApprovals(
  supabase: SupabaseClient,
  businessId: string,
): Promise<FranvarorapportApprovalRow[]> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id, approval_type, title, risk_level, payload, status, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) return []
  return (data as FranvarorapportApprovalRow[]) || []
}

/**
 * I/O-wrapper — hämtar underlaget och anropar den rena derivationen.
 * Fail-soft: en trasig läsning ger en TOM rapport (aldrig ett kastat fel
 * som fäller ytan), samma konvention som resten av lib/absence.
 */
export async function byggFranvarorapport(
  supabase: SupabaseClient,
  businessId: string,
  window: AbsenceWindow,
): Promise<Franvarorapport> {
  const from = new Date(window.from)
  const to = new Date(window.to)

  let aktiviteter: DigestAktivitet[] = []
  let approvals: FranvarorapportApprovalRow[] = []
  try {
    ;[aktiviteter, approvals] = await Promise.all([
      hamtaAktiviteterIFonster(supabase, businessId, { from, to }),
      hamtaApprovals(supabase, businessId),
    ])
  } catch (err) {
    console.error('[franvarorapport] kunde inte läsa underlag (fail-soft, tom rapport):', err)
  }

  return deriveFranvarorapport({ window: { from, to }, aktiviteter, approvals })
}
