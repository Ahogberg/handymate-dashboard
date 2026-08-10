/**
 * Ägarrapporten — månadens värde i FYRA block med TRE sanningsnivåer
 * (Spår A1, 2026-08-10; absorberat ur externa rapporten via rådsaddendumet).
 *
 * ═══ VARFÖR ═══
 *
 * Garantimodellen (betala direkt, pengarna tillbaka) behöver sitt
 * retention-argument på en yta: "Handymate har kostat X kr — och bidragit
 * till Y kr bekräftat värde." Komponenterna fanns redan (värdekvittot,
 * weekly-value, pengar på bordet, billing) — det som saknades var
 * sammanställningen som ALDRIG blandar sanningsnivåerna.
 *
 * ═══ SANNINGSNIVÅERNA (facit i tests/agarrapport.spec.ts) ═══
 *
 * 1. BEKRÄFTAT — enbart värdekvittots confirmed_kr (attributionskärnan,
 *    verifierade händelser). Aldrig en schablon, aldrig en uppskattning.
 * 2. UPPSKATTAT — admin-tid och samtal, alltid MÄRKT uppskattad, aldrig
 *    inräknad i bekräftat. Saknas datat är blocket null, aldrig nollor
 *    som ser mätta ut.
 * 3. VILANDE — pengar-på-bordet-potentialen. Egen nivå, egen etikett.
 *
 * KOSTNADEN är sin egen sort: den visas BARA när källan är säker
 * (aktiv prenumeration med Stripe-koppling + pris ur billing_plan —
 * B7-bevisade fält). Saknas säker källa finns ingen rad — en gissad
 * kostnad i ett retention-argument vore värre än ingen (lärdomen
 * 2026-05-30: Stripe-speglande fält är cache, inte sanning).
 *
 * Posten är fryst — en rapport redigeras inte.
 */

import type { Vardekvitto, VardekvittoRad } from '@/lib/value/vardekvitto'

export const AGARRAPPORT_METHOD_VERSION = 1

export interface AgarrapportUppskattat {
  adminTimmar: number
  samtalFangade: number
  automatiskaAtgarder: number
}

export interface AgarrapportKostnad {
  kr: number
  planNamn: string | null
}

export interface Agarrapport {
  period: string
  /** Nivå 1 — attributionskärnans verifierade kronor + bevisraderna. */
  bekraftat: { kr: number; rader: VardekvittoRad[] }
  /** Nivå 2 — alltid märkt uppskattad. null = datat saknas (inte noll). */
  uppskattat: AgarrapportUppskattat | null
  /** Nivå 3 — vilande potential. null = inte läst här (ytan bär den). */
  vilandeKr: number | null
  /** Bara vid säker källa — annars null och INGEN rad renderas. */
  kostnad: AgarrapportKostnad | null
  method_version: number
}

/** Ren sammanställare — ingen nivå läcker in i en annan. */
export function byggAgarrapport(input: {
  kvitto: Vardekvitto
  uppskattat: AgarrapportUppskattat | null
  vilandeKr: number | null
  kostnad: AgarrapportKostnad | null
}): Agarrapport {
  return Object.freeze({
    period: input.kvitto.period,
    bekraftat: Object.freeze({
      kr: input.kvitto.confirmed_kr,
      rader: input.kvitto.confirmed_items,
    }),
    uppskattat: input.uppskattat ? Object.freeze({ ...input.uppskattat }) : null,
    vilandeKr: input.vilandeKr === null ? null : Math.max(0, Math.round(input.vilandeKr)),
    kostnad:
      input.kostnad && Number.isFinite(input.kostnad.kr) && input.kostnad.kr > 0
        ? Object.freeze({ kr: Math.round(input.kostnad.kr), planNamn: input.kostnad.planNamn ?? null })
        : null,
    method_version: AGARRAPPORT_METHOD_VERSION,
  })
}

/**
 * Retention-raden — formuleras BARA när båda talen är sanna samtidigt.
 * Ett bekräftat värde på noll är fortfarande ett ärligt besked; då sägs
 * kostnaden utan jämförelse i stället för en pinsam kvot.
 */
export function retentionRad(rapport: Agarrapport): string | null {
  if (!rapport.kostnad) return null
  const kostnad = `${rapport.kostnad.kr.toLocaleString('sv-SE')} kr`
  if (rapport.bekraftat.kr > 0) {
    return `Handymate har kostat ${kostnad} den här månaden — och bidragit till ${rapport.bekraftat.kr.toLocaleString('sv-SE')} kr bekräftat värde.`
  }
  return `Handymate kostar ${kostnad} i månaden. Bekräftat värde räknas först när teamets förslag leder till betalda kronor.`
}
