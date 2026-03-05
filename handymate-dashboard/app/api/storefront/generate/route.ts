import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'
import { getImagesForBranch } from '@/lib/industry-images'

function generateSlug(businessName: string): string {
  return businessName
    .toLowerCase()
    .replace(/\s(ab|hb|kb|enskild firma|ef)$/i, '')
    .replace(/[åä]/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 30)
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Hämta full business_config
    const { data: config } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    if (!config) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Hämta price_list
    const { data: priceItems } = await supabase
      .from('price_list')
      .select('name, category, unit, unit_price')
      .eq('business_id', business.business_id)
      .limit(20)

    // Hämta knowledge_base
    const kb = config.knowledge_base || {}
    const services = config.services_offered || []
    const kbServices = (kb as Record<string, unknown>).services || []

    // Hämta recensioner om de finns
    const { data: reviews } = await supabase
      .from('review_request')
      .select('review_rating, review_text')
      .eq('business_id', business.business_id)
      .not('review_rating', 'is', null)
      .order('review_rating', { ascending: false })
      .limit(10)

    const avgRating = reviews && reviews.length > 0
      ? (reviews.reduce((sum: number, r: Record<string, number | null>) => sum + (r.review_rating || 0), 0) / reviews.length).toFixed(1)
      : null

    // Generera innehåll med Claude
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
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    if (!textBlock || textBlock.type !== 'text') {
      return NextResponse.json({ error: 'AI generated no content' }, { status: 500 })
    }

    let generated: Record<string, unknown>
    try {
      // Strip potential markdown code blocks
      const cleanJson = textBlock.text.replace(/```json?\n?/g, '').replace(/```\n?/g, '').trim()
      generated = JSON.parse(cleanJson)
    } catch {
      console.error('Failed to parse AI response:', textBlock.text)
      return NextResponse.json({ error: 'AI generated invalid JSON' }, { status: 500 })
    }

    // Generate slug
    let slug = generateSlug(config.business_name)

    // Check slug uniqueness
    const { data: existingSlug } = await supabase
      .from('storefront')
      .select('id')
      .eq('slug', slug)
      .neq('business_id', business.business_id)
      .maybeSingle()

    if (existingSlug) {
      slug = slug + '-' + Math.random().toString(36).substring(2, 6)
    }

    // Check if storefront already exists
    const { data: existing } = await supabase
      .from('storefront')
      .select('id')
      .eq('business_id', business.business_id)
      .maybeSingle()

    // Auto-set hero image from industry images
    const branchImages = getImagesForBranch(config.branch)
    const heroImageUrl = branchImages.length > 0 ? branchImages[0].url : null

    const storefrontData = {
      business_id: business.business_id,
      slug,
      is_published: true,
      hero_headline: generated.hero_headline as string || '',
      hero_description: generated.hero_description as string || '',
      about_text: generated.about_text as string || '',
      service_descriptions: generated.service_descriptions || {},
      meta_title: generated.meta_title as string || config.business_name,
      meta_description: generated.meta_description as string || '',
      color_scheme: 'blue',
      hero_image_url: heroImageUrl,
      updated_at: new Date().toISOString(),
    }

    if (existing) {
      const { error } = await supabase
        .from('storefront')
        .update(storefrontData)
        .eq('id', existing.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from('storefront')
        .insert(storefrontData)

      if (error) throw error
    }

    return NextResponse.json({ success: true, slug })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('Storefront generate error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
