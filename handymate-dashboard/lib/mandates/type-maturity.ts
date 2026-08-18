/**
 * Etapp Y — kvantifierad grind (Mission Mandates V1,
 * tasks/jaunty-pondering-hummingbird.md). Ren funktion, INGEN I/O, INGEN
 * krypto-import — importerbar var som helst, inklusive klient-/edge-bygget
 * (samma isolationsskäl som lib/mandates/types.ts:s filhuvud förklarar,
 * det som tvingade MANDATE_ALLOWED_TYPES ut ur mission-mandate.ts).
 *
 * ═══ VAD DEN HÄR FILEN GÖR ═══
 *
 * Gör typ-trappans öppning (planens "Vägen till fullständighet") MEKANISK
 * istället för magkänsla: `bedomTypMognad` läser platformens per-typ-facit
 * (lib/mandates/mandate-facit.ts:s räknade fakta, aggregerat över ALLA
 * företag av lib/mandates/platform-maturity.ts) och svarar mogen/omogen mot
 * NAMNGIVNA konstanter. Andreas justerar siffrorna vid granskning — koden
 * ändras aldrig i smyg för att en typ "borde" få öppnas.
 *
 * ═══ ALDRIG DELBETYG ═══
 *
 * `mogen` är true bara när ALLA fem kriterier är uppfyllda. Ett kriterium
 * som nästan klarar gränsen är fortfarande INTE uppfyllt — det finns ingen
 * viktning, inget genomsnitt, ingen "4 av 5 räcker".
 *
 * ═══ 0 UTFÖRDA ÄR INTE ETT RENT LEVERANSFEL-FACIT ═══
 *
 * Leveransfel-kriteriet (andel av utförda) kan bara vara uppfyllt när det
 * FINNS utförda att räkna på. Med 0 utförda visas ärligt "0% av 0" — men
 * kriteriet räknas som INTE uppfyllt, exakt som mandate-facit.ts:s ärlighet
 * om ej_bedombart: en tyst nolla är inte samma sak som ett bevisat rent
 * facit. (MIN_EXECUTED-kriteriet fångar redan detta fall separat, men
 * leveransfel-kriteriet ska aldrig av misstag ge falskt sken av att vara
 * "klart" bara för att täljaren råkar vara 0.)
 *
 * ═══ ÖPPNING KRÄVER TRE LÅS, INTE BARA MOGEN=TRUE ═══
 *
 * mogen=true är BEVISET, inte beslutet. Att faktiskt öppna en ny typ kräver
 * dessutom Andreas uttryckliga godkännande och en migration som vidgar
 * mission_mandate.allowed_action_types CHECK-begränsningen
 * (sql/v150_mission_mandate.sql:s mandate_types_within_allowlist). Den här
 * filen skriver ingenting, öppnar ingenting — den bedömer bara.
 */

import type { MandateActionType } from './types'

// ─────────────────────────────────────────────────────────────────
// Namngivna trösklar (startförslag, Andreas justerar vid granskning).
// ─────────────────────────────────────────────────────────────────

export const MATURITY_MIN_EXECUTED = 25
export const MATURITY_MAX_STOPP = 0
export const MATURITY_MAX_DELIVERY_FAILURE_PCT = 2
export const MATURITY_MAX_SAFETY_REVOCATIONS = 0
export const MATURITY_MIN_HISTORY_DAYS = 30

export interface MaturityCriterion {
  /** Vad som krävs, på svenska (t.ex. "Minst 25 utförda utskick"). */
  krav: string
  uppfyllt: boolean
  /** Räknat läge, t.ex. "12/25", "0 STOPP", "18/30 dagar". */
  varde: string
}

export interface TypeMaturity {
  action_type: MandateActionType
  /** ALLA kriterier uppfyllda — aldrig delbetyg. */
  mogen: boolean
  kriterier: MaturityCriterion[]
}

/** Rundar till högst en decimal och trimmar en onödig ".0" — "2.0" → "2",
    "8.333..." → "8.3". Ren formatteringsdetalj, ingen affärslogik. */
function formatPct(n: number): string {
  const rounded = Math.round(n * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

/** Antal hela dagar mellan forsta_utford_iso och nowIso. Ogiltigt eller
    saknat datum ⇒ 0 dagar (fail-closed: hellre underskatta historiken än
    hitta på ett datum). Ett nowIso "före" startdatumet (skulle aldrig
    hända i praktiken) klampas också till 0, inte ett negativt tal. */
function historyDays(forstaUtfordIso: string | null, nowIso: string): number {
  if (!forstaUtfordIso) return 0
  const startMs = Date.parse(forstaUtfordIso)
  const nowMs = Date.parse(nowIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) return 0
  const days = Math.floor((nowMs - startMs) / (24 * 3600_000))
  return days < 0 ? 0 : days
}

export function bedomTypMognad(input: {
  action_type: MandateActionType
  utforda: number
  leveransfel: number
  stopp_inom_7d: number
  sakerhets_aterkallelser: number
  forsta_utford_iso: string | null
  nowIso: string
}): TypeMaturity {
  const { action_type, utforda, leveransfel, stopp_inom_7d, sakerhets_aterkallelser, forsta_utford_iso, nowIso } = input

  const executedOk = utforda >= MATURITY_MIN_EXECUTED
  const stoppOk = stopp_inom_7d <= MATURITY_MAX_STOPP

  const failurePct = utforda > 0 ? (leveransfel / utforda) * 100 : 0
  // 0 utförda kan aldrig räknas som ett uppfyllt leveransfel-kriterium —
  // se filhuvudets "0 UTFÖRDA ÄR INTE ETT RENT LEVERANSFEL-FACIT".
  const failureOk = utforda > 0 && failurePct <= MATURITY_MAX_DELIVERY_FAILURE_PCT

  const revocationsOk = sakerhets_aterkallelser <= MATURITY_MAX_SAFETY_REVOCATIONS

  const days = historyDays(forsta_utford_iso, nowIso)
  const historyOk = days >= MATURITY_MIN_HISTORY_DAYS

  const kriterier: MaturityCriterion[] = [
    {
      krav: `Minst ${MATURITY_MIN_EXECUTED} utförda utskick`,
      uppfyllt: executedOk,
      varde: `${utforda}/${MATURITY_MIN_EXECUTED}`,
    },
    {
      krav: `Högst ${MATURITY_MAX_STOPP} STOPP inom 7 dagar efter kontakt`,
      uppfyllt: stoppOk,
      varde: `${stopp_inom_7d} STOPP`,
    },
    {
      krav: `Högst ${MATURITY_MAX_DELIVERY_FAILURE_PCT}% leveransfel`,
      uppfyllt: failureOk,
      varde: `${formatPct(failurePct)}% av ${utforda}`,
    },
    {
      krav: `Högst ${MATURITY_MAX_SAFETY_REVOCATIONS} säkerhetsåterkallelser`,
      uppfyllt: revocationsOk,
      varde: `${sakerhets_aterkallelser} återkallelser`,
    },
    {
      krav: `Minst ${MATURITY_MIN_HISTORY_DAYS} dagars historik`,
      uppfyllt: historyOk,
      varde: `${days}/${MATURITY_MIN_HISTORY_DAYS} dagar`,
    },
  ]

  return {
    action_type,
    mogen: kriterier.every(k => k.uppfyllt),
    kriterier,
  }
}
