import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'
import { generateQuoteFromInput, getAveragePrice } from '@/lib/ai-quote-generator'
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

    const { imageBase64, voiceTranscript, textDescription, customerId } = await request.json()

    if (!imageBase64 && !voiceTranscript && !textDescription) {
      return NextResponse.json({ error: 'Ange bild, röst eller text' }, { status: 400 })
    }

    // Get business pricing, price list and templates in parallel
    const supabase = getServerSupabase()
    const [priceListResult, templatesResult] = await Promise.all([
      supabase
        .from('price_list')
        .select('name, unit, unit_price, category')
        .eq('business_id', business.business_id)
        .eq('is_active', true)
        .limit(50),
      supabase
        .from('quote_templates')
        .select('name, default_items, category')
        .eq('business_id', business.business_id)
        .limit(5)
    ])

    const priceListData = priceListResult.data || []
    const templatesData = templatesResult.data || []

    const hourlyRate = business.pricing_settings?.hourly_rate || 650
    const branch = business.industry || 'Bygg'

    const quote = await generateQuoteFromInput({
      businessId: business.business_id,
      branch,
      hourlyRate,
      imageBase64,
      voiceTranscript,
      textDescription,
      customerId,
      priceList: priceListData,
      templates: templatesData
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
      priceWarning
    })
  } catch (error: any) {
    console.error('AI quote generation error:', error)
    return NextResponse.json({ error: error.message || 'Generering misslyckades' }, { status: 500 })
  }
}
