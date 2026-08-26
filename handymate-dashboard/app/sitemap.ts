import { MetadataRoute } from 'next'
import { getServerSupabase } from '@/lib/supabase'
import { getAppBaseUrl } from '@/lib/site-url'

// Revalidera sitemapen en gång i timmen — nya/borttagna mikrosajter
// dyker upp utan att kräva en ny deploy.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getAppBaseUrl()

  // Den enda statiska publika sidan utanför mikrosajterna. Används som
  // fallback om DB-läsningen nedan failar, så /sitemap.xml aldrig blir tom.
  const staticEntries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.5 },
    { url: `${baseUrl}/hitta-pengar`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/skydda-marginalen`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
    { url: `${baseUrl}/slipp-administrationen`, lastModified: new Date(), changeFrequency: 'monthly', priority: 0.9 },
  ]

  try {
    const supabase = getServerSupabase()
    const { data: storefronts, error } = await supabase
      .from('storefront')
      .select('slug, updated_at')
      .eq('is_published', true)
      .not('slug', 'is', null)

    if (error || !storefronts) {
      console.error('[sitemap] Kunde inte hämta publicerade mikrosajter:', error)
      return staticEntries
    }

    const siteEntries: MetadataRoute.Sitemap = storefronts
      .filter((s: { slug: string | null }) => !!s.slug)
      .map((s: { slug: string; updated_at: string | null }) => ({
        url: `${baseUrl}/site/${s.slug}`,
        lastModified: s.updated_at ? new Date(s.updated_at) : new Date(),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      }))

    return [...staticEntries, ...siteEntries]
  } catch (err) {
    // DB oåtkomlig — returnera bara de statiska sidorna istället för att
    // krascha byggkedjan eller hela /sitemap.xml-anropet.
    console.error('[sitemap] Oväntat fel vid generering:', err)
    return staticEntries
  }
}
