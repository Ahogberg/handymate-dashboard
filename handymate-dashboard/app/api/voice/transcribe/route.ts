import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

/**
 * Transkriberar en inspelning med OpenAI Whisper
 * POST body: { recording_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { recording_id } = await request.json()

    if (!recording_id) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    // Hämta inspelningen från databasen
    const { data: recording, error: fetchError } = await supabase
      .from('call_recording')
      .select('*')
      .eq('recording_id', recording_id)
      .single()

    if (fetchError || !recording) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    if (recording.transcript) {
      return NextResponse.json({
        success: true,
        message: 'Already transcribed',
        transcript: recording.transcript
      })
    }

    // Kolla om OpenAI är konfigurerat
    if (!OPENAI_API_KEY) {
      console.log('OpenAI API key not configured, skipping transcription')
      return NextResponse.json({
        success: false,
        error: 'Transcription service not configured. Add OPENAI_API_KEY to enable.'
      }, { status: 503 })
    }

    // Ladda ner inspelningen från 46elks
    console.log('Downloading recording from:', recording.recording_url)

    const audioResponse = await fetch(recording.recording_url, {
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64')
      }
    })

    if (!audioResponse.ok) {
      throw new Error(`Failed to download recording: ${audioResponse.status}`)
    }

    const audioBuffer = await audioResponse.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: 'audio/wav' })

    // Skicka till OpenAI Whisper för transkribering
    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.wav')
    formData.append('model', 'whisper-1')
    formData.append('language', 'sv') // Svenska

    const whisperResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    })

    if (!whisperResponse.ok) {
      const errorText = await whisperResponse.text()
      throw new Error(`Whisper API error: ${whisperResponse.status} - ${errorText}`)
    }

    const whisperResult = await whisperResponse.json()
    const transcript = whisperResult.text

    console.log('Transcription complete:', transcript?.substring(0, 100))

    // Spara transkriptet i databasen
    const { error: updateError } = await supabase
      .from('call_recording')
      .update({
        transcript: transcript,
        transcribed_at: new Date().toISOString()
      })
      .eq('recording_id', recording_id)

    if (updateError) {
      console.error('Error saving transcript:', updateError)
    }

    // Trigga AI-analys
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'
    fetch(`${appUrl}/api/voice/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recording_id })
    }).catch(err => console.error('Failed to trigger analysis:', err))

    return NextResponse.json({
      success: true,
      transcript,
      recording_id
    })

  } catch (error: any) {
    console.error('Transcription error:', error)
    return NextResponse.json({
      error: error.message || 'Transcription failed'
    }, { status: 500 })
  }
}
