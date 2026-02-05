import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
  })
}

export async function POST(request: NextRequest) {
  try {
    const anthropic = getAnthropic()
    const { prompt, priceList, pricingSettings } = await request.json()

    const systemPrompt = `Du är en expert på att skapa offerter för hantverkare i Sverige.

Användarens prislista:
${JSON.stringify(priceList, null, 2)}

Grundinställningar:
- Timpris: ${pricingSettings.hourly_rate} kr/h
- Moms: ${pricingSettings.vat_rate}%

Din uppgift:
1. Analysera arbetsbeskrivningen
2. Skapa en detaljerad offert med arbete och material
3. Använd realistiska tidsuppskattningar
4. Använd priser från prislistan när möjligt, annars rimliga marknadspriser

Svara ENDAST med JSON i detta format:
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
      "unit_price": 650,
      "total": 1300
    },
    {
      "id": "item_2", 
      "type": "material",
      "name": "Materialnamn",
      "quantity": 3,
      "unit": "piece",
      "unit_price": 150,
      "total": 450
    }
  ]
}

Tänk på:
- Arbete (labor): timpris, uppskatta realistisk tid
- Material: styckpris eller meterpris
- Inkludera alltid "småmaterial" för skruv, tejp etc (~50-100 kr)
- Var realistisk med tidsuppskattningar`

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
      return NextResponse.json(data)
    }

    return NextResponse.json({ error: 'Could not parse response' }, { status: 500 })

  } catch (error: any) {
    console.error('Quote generation error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
