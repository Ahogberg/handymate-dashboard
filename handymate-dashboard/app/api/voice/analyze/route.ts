import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getAnthropic() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!
  })
}

interface AISuggestion {
  type: 'booking' | 'follow_up' | 'quote' | 'reminder' | 'sms' | 'callback' | 'create_customer' | 'reschedule' | 'other'
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
    const supabase = getSupabase()
    const anthropic = getAnthropic()
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
      .select('business_name, services_offered, contact_name, industry, service_area')
      .eq('business_id', recording.business_id)
      .single()

    // Hämta leverantörsprodukter för kontext (max 50 vanligaste)
    const { data: products } = await supabase
      .from('supplier_product')
      .select('name, category, sell_price')
      .eq('business_id', recording.business_id)
      .limit(50)

    const productContext = products?.length
      ? `\n\nTILLGÄNGLIGA PRODUKTER/MATERIAL:\n${products.map((p: { name: string; category: string | null; sell_price: number | null }) => `- ${p.name} (${p.category || 'Övrigt'}): ${p.sell_price || '?'} kr`).join('\n')}`
      : ''

    const industry = business?.industry || 'hantverkare'
    const services = Array.isArray(business?.services_offered)
      ? business.services_offered.join(', ')
      : business?.services_offered || 'Hantverkstjänster'

    // Förbättrad AI-prompt
    const prompt = `Du är en AI-assistent för en ${industry} i Sverige.
Lyssna på detta transkript från ett kundsamtal och analysera noggrant.

=== FÖRETAGSINFORMATION ===
Företag: ${business?.business_name || 'Okänt'}
Bransch: ${industry}
Tjänster: ${services}
Serviceområde: ${business?.service_area || 'Okänt'}
${productContext}

=== SAMTALSINFORMATION ===
Samtalsriktning: ${recording.direction === 'inbound' ? 'INKOMMANDE (kund ringde)' : 'UTGÅENDE (vi ringde)'}
Telefonnummer: ${recording.phone_number || 'Okänt'}
Samtalslängd: ${recording.duration_seconds || 0} sekunder
${recording.customer ? `
Befintlig kund: ${recording.customer.name || 'Ja'}
Kundadress: ${recording.customer.address || 'Ej registrerad'}
Kundemail: ${recording.customer.email || 'Ej registrerad'}
` : 'Ny/okänd kund'}

=== TRANSKRIBERAT SAMTAL ===
"""
${recording.transcript}
"""

=== ANALYSINSTRUKTIONER ===

Analysera samtalet och extrahera följande information:

**1. KUNDINFO**
- Namn (om nämnt i samtalet)
- Telefonnummer (from-numret: ${recording.phone_number || 'okänt'})
- Adress (om nämnd - gata, postnummer, ort)
- Email (om nämnd)

**2. JOBBDETALJER**
- Typ av jobb (installation, reparation, service, besiktning, etc)
- Specifikt vad kunden vill ha (t.ex. "3 eluttag i kök", "byta kran i badrum")
- Plats i fastigheten (kök, badrum, garage, etc)
- Eventuella problem/symptom som beskrivs

**3. ÖVERENSKOMMELSER**
- Tid/datum som nämndes ("tisdag", "nästa vecka", "så fort som möjligt", etc)
- Pris som nämndes eller diskuterades
- Eventuella villkor eller förväntningar

**4. MATERIAL SOM KAN BEHÖVAS**
- Lista material baserat på jobbtyp
- Uppskattade kvantiteter om möjligt

**5. SENTIMENT OCH BRÅDSKANDHET**
- Är kunden nöjd, neutral eller missnöjd?
- Är det brådskande (läcka, strömavbrott) eller kan det vänta?

=== FÖRSLAG ===

Baserat på analysen, skapa KONKRETA och ACTIONABLE förslag:

- Om pris/jobb diskuterades → "quote" (skapa offert)
- Om tid nämndes → "booking" (boka in)
- Om ny kund → "create_customer" (registrera kund)
- Om kund vill bli återkopplad → "callback" (ring tillbaka)
- Om "skicka offert" nämndes → "quote" med hög prioritet
- Om bekräftelse önskas → "sms" (skicka SMS)
- Om uppföljning behövs → "follow_up"
- Om kund vill flytta/ändra tid → "reschedule" (flytta bokning)
  Triggerfraser: "kan vi flytta", "passar inte", "annan tid", "ändra tiden", "boka om", "flytta bokningen"

=== SVARSFORMAT ===

Svara ENDAST med JSON i följande format:

{
  "summary": "Kort sammanfattning av samtalet på svenska (2-3 meningar)",
  "customer_sentiment": "positive|neutral|negative",
  "urgency": "low|normal|high|urgent",
  "extracted_info": {
    "customer_name": "Namn eller null",
    "phone_number": "${recording.phone_number || 'null'}",
    "address": "Adress eller null",
    "email": "Email eller null",
    "job_type": "Typ av jobb",
    "job_description": "Detaljerad beskrivning",
    "location_in_property": "Var i fastigheten",
    "mentioned_date": "Datum/tid som nämndes eller null",
    "mentioned_price": "Pris som nämndes eller null",
    "materials_needed": ["Lista", "av", "material"]
  },
  "suggestions": [
    {
      "type": "booking|quote|callback|sms|follow_up|create_customer|reminder|reschedule|other",
      "title": "Kort titel på svenska",
      "description": "Beskrivning av vad som ska göras",
      "priority": "low|medium|high|urgent",
      "confidence": 0.0-1.0,
      "source_text": "Relevant citat från samtalet",
      "action_data": {
        "customer_name": "Namn om känt",
        "phone_number": "Telefon",
        "address": "Adress om känd",
        "service": "Typ av tjänst",
        "date": "YYYY-MM-DD om känt",
        "time": "HH:MM om känt",
        "estimated_price": "Uppskattat pris",
        "message_template": "SMS-meddelande för sms-typ",
        "reason": "Anledning för callback/follow_up"
      }
    }
  ]
}

=== REGLER ===

1. Ge ENDAST förslag baserade på vad som faktiskt diskuterades
2. Om kunden nämner något specifikt, citera det i source_text
3. Confidence ska reflektera hur tydligt det framgår i samtalet
4. Om inget konkret diskuterades, returnera tom suggestions-array
5. Prioritera "quote" och "booking" om kunden har ett aktivt behov
6. "urgent" prioritet ENDAST vid akuta problem (läcka, strömavbrott, etc)
7. Skapa "create_customer" om det är en ny kund med namn/kontaktinfo
8. Svara ENDAST med JSON, ingen annan text före eller efter`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
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

