import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'
import { checkFuelGate } from '@/lib/costs/fuel'

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkAiApiRateLimit(business.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const supabase = getServerSupabase()
    const fuel = await checkFuelGate(supabase, business.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File

    if (!audioFile) {
      return NextResponse.json({ error: 'Ingen ljudfil' }, { status: 400 })
    }

    // Send to OpenAI Whisper
    const whisperForm = new FormData()
    whisperForm.append('file', audioFile, 'recording.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'sv')
    // verbose_json ger en FAKTISK ljudlängd (Whisper mäter, gissar inte ur
    // filstorlek) — se app/api/voice/transcribe/route.ts.
    whisperForm.append('response_format', 'verbose_json')

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: whisperForm
    })

    if (!whisperResponse.ok) {
      const err = await whisperResponse.text()
      console.error('Whisper error:', err)
      return NextResponse.json({ error: 'Transkribering misslyckades' }, { status: 500 })
    }

    const result = await whisperResponse.json()

    const ljudSekunder = Number(result.duration) || 0
    if (ljudSekunder > 0) {
      await recordCost({
        supabase,
        businessId: business.business_id,
        resource: 'whisper',
        units: ljudSekunder,
        costOre: whisperCostOre(ljudSekunder),
        refType: 'quote_transcribe_voice',
        refId: `quote_transcribe_voice_${Date.now()}`,
      })
    }

    return NextResponse.json({
      success: true,
      transcript: result.text
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json({ error: error.message || 'Transkribering misslyckades' }, { status: 500 })
  }
}
