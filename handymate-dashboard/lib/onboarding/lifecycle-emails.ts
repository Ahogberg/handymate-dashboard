/**
 * Livscykelmailen efter slutförd onboarding (Etapp B4, 2026-09-02).
 *
 * Det fanns EN touchpoint: dag 7. Ett konto som kört fast dag 3 hörde
 * ingenting från oss förrän en vecka senare, och sedan aldrig igen — i en
 * produkt vars hela poäng är att företaget ska komma igång på egen hand.
 *
 * Schemat är [2, 7, 14] och innehållet härleds ur kontots VERKLIGA luckor
 * (lib/onboarding/kom-igang-signals.ts) respektive dess adoption
 * (lib/admin/adoption.ts) — aldrig generisk drip:
 *   dag 2  — vad teamet redan gjort + den viktigaste luckan
 *   dag 7  — veckans siffror + nästa väntande kort (oförändrat)
 *   dag 14 — bara till konton som ännu inte är aktiva på fyra ytor;
 *            är de aktiva skickas INGET mail (ingen brus åt den som lyckats)
 *
 * Fönstret per dag är tre dygn brett av samma skäl som dag 7 alltid haft det:
 * en missad cron-körning ska självläka nästa dag i stället för att kontot
 * missar mailet permanent. Flaggan i business_preferences hindrar dubletter.
 */

export const LIVSCYKEL_DAGAR = [2, 7, 14] as const
export type LivscykelDag = (typeof LIVSCYKEL_DAGAR)[number]

/** Så många dygn brett fönstret är, så en missad körning läker nästa dag */
export const FONSTER_DYGN = 3

const DYGN_MS = 86_400_000

/** business_preferences-nyckeln för en dag. Dag 7 behåller sitt gamla namn. */
export function flaggaFor(dag: LivscykelDag): string {
  return `onboarding_day${dag}_email`
}

export function amneFor(dag: LivscykelDag): string {
  switch (dag) {
    case 2:
      return 'Så här har teamet börjat'
    case 7:
      return 'Din första vecka med Handymate'
    case 14:
      return 'Tre saker som tar fem minuter'
  }
}

export interface Fonster {
  /** Inklusive — tidigaste starttidpunkt som kvalificerar */
  fran: string
  /** Exklusive — senaste starttidpunkt som kvalificerar */
  till: string
}

/**
 * Fönstret för en dag: konton vars start ligger [dag, dag+3) dygn tillbaka.
 * Ren funktion av klockan — ingen I/O, testbar.
 */
export function fonsterFor(dag: LivscykelDag, nowMs: number): Fonster {
  return {
    fran: new Date(nowMs - (dag + FONSTER_DYGN) * DYGN_MS).toISOString(),
    till: new Date(nowMs - dag * DYGN_MS).toISOString(),
  }
}

/**
 * Dag 14 går bara till den som ännu inte kommit igång. Den som redan är
 * aktiv på fyra ytor får inget mail alls — flaggan sätts ändå så vi inte
 * frågar om samma konto varje dag under fönstret.
 */
export function skaSkickaDag14(antalYtor: number, troskel: number): boolean {
  return antalYtor < troskel
}