    // Om det är en ny kund och vi har info, skapa/uppdatera kund
    const extractedInfo = analysisResult.extracted_info || {}
    let customerId = recording.customer_id

    if (!customerId && extractedInfo.customer_name) {
      // Kolla om kund redan finns med samma telefonnummer
      const { data: existingCustomer } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', recording.business_id)
        .eq('phone_number', recording.phone_number)
        .single()

      if (existingCustomer) {
        customerId = existingCustomer.customer_id
        // Uppdatera med ny info om det finns
        if (extractedInfo.address || extractedInfo.email) {
          await supabase
            .from('customer')
            .update({
              name: extractedInfo.customer_name,
              address: extractedInfo.address || undefined,
              email: extractedInfo.email || undefined
            })
            .eq('customer_id', customerId)
        }
      }
    }

    // Skapa AI-förslag i databasen
    const suggestions = analysisResult.suggestions || []
    const createdSuggestions = []

    for (const suggestion of suggestions) {
      // Skippa förslag med låg confidence
      if (suggestion.confidence < 0.4) continue

      // Lägg till extraherad kundinfo i action_data
      const actionData = {
        ...suggestion.action_data,
        customer_name: suggestion.action_data?.customer_name || extractedInfo.customer_name,
        phone_number: suggestion.action_data?.phone_number || extractedInfo.phone_number || recording.phone_number,
        address: suggestion.action_data?.address || extractedInfo.address,
        email: suggestion.action_data?.email || extractedInfo.email
      }

      const { data: createdSuggestion, error: insertError } = await supabase
        .from('ai_suggestion')
        .insert({
          business_id: recording.business_id,
          recording_id: recording_id,
          customer_id: customerId,
          suggestion_type: suggestion.type,
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          status: 'pending',
          action_data: actionData,
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
      urgency: analysisResult.urgency,
      extracted_info: extractedInfo,
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
