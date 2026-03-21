import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
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
    whisperForm.append('response_format', 'json')

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
