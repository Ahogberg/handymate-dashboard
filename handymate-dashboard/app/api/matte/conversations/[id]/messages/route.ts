import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export const maxDuration = 60

/**
 * POST /api/matte/conversations/[id]/messages
 * 1. Sparar user-meddelandet
 * 2. Hämtar hela historiken
 * 3. Anropar agent-trigger med conversation-array
 * 4. Sparar agent-svaret
 * 5. Uppdaterar conversation (titel, preview, count)
 * Returnerar { user_message, assistant_message, conversation }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: conversationId } = await params
  const body = await request.json().catch(() => ({}))
  const userContent = (body.content || '').trim()
  if (!userContent) {
    return NextResponse.json({ error: 'Meddelande krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Verifiera att konversationen tillhör företaget
  const { data: conv } = await supabase
    .from('matte_conversations')
    .select('id, title, message_count')
    .eq('id', conversationId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (!conv) {
    return NextResponse.json({ error: 'Konversation hittades inte' }, { status: 404 })
  }

  // 1. Spara user-meddelande
  const { data: userMsg, error: userErr } = await supabase
    .from('matte_messages')
    .insert({
      conversation_id: conversationId,
      business_id: business.business_id,
      role: 'user',
      content: userContent,
    })
    .select()
    .single()

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 })
  }

  // 2. Hämta hela historiken
  const { data: history } = await supabase
    .from('matte_messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  const conversation = (history || []).slice(-20)

  // 3. Anropa agent-trigger (intern server-to-server call)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || (request.headers.get('origin') || '')
  let assistantContent = 'Jag kunde inte svara just nu — försök igen.'
  let agentRunId: string | null = null

  try {
    const triggerRes = await fetch(`${appUrl}/api/agent/trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({
        business_id: business.business_id,
        trigger_type: 'manual',
        trigger_data: {
          instruction: userContent,
          conversation: conversation,
        },
      }),
    })

    if (triggerRes.ok) {
      const data = await triggerRes.json()
      assistantContent = data.final_response || assistantContent
      agentRunId = data.run_id || null
    } else {
      const err = await triggerRes.text().catch(() => '')
      assistantContent = `Något gick fel — försök igen. ${err ? `(${err.slice(0, 100)})` : ''}`
    }
  } catch (err: any) {
    assistantContent = `Kunde inte nå AI-tjänsten just nu. ${err?.message || ''}`
  }

  // 4. Spara assistant-meddelande
  const { data: assistantMsg } = await supabase
    .from('matte_messages')
    .insert({
      conversation_id: conversationId,
      business_id: business.business_id,
      role: 'assistant',
      content: assistantContent,
      agent_run_id: agentRunId,
    })
    .select()
    .single()

  // 5. Uppdatera conversation-metadata + auto-titel om första gången
  const messageCount = (conv.message_count || 0) + 2
  const updates: Record<string, unknown> = {
    message_count: messageCount,
    last_message_preview: assistantContent.slice(0, 120),
    updated_at: new Date().toISOString(),
  }
  if (!conv.title || conv.title.trim() === '') {
    updates.title = userContent.slice(0, 60)
  }

  await supabase
    .from('matte_conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('business_id', business.business_id)

  return NextResponse.json({
    user_message: userMsg,
    assistant_message: assistantMsg,
  })
}
