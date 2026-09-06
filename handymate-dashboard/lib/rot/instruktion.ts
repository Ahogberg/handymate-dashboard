/**
 * Hantverkarens egen instruktion om avdrag (2026-09-06).
 *
 * Fynd vid Codex driftprov på Nordström El: underlaget sa ordagrant "Ingen
 * ROT eller RUT i detta prov", men offerten fick ROT ändå. Orsaken: ROT-
 * rätten avgörs av bedomAvdrag() (lib/rot/ratt.ts) mot jobbtypen, och den
 * läser aldrig vad hantverkaren själv skrev. Ett belagt "ja" från tabellen
 * slog alltså en uttrycklig instruktion.
 *
 * Regeln här: en uttrycklig instruktion om att INTE använda avdrag är ett
 * belagt nej — hantverkaren är den som vet om kunden har rätt till avdrag i
 * just det här jobbet. Den går före tabellen. Motsatsen (en instruktion om
 * att avdrag SKA användas) tolkas inte här: att slå på ROT är ett påstående
 * mot Skatteverket och ska fortfarande gå via bedomAvdrag eller hantverkarens
 * eget kryss i offertbyggaren.
 *
 * Ren funktion, ingen databas, ingen modell. Mönstren är avsiktligt snäva:
 * ett nekande ord direkt före avdragsordet. "ROT-avdrag önskas" eller
 * "kunden vill ha ROT" träffar aldrig.
 */
import type { RottBesked } from './ratt'

export const AVDRAGS_KALLA_INSTRUKTION = 'Hantverkarens egen instruktion i underlaget'

/** Nekande ord följt av avdragsord, med valfritt bindestreck/snedstreck emellan
 *  ("ingen ROT", "inget ROT-/RUT-avdrag", "utan avdrag", "ej rot eller rut"). */
const NEKANDE_FORE = /\b(ingen|inget|inga|utan|ej|inte)\s+(rot(?:[-/ ]*(?:eller\s+)?rut)?|rut|rot-?avdrag|rut-?avdrag|avdrag|skattereduktion|skatteavdrag)\b/i

/** Avdragsord följt av "ska inte"/"skall ej" ("ROT ska inte användas"). */
const AVDRAG_SKA_INTE = /\b(rot|rut|avdrag|skattereduktion)[^.\n]{0,25}\b(ska|skall)\s+(inte|ej)\b/i

/** "ROT: nej", "avdrag nej" i punktform. */
const AVDRAG_NEJ = /\b(rot|rut|avdrag)\s*[:=-]?\s*nej\b/i

export const INSTRUKTIONSMONSTER: ReadonlyArray<RegExp> = [NEKANDE_FORE, AVDRAG_SKA_INTE, AVDRAG_NEJ]

/**
 * Returnerar ett belagt nej när texten uttryckligen säger att inget
 * ROT-/RUT-avdrag ska användas, annars null (ingen åsikt — tabellen avgör).
 */
export function tolkaAvdragsinstruktion(text: string | null | undefined): Extract<RottBesked, { utfall: 'nej' }> | null {
  const t = (text || '').trim()
  if (!t) return null
  if (!INSTRUKTIONSMONSTER.some(re => re.test(t))) return null
  return {
    utfall: 'nej',
    grund: 'Du skrev i underlaget att inget ROT-/RUT-avdrag ska användas i den här offerten.',
    kalla: AVDRAGS_KALLA_INSTRUKTION,
  }
}
