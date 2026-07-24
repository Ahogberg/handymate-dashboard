import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import StorefrontClient from './StorefrontClient'
import StorefrontTracker from './StorefrontTracker'
import { getAppBaseUrl } from '@/lib/site-url'

// Sidan cachas som ISR och byggs om i bakgrunden en gång i timmen. Den
// gamla server-side fire-and-forget-fetchen till /api/storefront/track
// tvingade tidigare fram fullt dynamisk rendering — spårningen ligger nu i
// StorefrontTracker (klientkomponent) istället, se render() nedan.
export const revalidate = 3600

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── SEO-hjälpare ──────────────────────────────────────────────────────

const SCHEMA_DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const
const SCHEMA_DAY_NAMES: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

// Best-effort-tolkning av svensk fritextadress, ex. "Storgatan 12, 123 45 Ort".
// Returnerar null om adressen inte matchar ett postnummer+ort-mönster —
// då faller anroparen tillbaka på hela strängen som oformaterad text
// istället för att gissa var gatan slutar och orten börjar.
function parseSwedishAddress(raw: string): { streetAddress?: string; postalCode: string; addressLocality: string } | null {
  const address = raw.trim()
  if (!address) return null

  const match = address.match(/(\d{3}\s?\d{2})\s*,?\s*([A-Za-zÅÄÖÉåäöé][A-Za-zÅÄÖÉåäöé\s'-]*)$/)
  if (!match || match.index === undefined) return null

  const postalCode = match[1].trim()
  const addressLocality = match[2].trim()
  const streetAddress = address.slice(0, match.index).replace(/,\s*$/, '').trim()

  return {
    ...(streetAddress ? { streetAddress } : {}),
    postalCode,
    addressLocality,
  }
}

function buildOpeningHoursSpecification(
  workingHours: Record<string, { enabled: boolean; start: string; end: string }> | null
) {
  if (!workingHours) return []
  return SCHEMA_DAY_ORDER
    .filter(day => workingHours[day]?.enabled && workingHours[day]?.start && workingHours[day]?.end)
    .map(day => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${SCHEMA_DAY_NAMES[day]}`,
      opens: workingHours[day].start,
      closes: workingHours[day].end,
    }))
}

interface StorefrontData {
  id: string
  business_id: string
  slug: string
  is_published: boolean
  hero_headline: string | null
  hero_description: string | null
  about_text: string | null
  hero_image_url: string | null
  gallery_images: string[]
  color_scheme: string
  service_descriptions: Record<string, string>
  meta_title: string | null
  meta_description: string | null
  sections: string[]
  show_chat_widget: boolean
  certifications: string | null
}

interface BusinessData {
  business_id: string
  business_name: string
  contact_name: string | null
  contact_email: string | null
  phone_number: string | null
  assigned_phone_number: string | null
  address: string | null
  service_area: string | null
  branch: string | null
  services_offered: string[]
  default_hourly_rate: number
  rot_enabled: boolean
  rut_enabled: boolean
  google_review_url: string | null
  widget_enabled: boolean
  subscription_plan: string | null
  working_hours: Record<string, { enabled: boolean; start: string; end: string }> | null
  logo_url: string | null
}

interface PriceItem {
  name: string
  category: string
  unit: string
  unit_price: number
}

interface Review {
  review_rating: number
  review_text: string | null
  customer?: { name: string } | null
  sent_at: string
}

async function getStorefrontData(slug: string) {
  const supabase = getSupabase()

  const { data: storefront } = await supabase
    .from('storefront')
    .select('*')
    .eq('slug', slug)
    .eq('is_published', true)
    .single()

  if (!storefront) return null

  const { data: business } = await supabase
    .from('business_config')
    .select('business_id, business_name, contact_name, contact_email, phone_number, assigned_phone_number, address, service_area, branch, services_offered, default_hourly_rate, rot_enabled, rut_enabled, google_review_url, widget_enabled, subscription_plan, working_hours, logo_url')
    .eq('business_id', storefront.business_id)
    .single()

  if (!business) return null

  const { data: priceItems } = await supabase
    .from('price_list')
    .select('name, category, unit, unit_price')
    .eq('business_id', storefront.business_id)
    .eq('category', 'labor')
    .limit(12)

  // review_request saknar FK till customer i prod — en embed (`customer
  // (name)`) avvisar HELA queryn (PGRST200) och gör att recensioner aldrig
  // visas på den publika sajten. Hämta kundnamn separat i batch.
  const { data: reviewsRaw } = await supabase
    .from('review_request')
    .select('review_rating, review_text, sent_at, customer_id')
    .eq('business_id', storefront.business_id)
    .not('review_rating', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(6)

  const reviewsList = reviewsRaw || []
  const reviewCustomerIds = Array.from(new Set(reviewsList.map((r: any) => r.customer_id).filter(Boolean)))
  const reviewCustomerMap: Record<string, { name: string }> = {}
  if (reviewCustomerIds.length > 0) {
    const { data: reviewCustomers, error: reviewCustomerErr } = await supabase
      .from('customer')
      .select('customer_id, name')
      .in('customer_id', reviewCustomerIds)
    if (reviewCustomerErr) {
      console.error('[site/[slug]] review customer batch fetch error:', reviewCustomerErr)
    } else {
      for (const c of reviewCustomers || []) reviewCustomerMap[c.customer_id] = { name: c.name }
    }
  }
  const reviews = reviewsList.map((r: any) => ({
    review_rating: r.review_rating,
    review_text: r.review_text,
    sent_at: r.sent_at,
    customer: r.customer_id ? reviewCustomerMap[r.customer_id] || null : null,
  }))

  // Sidvisning spåras numera klientsidan (se StorefrontTracker) så att
  // denna funktion förblir ren datahämtning och sidan kan ISR-cachas.

  return {
    storefront: storefront as StorefrontData,
    business: business as BusinessData,
    priceItems: (priceItems || []) as PriceItem[],
    reviews: (reviews || []) as unknown as Review[],
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const baseUrl = getAppBaseUrl()
  const data = await getStorefrontData(slug)

  if (!data) {
    return {
      title: 'Sidan hittades inte',
      robots: { index: false, follow: false },
    }
  }

  const { storefront, business } = data
  const title = storefront.meta_title || business.business_name
  const description = storefront.meta_description || storefront.hero_description || ''
  const canonicalUrl = `${baseUrl}/site/${slug}`
  const ogImage = storefront.hero_image_url || business.logo_url || undefined

  return {
    metadataBase: new URL(baseUrl),
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: business.business_name,
      locale: 'sv_SE',
      type: 'website',
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    robots: {
      index: true,
      follow: true,
    },
  }
}

export default async function StorefrontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const data = await getStorefrontData(slug)

  if (!data) {
    notFound()
  }

  const { storefront, business, priceItems, reviews } = data

  const baseUrl = getAppBaseUrl()
  const canonicalUrl = `${baseUrl}/site/${slug}`
  const image = storefront.hero_image_url || business.logo_url || undefined

  // Strukturerad adress om fritexten går att tolka (svenskt "Gata NN, NNN NN
  // Ort"-format), annars raw text — gissa aldrig på gräns mellan gata/ort.
  const parsedAddress = business.address ? parseSwedishAddress(business.address) : null
  const address = business.address
    ? parsedAddress
      ? { '@type': 'PostalAddress', ...parsedAddress, addressCountry: 'SE' }
      : { '@type': 'PostalAddress', streetAddress: business.address, addressCountry: 'SE' }
    : undefined

  // Prisintervall från timprislistan (labor), annars grundtimpriset.
  const laborPrices = priceItems.map(p => p.unit_price).filter(p => typeof p === 'number' && p > 0)
  const priceRange = laborPrices.length > 0
    ? (Math.min(...laborPrices) === Math.max(...laborPrices)
        ? `${Math.round(Math.min(...laborPrices))} kr`
        : `${Math.round(Math.min(...laborPrices))}–${Math.round(Math.max(...laborPrices))} kr`)
    : business.default_hourly_rate > 0
      ? `${Math.round(business.default_hourly_rate)} kr/h`
      : undefined

  const openingHoursSpecification = buildOpeningHoursSpecification(business.working_hours)

  // Tjänstekatalog — visas för alla planer på sidan (ingen plan-gating på
  // priser i StorefrontClient), så ingen dold data läcker här heller.
  const hasOfferCatalog = priceItems.length > 0
    ? {
        '@type': 'OfferCatalog',
        name: 'Tjänster',
        itemListElement: priceItems.map(item => ({
          '@type': 'Offer',
          itemOffered: { '@type': 'Service', name: item.name },
          priceSpecification: {
            '@type': 'UnitPriceSpecification',
            price: item.unit_price,
            priceCurrency: 'SEK',
            ...(item.unit ? { unitText: item.unit } : {}),
          },
        })),
      }
    : undefined

  // Build JSON-LD structured data. Ingen aggregateRating/review-markup —
  // recensionerna är inte verifierbara mot Googles policy för
  // tredjeparts-omdömen förrän review_rating/review_text-flödet är
  // dokumenterat (Fas 1b).
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': `${canonicalUrl}#business`,
    name: business.business_name,
    description: storefront.meta_description || storefront.hero_description || '',
    url: canonicalUrl,
    telephone: business.assigned_phone_number || business.phone_number || '',
    email: business.contact_email || '',
    ...(image ? { image, logo: business.logo_url || image } : {}),
    ...(priceRange ? { priceRange } : {}),
    ...(address ? { address } : {}),
    ...(business.service_area ? { areaServed: business.service_area } : {}),
    ...(openingHoursSpecification.length > 0 ? { openingHoursSpecification } : {}),
    ...(hasOfferCatalog ? { hasOfferCatalog } : {}),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StorefrontTracker businessId={business.business_id} />
      <StorefrontClient
        storefront={storefront}
        business={business}
        priceItems={priceItems}
        reviews={reviews}
      />
    </>
  )
}
