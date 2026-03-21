import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const { messages, context } = await request.json()

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'messages krävs' }, { status: 400 })
    }

    const userName = context?.userName || 'hantverkaren'
    const businessName = context?.businessName || 'företaget'
    const businessId = context?.businessId

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({
        reply: 'Hej! Jag är Matte, din AI-assistent. Just nu kan jag inte svara — be din admin kontrollera API-inställningarna.',
      })
    }

    const systemPrompt = `Du är Matte, AI-assistent för hantverkaren ${userName} på ${businessName}. Du kan hjälpa med tidrapportering, offerter, fakturaöversikt och projektuppdateringar. Svara kort och konkret på svenska. Max 2-3 meningar per svar.

Om användaren vill navigera till en del av appen, returnera ett JSON-objekt på en egen rad:
{"action":"navigate","target":"quotes|projects|invoices|customers|pipeline|settings|home"}

Var vänlig, professionell och effektiv. Använd du-tilltal.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: messages.slice(-10).map((m: { role: string; content: string }) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        })),
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[matte/chat] Anthropic error:', err)
      return NextResponse.json({
        reply: 'Något gick fel — försök igen om en stund.',
      })
    }

    const data = await res.json()
    const replyText = data.content?.[0]?.text || 'Jag kunde inte svara just nu.'

    // Parse action if present
    let action: { type: string; target: string } | undefined
    const actionMatch = replyText.match(/\{"action"\s*:\s*"navigate"\s*,\s*"target"\s*:\s*"([^"]+)"\}/)
    if (actionMatch) {
      action = { type: 'navigate', target: actionMatch[1] }
    }

    // Remove JSON action from visible reply
    const cleanReply = replyText.replace(/\{"action"\s*:\s*"navigate"[^}]+\}\s*/g, '').trim()

    return NextResponse.json({
      reply: cleanReply || 'Navigerar...',
      action,
    })
  } catch (error: any) {
    console.error('[matte/chat] Error:', error)
    return NextResponse.json({
      reply: 'Något gick fel — försök igen.',
    })
  }
}
