import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre, llmCostUsd } from '@/lib/costs/meter'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'

const VOICE_PROCESS_MODEL = 'claude-haiku-4-5-20251001'

/**
 * POST /api/voice/process
 * Tar emot ljudfil → transkriberar med Whisper → analyserar med Claude → returnerar actions.
 *
 * DIKTATVÄGEN (etapp 1b, "en väg in"): detta är hantverkarens EGET röst-
 * kommando-flöde — han pratar in "boka Anna på tisdag" och godkänner själv
 * förslaget i UI:t. Ingen agent triggas, inget ai_suggestion-kort skapas —
 * det är INTE en inbound-kanal och ska aldrig bli en. Blanda inte ihop med
 * telefonivägen (46elks → voice/recording → voice/transcribe →
 * lib/voice/analyze-call.ts), där ett INKOMMANDE samtal går genom Lisa
 * (agentmotorn) och analysmotorn.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const audio = formData.get('audio') as File | null
  if (!audio) {
    return NextResponse.json({ error: 'Ingen ljudfil bifogad' }, { status: 400 })
  }

  // 1. Transkribera med Whisper
  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return NextResponse.json({ error: 'OpenAI API-nyckel saknas' }, { status: 500 })
  }

  const whisperForm = new FormData()
  whisperForm.append('file', audio)
  whisperForm.append('model', 'whisper-1')
  whisperForm.append('language', 'sv')
  // verbose_json ger en FAKTISK ljudlängd (Whisper mäter, gissar inte ur
  // filstorlek) — se app/api/voice/transcribe/route.ts.
  whisperForm.append('response_format', 'verbose_json')

  const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openaiKey}` },
    body: whisperForm,
  })

  if (!whisperRes.ok) {
    const err = await whisperRes.text().catch(() => 'unknown')
    console.error('[voice/process] Whisper error:', err)
    return NextResponse.json({ error: 'Transkribering misslyckades' }, { status: 500 })
  }

  const whisperJson = await whisperRes.json()
  const transcript = whisperJson.text

  const ljudSekunder = Number(whisperJson.duration) || 0
  if (ljudSekunder > 0) {
    await recordCost({
      supabase: getServerSupabase(),
      businessId: business.business_id,
      resource: 'whisper',
      units: ljudSekunder,
      costOre: whisperCostOre(ljudSekunder),
      refType: 'voice_process',
      refId: `voice_process_${Date.now()}`,
    })
  }

  if (!transcript || transcript.trim().length === 0) {
    return NextResponse.json({
      transcript: '',
      actions: [],
      error: 'Kunde inte höra något tal',
    })
  }

  // 2. Analysera med Claude
  const anthropicKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicKey) {
    return NextResponse.json({
      transcript,
      actions: [],
      error: 'Anthropic API-nyckel saknas',
    })
  }

  const prompt = `Du är assistent för ${business.business_name}, ett hantverksföretag.

Användaren sa: "${transcript}"

Identifiera ALLA konkreta actions som ska utföras.
Returnera ENDAST JSON, inget annat:

{
  "actions": [
    {
      "id": "generera-unik-uuid",
      "type": "time_report|work_log|material|invoice|quote|note|sms|calendar",
      "title": "Kort titel t.ex. 'Tidrapport 6 tim'",
      "description": "Beskrivning t.ex. 'Erik Andersson — Elinstallation'",
      "confidence": 0.0-1.0,
      "data": {}
    }
  ]
}

Möjliga typer och deras data-fält:
- time_report: { "customer_name": "", "hours": 0, "description": "", "date": "YYYY-MM-DD" }
- work_log: { "project_name": "", "description": "" }
- material: { "description": "", "amount_sek": 0 }
- invoice: { "customer_name": "", "description": "" }
- quote: { "customer_name": "", "description": "", "estimated_amount": 0 }
- note: { "title": "", "content": "" }
- sms: { "recipient_name": "", "message": "" }
- calendar: { "title": "", "date": "YYYY-MM-DD", "time": "HH:MM", "duration_hours": 1 }

Om inget datum anges, anta dagens datum (${new Date().toISOString().split('T')[0]}).
Inkludera bara actions med confidence > 0.7.`

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: VOICE_PROCESS_MODEL,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!claudeRes.ok) {
      const err = await claudeRes.text().catch(() => 'unknown')
      console.error('[voice/process] Claude error:', err)
      return NextResponse.json({
        transcript,
        actions: [],
        error: 'AI-analys misslyckades',
      })
    }

    const claudeData = await claudeRes.json()
    const rawText = claudeData.content?.[0]?.text || ''

    if (claudeData.usage) {
      await meterDirectLlmCall({
        supabase: getServerSupabase(),
        businessId: business.business_id,
        usage: claudeData.usage,
        costUsd: llmCostUsd(claudeData.usage, VOICE_PROCESS_MODEL),
        refType: 'voice_process',
        refId: `voice_process_${Date.now()}`,
      })
    }

    const parsed = JSON.parse(rawText.replace(/```json|```/g, '').trim())
    const actions = (parsed.actions || []).filter((a: { confidence: number }) => a.confidence > 0.7)

    return NextResponse.json({
      transcript,
      actions,
    })
  } catch (err) {
    console.error('[voice/process] Parse error:', err)
    return NextResponse.json({
      transcript,
      actions: [],
      error: 'Kunde inte tolka AI-svaret',
    })
  }
}
