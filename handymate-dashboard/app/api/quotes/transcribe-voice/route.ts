import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness, checkAiApiRateLimit } from '@/lib/auth'

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

    return NextResponse.json({
      success: true,
      transcript: result.text
    })
  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json({ error: error.message || 'Transkribering misslyckades' }, { status: 500 })
  }
}
