import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'
import { meterDirectLlmCall } from '@/lib/agents/shared/cost-guard'
import { llmCostUsd } from '@/lib/costs/meter'
import { checkFuelGate } from '@/lib/costs/fuel'

const JOBBUDDY_VOICE_MODEL = 'claude-sonnet-4-6'

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

    const fuelSupabase = getServerSupabase()
    const fuel = await checkFuelGate(fuelSupabase, authBusiness.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const activeCustomer = formData.get('active_customer') as string | null
    const activeCustomerId = formData.get('active_customer_id') as string | null

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    // Ett spårbart id för hela röstförfrågan — delas av Whisper- och
    // Sonnet-kostnadsraderna nedan så de går att koppla ihop i cost_event.
    const requestId = `jobbuddy_voice_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Step 1: Transcribe with Whisper. response_format=verbose_json ger en
    // FAKTISK ljudlängd (Whisper mäter den, gissar inte ur filstorlek) —
    // det var just den skillnaden som höll den här routen omätt tidigare
    // (se app/api/voice/transcribe/route.ts, som varnar för att uppskatta
    // längd ur filstorlek).
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const whisperFormData = new FormData()
    whisperFormData.append('file', new Blob([audioBuffer], { type: audioFile.type }), 'recording.webm')
    whisperFormData.append('model', 'whisper-1')
    whisperFormData.append('language', 'sv')
    whisperFormData.append('response_format', 'verbose_json')

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: whisperFormData,
    })

    if (!whisperResponse.ok) {
      return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
    }

    const whisperData = await whisperResponse.json()
    const transcript = whisperData.text

    const ljudSekunder = Number(whisperData.duration) || 0
    if (ljudSekunder > 0) {
      await recordCost({
        supabase: getServerSupabase(),
        businessId: authBusiness.business_id,
        resource: 'whisper',
        units: ljudSekunder,
        costOre: whisperCostOre(ljudSekunder),
        refType: 'jobbuddy_voice',
        refId: requestId,
      })
    }

    // Matte-flytten (Andreas 2026-08-03): hörnbubblan skickar transcribe_only
    // och matar transkriptet genom /api/matte/chat (multi-agent, dirigering,
    // Fas 0-säkerhetsräcke) istället för denna routes egna, svagare Claude-
    // analys. Whisper-delen behålls här; analysen nedan är kvar enbart för
    // ev. äldre anropare och kan tas bort när ingen använder den.
    if (formData.get('transcribe_only') === '1') {
      return NextResponse.json({ transcript: transcript?.trim() || '' })
    }

    if (!transcript || transcript.trim().length < 3) {
      return NextResponse.json({
        transcript: '',
        understood: 'Kunde inte uppfatta vad du sa. Försök igen.',
        actions: [],
      })
    }

    // Step 2: Get business context for AI
    const supabase = getServerSupabase()

    const { data: recentCustomers } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .eq('business_id', authBusiness.business_id)
      .order('updated_at', { ascending: false })
      .limit(20)

    // OBS: ingen embeddad customer-join här — project saknar FK till customer
    // i prod (PGRST200 → hela queryn felar). Kundnamn hämtas separat nedan.
    const { data: activeProjectRows } = await supabase
      .from('project')
      .select('project_id, name, status, customer_id')
      .eq('business_id', authBusiness.business_id)
      .eq('status', 'active')
      .limit(10)

    const projCustomerIds = Array.from(new Set((activeProjectRows || []).map(p => p.customer_id).filter(Boolean)))
    const projCustomerNames: Record<string, string> = {}
    if (projCustomerIds.length > 0) {
      const { data: projCustomers } = await supabase
        .from('customer')
        .select('customer_id, name')
        .in('customer_id', projCustomerIds)
      for (const c of projCustomers || []) projCustomerNames[c.customer_id] = c.name
    }
    const activeProjects = (activeProjectRows || []).map(p => ({
      ...p,
      customer: p.customer_id ? { name: projCustomerNames[p.customer_id] ?? null } : null,
    }))

    // Step 3: AI analysis with Claude
    const anthropic = getAnthropic()

    const response = await anthropic.messages.create({
      model: JOBBUDDY_VOICE_MODEL,
      max_tokens: 1000,
      system: `Du är "Jobbkompisen" — en AI som tolkar hantverkares röstkommandon och omvandlar dem till konkreta åtgärder.

INSTRUKTIONER:
- Tolka vad hantverkaren menar, även om det är informellt ("Jag är klar hos Svensson, bytte tre grejer, tog två och en halv timma")
- Skapa lämpliga åtgärder baserat på vad som sades
- Svara alltid på svenska

TILLGÄNGLIGA ÅTGÄRDSTYPER:
- log_time: Logga arbetstid (data: customer_id, customer_name, duration_minutes, description)
- create_invoice: Skapa faktura (data: customer_id, customer_name, description, items)
- create_quote: Skapa offert (data: customer_name, description, items)
- update_project: Uppdatera projekt (data: project_id, project_name, update)
- send_sms: Skicka SMS (data: customer_id, customer_name, message)
- order_material: Beställ material (data: items)

${activeCustomer ? `PÅGÅENDE JOBB: Hos kund "${activeCustomer}" (ID: ${activeCustomerId})` : ''}

KÄNDA KUNDER: ${(recentCustomers || []).map((c: any) => `${c.name} (${c.customer_id})`).join(', ') || 'Inga'}
AKTIVA PROJEKT: ${(activeProjects || []).map((p: any) => `${p.name} (${p.project_id}) - ${(p.customer as any)?.name || 'okänd kund'}`).join(', ') || 'Inga'}

Svara med JSON: { "understood": "sammanfattning av vad du förstod", "actions": [{ "id": "unikt-id", "type": "åtgärdstyp", "label": "kort etikett", "description": "detaljerad beskrivning", "data": {...}, "status": "pending" }] }`,
      messages: [{
        role: 'user',
        content: `Hantverkaren sa: "${transcript}"`,
      }],
    })

    await meterDirectLlmCall({
      supabase: getServerSupabase(),
      businessId: authBusiness.business_id,
      usage: response.usage,
      costUsd: llmCostUsd(response.usage, JOBBUDDY_VOICE_MODEL),
      refType: 'jobbuddy_voice',
      refId: requestId,
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

    // Parse AI response
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        return NextResponse.json({
          transcript,
          understood: parsed.understood || transcript,
          actions: (parsed.actions || []).map((a: any, i: number) => ({
            id: a.id || `voice-action-${Date.now()}-${i}`,
            type: a.type || 'unknown',
            label: a.label || 'Åtgärd',
            description: a.description || '',
            data: a.data || {},
            status: 'pending',
          })),
        })
      }
    } catch {
      // JSON parsing failed
    }

    return NextResponse.json({
      transcript,
      understood: rawText || transcript,
      actions: [],
    })
  } catch (error) {
    console.error('Jobbuddy voice error:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}
