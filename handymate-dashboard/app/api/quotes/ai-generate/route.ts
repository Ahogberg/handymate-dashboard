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

    // Get business pricing and price list
    const supabase = getServerSupabase()
    const { data: priceListData } = await supabase
      .from('price_list')
      .select('name, unit, unit_price, category')
      .eq('business_id', business.business_id)
      .eq('is_active', true)
      .limit(50)

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
      priceList: priceListData || []
    })

    // Get price comparison
    const description = [textDescription, voiceTranscript].filter(Boolean).join(' ')
    const priceComparison = description
      ? await getAveragePrice(business.business_id, description)
      : { average: 0, min: 0, max: 0, count: 0 }

    return NextResponse.json({
      success: true,
      quote,
      priceComparison
    })
  } catch (error: any) {
    console.error('AI quote generation error:', error)
    return NextResponse.json({ error: error.message || 'Generering misslyckades' }, { status: 500 })
  }
}
