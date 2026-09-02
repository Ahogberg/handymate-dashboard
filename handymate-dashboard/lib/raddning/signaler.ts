/**
 * Räddningskön — rena bedömare (docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md
 * §3, tasks/plan-raddningsko.md Del 1).
 *
 * En bedömare per signal. Alla tar redan hämtade rader (ingen I/O här) och
 * ett `now` (så testerna är deterministiska) och returnerar ett
 * RaddningsFynd eller null. Cronen (app/api/cron/raddningsko/route.ts)
 * hämtar raderna per företag och kör bedömarna — den här filen vet inget
 * om Supabase.
 *
 * Trösklarna är exakt de i planen: 24/72 h (onboarding), 48 h (kanal), 72 h
 * (aktivering), 7 d (offert), 3 d (uppdrag), 5 d/48 h+24 h (kort), ≥3
 * (handlingar/kort-severity).
 */

import type { FunnelRecord } from '@/lib/onboarding/funnel'
import { STEG_ETIKETTER } from '@/lib/onboarding/funnel'
import type { ChannelHealth } from '@/lib/onboarding/channel-health'
import type { ActivationMetrics } from '@/lib/admin/activation-metrics'
import { RECEIPT_APPROVAL_TYPES } from '@/lib/approvals/value-receipt'
import { extractExecutionArtifacts } from '@/lib/approvals/execution-outcome'

export type Signal =
  | 'onboarding_stannat'
  | 'ingen_verifierad_kanal'
  | 'ingen_aktivering'
  | 'ingen_offert'
  | 'inget_uppdrag'
  | 'integration_bruten'
  | 'misslyckad_handling'
  | 'fastnat_kort'
  | 'falsk_framgang'
  | 'manuell_fix_kravdes'

export type Severity = 'hog' | 'medel' | 'lag'

export interface RaddningsFynd {
  business_id: string
  signal: Signal
  severity: Severity
  summary: string
  evidence: Record<string, unknown>
}

/** Svenska etiketter för admin-UI:t (RaddningskoTab). */
export const SIGNAL_LABELS: Record<Signal, string> = {
  onboarding_stannat: 'Onboarding stannade',
  ingen_verifierad_kanal: 'Ingen verifierad kanal',
  ingen_aktivering: 'Ingen aktivering',
  ingen_offert: 'Ingen offert',
  inget_uppdrag: 'Inget uppdrag',
  integration_bruten: 'Integration bruten',
  misslyckad_handling: 'Misslyckad handling',
  fastnat_kort: 'Fastnat kort',
  falsk_framgang: 'Falsk framgång',
  manuell_fix_kravdes: 'Manuell fix krävdes',
}

const TIMME_MS = 3_600_000
const DYGN_MS = 24 * TIMME_MS

function timmarSedan(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return (now.getTime() - t) / TIMME_MS
}

function timmarTill(iso: string | null | undefined, now: Date): number | null {
  const s = timmarSedan(iso, now)
  return s === null ? null : -s
}

// ─── 1. Onboarding stannade ─────────────────────────────────────────────

export interface OnboardingRad {
  business_id: string
  created_at: string
  onboarding_completed_at: string | null
}

function senasteFunnelStampel(funnel: FunnelRecord): string | null {
  const värden = Object.values(funnel.reached).filter((v): v is string => typeof v === 'string')
  if (värden.length === 0) return null
  return [...värden].sort().at(-1) ?? null
}

function hogstaFunnelSteg(funnel: FunnelRecord): number {
  const steg = Object.keys(funnel.reached).map(Number).filter(n => Number.isFinite(n))
  return steg.length > 0 ? Math.max(...steg) : 0
}

/**
 * onboarding_completed_at null + (senaste _funnel-stämpel, annars
 * created_at) äldre än 24 h ⇒ medel, äldre än 72 h ⇒ hög.
 */
