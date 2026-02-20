import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_id, session_id, message, visitor_info } = body

    if (!business_id || !session_id || !message) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400, headers: CORS_HEADERS })
    }

    const supabase = getServerSupabase()

    // Get business config
    const { data: config } = await supabase
      .from('business_config')
      .select('business_id, business_name, display_name, service_area, widget_enabled, widget_max_estimate, widget_collect_contact, widget_give_estimates, widget_ask_budget, widget_bot_name')
      .eq('business_id', business_id)
      .single()

    if (!config || !config.widget_enabled) {
      return NextResponse.json({ error: 'Widget not enabled' }, { status: 403, headers: CORS_HEADERS })
    }

    // Rate limit: check conversation count today
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const { count: todayConvos } = await supabase
      .from('widget_conversation')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', business_id)
      .gte('created_at', todayStart.toISOString())

    if ((todayConvos || 0) > 500) {
      return NextResponse.json({ error: 'Daglig gräns nådd', reply: 'Vi har många förfrågningar just nu. Vänligen kontakta oss direkt.' }, { status: 429, headers: CORS_HEADERS })
    }

    // Get or create conversation
    let { data: conversation } = await supabase
      .from('widget_conversation')
      .select('*')
      .eq('business_id', business_id)
      .eq('session_id', session_id)
      .single()

    if (!conversation) {
      const { data: newConv } = await supabase
        .from('widget_conversation')
        .insert({
          business_id,
          session_id,
          visitor_name: visitor_info?.name || null,
          visitor_phone: visitor_info?.phone || null,
          visitor_email: visitor_info?.email || null,
          messages: [],
          message_count: 0,
        })
        .select()
        .single()
      conversation = newConv
    }

    if (!conversation) {
      return NextResponse.json({ error: 'Could not create conversation' }, { status: 500, headers: CORS_HEADERS })
    }

    // Rate limit: max 20 messages per conversation
    if ((conversation.message_count || 0) >= 20) {
      return NextResponse.json({
        reply: 'Du har nått maxgränsen för meddelanden. Kontakta oss direkt för mer hjälp!',
        session_id,
      }, { headers: CORS_HEADERS })
    }

    // Update visitor info if provided
    if (visitor_info) {
      const updates: Record<string, any> = {}
      if (visitor_info.name && !conversation.visitor_name) updates.visitor_name = visitor_info.name
      if (visitor_info.phone && !conversation.visitor_phone) updates.visitor_phone = visitor_info.phone
      if (visitor_info.email && !conversation.visitor_email) updates.visitor_email = visitor_info.email
      if (Object.keys(updates).length > 0) {
        await supabase.from('widget_conversation').update(updates).eq('id', conversation.id)
        Object.assign(conversation, updates)
      }
    }

    // Get knowledge base and price list
    let knowledgeText = ''
    let priceListText = ''

    try {
      const { data: knowledge } = await supabase
        .from('knowledge_base')
        .select('title, content, category')
        .eq('business_id', business_id)
        .limit(20)
      if (knowledge && knowledge.length > 0) {
        knowledgeText = knowledge.map((k: any) => `[${k.category || 'Allmänt'}] ${k.title}: ${k.content}`).join('\n')
      }
    } catch { /* table may not exist */ }

    try {
      const { data: prices } = await supabase
        .from('price_list')
        .select('name, category, unit, unit_price')
        .eq('business_id', business_id)
        .limit(50)
      if (prices && prices.length > 0) {
        priceListText = prices.map((p: any) => `${p.name} (${p.category}): ${p.unit_price} kr/${p.unit}`).join('\n')
      }
    } catch { /* table may not exist */ }

    // Build conversation history for Claude
    const existingMessages = (conversation.messages || []) as { role: string; content: string }[]
    const conversationHistory = existingMessages.map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }))

    const businessName = config.display_name || config.business_name
    const maxEstimate = config.widget_max_estimate || 100000
    const serviceArea = config.service_area || 'hela Sverige'

    const systemPrompt = `Du är en hjälpsam kundassistent för ${businessName}.

Ditt jobb:
1. Svara vänligt och professionellt på kundfrågor
2. ${config.widget_give_estimates ? 'Ge prisuppskattningar baserat på prislistan nedan' : 'Hänvisa till offert för prisfrågor'}
3. ${config.widget_collect_contact ? 'Samla kundens kontaktuppgifter (namn, telefon, email) för uppföljning' : 'Var hjälpsam'}
4. Hjälp kunden förstå vilka tjänster som erbjuds

${priceListText ? `PRISLISTA:\n${priceListText}` : ''}

${knowledgeText ? `KUNSKAPSBAS:\n${knowledgeText}` : ''}

SERVICEOMRÅDE: ${serviceArea}

REGLER:
- Ge alltid prisintervall, aldrig exakta priser: "Ungefär 85 000 - 120 000 kr beroende på materialval"
- Om jobbet överstiger ${maxEstimate.toLocaleString('sv-SE')} kr: "Det här kräver en individuell offert. Lämna gärna dina uppgifter!"
- Om jobbet är utanför serviceområdet: "Vi jobbar främst i ${serviceArea}. Lämna dina uppgifter så kollar vi om vi kan hjälpa."
- Om du inte vet svaret: "Det vill jag inte svara fel på. Lämna dina uppgifter så kontaktar ${businessName} dig personligen."
${config.widget_ask_budget ? '- Fråga naturligt om budget och önskad tidsram' : ''}
${config.widget_collect_contact ? '- Försök naturligt samla: namn, telefon, email, jobbeskrivning' : ''}
- Svara ALLTID på svenska
- Var vänlig och professionell men inte för formell
- Håll svaren korta (max 2-3 meningar per svar)
- Använd INTE markdown-formatering

${config.widget_collect_contact ? 'När du har fått kontaktuppgifter (minst namn + telefon eller email), säg: "Tack! Vi hör av oss inom 24 timmar med mer information."' : ''}`

    // Call Claude (Sonnet for speed + cost)
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        ...conversationHistory,
        { role: 'user', content: message },
      ],
    })

    const reply = response.content[0].type === 'text' ? response.content[0].text : 'Jag kunde inte svara just nu.'

    // Save messages to conversation
    const updatedMessages = [
      ...existingMessages,
      { role: 'user', content: message },
      { role: 'assistant', content: reply },
    ]

    await supabase.from('widget_conversation').update({
      messages: updatedMessages,
      message_count: (conversation.message_count || 0) + 1,
      updated_at: new Date().toISOString(),
      ...(visitor_info?.name ? { visitor_name: visitor_info.name } : {}),
      ...(visitor_info?.phone ? { visitor_phone: visitor_info.phone } : {}),
      ...(visitor_info?.email ? { visitor_email: visitor_info.email } : {}),
    }).eq('id', conversation.id)

    // Check if we have enough info to create a lead
    const hasName = conversation.visitor_name || visitor_info?.name
    const hasContact = conversation.visitor_phone || visitor_info?.phone || conversation.visitor_email || visitor_info?.email

    if (hasName && hasContact && !conversation.lead_created) {
      try {
        // Create customer if not exists
        const phone = conversation.visitor_phone || visitor_info?.phone
        const email = conversation.visitor_email || visitor_info?.email
        const name = conversation.visitor_name || visitor_info?.name

        let customerId: string | null = null

        // Check for existing customer
        if (phone) {
          const { data: existing } = await supabase
            .from('customer')
            .select('customer_id')
            .eq('business_id', business_id)
            .eq('phone_number', phone)
            .single()
          if (existing) customerId = existing.customer_id
        }

        if (!customerId && email) {
          const { data: existing } = await supabase
            .from('customer')
            .select('customer_id')
            .eq('business_id', business_id)
            .eq('email', email)
            .single()
          if (existing) customerId = existing.customer_id
        }

        if (!customerId) {
          const { data: newCustomer } = await supabase
            .from('customer')
            .insert({
              business_id,
              name,
              phone_number: phone || null,
              email: email || null,
            })
            .select('customer_id')
            .single()
          customerId = newCustomer?.customer_id || null
        }

        // Create deal
        if (customerId) {
          const dealTitle = `Webbförfrågan: ${name}`
          const { data: stages } = await supabase
            .from('pipeline_stage')
            .select('id')
            .eq('business_id', business_id)
            .order('sort_order', { ascending: true })
            .limit(1)

          const firstStageId = stages?.[0]?.id

          if (firstStageId) {
            const { data: deal } = await supabase
              .from('deal')
              .insert({
                business_id,
                title: dealTitle,
                customer_id: customerId,
                stage_id: firstStageId,
                source: 'website_widget',
                lead_source_platform: 'website_widget',
                lead_temperature: 'warm',
                first_response_at: new Date().toISOString(),
                response_time_seconds: 0,
              })
              .select('id')
              .single()

            // Mark conversation as lead-created
            await supabase.from('widget_conversation').update({
              lead_created: true,
              deal_id: deal?.id || null,
            }).eq('id', conversation.id)

            // Create notification
            try {
              await supabase.from('notification').insert({
                business_id,
                type: 'new_lead',
                title: `Ny lead från hemsidan: ${name}`,
                message: phone ? `Telefon: ${phone}` : `Email: ${email}`,
                icon: '🌐',
                link: deal?.id ? `/dashboard/pipeline` : null,
              })
            } catch { /* notification table may not exist */ }
          }
        }
      } catch { /* lead creation failed, non-critical */ }
    }

    return NextResponse.json({
      reply,
      session_id,
    }, { headers: CORS_HEADERS })
  } catch (error: any) {
    console.error('Widget chat error:', error)
    return NextResponse.json({
      reply: 'Något gick fel. Försök igen om en stund.',
      error: error.message,
    }, { status: 500, headers: CORS_HEADERS })
  }
}
