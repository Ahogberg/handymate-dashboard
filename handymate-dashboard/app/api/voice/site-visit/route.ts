import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { verifyOwnership } from '@/lib/auth/verify-ownership'
import { recordCost } from '@/lib/costs/record'
import { whisperCostOre } from '@/lib/costs/meter'

/**
 * Mötesassistenten (etapp 3, 2026-08-09): hantverkaren spelar in ett
 * platsbesök i appen; det behandlas som ett inkommande samtal.
 *
 * ═══ BESLUTAD OMFATTNING ═══
 *
 *   - Max 10 minuter. Hooken (useAudioRecording) stoppar hårt; routen
 *     kontrollerar ändå — klienten är inte betrodd.
 *   - BARA TRANSKRIPTET SPARAS. Ljudet transkriberas och kastas — det
 *     lagras aldrig, varken i bucket eller databas. Man kan läsa vad som
 *     sades men aldrig lyssna. Medvetet val.
 *   - Ingen bucket, ingen chunkning, ingen jobbkö: allt ryms i den
 *     synkrona kedjan (10 min mp4 ≈ 5–10 MB, långt under Whispers 25 MB).
 *
 * ═══ VAD SOM HÄNDER SEN ═══
 *
 * Raden sparas i call_recording med source='site_visit' (sql/v102) och
 * analysmotorn körs — med mötesanpassad vinkel: ett platsbesök föreslår
 * offert/ÄTA och uppföljning, inte återuppringning. Lisa (agentmotorn)
 * triggas INTE för möten: hon agerar på inkommande kundkontakt, och ett
 * platsbesök är hantverkarens eget samtal — att auto-SMS:a kunden utifrån
 * det vore att agera i ett rum där hantverkaren själv står.
 */

// Whisper på 10 minuters ljud tar regelmässigt längre än Vercels
// default-timeout — utan explicit maxDuration dog långa inspelningar i
// plattformstaket trots att allt annat var rätt (P0-fynd i
// docs/audits/MEETING_INTELLIGENCE_ARCHITECTURE.md, 2026-08-11).
export const maxDuration = 300

const MAX_SECONDS = 10 * 60
const MAX_BYTES = 25 * 1024 * 1024 // Whispers gräns; 10 min ryms med marginal

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'Transkribering är inte konfigurerad.' },
        { status: 503 }
      )
    }

    const formData = await request.formData()
    const file = formData.get('audio') as File | null
    const durationSeconds = Number(formData.get('duration_seconds')) || 0
    const customerId = (formData.get('customer_id') as string) || null
    const bookingId = (formData.get('booking_id') as string) || null

    if (!file || file.size === 0) {
      return NextResponse.json({ error: 'Ingen ljudfil mottagen' }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Inspelningen är för stor' }, { status: 413 })
    }
    if (durationSeconds > MAX_SECONDS + 5) {
      // +5: klockslack mellan klientens timer och blobbens verkliga längd.
      return NextResponse.json({ error: 'Inspelningen överskrider tio minuter' }, { status: 413 })
    }

    // Cross-tenant-skydd: customer_id/booking_id kommer från klienten och
    // inserten sker med service role — verifiera ägarskap före användning.
    const ownership = await verifyOwnership(getServerSupabase(), business.business_id, [
      { table: 'customer', idColumn: 'customer_id', idValue: customerId, label: 'kund' },
      { table: 'booking', idColumn: 'booking_id', idValue: bookingId, label: 'bokning' },
    ])
    if (!ownership.ok) {
      return NextResponse.json({ error: `Ogiltig koppling: ${ownership.missing.join(', ')}` }, { status: 403 })
    }

    // ── Transkribera. Ljudet finns bara i minnet under det här anropet. ──
    const whisperForm = new FormData()
    whisperForm.append('file', file, file.name || 'platsbesok.mp4')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'sv')
    whisperForm.append('response_format', 'json')

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: whisperForm,
    })

    if (!whisperRes.ok) {
      const err = await whisperRes.text()
      console.error('[site-visit] Whisper error:', whisperRes.status, err)
      return NextResponse.json({ error: 'Transkriberingen misslyckades' }, { status: 502 })
    }

    const { text: transcript } = await whisperRes.json()
    if (!transcript || !transcript.trim()) {
      return NextResponse.json({ error: 'Inget tal uppfattades i inspelningen' }, { status: 422 })
    }

    // ── Spara transkriptet — ALDRIG ljudet. recording_url lämnas null. ──
    const supabase = getServerSupabase()
    const { data: recording, error: insertError } = await supabase
      .from('call_recording')
      .insert({
        business_id: business.business_id,
        customer_id: customerId,
        booking_id: bookingId, // v118 — vilken bokning platsbesöket gällde
        source: 'site_visit',
        transcript,
        transcript_summary: null,
        transcribed_at: new Date().toISOString(),
        duration_seconds: durationSeconds,
        direction: null,
        phone_number: null,
        recording_url: null,
      })
      .select('recording_id')
      .single()

    if (insertError || !recording) {
      console.error('[site-visit] insert error:', insertError?.message)
      return NextResponse.json({ error: 'Transkriptet kunde inte sparas' }, { status: 500 })
    }

    // Whisper-kostnaden bokförs — samma mätare som telefonivägen.
    if (durationSeconds > 0) {
      await recordCost({
        supabase,
        businessId: business.business_id,
        resource: 'whisper',
        units: durationSeconds,
        costOre: whisperCostOre(durationSeconds),
        refType: 'call_recording',
        refId: recording.recording_id,
      })
    }

    // ── Analysen — förslag, inte åtgärder. Fire-and-forget som telefonvägen. ──
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    fetch(`${appUrl}/api/voice/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.CRON_SECRET || '',
      },
      body: JSON.stringify({ recording_id: recording.recording_id }),
    }).catch(err => console.error('[site-visit] analyze trigger failed:', err))

    return NextResponse.json({
      success: true,
      recording_id: recording.recording_id,
      transcript,
    })
  } catch (error: any) {
    console.error('[site-visit] error:', error)
    return NextResponse.json({ error: error.message || 'Något gick fel' }, { status: 500 })
  }
}
