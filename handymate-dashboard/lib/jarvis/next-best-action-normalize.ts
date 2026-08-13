/**
 * Next Best Action Engine — payload-normaliseraren (2026-08-13).
 *
 * De sex kandidat-typerna lagrar sina belopp/tidssignaler under olika
 * fältnamn i `pending_approvals.payload` (verifierat mot varje skapande
 * ställe, inte antaget):
 *
 *   invoice_reminder     → payload.amount_kr, payload.days_overdue
 *   quote_nudge          → INGET belopp i payload — join mot quotes.total
 *                           via payload.quote_id (kolumnen heter quotes.
 *                           quote_id, inte quotes.id)
 *   profitability_warning→ payload.projected_overrun (en prognos, alltid
 *                           UPPSKATTAT), payload.status/cost_percent
 *   create_ata_draft     → payload.amount_estimate (kan saknas — då null,
 *                           aldrig gissat), payload.project_id
 *   missad_intakt        → payload.amount_kr, payload.project_id
 *   dispatch_suggestion  → inget belopp alls (bekräftat, dispatch handlar
 *                           inte om pengar) — payload.scheduled_start
 *                           finns redan direkt, inget uppslag behövs
 *
 * Pure/IO-split (samma mönster som lib/jarvis/monday-brief.ts): `normalize`
 * är ren och testbar utan DB, `enrichAndNormalize` gör de nödvändiga
 * uppslagen (quote-belopp, närmaste bokade besök för ett ÄTA-projekt) och
 * kör den rena funktionen. Datum/summor räknas ALLTID i den här filen,
 * aldrig av modellen — "en summa är inte en åsikt" (Kvittoprincipen).
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export const NEXT_BEST_ACTION_APPROVAL_TYPES = [
  'invoice_reminder',
  'quote_nudge',
  'profitability_warning',
  'create_ata_draft',
  'missad_intakt',
  'dispatch_suggestion',
] as const

export type NextBestActionApprovalType = (typeof NEXT_BEST_ACTION_APPROVAL_TYPES)[number]

export interface NormalizedCandidate {
  approval_id: string
  approval_type: string
  title: string
  age_days: number
  /** null = typen bär ingen finansiell signal (t.ex. dispatch_suggestion) — aldrig gissat. */
  financial_impact_kr: number | null
  financial_impact_kind: 'KÄNT' | 'UPPSKATTAT' | null
  /** Färdigformulerad svensk fakta, t.ex. "3 dagar försenad", "Bokat imorgon kl 08:00". */
  urgency_note: string | null
  project_or_customer: string | null
}

export interface RawCandidateRow {
  id: string
  approval_type: string
  title: string
  created_at: string
  payload: Record<string, unknown> | null
}

/** Enrichment som INTE kan räknas fram ur candidate-raden själv — hämtas separat per typ. */
export interface CandidateEnrichment {
  /** quote_nudge: verkligt quotes.total, aldrig gissat. */
  quoteTotal?: number | null
  /** create_ata_draft: närmaste kommande bokade besök för projektet (booking ELLER work_orders, det tidigaste). */
  nextVisitIso?: string | null
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.floor(ms / 86_400_000)
}

