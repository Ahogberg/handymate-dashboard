import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getServerSupabase } from '@/lib/supabase'
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

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File
    const activeCustomer = formData.get('active_customer') as string | null
    const activeCustomerId = formData.get('active_customer_id') as string | null

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file' }, { status: 400 })
    }

    // Step 1: Transcribe with Whisper
    const audioBuffer = Buffer.from(await audioFile.arrayBuffer())
    const whisperFormData = new FormData()
    whisperFormData.append('file', new Blob([audioBuffer], { type: audioFile.type }), 'recording.webm')
    whisperFormData.append('model', 'whisper-1')
    whisperFormData.append('language', 'sv')

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

    const { data: activeProjects } = await supabase
      .from('project')
      .select('project_id, name, status, customer:customer_id(name)')
      .eq('business_id', authBusiness.business_id)
      .eq('status', 'active')
      .limit(10)

    // Step 3: AI analysis with Claude
    const anthropic = getAnthropic()

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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
