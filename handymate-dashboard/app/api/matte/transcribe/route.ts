import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { checkFuelGate } from '@/lib/costs/fuel'
import { transcribe } from '@/lib/transcription/transcribe'
import { laddaVokabular } from '@/lib/transcription/vocabulary'

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

    // Delad transkribering (lib/transcription). Ensamtalaryta: ingen
    // diarisering, men egennamnsprompten väger tungt — det är här ägaren
    // dikterar kundnamn, ortsnamn och artiklar.
    const vocabulary = await laddaVokabular(supabase, business.business_id)
    const resultat = await transcribe(supabase, business.business_id, {
      yta: 'matte',
      file,
      filename: file.name || 'audio.m4a',
      vocabulary,
      refType: 'matte_transcribe',
      refId: `matte_transcribe_${Date.now()}`,
    })

    // Vakten: hellre "inget tal hittades" än en hallucination som skickas
    // vidare in i Matte-chatten som om ägaren hade sagt den.
    if (resultat.avvisad) {
      return NextResponse.json({ text: '', error: resultat.avvisad.meddelande }, { status: 422 })
    }
    if (!resultat.ok) {
      console.error('[matte/transcribe] transkribering misslyckades:', resultat.error)
      return NextResponse.json({ error: 'Kunde inte transkribera ljudet' }, { status: 500 })
    }

    return NextResponse.json({
      text: resultat.text,
    })
  } catch (error: any) {
    console.error('[matte/transcribe] Error:', error)
    return NextResponse.json(
      { error: 'Transkribering misslyckades' },
      { status: 500 }
    )
  }
}
