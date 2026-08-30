import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'
import { checkFuelGate } from '@/lib/costs/fuel'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'

export const maxDuration = 300

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
    // ett främmande företag och starta dyr samtalsanalys genom att gissa ett
    // id. Samma mönster som voice/analyze redan hade lagat.
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
    if (!internalOk) {
      const user = await getCurrentUser(request, authed!.business_id)
      if (!user || !isOwnerOrAdmin(user) || authed!._impersonation) return NextResponse.json({ error: 'Saknar behörighet' }, { status: 403 })
    }

    const fuel = await checkFuelGate(supabase, recording.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    if (recording.raw_deleted_at) return NextResponse.json({ error: 'Samtalets underlag har gallrats.' }, { status: 410 })
    const continueAnalysis = async () => {
      if (!process.env.CRON_SECRET) throw new Error('Efterarbetet saknar intern autentisering.')
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
      const response = await fetch(`${appUrl}/api/voice/analyze`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': process.env.CRON_SECRET },
        body: JSON.stringify({ recording_id }),
      })
      return response.ok
    }
    if (recording.transcript) {
      if (!await continueAnalysis()) return NextResponse.json({ success: false, transcribed: true, recording_id,
        error: 'Transkriptet finns, men efterarbetet behöver kompletteras från samtalsvyn.' }, { status: 503 })
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
    // Credentials must never follow a supplied URL or redirect to a third party.
    const audioUrl = new URL(recording.recording_url || '')
    if (audioUrl.protocol !== 'https:' || audioUrl.hostname !== 'api.46elks.com' || audioUrl.username || audioUrl.password) {
      return NextResponse.json({ error: 'Inspelningsadressen kunde inte verifieras.' }, { status: 400 })
    }
    const audioResponse = await fetch(audioUrl.toString(), {
      redirect: 'error',
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

    if (typeof transcript !== 'string' || !transcript.trim()) throw new Error('Inget tal kunde transkriberas.')

    // Spara transkriptet i databasen
    const { data: savedTranscript, error: updateError } = await supabase
      .from('call_recording')
      .update({
        transcript: transcript,
        transcribed_at: new Date().toISOString()
      })
      .eq('recording_id', recording_id)
      .eq('business_id', recording.business_id)
      .is('raw_deleted_at', null)
      .select('recording_id').maybeSingle()

    if (updateError || !savedTranscript) {
      throw new Error('Transkriptet kunde inte sparas. Ingen analys startades.')
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

    // ═══ EN MOTTAGARE, REVIEW-FIRST (prelaunch Voice V1) ═══
    //
    // Ett inkommande kundtranskript är extern, opålitlig input. Det får inte
    // skickas in som ett "user"-meddelande till den generella agentmotorn,
    // eftersom den motorn har interna verktyg och därmed skulle kunna agera
    // på instruktioner som råkade sägas i samtalet. Efteranalysen nedan är den
    // enda mottagaren: den kvalificerar leadet och skapar granskningsbara kort.
    // Missat-samtal-SMS:et körs separat i 46elks whenhangup-rälsen.
    if (!await continueAnalysis()) return NextResponse.json({ success: false, transcribed: true, recording_id,
      error: 'Transkriptet är sparat, men efterarbetet behöver kompletteras från samtalsvyn.' }, { status: 503 })

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
