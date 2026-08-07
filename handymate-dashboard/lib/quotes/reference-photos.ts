import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Referensfoton i kundens offert — förberedd men avstängd.
 *
 * Kunden samlar två-tre offerter och jämför. Vår ska vara den enda som visar
 * hur jobbet faktiskt blev. Hantverkaren har redan fotona (project_photos från
 * projekten) — de har bara aldrig nått offerten.
 *
 * ÄRLIGHETSREGELN: vi påstår bara "liknande jobb" när orden i offertens titel
 * faktiskt överlappar projektets. Utan överlapp visas fotona som "tidigare
 * jobb" — vilket är sant — i stället för att antyda en likhet som inte finns.
 *
 * Matchningen behålls för en framtida samtyckesmodell och är facit-testad i
 * tests/reference-photos.spec.ts. Själva hämtningen är fail-closed tills
 * project_photos har en uttrycklig publicerings-/samtyckesflagga.
 */

export interface ReferencePhotoCandidate {
  url: string
  caption?: string | null
  /** Projektets namn — grunden för likhetsbedömningen. */
  projectName?: string | null
  uploadedAt?: string | null
}

export interface ReferencePhotoSelection {
  photos: Array<{ url: string; caption: string | null }>
  /** true när fotona kommer från projekt vars namn liknar offertens. */
  isSimilar: boolean
  /** Rubriken kundvyn ska visa — aldrig ett påstående vi inte kan stå för. */
  heading: string
}

/** Ord som är för vanliga för att betyda något i en likhetsjämförelse. */
const STOPWORDS = new Set([
  'och', 'med', 'för', 'till', 'av', 'på', 'i', 'en', 'ett', 'den', 'det',
  'nytt', 'ny', 'nya', 'byte', 'arbete', 'jobb', 'offert', 'komplett',
])

/** Plockar ut meningsbärande ord ur en fri text. */
export function meaningfulWords(text: string | null | undefined): string[] {
  if (!text) return []
  return text
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length >= 4 && !STOPWORDS.has(word))
}

/** Delar minst ett meningsbärande ord? */
export function looksSimilar(quoteTitle: string | null | undefined, projectName: string | null | undefined): boolean {
  const quoteWords = new Set(meaningfulWords(quoteTitle))
  if (quoteWords.size === 0) return false
  return meaningfulWords(projectName).some(word => quoteWords.has(word))
}

export const MAX_REFERENCE_PHOTOS = 3

/**
 * Väljer vilka foton som ska följa med offerten.
 *
 * Liknande projekt först. Finns inga liknande används de senaste — men då
 * ändras rubriken, så kunden aldrig får intrycket att vi visar just deras
 * sorts jobb när vi inte gör det.
 */
export function selectReferencePhotos(
  candidates: ReferencePhotoCandidate[],
  quoteTitle: string | null | undefined,
): ReferencePhotoSelection {
  const similar = candidates.filter(c => looksSimilar(quoteTitle, c.projectName))
  const chosen = (similar.length > 0 ? similar : candidates).slice(0, MAX_REFERENCE_PHOTOS)

  return {
    photos: chosen.map(c => ({ url: c.url, caption: c.caption?.trim() || null })),
    isSimilar: similar.length > 0,
    heading: similar.length > 0 ? 'Liknande jobb vi gjort' : 'Tidigare jobb vi gjort',
  }
}

/**
 * Stoppgap 2026-08-07: project_photos saknar helt samtyckes-/publiceringsfält.
 * Att välja företagets senaste `type='after'`-bilder innebär därför att en
 * tidigare kunds projekt kan visas för en annan kund utan godkännande.
 *
 * Funktionen är avsiktligt DB-fri och returnerar alltid null tills Andreas har
 * beslutat modellen och en separat migration infört en explicit opt-in-flagga.
 */
export async function getReferencePhotos(
  _supabase: SupabaseClient,
  _businessId: string,
  _quoteTitle: string | null | undefined,
): Promise<ReferencePhotoSelection | null> {
  return null
}
