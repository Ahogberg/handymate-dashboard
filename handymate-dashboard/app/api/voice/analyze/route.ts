import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { analyseraSamtal, type AnalyseraSamtalResult } from '@/lib/voice/analyze-call'

/**
 * Analyserar ett transkriberat samtal med AI och skapar förslag.
 * POST body: { recording_id: string, force?: boolean }
 *
 * Tunn HTTP-adapter (etapp 1b, "en väg in") — själva analysen (prompten,
 * map-reduce för långa mötestranskript, kill switch, det atomiska
 * anspråket) bor i lib/voice/analyze-call.ts, som app/api/voice/transcribe
 * också anropar direkt (in-process, inget HTTP-självanrop). Den här routen
 * sköter bara: auth, tenantmatchning och att översätta resultatet till
 * samma svarsformer som anropare (recordings-sidan, demo-seed-meeting) redan
 * väntar sig.
 */
export async function POST(request: NextRequest) {
  try {
    // Behörighet: antingen inloggat företag (dashboard) eller internt anrop
    // (transcribe-kedjan server-till-server med CRON_SECRET). Routen skrev
    // tidigare kunddata helt oautentiserat på gissningsbart recording_id.
    const authed = await getAuthenticatedBusiness(request)
    const internalOk =
      !!process.env.CRON_SECRET &&
      request.headers.get('x-internal-secret') === process.env.CRON_SECRET
    if (!authed && !internalOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    let supabase
    try {
      supabase = getServerSupabase()
    } catch {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => null)
    const recording_id = body?.recording_id

    if (!recording_id) {
      return NextResponse.json({ error: 'Missing recording_id' }, { status: 400 })
    }

    // Auth fanns — men ingen jämförelse mellan inloggat företag och
    // inspelningens (2026-08-08). En inloggad kund kunde alltså skicka ett
    // annat företags recording_id och orsaka Claude-analys, ai_suggestion
    // och tryAutoApprove i DEN tenanten. Att vara inloggad någonstans är
    // inte samma sak som att ha rätt till just den här raden. Matchningen
    // görs HÄR, före analyseraSamtal ens anropas — dvs före varje skrivning.
    if (!internalOk) {
      const { data: recording } = await supabase
        .from('call_recording')
        .select('business_id')
        .eq('recording_id', recording_id)
        .maybeSingle()

      if (!recording || recording.business_id !== authed!.business_id) {
        return NextResponse.json({ error: 'Recording not found' }, { status: 404 })
      }
    }

    const result = await analyseraSamtal({
      supabase,
      recordingId: recording_id,
      force: body?.force === true,
    })

    return toHttpResponse(result)
  } catch (error: any) {
    console.error('Analysis error:', error)
    return NextResponse.json({
      error: error.message || 'Analysis failed'
    }, { status: 500 })
  }
}

/** Översätter analyseraSamtal-resultatet till samma HTTP-svarsformer som routen historiskt gett. */
function toHttpResponse(result: AnalyseraSamtalResult): NextResponse {
  switch (result.status) {
    case 'not_found':
      return NextResponse.json(
        { error: 'Recording not found', debug: result.debug },
        { status: 404 },
      )
    case 'no_transcript':
      return NextResponse.json({ error: 'No transcript available for analysis' }, { status: 400 })
    case 'globally_paused':
      return NextResponse.json({
        success: true,
        recording_id: result.recording_id,
        skipped: true,
        reason: 'agents_globally_paused',
        message: result.message,
      })
    case 'already_claimed':
      return NextResponse.json({
        success: true,
        recording_id: result.recording_id,
        already_claimed: true,
        message: result.message,
      })
    case 'already_analyzed':
      return NextResponse.json({
        success: true,
        recording_id: result.recording_id,
        already_analyzed: true,
        summary: result.summary,
        suggestions_created: 0,
        suggestions: result.suggestions,
      })
    case 'meeting_done':
      return NextResponse.json({
        success: true,
        recording_id: result.recording_id,
        summary: result.summary,
        cards_created: result.cards_created,
      })
    case 'phone_done':
      return NextResponse.json({
        success: true,
        recording_id: result.recording_id,
        summary: result.summary,
        sentiment: result.sentiment,
        urgency: result.urgency,
        extracted_info: result.extracted_info,
        suggestions_created: result.suggestions_created,
        suggestions: result.suggestions,
        auto_approved: result.auto_approved,
        auto_approve_results: result.auto_approve_results,
      })
    case 'error':
      return NextResponse.json({ error: result.error }, { status: 500 })
  }
}
