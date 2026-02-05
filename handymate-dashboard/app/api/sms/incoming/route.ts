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
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })
}

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

async function sendSMS(to: string, message: string, from: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: from.substring(0, 11),
        to: to,
        message: message,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const anthropic = getAnthropic()
    // 46elks skickar form-data
    const formData = await request.formData()
    const from = formData.get('from') as string
    const to = formData.get('to') as string
    const message = formData.get('message') as string

    console.log('Incoming SMS:', { from, to, message })

    if (!from || !message) {
      return NextResponse.json({ error: 'Missing data' }, { status: 400 })
    }

    // Hitta vilket företag som äger detta nummer
    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('business_id, business_name, services_offered, working_hours, greeting_script')
      .eq('phone_number', to)
      .single()

    // Om vi inte hittar företag via nummer, försök hitta via kundens telefon
    let business = businessConfig
    let customer = null

    if (!business) {
      // Hitta kunden och därmed företaget
      const { data: customerData } = await supabase
        .from('customer')
        .select('customer_id, name, business_id')
        .eq('phone_number', from)
        .single()

      if (customerData) {
        customer = customerData
        const { data: bizData } = await supabase
          .from('business_config')
          .select('business_id, business_name, services_offered, working_hours, greeting_script')
          .eq('business_id', customerData.business_id)
          .single()
        business = bizData
      }
    }

    if (!business) {
      console.log('No business found for incoming SMS')
      return NextResponse.json({ success: true, handled: false })
    }

    // Hämta eller skapa kund
    if (!customer) {
      const { data: existingCustomer } = await supabase
        .from('customer')
        .select('customer_id, name')
        .eq('business_id', business.business_id)
        .eq('phone_number', from)
        .single()

      if (existingCustomer) {
        customer = existingCustomer
      } else {
        // Skapa ny kund
        const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
        await supabase
          .from('customer')
          .insert({
            customer_id: customerId,
            business_id: business.business_id,
            phone_number: from,
            name: 'SMS-kund',
            created_at: new Date().toISOString(),
          })
        customer = { customer_id: customerId, name: 'SMS-kund' }
      }
    }

    // Hämta konversationshistorik (senaste 10 meddelanden)
    const { data: history } = await supabase
      .from('sms_conversation')
      .select('role, content, created_at')
      .eq('business_id', business.business_id)
      .eq('phone_number', from)
      .order('created_at', { ascending: false })
      .limit(10)

    const conversationHistory = (history || []).reverse()

    // Spara inkommande meddelande
    await supabase
      .from('sms_conversation')
      .insert({
        business_id: business.business_id,
        customer_id: customer.customer_id,
        phone_number: from,
        role: 'user',
        content: message,
        created_at: new Date().toISOString(),
      })

    // Generera AI-svar
    const systemPrompt = `Du är en hjälpsam SMS-assistent för ${business.business_name}.

Företagsinformation:
- Namn: ${business.business_name}
- Tjänster: ${business.services_offered?.join(', ') || 'Ej specificerat'}

Din uppgift:
1. Svara kortfattat och vänligt (max 160 tecken om möjligt)
2. Om kunden vill boka, fråga om dag/tid som passar
3. Om kunden svarar "JA", "OK", "Boka" eller liknande på ett erbjudande, bekräfta och fråga om detaljer
4. Om kunden svarar "NEJ", "Nej tack" eller liknande, tacka artigt och avsluta
5. Svara alltid på svenska
6. Var personlig men professionell
7. Om du inte kan hjälpa, erbjud att företaget ringer upp

Viktigt: Håll svaren korta - detta är SMS!`

    const messages = conversationHistory.map((msg: any) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content
    }))
    messages.push({ role: 'user' as const, content: message })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      system: systemPrompt,
      messages: messages,
    })

    const aiResponse = response.content[0].type === 'text' 
      ? response.content[0].text 
      : 'Tack för ditt meddelande! Vi återkommer snart.'

    // Spara AI-svar
    await supabase
      .from('sms_conversation')
      .insert({
        business_id: business.business_id,
        customer_id: customer.customer_id,
        phone_number: from,
        role: 'assistant',
        content: aiResponse,
        created_at: new Date().toISOString(),
      })

    // Skicka SMS-svar
    await sendSMS(from, aiResponse, business.business_name)

    // Skapa inbox-item för översikt
    await supabase
      .from('inbox_item')
      .insert({
        inbox_item_id: 'inb_' + Math.random().toString(36).substr(2, 9),
        business_id: business.business_id,
        customer_id: customer.customer_id,
        channel: 'sms',
        summary: message.substring(0, 100),
        transcript: JSON.stringify([
          { role: 'user', content: message },
          { role: 'assistant', content: aiResponse }
        ]),
        ai_recommendation: 'Tvåvägs SMS-konversation',
        status: 'new',
        created_at: new Date().toISOString(),
      })

    return NextResponse.json({ success: true, response: aiResponse })

  } catch (error: any) {
    console.error('Incoming SMS error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
