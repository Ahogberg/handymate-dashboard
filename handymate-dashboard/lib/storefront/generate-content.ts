import type { SupabaseClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { getImagesForBranch } from '@/lib/industry-images'

/**
 * lib/storefront/generate-content.ts (hemsida-nudgen, 2026-07-25)
 *
 * Delad genererings-kärna för storefront-innehåll (AI-genererad hemsida).
 * Extraherad från app/api/storefront/generate/route.ts så BÅDE den manuella
 * "Skapa min hemsida"-knappen (/dashboard/website) och den dagliga
 * app/api/cron/hemsida-forslag/route.ts använder EXAKT samma logik —
 * ingen dubblett-prompt, ingen dubblett-slug-regel.
 *
 * Skillnaden mellan de två anropssätten styrs enbart av `isPublished`:
 *   - Manuell knapp: isPublished=true (oförändrat beteende — hantverkaren
 *     klickade själv, ingen anledning att gate:a bakom godkännande).
 *   - Cron: isPublished=false (utkast — publiceras bara om hantverkaren
 *     godkänner kö-kortet, se 'publish_microsite'-caset i
 *     app/api/approvals/[id]/route.ts).
 */

export function generateStorefrontSlug(businessName: string): string {
  return (businessName || '')
    .toLowerCase()
    .replace(/\s(ab|hb|kb|enskild firma|ef)$/i, '')
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30)
}

export interface StorefrontGenerationSuccess {
  ok: true
  id: string
  slug: string
  headline: string
  description: string
}

export interface StorefrontGenerationFailure {
  ok: false
  error: string
}

export type StorefrontGenerationResult = StorefrontGenerationSuccess | StorefrontGenerationFailure

/**
 * Genererar (eller regenererar) storefront-innehåll med Claude och
 * sparar det som en storefront-rad. Kastar ALDRIG — fel returneras som
 * { ok: false, error } så anroparen (route eller cron) kan degradera
 * snällt (cron: inget kort skapas; route: 500 till klienten som idag).
 */
export async function generateStorefrontContent(
  supabase: SupabaseClient,
  businessId: string,
  opts: { isPublished: boolean },
): Promise<StorefrontGenerationResult> {
  try {
    const { data: config, error: configError } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', businessId)
      .single()

    if (configError || !config) {
      return { ok: false, error: configError?.message || 'Business not found' }
    }

    const { data: priceItems } = await supabase
      .from('price_list')
      .select('name, category, unit, unit_price')
      .eq('business_id', businessId)
      .limit(20)

    const services = config.services_offered || []

    const { data: reviews } = await supabase
      .from('review_request')
      .select('review_rating, review_text')
      .eq('business_id', businessId)
      .not('review_rating', 'is', null)
      .order('review_rating', { ascending: false })
      .limit(10)

    const avgRating = reviews && reviews.length > 0
      ? (reviews.reduce((sum: number, r: Record<string, number | null>) => sum + (r.review_rating || 0), 0) / reviews.length).toFixed(1)
      : null

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const serviceList = services.length > 0
      ? services.join(', ')
      : (priceItems || []).map((p: Record<string, unknown>) => p.name).join(', ') || 'Ej angivet'

    const prompt = `Du är en copywriter som skapar hemsideinnehåll för svenska hantverksföretag.

Baserat på följande företagsdata, generera:
1. hero_headline: Kort, slagkraftig rubrik (max 8 ord). Undvik klichéer.
2. hero_description: 2-3 meningar som sammanfattar företaget.
3. about_text: 3-4 stycken "Om oss"-text. Professionell men personlig ton. Separera stycken med \\n\\n.
4. meta_title: SEO-titel (max 60 tecken)
5. meta_description: SEO-beskrivning (max 160 tecken)
6. service_descriptions: Ett objekt med tjänstnamn som nyckel och kort beskrivning (1-2 meningar) som värde.

Företagsdata:
- Namn: ${config.business_name}
- Bransch: ${config.branch || config.industry || 'Hantverkare'}
- Tjänster: ${serviceList}
- Kontaktperson: ${config.contact_name || ''}
- Plats: ${config.service_area || config.address || 'Sverige'}
- Betyg: ${avgRating ? `${avgRating}/5 (${reviews?.length} recensioner)` : 'Ej tillgängligt'}

Svara med ENBART JSON (inget annat). Ingen markdown, inga code blocks.`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return { ok: false, error: 'AI generated no content' }
    }

    let generated: Record<string, unknown>
    try {
      const cleanJson = textBlock.text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
      generated = JSON.parse(cleanJson)
    } catch {
      console.error('[storefront/generate-content] Failed to parse AI response:', textBlock.text)
      return { ok: false, error: 'AI generated invalid JSON' }
    }

    // Generate slug + check uniqueness (samma regel som app/api/storefront/route.ts PUT)
    let slug = generateStorefrontSlug(config.business_name)

    const { data: existingSlug } = await supabase
      .from('storefront')
      .select('id')
      .eq('slug', slug)
      .neq('business_id', businessId)
      .maybeSingle()

    if (existingSlug) {
      slug = slug + '-' + Math.random().toString(36).substring(2, 6)
    }

    const { data: existing } = await supabase
      .from('storefront')
      .select('id')
      .eq('business_id', businessId)
      .maybeSingle()

    const branchImages = getImagesForBranch(config.branch)
    const heroImageUrl = branchImages.length > 0 ? branchImages[0].url : null

    const heroHeadline = (generated.hero_headline as string) || ''
    const heroDescription = (generated.hero_description as string) || ''

    const storefrontData = {
      business_id: businessId,
      slug,
      is_published: opts.isPublished,
      hero_headline: heroHeadline,
      hero_description: heroDescription,
      about_text: (generated.about_text as string) || '',
      service_descriptions: generated.service_descriptions || {},
      meta_title: (generated.meta_title as string) || config.business_name,
      meta_description: (generated.meta_description as string) || '',
      color_scheme: 'blue',
      hero_image_url: heroImageUrl,
      updated_at: new Date().toISOString(),
    }

    let id: string
    if (existing) {
      const { error } = await supabase
        .from('storefront')
        .update(storefrontData)
        .eq('id', existing.id)
      if (error) return { ok: false, error: error.message }
      id = existing.id
    } else {
      const { data: inserted, error } = await supabase
        .from('storefront')
        .insert(storefrontData)
        .select('id')
        .single()
      if (error) return { ok: false, error: error.message }
      id = inserted.id
    }

    return { ok: true, id, slug, headline: heroHeadline, description: heroDescription }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Okänt fel' }
  }
}
