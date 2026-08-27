/**
 * Aktiveringsmått utan analytics-SDK (Lager 3 / B8, 2026-08-27).
 *
 * Codex-analysen: "mät tid till första fynd, första godkännande, första
 * utförda handling och första verifierade resultat — inte bara slutförd
 * onboarding". Det fanns ingen mätning alls; bara booleska flaggor.
 *
 * Allt räknas retroaktivt ur tidsstämplar som redan finns:
 *   första fynd      = första pending_approvals-rad som inte är ett startkort
 *   första beslut    = första resolved_at på ett godkänt kort
 *   första utförda   = första godkända kort vars execution_result.outcome = success
 *   första kvitto    = som utförda, men bara korttyper som ger värdekvitto
 *                      (RECEIPT_APPROVAL_TYPES — samma lista som kvittot självt)
 * Alla i timmar från onboarding_completed_at (null utan slutförd onboarding
 * eller när händelsen inte inträffat). Ingen ny tabell, ingen vy — en
 * ren funktion över rader, adminspärrad i app/api/admin/pilots.
 */
import { RECEIPT_APPROVAL_TYPES } from '@/lib/approvals/value-receipt'

export interface ActivationRow {
  approval_type: string
  status: string
  created_at: string
  resolved_at: string | null
  /** payload->execution_result->>outcome, eller null */
  outcome: string | null
}

export interface ActivationMetrics {
  /** Timmar från konto skapat till onboarding slutförd */
  onboardingHours: number | null
  firstFindingH: number | null
  firstApprovalH: number | null
  firstExecutedH: number | null
  firstReceiptH: number | null
}

const KVITTOTYPER = new Set<string>(RECEIPT_APPROVAL_TYPES)

const timmar = (from: string | null | undefined, to: string | null | undefined): number | null => {
  if (!from || !to) return null
  const a = new Date(from).getTime()
  const b = new Date(to).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null
  return Math.round(((b - a) / 3_600_000) * 10) / 10
}

const minIso = (values: Array<string | null | undefined>): string | null => {
  const giltiga = values.filter((v): v is string => typeof v === 'string' && v.length > 0).sort()
  return giltiga[0] ?? null
}

export function computeActivation(
  rows: ActivationRow[],
  business: { created_at: string | null; onboarding_completed_at: string | null },
): ActivationMetrics {
  const start = business.onboarding_completed_at
  const riktiga = rows.filter(r => r.approval_type !== 'team_intro')
  const godkanda = riktiga.filter(r => r.status === 'approved' && r.resolved_at)
  const utforda = godkanda.filter(r => r.outcome === 'success')
  const kvitterbara = utforda.filter(r => KVITTOTYPER.has(r.approval_type))
  return {
    onboardingHours: timmar(business.created_at, start),
    firstFindingH: start ? timmar(start, minIso(riktiga.map(r => r.created_at))) : null,
    firstApprovalH: start ? timmar(start, minIso(godkanda.map(r => r.resolved_at))) : null,
    firstExecutedH: start ? timmar(start, minIso(utforda.map(r => r.resolved_at))) : null,
    firstReceiptH: start ? timmar(start, minIso(kvitterbara.map(r => r.resolved_at))) : null,
  }
}

/** Kort etikett för admin-tabellen: "fynd 2 h · beslut 5 h · utfört 5 h · kvitto —" */
export function formatActivation(m: ActivationMetrics): string {
  const h = (v: number | null) => (v == null ? '—' : v < 1 ? `${Math.round(v * 60)} min` : `${Math.round(v)} h`)
  return `fynd ${h(m.firstFindingH)} · beslut ${h(m.firstApprovalH)} · utfört ${h(m.firstExecutedH)} · kvitto ${h(m.firstReceiptH)}`
}
