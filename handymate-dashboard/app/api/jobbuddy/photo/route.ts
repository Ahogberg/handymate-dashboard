import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'

function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
}

export async function POST(request: NextRequest) {
  try {
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkAiApiRateLimit(authBusiness.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const { image } = await request.json()

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    const anthropic = getAnthropic()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: `Du är en expert på hantverksarbete i Sverige. Du analyserar bilder av jobb som behöver göras och ger praktisk information.

Svara alltid på svenska.

Din analys ska innehålla:
1. **Vad du ser**: Kort beskrivning av vad bilden visar
2. **Bedömning**: Vad som behöver göras
3. **Material**: Lista på material som troligen behövs
4. **Tidsuppskattning**: Ungefärlig arbetstid
5. **Offertförslag**: Ungefärligt prisintervall (arbete + material)

Var konkret och praktisk. Tänk som en erfaren hantverkare som ger en snabb bedömning.`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: image,
            },
          },
          {
            type: 'text',
            text: 'Analysera denna bild och ge en bedömning av arbetet som behöver göras. Inkludera materialbehov och tidsuppskattning.',
          },
        ],
      }],
    })

    const analysis = response.content[0].type === 'text'
      ? response.content[0].text
      : 'Kunde inte analysera bilden.'

    return NextResponse.json({ analysis })
  } catch (error) {
    console.error('Jobbuddy photo error:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}
