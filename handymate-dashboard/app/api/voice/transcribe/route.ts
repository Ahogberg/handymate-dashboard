import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { triggerAgentFireAndForget, makeIdempotencyKey } from '@/lib/agent-trigger'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'
import { checkFuelGate } from '@/lib/costs/fuel'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

/**
 * Transkriberar en inspelning med OpenAI Whisper
 * POST body: { recording_id: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()

    // ═══ ROUTEN VAR HELT OAUTENTISERAD (2026-08-08) ═══
    //
    // Enda inputen var recording_id. Vem som helst kunde alltså bränna
    // Whisper-krediter och — allvarligare — STARTA EN LISA-AGENTKÖRNING i
    // ett främmande företag (se triggerAgentFireAndForget längre ner) genom
    // att gissa ett id. Samma mönster som voice/analyze redan hade lagat.
    //
    // Två tillåtna anropare: den interna kedjan recording→transcribe (delad
    // hemlighet, server-till-server) och en inloggad användare som tittar på
    // SIN EGEN inspelning. Tenantmatchningen görs efter uppslaget nedan.
    const authed = await getAuthenticatedBusiness(request)
    const internalOk =
      !!process.env.CRON_SECRET &&
      request.headers.get('x-internal-secret') === process.env.CRON_SECRET
    if (!authed && !internalOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

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

    // Inloggad väg: inspelningen måste tillhöra det egna företaget. Utan den
    // här raden räcker auth inte — vilken kund som helst kunde peka på en
    // annan kunds inspelning. Samma svar som "hittades inte", så id:n inte
    // går att räkna ut genom att jämföra felkoder.
    if (!internalOk && recording.business_id !== authed!.business_id) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
    }

    const fuel = await checkFuelGate(supabase, recording.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
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

    // ═══ WHISPER-KOSTNADEN BOKFÖRS (COGS-mätaren, 2026-08-08) ═══
    //
    // Detta är enda Whisper-anropet i kedjan med KÄND ljudlängd
    // (recording.duration_seconds) och enda som skalar med kundvolym — de tre
    // användarinitierade (matte/transcribe, jobbuddy/voice,
    // quotes/transcribe-voice) lämnas medvetet omätta: att estimera längd ur
    // filstorlek ger ett tal som ser exakt ut utan att vara det.
    //
    // Idempotens-checken högre upp (returnerar tidigt om transcript redan
    // finns) gör att en retry inte dubbelbokför.
    const ljudSekunder = Number(recording.duration_seconds) || 0
    if (ljudSekunder > 0) {
      await recordCost({
        supabase,
        businessId: recording.business_id,
        resource: 'whisper',
        units: ljudSekunder,
        costOre: whisperCostOre(ljudSekunder),
        refType: 'call_recording',
        refId: recording_id,
      })
    }

    // ═══ TVÅ MOTTAGARE, TVÅ ROLLER (etapp 2b) ═══
    //
    // Analysmotorn var tidigare en fallback i catch-grenen nedan — den kördes
    // i praktiken aldrig, och de fem förslagstyper den var ensam om (offert,
    // uppföljning, återuppringning, påminnelse, ombokning) hade tyst slutat
    // produceras. Nu är den ett AVSIKTLIGT andra steg:
    //
    //   Lisa (agentmotorn)  AGERAR — bokar, SMS:ar, registrerar kund.
    //   Analysmotorn        FÖRESLÅR — enbart de typer Lisa saknar verktyg
    //                       för; gränsen är kod i lib/voice/analysis-scope.ts.
    //
    // Båda är fire-and-forget: samtalet är redan avslutat, ingen väntar, och
    // typgränsen — inte ordningen — är det som hindrar dubbelåtgärder.
    try {
      triggerAgentFireAndForget(
        recording.business_id,
        'phone_call',
        {
          recording_id,
          transcript,
          phone_number: recording.phone_number || '',
          duration_seconds: recording.duration_seconds || 0,
          direction: recording.direction || 'inbound',
        },
        makeIdempotencyKey('call', recording_id)
      )
    } catch (agentErr) {
      // Lisa uteblir — men analysmotorn nedan kör ändå, så samtalet blir
      // åtminstone föreslaget om inte utfört.
      console.error('[Transcribe] Agent trigger failed:', agentErr)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    fetch(`${appUrl}/api/voice/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
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
