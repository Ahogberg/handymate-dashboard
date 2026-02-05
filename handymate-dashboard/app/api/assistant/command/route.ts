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

interface CommandResponse {
  action: 'create_quote' | 'create_booking' | 'send_reminder' | 'get_stats' | 'search_customer' | 'create_invoice' | 'unknown'
  params: Record<string, any>
  response: string
  needsConfirmation: boolean
  suggestions?: string[]
}

/**
 * POST - Tolka röstkommando med AI
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { text, businessId } = body

    if (!text) {
      return NextResponse.json({ error: 'Missing text' }, { status: 400 })
    }

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    const supabase = getSupabase()
    const anthropic = getAnthropic()

    // Hämta kontext om företaget och kunder
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, services_offered, industry')
      .eq('business_id', businessId)
      .single()

    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .eq('business_id', businessId)
      .order('name')
      .limit(50)

    const { data: recentBookings } = await supabase
      .from('booking')
      .select('booking_id, scheduled_start, customer:customer_id(name)')
      .eq('business_id', businessId)
      .gte('scheduled_start', new Date().toISOString())
      .order('scheduled_start')
      .limit(10)

    const customerList = customers?.map((c: { customer_id: string; name: string; phone_number: string }) => `- ${c.name} (${c.phone_number})`).join('\n') || 'Inga kunder'

    const prompt = `Du är en röstassistent för ${business?.business_name || 'ett hantverksföretag'} (bransch: ${business?.industry || 'hantverkare'}).

Tolka användarens röstkommando och returnera ett strukturerat JSON-svar.

TILLGÄNGLIGA KUNDER:
${customerList}

KOMMANDE BOKNINGAR:
${recentBookings?.map((b: any) => `- ${b.customer?.name}: ${new Date(b.scheduled_start).toLocaleString('sv-SE')}`).join('\n') || 'Inga kommande bokningar'}

KOMMANDON DU KAN FÖRSTÅ:

1. SKAPA OFFERT
   Exempel: "Skapa offert till Erik på laddbox", "Gör en offert för badrumsrenovering till Andersson"
   Action: create_quote
   Params: customer_search (namn att söka på), job_type (typ av jobb), description (beskrivning)

2. BOKA
   Exempel: "Boka Johan på tisdag klockan 10", "Lägg in ett besök hos Svensson imorgon"
   Action: create_booking
   Params: customer_search, date (relativt eller specifikt), time, notes

3. SKICKA PÅMINNELSE
   Exempel: "Skicka påminnelse till Erik", "Påminn Andersson om deras bokning"
   Action: send_reminder
   Params: customer_search, message_type (booking_reminder, quote_reminder, payment_reminder)

4. HÄP STATISTIK
   Exempel: "Hur många bokningar har jag denna vecka?", "Vad är min omsättning denna månad?", "Hur många offerter är skickade?"
   Action: get_stats
   Params: stat_type (bookings, revenue, quotes, customers), period (today, this_week, this_month, this_year)

5. SÖK KUND
   Exempel: "Visa information om Erik", "Hitta kund Andersson"
   Action: search_customer
   Params: customer_search

6. SKAPA FAKTURA
   Exempel: "Fakturera Erik för jobbet igår", "Skapa faktura på offerten till Andersson"
   Action: create_invoice
   Params: customer_search, from_quote (true/false), from_time_entries (true/false)

ANVÄNDARENS KOMMANDO:
"${text}"

SVARA MED JSON I DETTA FORMAT:
{
  "action": "create_quote|create_booking|send_reminder|get_stats|search_customer|create_invoice|unknown",
  "params": {
    // Relevanta parametrar baserat på action
  },
  "response": "Naturligt svar på svenska som beskriver vad du ska göra",
  "needsConfirmation": true/false,
  "suggestions": ["Förslag 1", "Förslag 2"] // Endast om action är unknown
}

REGLER:
1. Om kommandot är otydligt, ställ en följdfråga i response
2. Om du hittar en matchande kund i listan, inkludera customer_id i params
3. needsConfirmation ska vara true för alla åtgärder som skapar/ändrar data
4. Om du inte förstår kommandot, sätt action till "unknown" och ge förslag på vad användaren kan säga
5. Svara ENDAST med JSON, ingen annan text`

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }]
    })

    const responseText = response.content[0].type === 'text' ? response.content[0].text : ''

    let commandResponse: CommandResponse
    try {
      // Försök parsa hela svaret som JSON
      commandResponse = JSON.parse(responseText)
    } catch {
      // Om det misslyckas, försök hitta JSON i texten
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        commandResponse = JSON.parse(jsonMatch[0])
      } else {
        commandResponse = {
          action: 'unknown',
          params: {},
          response: 'Jag förstod inte kommandot. Försök igen eller tryck på hjälpknappen för exempel.',
          needsConfirmation: false,
          suggestions: [
            'Skapa offert till [kundnamn] på [jobb]',
            'Boka [kundnamn] på [dag] klockan [tid]',
            'Hur många bokningar har jag denna vecka?'
          ]
        }
      }
    }

    // Om kund hittades, försök matcha mot kundlistan
    if (commandResponse.params.customer_search) {
      const searchTerm = commandResponse.params.customer_search.toLowerCase()
      const matchedCustomer = customers?.find((c: { customer_id: string; name: string; phone_number: string }) =>
        c.name.toLowerCase().includes(searchTerm)
      )
      if (matchedCustomer) {
        commandResponse.params.customer_id = matchedCustomer.customer_id
        commandResponse.params.customer_name = matchedCustomer.name
        commandResponse.params.customer_phone = matchedCustomer.phone_number
      }
    }

    return NextResponse.json(commandResponse)

  } catch (error: any) {
    console.error('Command interpretation error:', error)
    return NextResponse.json({
      action: 'unknown',
      params: {},
      response: 'Ett tekniskt fel uppstod. Försök igen.',
      needsConfirmation: false
    }, { status: 500 })
  }
}
