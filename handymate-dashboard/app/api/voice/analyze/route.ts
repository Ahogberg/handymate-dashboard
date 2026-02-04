import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!
})

interface AISuggestion {
  type: 'booking' | 'follow_up' | 'quote' | 'reminder' | 'sms' | 'callback' | 'other'
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  action_data?: Record<string, any>
  confidence: number
  source_text?: string
}

/**
 * Analyserar ett transkriberat samtal med AI och skapar förslag
 * POST body: { recording_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { recording_id } = await request.json()

    if (!recording_id) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    // Hämta inspelningen med transkript
    const { data: recording, error: fetchError } = await supabase
      .from('call_recording')
      .select(`
        *,
        customer (
          customer_id,
          name,
          phone_number,
          email,
          address
        )
      `)
      .eq('recording_id', recording_id)
      .single()

    if (fetchError || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    if (!recording.transcript) {
      return NextResponse.json({
        error: 'No transcript available for analysis'
      }, { status: 400 })
    }

    // Hämta business-info för kontext
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, services, contact_name')
      .eq('business_id', recording.business_id)
      .single()

    // Analysera med Claude
    const prompt = `Du är en AI-assistent som analyserar kundsamtal för ett svenskt hantverksföretag.

FÖRETAG: ${business?.business_name || 'Okänt'}
TJÄNSTER: ${business?.services || 'Hantverkstjänster'}

KUNDINFORMATION:
- Namn: ${recording.customer?.name || 'Okänd kund'}
- Telefon: ${recording.phone_number || recording.customer?.phone_number || 'Okänt'}
- Email: ${recording.customer?.email || 'Okänt'}
- Adress: ${recording.customer?.address || 'Okänt'}

SAMTALSRIKTNING: ${recording.direction === 'inbound' ? 'Inkommande (kund ringde)' : 'Utgående (vi ringde)'}
SAMTALSLÄNGD: ${recording.duration_seconds || 0} sekunder

TRANSKRIBERAT SAMTAL:
"""
${recording.transcript}
"""

Analysera samtalet och extrahera ACTIONABLE förslag. Fokusera på:
1. Ska en bokning skapas? (tid, datum, tjänst, adress)
2. Behövs en uppföljning? (callback, mer info)
3. Ska en offert skickas?
4. Ska ett SMS skickas (bekräftelse, påminnelse)?
5. Finns det brådskande behov?

Svara i JSON-format med en array av förslag:
{
  "summary": "Kort sammanfattning av samtalet på svenska (1-2 meningar)",
  "customer_sentiment": "positive|neutral|negative",
  "suggestions": [
    {
      "type": "booking|follow_up|quote|reminder|sms|callback|other",
      "title": "Kort titel på svenska",
      "description": "Beskrivning av vad som ska göras",
      "priority": "low|medium|high|urgent",
      "confidence": 0.0-1.0,
      "source_text": "Relevant citat från samtalet",
      "action_data": {
        // Relevant data för att utföra åtgärden
        // För booking: { date, time, service, address }
        // För sms: { message_template }
        // För quote: { service, estimated_price }
      }
    }
  ]
}

Regler:
- Ge endast förslag som faktiskt diskuterades i samtalet
- Confidence ska reflektera hur säker du är på förslaget
- Om inget konkret diskuterades, returnera tom suggestions-array
- Prioritera booking och callback högt om kunden uttrycker behov
- Svara ENDAST med JSON, ingen annan text`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }]
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Extrahera JSON från svaret
    let analysisResult
    try {
      // Försök parsa hela svaret som JSON
      analysisResult = JSON.parse(responseText)
    } catch {
      // Om det misslyckas, försök hitta JSON i texten
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('Could not parse AI response as JSON')
      }
    }

    console.log('Analysis result:', analysisResult)

    // Spara sammanfattningen på inspelningen
    await supabase
      .from('call_recording')
      .update({
        transcript_summary: analysisResult.summary
      })
      .eq('recording_id', recording_id)

    // Skapa AI-förslag i databasen
    const suggestions = analysisResult.suggestions || []
    const createdSuggestions = []

    for (const suggestion of suggestions) {
      // Skippa förslag med låg confidence
      if (suggestion.confidence < 0.5) continue

      const { data: createdSuggestion, error: insertError } = await supabase
        .from('ai_suggestion')
        .insert({
          business_id: recording.business_id,
          recording_id: recording_id,
          customer_id: recording.customer_id,
          suggestion_type: suggestion.type,
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          status: 'pending',
          action_data: suggestion.action_data || {},
          confidence_score: suggestion.confidence,
          source_text: suggestion.source_text,
          created_at: new Date().toISOString(),
          // Förslag utgår efter 7 dagar om de inte hanteras
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        })
        .select()
        .single()

      if (createdSuggestion) {
        createdSuggestions.push(createdSuggestion)
      }

      if (insertError) {
        console.error('Error creating suggestion:', insertError)
      }
    }

    return NextResponse.json({
      success: true,
      recording_id,
      summary: analysisResult.summary,
      sentiment: analysisResult.customer_sentiment,
      suggestions_created: createdSuggestions.length,
      suggestions: createdSuggestions
    })

  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json({
      error: error.message || 'Analysis failed'
    }, { status: 500 })
  }
}
