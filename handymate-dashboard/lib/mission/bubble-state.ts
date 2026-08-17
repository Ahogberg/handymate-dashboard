/**
 * Matte-bubblans lägesetiketter — Goal-to-Plan V1 (Etapp C,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Bubblan bär EN pill-slot i stängt läge. Ren precedensfunktion, ingen I/O
 * — Jobbkompisen.tsx matar in det den redan har (aktivt uppdrag + väntande
 * beslut ur useMission(), osedda kronor ur useMoments()) och byter etikett
 * efter svaret. Facit i tests/bubble-state.spec.ts.
 */

export type BubbleState = 'kraver_beslut' | 'aktivt_uppdrag' | 'kr_pill' | 'idle'

/** Samma tröskel som Jobbkompisens tidigare hårdkodade "kr hittat"-pill —
 *  flyttad hit så det bara finns EN sanning om beloppsgränsen. */
export const KR_PILL_THRESHOLD = 10_000

export interface BubbleStateInput {
  /** Finns ett uppdrag OCH är det aktivt (status 'active')? */
  hasActiveMission: boolean
  /** progress.decisions_outstanding — bara meningsfullt när ett uppdrag finns. */
  decisionsOutstanding: number
  /** Summan av osedda verkliga fynd-kronor (useMoments().unseenKr). */
  unseenKr: number
}

/**
 * Precedens: ett uppdrag som väntar på ett beslut vinner alltid, sedan ett
 * uppdrag utan väntande beslut, sedan kronpillen, annars dagens tysta läge.
 */
export function deriveBubbleState(input: BubbleStateInput): BubbleState {
  if (input.hasActiveMission && input.decisionsOutstanding > 0) return 'kraver_beslut'
  if (input.hasActiveMission) return 'aktivt_uppdrag'
  if (input.unseenKr >= KR_PILL_THRESHOLD) return 'kr_pill'
  return 'idle'
}
