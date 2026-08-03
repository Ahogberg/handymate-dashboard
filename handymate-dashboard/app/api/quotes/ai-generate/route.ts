import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'
import { generateQuoteFromInput, getAveragePrice, analyzeJobImage, resolveCustomerPriceList } from '@/lib/ai-quote-generator'
import { getServerSupabase } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkAiApiRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const { imageBase64, images, voiceTranscript, textDescription, customerId } = await request.json()

    // Stöd både images[] (nytt) och imageBase64 (bakåtkompatibilitet)
    const allImages: string[] = images?.length ? images : imageBase64 ? [imageBase64] : []
    const primaryImage = allImages[0] || undefined

    if (!primaryImage && !voiceTranscript && !textDescription) {
      return NextResponse.json({ error: 'Ange bild, röst eller text' }, { status: 400 })
    }

    // Get business pricing, price list and templates in parallel
    const supabase = getServerSupabase()
    const branch = business.industry || 'Bygg'

    // Produktbank-konsolidering: fallback-priskontexten läses ur products
    // (artikelregistret) i stället för döda price_list. Mappas till samma
    // PriceListItem-form (unit_price = sales_price) så buildPriceContext är
    // oförändrad. Kundspecifik price_lists_v2 (topp-prio) hämtas separat
    // nedan (B4) via resolveCustomerPriceList och tar över när den finns.
    //
    // B3 (kodrevision 2026-08-03): tidigare .limit(50) UTAN .order() gav en
    // hantverkare med 300 artiklar 50 GODTYCKLIGA rader i AI-prompten
    // (Postgres garanterar ingen ordning utan ORDER BY). Samma order som
    // usePriceListLookup.ts (favoriter → namn) — konsekvent med hur
    // snabbvalen i quotes/new redan sorterar produktbanken. Höjd limit
    // (50 → 100) ger fler kandidater innan gränsen träffas.
    const [priceListResult, templatesResult, customerPriceList] = await Promise.all([
      supabase
        .from('products')
        .select('name, unit, sales_price, category')
        .eq('business_id', business.business_id)
        .eq('is_active', true)
        .order('is_favorite', { ascending: false })
        .order('name')
        .limit(100),
      supabase
        .from('quote_templates')
        .select('name, default_items, category')
        .eq('business_id', business.business_id)
        .limit(5),
      // B4: kundspecifik prislista (price_lists_v2) — undefined om ingen
      // customerId, ingen kundprislista finns, eller uppslaget failar.
      resolveCustomerPriceList(business.business_id, customerId),
    ])

    const priceListData = (priceListResult.data || []).map(p => ({
      name: p.name,
      unit: p.unit,
      unit_price: p.sales_price,
      category: p.category,
    }))
    const templatesData = templatesResult.data || []

    const hourlyRate = business.pricing_settings?.hourly_rate || 650

    // Om flera bilder: analysera extra bilder och kombinera med textDescription
    let combinedText = textDescription || ''
    if (allImages.length > 1) {
      try {
        const extraAnalyses = await Promise.all(
          allImages.slice(1, 5).map(img => analyzeJobImage(img, branch))
        )
        const extraDesc = extraAnalyses
          .map((a, i) => `Foto ${i + 2}: ${a.description}`)
          .join('\n')
        combinedText = [textDescription, extraDesc].filter(Boolean).join('\n\n')
      } catch (err: any) {
        console.error('[ai-generate] Extra image analysis failed:', err.message)
      }
    }

    const quote = await generateQuoteFromInput({
      businessId: business.business_id,
      branch,
      hourlyRate,
      imageBase64: primaryImage,
      voiceTranscript,
      textDescription: combinedText || undefined,
      customerId,
      priceList: priceListData,
      templates: templatesData,
      customerPriceList,
    })

    // Get price comparison
    const description = [textDescription, voiceTranscript].filter(Boolean).join(' ')
    const priceComparison = description
      ? await getAveragePrice(business.business_id, description)
      : { average: 0, min: 0, max: 0, count: 0 }

    // Build price warning if applicable
    const priceWarning = quote.priceListEmpty
      ? {
          warning: true,
          message: 'Din prislista är tom. Lägg till dina priser under Inställningar → Prislista för att få konsekventa AI-offerter.',
          link: '/dashboard/settings/pricing',
        }
      : quote.missingPriceCount > 0
        ? {
            warning: true,
            message: `${quote.missingPriceCount} rad${quote.missingPriceCount > 1 ? 'er' : ''} saknar pris från din prislista. Fyll i priserna manuellt eller uppdatera din prislista under Inställningar → Prislista.`,
            link: '/dashboard/settings/pricing',
          }
        : null

    return NextResponse.json({
      success: true,
      quote,
      priceComparison,
      priceWarning,
      photoCount: allImages.length,
    })
  } catch (error: any) {
    console.error('AI quote generation error:', error)
    return NextResponse.json({ error: error.message || 'Generering misslyckades' }, { status: 500 })
  }
}
