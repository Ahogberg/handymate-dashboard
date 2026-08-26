import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'
import { checkFuelGate } from '@/lib/costs/fuel'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    // Auth: annars kan vem som helst bränna OpenAI Whisper-krediter.
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const fuel = await checkFuelGate(supabase, business.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'Transkribering ej konfigurerad — OPENAI_API_KEY saknas' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('audio') as File | null

    if (!file) {
      return NextResponse.json({ error: 'Ingen ljudfil bifogad' }, { status: 400 })
    }

    // Max 25MB (Whisper limit)
    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json({ error: 'Filen är för stor (max 25 MB)' }, { status: 400 })
    }

    // Forward to OpenAI Whisper
    const whisperForm = new FormData()
    whisperForm.append('file', file, file.name || 'audio.m4a')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'sv')
    // verbose_json ger en FAKTISK ljudlängd (Whisper mäter, gissar inte ur
    // filstorlek) — det är vad som gör den mätbar, se app/api/voice/transcribe/route.ts.
    whisperForm.append('response_format', 'verbose_json')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: whisperForm,
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('[matte/transcribe] Whisper error:', err)
      return NextResponse.json(
        { error: 'Kunde inte transkribera ljudet' },
        { status: 500 }
      )
    }

    const data = await res.json()

    const ljudSekunder = Number(data.duration) || 0
    if (ljudSekunder > 0) {
      await recordCost({
        supabase,
        businessId: business.business_id,
        resource: 'whisper',
        units: ljudSekunder,
        costOre: whisperCostOre(ljudSekunder),
        refType: 'matte_transcribe',
        refId: `matte_transcribe_${Date.now()}`,
      })
    }

    return NextResponse.json({
      text: data.text || '',
    })
  } catch (error: any) {
    console.error('[matte/transcribe] Error:', error)
    return NextResponse.json(
      { error: 'Transkribering misslyckades' },
      { status: 500 }
    )
  }
}