export function bedomOnboarding(
  row: OnboardingRad,
  funnel: FunnelRecord | null,
  now: Date,
): RaddningsFynd | null {
  if (row.onboarding_completed_at) return null
  const referens = (funnel && senasteFunnelStampel(funnel)) || row.created_at
  const timmar = timmarSedan(referens, now)
  if (timmar === null || timmar < 24) return null

  const steg = funnel ? hogstaFunnelSteg(funnel) : 0
  const etikett = steg > 0 ? (STEG_ETIKETTER[steg] || String(steg)) : 'Intro'
  const severity: Severity = timmar >= 72 ? 'hog' : 'medel'
  const avrundat = Math.round(timmar)

  return {
    business_id: row.business_id,
    signal: 'onboarding_stannat',
    severity,
    summary: `Fastnade på steg ${steg} (${etikett}) för ${avrundat} h sedan`,
    evidence: { steg, etikett, timmar_sedan: avrundat },
  }
}

// ─── 2. Ingen verifierad kanal ──────────────────────────────────────────

/**
 * Klar sedan > 48 h och ingen av företagets kanaler har hunnit
 * channel_verified/lead_verified (deriveChannelHealth, körd av anroparen —
 * denna funktion läser bara resultatet).
 */
export function bedomKanal(
  businessId: string,
  halsa: ChannelHealth[],
  klarSedanH: number | null,
): RaddningsFynd | null {
  if (klarSedanH === null || klarSedanH <= 48) return null
  const nagonVerifierad = halsa.some(
    k => k.state === 'channel_verified' || k.state === 'lead_verified',
  )
  if (nagonVerifierad) return null

  return {
    business_id: businessId,
    signal: 'ingen_verifierad_kanal',
    severity: 'hog',
    summary: `Klar sedan ${Math.round(klarSedanH)} h — ingen kanal verifierad`,
    evidence: { klar_sedan_h: Math.round(klarSedanH), kanaler: halsa.map(k => k.state) },
  }
}

// ─── 3. Ingen aktivering ────────────────────────────────────────────────

/** Klar sedan > 72 h och inget godkänt kort (firstApprovalH null). */
export function bedomAktivering(
  businessId: string,
  metrics: Pick<ActivationMetrics, 'firstApprovalH'>,
  klarSedanH: number | null,
): RaddningsFynd | null {
  if (klarSedanH === null || klarSedanH <= 72) return null
  if (metrics.firstApprovalH !== null) return null

  return {
    business_id: businessId,
    signal: 'ingen_aktivering',
    severity: 'medel',
    summary: `Klar sedan ${Math.round(klarSedanH)} h — inget kort godkänt än`,
    evidence: { klar_sedan_h: Math.round(klarSedanH) },
  }
}

// ─── 4. Ingen offert ────────────────────────────────────────────────────

/** Klar sedan > 7 dygn och 0 skickade offerter. */
export function bedomOffert(
  businessId: string,
  antalSkickade: number,
  klarSedanH: number | null,
): RaddningsFynd | null {
  if (klarSedanH === null || klarSedanH <= 7 * 24) return null
  if (antalSkickade > 0) return null

  return {
    business_id: businessId,
    signal: 'ingen_offert',
    severity: 'medel',
    summary: `Klar sedan ${Math.round(klarSedanH / 24)} dygn — ingen offert skickad`,
    evidence: { klar_sedan_h: Math.round(klarSedanH), antal_skickade: antalSkickade },
  }
}

// ─── 5. Inget uppdrag ───────────────────────────────────────────────────

/** Klar sedan > 3 dygn och 0 uppdrag (mission). */
export function bedomUppdrag(
  businessId: string,
  antalMission: number,
  klarSedanH: number | null,
): RaddningsFynd | null {
  if (klarSedanH === null || klarSedanH <= 3 * 24) return null
  if (antalMission > 0) return null

  return {
    business_id: businessId,
    signal: 'inget_uppdrag',
    severity: 'lag',
    summary: `Klar sedan ${Math.round(klarSedanH / 24)} dygn — inget uppdrag skapat`,
    evidence: { klar_sedan_h: Math.round(klarSedanH), antal_mission: antalMission },
  }
}

// ─── 6. Integration bruten ──────────────────────────────────────────────

export interface IntegrationSignaler {
  fortnoxConnected: boolean
  tokenExpiresAt: string | null
  synkfel25h: number
}

