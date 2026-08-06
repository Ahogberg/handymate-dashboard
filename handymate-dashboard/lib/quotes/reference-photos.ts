import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Referensfoton i kundens offert — bevis utan arbete.
 *
 * Kunden samlar två-tre offerter och jämför. Vår ska vara den enda som visar
 * hur jobbet faktiskt blev. Hantverkaren har redan fotona (project_photos från
 * projekten) — de har bara aldrig nått offerten.
 *
 * ÄRLIGHETSREGELN: vi påstår bara "liknande jobb" när orden i offertens titel
 * faktiskt överlappar projektets. Utan överlapp visas fotona som "tidigare
 * jobb" — vilket är sant — i stället för att antyda en likhet som inte finns.
 *
 * Matchningen är en ren funktion, facit-testad i tests/reference-photos.spec.ts.
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
 * Hämtar färdiga referensfoton för en offert. Fail-soft: fotona är en bonus,
 * de får aldrig hindra kunden från att se sin offert.
 *
 * Endast 'after'-foton — pågående och före-bilder är inte säljande bevis.
 */
export async function getReferencePhotos(
  supabase: SupabaseClient,
  businessId: string,
  quoteTitle: string | null | undefined,
): Promise<ReferencePhotoSelection | null> {
  try {
    const { data, error } = await supabase
      .from('project_photos')
      .select('url, caption, uploaded_at, project_id')
      .eq('business_id', businessId)
      .eq('type', 'after')
      .not('url', 'is', null)
      .order('uploaded_at', { ascending: false })
      .limit(40)

    if (error || !data || data.length === 0) return null

    // Projektnamnen hämtas separat — project↔project_photos har ingen FK, och
    // en embed skulle avvisa hela queryn (PGRST200).
    const projectIds = Array.from(new Set(data.map((p: any) => p.project_id).filter(Boolean)))
    const nameById = new Map<string, string>()
    if (projectIds.length > 0) {
      const { data: projects } = await supabase
        .from('project')
        .select('project_id, name')
        .eq('business_id', businessId)
        .in('project_id', projectIds)
      for (const p of projects || []) nameById.set(String(p.project_id), p.name || '')
    }

    const candidates: ReferencePhotoCandidate[] = data.map((p: any) => ({
      url: p.url,
      caption: p.caption,
      projectName: p.project_id ? nameById.get(String(p.project_id)) || null : null,
      uploadedAt: p.uploaded_at,
    }))

    const selection = selectReferencePhotos(candidates, quoteTitle)
    return selection.photos.length > 0 ? selection : null
  } catch (err) {
    console.warn('[reference-photos] kunde inte hämta foton (icke-blockerande):', err)
    return null
  }
}
