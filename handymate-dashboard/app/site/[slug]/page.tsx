import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import StorefrontClient from './StorefrontClient'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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
    .select('business_id, business_name, contact_name, contact_email, phone_number, assigned_phone_number, address, service_area, branch, services_offered, default_hourly_rate, rot_enabled, rut_enabled, google_review_url, widget_enabled, subscription_plan, working_hours')
    .eq('business_id', storefront.business_id)
    .single()

  if (!business) return null

  const { data: priceItems } = await supabase
    .from('price_list')
    .select('name, category, unit, unit_price')
    .eq('business_id', storefront.business_id)
    .eq('category', 'labor')
    .limit(12)

  const { data: reviews } = await supabase
    .from('review_request')
    .select('review_rating, review_text, customer(name), sent_at')
    .eq('business_id', storefront.business_id)
    .not('review_rating', 'is', null)
    .order('sent_at', { ascending: false })
    .limit(6)

  // Track page view (fire and forget)
  fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/storefront/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ business_id: storefront.business_id, event: 'page_view' }),
  }).catch(() => {})

  return {
    storefront: storefront as StorefrontData,
    business: business as BusinessData,
    priceItems: (priceItems || []) as PriceItem[],
    reviews: (reviews || []) as unknown as Review[],
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const data = await getStorefrontData(slug)
  if (!data) return { title: 'Sidan hittades inte' }

  const { storefront, business } = data
  return {
    title: storefront.meta_title || business.business_name,
    description: storefront.meta_description || storefront.hero_description || '',
    openGraph: {
      title: storefront.meta_title || business.business_name,
      description: storefront.meta_description || '',
      type: 'website',
      ...(storefront.hero_image_url ? { images: [storefront.hero_image_url] } : {}),
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

  // Build JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: business.business_name,
    description: storefront.meta_description || storefront.hero_description || '',
    telephone: business.assigned_phone_number || business.phone_number || '',
    email: business.contact_email || '',
    ...(business.address ? { address: { '@type': 'PostalAddress', streetAddress: business.address } } : {}),
    ...(business.service_area ? { areaServed: business.service_area } : {}),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <StorefrontClient
        storefront={storefront}
        business={business}
        priceItems={priceItems}
        reviews={reviews}
      />
    </>
  )
}