/** "imorgon kl 08:00", "om 3 dagar", "idag kl 14:30" — ärlig, läsbar tidsfakta ur en ISO-tidpunkt. */
function formatVisitNote(visitIso: string, nowIso: string): string {
  const visitDays = daysBetween(nowIso, visitIso)
  const time = new Date(visitIso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Stockholm' })
  if (visitDays <= 0) return `Bokat idag kl ${time}`
  if (visitDays === 1) return `Bokat imorgon kl ${time}`
  return `Bokat om ${visitDays} dagar, kl ${time}`
}

/**
 * Ren. Ingen I/O, inget `new Date()` utan `nowIso` — allt via parametrar.
 * Returnerar null om raden saknar `payload` helt (oväntat format, hoppas
 * tyst över av anroparen — gissas aldrig fram).
 */
export function normalize(row: RawCandidateRow, nowIso: string, enrichment: CandidateEnrichment = {}): NormalizedCandidate | null {
  const p = (row.payload || {}) as Record<string, unknown>
  const ageDays = daysBetween(row.created_at, nowIso)

  let financial_impact_kr: number | null = null
  let financial_impact_kind: 'KÄNT' | 'UPPSKATTAT' | null = null
  let urgency_note: string | null = null
  let project_or_customer: string | null = null

  switch (row.approval_type) {
    case 'invoice_reminder': {
      if (typeof p.amount_kr === 'number') {
        financial_impact_kr = p.amount_kr
        financial_impact_kind = 'KÄNT' // en utskickad faktura, ett verkligt belopp
      }
      if (typeof p.days_overdue === 'number') {
        urgency_note = `${p.days_overdue} dag${p.days_overdue === 1 ? '' : 'ar'} försenad`
      }
      project_or_customer = typeof p.customer_name === 'string' ? p.customer_name : null
      break
    }
    case 'quote_nudge': {
      if (typeof enrichment.quoteTotal === 'number') {
        financial_impact_kr = enrichment.quoteTotal
        financial_impact_kind = 'KÄNT' // verklig quotes.total, inte gissat
      }
      if (typeof p.view_count === 'number' && p.view_count > 0) {
        urgency_note = `Visad ${p.view_count} gång${p.view_count === 1 ? '' : 'er'}, inte accepterad`
      }
      project_or_customer = typeof p.customer_name === 'string' ? p.customer_name : null
      break
    }
    case 'profitability_warning': {
      if (typeof p.projected_overrun === 'number') {
        financial_impact_kr = p.projected_overrun
        financial_impact_kind = 'UPPSKATTAT' // en prognos, inte ett facit
      }
      if (typeof p.status === 'string' && typeof p.cost_percent === 'number') {
        const statusText = p.status === 'over_budget' ? 'Redan över budget' : 'Riskerar överskrida budget'
        urgency_note = `${statusText} (${Math.round(p.cost_percent)}% av kalkylen förbrukad)`
      }
      project_or_customer = typeof p.project_name === 'string' ? p.project_name : null
      break
    }
    case 'create_ata_draft': {
      if (typeof p.amount_estimate === 'number') {
        financial_impact_kr = p.amount_estimate
        financial_impact_kind = 'UPPSKATTAT' // ett estimat tills ÄTA:t är avstämt
      }
      if (enrichment.nextVisitIso) {
        urgency_note = formatVisitNote(enrichment.nextVisitIso, nowIso)
      }
      project_or_customer = typeof p.description === 'string' ? p.description : null
      break
    }
    case 'missad_intakt': {
      if (typeof p.amount_kr === 'number') {
        financial_impact_kr = p.amount_kr
        financial_impact_kind = 'UPPSKATTAT' // ett fynd som väntar på granskning, inte ett stämt facit
      }
      urgency_note = `Upptäckt för ${ageDays} dag${ageDays === 1 ? '' : 'ar'} sedan`
      break
    }
    case 'dispatch_suggestion': {
      // Bekräftat: ingen finansiell signal i den här typen alls.
      if (typeof p.scheduled_start === 'string') {
        urgency_note = formatVisitNote(p.scheduled_start, nowIso)
      }
      project_or_customer = typeof p.job_title === 'string' ? p.job_title : null
      break
    }
    default:
      return null
  }

  return {
    approval_id: row.id,
    approval_type: row.approval_type,
    title: row.title,
    age_days: ageDays,
    financial_impact_kr,
    financial_impact_kind,
    urgency_note,
    project_or_customer,
  }
}

/**
 * IO: hämtar de uppslag `normalize` inte kan räkna fram själv, kör sedan
 * den rena funktionen per rad. Två uppslag krävs, båda billiga (engångs-
 * batch, inte en sidladdning):
 *
 *   quote_nudge      → quotes.total via payload.quote_id
 *   create_ata_draft → närmaste kommande besök (booking ELLER work_orders,
 *                       det tidigaste) via payload.project_id — det som
 *                       gör "teamet är där kl 08:00 imorgon" en ärlig
 *                       KÄNT-fakta, inte en påhittad.
 *
 * missad_intakt/profitability_warning bär också project_id, men får
 * medvetet INGET schema-uppslag i den här omgången — deras urgency_note
 * bygger redan på egna fält (ålder, cost_percent). Skulle kunna läggas
 * till senare utan att röra formen ovan.
 */
export async function enrichAndNormalize(
  supabase: SupabaseClient,
  rows: RawCandidateRow[],
  nowIso: string,
): Promise<NormalizedCandidate[]> {
  const out: NormalizedCandidate[] = []

  for (const row of rows) {
    const p = (row.payload || {}) as Record<string, unknown>
    const enrichment: CandidateEnrichment = {}

    if (row.approval_type === 'quote_nudge' && typeof p.quote_id === 'string') {
      const { data } = await supabase.from('quotes').select('total').eq('quote_id', p.quote_id).maybeSingle()
      enrichment.quoteTotal = typeof data?.total === 'number' ? data.total : null
    }

    if (row.approval_type === 'create_ata_draft' && typeof p.project_id === 'string') {
      enrichment.nextVisitIso = await nearestUpcomingVisit(supabase, p.project_id, nowIso)
    }

    const normalized = normalize(row, nowIso, enrichment)
    if (normalized) out.push(normalized)
  }

  return out
}

/** Tidigaste kommande besök för ett projekt, booking ELLER work_orders — det tidigaste av de två. */
async function nearestUpcomingVisit(supabase: SupabaseClient, projectId: string, nowIso: string): Promise<string | null> {
  const [bookingRes, workOrderRes] = await Promise.all([
    supabase
      .from('booking')
      .select('scheduled_start')
      .eq('project_id', projectId)
      .gte('scheduled_start', nowIso)
      .order('scheduled_start', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('work_orders')
      .select('scheduled_start, scheduled_date')
      .eq('project_id', projectId)
      .gte('scheduled_start', nowIso)
      .order('scheduled_start', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const candidates = [
    bookingRes.data?.scheduled_start as string | undefined,
    (workOrderRes.data?.scheduled_start || workOrderRes.data?.scheduled_date) as string | undefined,
  ].filter((v): v is string => typeof v === 'string')

  if (candidates.length === 0) return null
  return candidates.sort()[0]
}
