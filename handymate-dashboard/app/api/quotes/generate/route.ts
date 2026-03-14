import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'
import { buildPriceContext, PriceListItem } from '@/lib/ai-quote-generator'

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
  })
}

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check (AI API costs money)
    const rateLimit = checkAiApiRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const anthropic = getAnthropic()
    const { prompt, priceList, pricingSettings } = await request.json()

    const hourlyRate = pricingSettings?.hourly_rate || 650
    const vatRate = pricingSettings?.vat_rate || 25
    const hasPriceList = Array.isArray(priceList) && priceList.length > 0
    const priceContext = buildPriceContext(priceList as PriceListItem[] || [], hourlyRate)

    const systemPrompt = `Du är en expert på att skapa offerter för hantverkare i Sverige.

${priceContext}

Grundinställningar:
- Moms: ${vatRate}%

REGLER FÖR PRISSÄTTNING:
1. Arbete (labor): använd ALLTID timpris ${hourlyRate} kr/h
2. Material: ${hasPriceList
      ? 'Använd ENBART priser från prislistan ovan. Markera med "from_price_list": true.'
      : 'Prislista saknas — sätt ALLA materialpriser till 0 kr.'}
3. Om ett material SAKNAS i prislistan — sätt unit_price till 0 och lägg till "note": "PRIS SAKNAS — fyll i manuellt"
4. Gissa ALDRIG ett pris — det är bättre med 0 kr och markering än ett felaktigt pris
5. Separera alltid arbete och material som separata rader
6. Inkludera alltid "Småmaterial" — ${hasPriceList ? 'använd pris från prislistan om det finns, annars 0 kr med markering' : '0 kr med markering'}
7. Max 8 rader

Svara ENDAST med JSON (ingen markdown):
{
  "title": "Kort titel för jobbet",
  "description": "Beskrivning av arbetet",
  "items": [
    {
      "id": "item_1",
      "type": "labor",
      "name": "Beskrivning av arbetsmoment",
      "quantity": 2,
      "unit": "hour",
      "unit_price": ${hourlyRate},
      "total": ${hourlyRate * 2},
      "from_price_list": false,
      "note": null
    },
    {
      "id": "item_2",
      "type": "material",
      "name": "Materialnamn",
      "quantity": 3,
      "unit": "piece",
      "unit_price": 0,
      "total": 0,
      "from_price_list": false,
      "note": "PRIS SAKNAS — fyll i manuellt"
    }
  ]
}`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages: [
        { role: 'user', content: `Skapa en offert för: ${prompt}` }
      ]
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const data = JSON.parse(jsonMatch[0])
      // Add metadata about missing prices
      const missingPriceItems = (data.items || []).filter((item: any) => item.unit_price === 0 || item.note?.includes('PRIS SAKNAS'))
      data.priceListEmpty = !hasPriceList
      data.missingPriceCount = missingPriceItems.length
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Could not parse response' }, { status: 500 })

  } catch (error: any) {
    console.error('Quote generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
