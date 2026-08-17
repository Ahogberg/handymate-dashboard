/**
 * Förslagschipsen på startsidans andra fråga — Goal-to-Plan V1 (Etapp C,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * ═══ INGA PÅHITTADE CHIPS ═══
 *
 * Varje chip härleds ur en verklig signal som redan finns i produktionen —
 * inget här uppfinner en kategori. Utan signaler blir svaret en tom lista,
 * aldrig ett hittepå-förslag. Ren funktion, ingen I/O (facit i
 * tests/mission-suggestions.spec.ts) — GET /api/mission/suggestions gör
 * läsningarna och anropar den här.
 *
 * Prioritet (förfallet > tunn vecka > återaktivering > marginalrisk) och
 * taket på tre chips är medvetna: hantverkaren ska kunna skumma raden på en
 * sekund, inte välja bland fem alternativ.
 */

export type MissionSuggestionKind = 'forfallet' | 'tunn_vecka' | 'reaktivering' | 'marginalrisk'

export interface MissionSuggestion {
  id: string
  label: string
  prefillText: string
  signalKind: MissionSuggestionKind
}

export interface ComposeSuggestionsInput {
  /** Delmängden av buildPengarSummary-svaret chipsen behöver. */
  pengar: { forfallet_kr: number; marginalrisk_count: number } | null
  /** Från getWeekCapacity (NÄSTA vecka) — thin räknas bara när configured. */
  capacity: { thin: boolean; configured: boolean } | null
  /** Toppgruppen ur summarizeQuietCustomersByJobType. */
  reactivation: { job_type: string; count: number; quietMonths: number } | null
}

const MAX_SUGGESTIONS = 3

/**
 * Naturlig svensk possessiv-/adjektivform för de vanligaste jobbtyperna —
 * DUPLICERAD (med flit, se tasks/jaunty-pondering-hummingbird.md Etapp C)
 * ur components/jarvis/ReaktiveringsInsikt.tsx:s jobTypeLabel. Den
 * komponenten är en 'use client'-fil; den här modulen läses även
 * server-side (API-rutten), så en delad export över klientgränsen
 * undviks hellre än att dra in en komponentfil i en server-modul.
 * Håll de två mapparna i synk manuellt om nya jobbtyper läggs till.
 */
function jobTypeLabel(jobType: string): string {
  const known: Record<string, string> = {
    badrum: 'badrums',
    kök: 'köks',
    el: 'el',
    tak: 'tak',
    vvs: 'vvs',
  }
  const knownLabel = known[jobType.toLowerCase()]
  if (knownLabel) return knownLabel
  return jobType.charAt(0).toUpperCase() + jobType.slice(1)
}

export function composeSuggestions(input: ComposeSuggestionsInput): MissionSuggestion[] {
  const suggestions: MissionSuggestion[] = []

  if (input.pengar && input.pengar.forfallet_kr > 0) {
    suggestions.push({
      id: 'forfallet',
      label: 'Få in pengar före fredag',
      prefillText:
        'Jag vill få in pengarna från de förfallna fakturorna före fredag. Gör en plan: vilka kunder, vilka belopp, och i vilken ordning vi agerar.',
      signalKind: 'forfallet',
    })
  }

  if (input.capacity && input.capacity.configured && input.capacity.thin) {
    suggestions.push({
      id: 'tunn-vecka',
      label: 'Fyll nästa veckas luckor',
      prefillText:
        'Nästa vecka ser tunn ut i kalendern. Hjälp mig fylla luckorna — gå igenom öppna offerter och tidigare kunder och föreslå en plan.',
      signalKind: 'tunn_vecka',
    })
  }

  if (input.reactivation && input.reactivation.count > 0) {
    const label = jobTypeLabel(input.reactivation.job_type)
    suggestions.push({
      id: `reaktivering-${input.reactivation.job_type}`,
      label: `Återaktivera tidigare ${label}kunder`,
      prefillText: `Jag vill återaktivera tidigare ${label}-kunder som varit tysta. Väg in kapacitet och pågående kundkontakter innan du föreslår något.`,
      signalKind: 'reaktivering',
    })
  }

  if (input.pengar && input.pengar.marginalrisk_count > 0) {
    suggestions.push({
      id: 'marginalrisk',
      label: 'Skydda marginalen i riskprojekten',
      prefillText: 'Skydda marginalen i projekten som ligger risigt till. Visa vilka projekt det gäller och vad vi kan göra nu.',
      signalKind: 'marginalrisk',
    })
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}