/** Fortnox anslutet och (token utgången eller minst ett synkfel) ⇒ hög. */
export function bedomIntegration(
  businessId: string,
  signaler: IntegrationSignaler,
  now: Date,
): RaddningsFynd | null {
  if (!signaler.fortnoxConnected) return null
  const tokenUtgangetH = signaler.tokenExpiresAt ? timmarSedan(signaler.tokenExpiresAt, now) : null
  const tokenUtganget = tokenUtgangetH !== null && tokenUtgangetH > 0
  if (!tokenUtganget && signaler.synkfel25h <= 0) return null

  return {
    business_id: businessId,
    signal: 'integration_bruten',
    severity: 'hog',
    summary: tokenUtganget
      ? 'Fortnox-token har gått ut'
      : `Fortnox-synk misslyckades ${signaler.synkfel25h} gång${signaler.synkfel25h === 1 ? '' : 'er'} senaste dygnet`,
    evidence: { token_utganget: tokenUtganget, synkfel_25h: signaler.synkfel25h },
  }
}

// ─── 7. Misslyckad handling ─────────────────────────────────────────────

/** Misslyckad automation senaste dygnet: > 0 ⇒ medel, ≥ 3 ⇒ hög. */
export function bedomHandlingar(businessId: string, antalFailed25h: number): RaddningsFynd | null {
  if (antalFailed25h <= 0) return null
  const severity: Severity = antalFailed25h >= 3 ? 'hog' : 'medel'
  return {
    business_id: businessId,
    signal: 'misslyckad_handling',
    severity,
    summary: `${antalFailed25h} misslyckad${antalFailed25h === 1 ? '' : 'e'} handling${antalFailed25h === 1 ? '' : 'ar'} senaste dygnet`,
    evidence: { antal_failed_25h: antalFailed25h },
  }
}

// ─── 8. Fastnat kort ────────────────────────────────────────────────────

export interface PendingKortRad {
  id: string
  created_at: string
  expires_at: string | null
}

/**
 * Pending äldre än 5 dygn, eller pending äldre än 48 h med expires_at inom
 * 24 h ⇒ fastnat. Severity lag som grund, medel om ≥ 3 fastnade kort.
 */
export function bedomKort(
  businessId: string,
  rader: PendingKortRad[],
  now: Date,
): RaddningsFynd | null {
  const fastnade = rader.filter(rad => {
    const alderH = timmarSedan(rad.created_at, now)
    if (alderH === null) return false
    if (alderH > 5 * 24) return true
    if (alderH > 48) {
      const garUtOmH = timmarTill(rad.expires_at, now)
      if (garUtOmH !== null && garUtOmH <= 24) return true
    }
    return false
  })
  if (fastnade.length === 0) return null

  const severity: Severity = fastnade.length >= 3 ? 'medel' : 'lag'
  return {
    business_id: businessId,
    signal: 'fastnat_kort',
    severity,
    summary: `${fastnade.length} kort har fastnat i väntan på beslut`,
    evidence: { antal: fastnade.length, kort_id: fastnade.slice(0, 5).map(r => r.id) },
  }
}

// ─── 9. Falsk framgång ──────────────────────────────────────────────────

export interface GodkantKortRad {
  id: string
  approval_type: string
  execution_result: Record<string, unknown> | null
}

const RECEIPT_TYPES = new Set<string>(RECEIPT_APPROVAL_TYPES)

/**
 * Godkända kort av kvittotyp (RECEIPT_APPROVAL_TYPES) vars
 * execution_result.outcome = 'success' men utan extraherbara artefakter
 * (extractExecutionArtifacts tom) — "lyckat" utan bevis.
 */
export function bedomFalskFramgang(businessId: string, rader: GodkantKortRad[]): RaddningsFynd | null {
  const falska = rader.filter(rad => {
    if (!RECEIPT_TYPES.has(rad.approval_type)) return false
    const outcome = rad.execution_result?.outcome
    if (outcome !== 'success') return false
    const artifacts = extractExecutionArtifacts(rad.execution_result)
    return !artifacts
  })
  if (falska.length === 0) return null

  return {
    business_id: businessId,
    signal: 'falsk_framgang',
    severity: 'hog',
    summary: `${falska.length} kort markerat lyckat utan bevis på utfört arbete`,
    evidence: { antal: falska.length, kort_id: falska.slice(0, 5).map(r => r.id) },
  }
}
