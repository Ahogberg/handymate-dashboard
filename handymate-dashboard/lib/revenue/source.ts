import { traffarTillProspekt } from '@/lib/launch-desk/platsbanken-kalla'
import {
  normaliseraOrgnummer,
  type PlatsbankenTraff,
} from '@/lib/launch-desk/rekryteringssignal'

/** Same provider/parser as Launch Desk, but errors are errors, never an empty success. */
export async function fetchCandidates(
  term: string,
  fetcher: typeof fetch = fetch,
  now = new Date(),
) {
  const response = await fetcher(
    `https://jobsearch.api.jobtechdev.se/search?q=${encodeURIComponent(term)}&limit=50`,
    {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
      cache: 'no-store',
    },
  )
  if (!response.ok)
    throw new Error(
      `Platsbanken svarade inte som väntat (${response.status}). Försök igen.`,
    )
  const data = await response.json()
  if (!Array.isArray(data?.hits))
    throw new Error('Platsbanken gav ett oväntat svar.')
  const hits = (data.hits as PlatsbankenTraff[]).filter((hit) => {
    const t = Date.parse(hit.publication_date || '')
    return (
      hit.id &&
      hit.webpage_url?.startsWith('https://arbetsformedlingen.se/') &&
      !hit.removed &&
      Number.isFinite(t) &&
      t <= now.getTime() &&
      t >= now.getTime() - 90 * 86400000
    )
  })
  const { prospekt } = traffarTillProspekt(hits, { nu: now, tak: 50 })
  return prospekt
    .filter((p) => p.legal_form === 'limited_company')
    .map((p) => {
      const hit = hits.find(
        (h) =>
          String(h.id) === p.annons_id &&
          normaliseraOrgnummer(h.employer?.organization_number) ===
            p.org_number,
      )!
      return {
        company_name: p.company_name,
        org_number: p.org_number,
        city: p.municipality,
        industry: p.industry,
        source: 'Platsbanken',
        source_url: p.source_url,
        external_id: p.annons_id,
        title: hit.headline || 'Publicerad rekryteringsannons',
        detail: p.factual_notes,
        observed_at: new Date(hit.publication_date!).toISOString(),
      }
    })
}
