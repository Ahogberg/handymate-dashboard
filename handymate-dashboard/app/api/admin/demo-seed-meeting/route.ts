import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * Inbyggt exempeltranskript för testmötet — formatet ([mm:ss]-block, se
 * lib/meetings/assemble-transcript.ts) matchar exakt vad ett riktigt
 * platsbesök skulle producera. Innehåller uttryckliga uttalanden av alla
 * fyra customer_fact-typer (preference/constraint/commitment/contact) plus
 * en tydlig offertdiskussion, så både customer_fact- och
 * create_quote_draft-grenarna i /api/voice/analyze kan testas samtidigt.
 */
const DEFAULT_TRANSCRIPT = `[00:00]
Hantverkare: Hej Anna, tack för att du tar emot oss idag. Vi tänkte gå igenom badrummet tillsammans så jag förstår exakt vad du vill ha.
Kund: Hej! Ja, varsågod, kom in. Jag har funderat mycket på golvet faktiskt.

[02:15]
Hantverkare: Berätta, vad har du tänkt dig?
Kund: Jag vill ha ekparkett, inte laminat. Jag har sett för mycket billigt laminat som buktar sig efter några år, så det får kosta lite extra.
Hantverkare: Absolut, det förstår jag. Ek håller mycket längre.

[05:40]
Kund: En sak till — vi har en hund, en labrador, så golvet får verkligen inte vara halkigt när det blir blött. Det är superviktigt för oss.
Hantverkare: Noterat. Då väljer vi en yta med bra friktion, det finns bra alternativ även i ek.

[09:10]
Hantverkare: Om vi räknar på hela badrummet — rivning, ny våtrumsmatta, kakel och det nya golvet — så landar det på ungefär 145 000 kronor inklusive material.
Kund: Okej, det är i linje med vad jag hade tänkt mig. Kan ni skicka en skriftlig offert på det?
Hantverkare: Absolut, jag sätter ihop den så fort jag är tillbaka på kontoret.

[13:20]
Kund: Har ni möjlighet att vara klara innan midsommar? Vi har släkten på besök då och vill verkligen kunna visa upp det nya badrummet.
Hantverkare: Jag lovar att vi är klara innan midsommar, vi bokar in start redan nästa vecka så vi har god marginal.

[16:45]
Hantverkare: En sista sak — vilket är bästa numret att nå dig på under projektet, om något dyker upp på plats?
Kund: Ring mig gärna på 070-555 12 34, det är mitt mobilnummer och jag har det alltid med mig. Ring helst efter lunch förresten, förmiddagarna är jag på jobbet.
Hantverkare: Perfekt, då har jag allt jag behöver. Vi hörs igen när offerten är klar.`

/**
 * POST /api/admin/demo-seed-meeting
 *
 * Dev-verktyg: skapar en påhittad mötesinspelning (call_recording,
 * source='site_visit') på en seedad demo-kund/bokning och kör den genom
 * samma analys som ett riktigt fältbesök (/api/voice/analyze, arMote-
 * grenen). Enda syftet är att testa customer_fact-flödet utan att vänta på
 * ett skarpt platsbesök.
 *
 * Samma hårda grind som /api/admin/demo-reset — detta verktyg får ALDRIG
 * kunna köras mot ett riktigt kundkonto. Fabricerad "kunden sa X"-data med
 * påhittade citat får aldrig hamna på en riktig kund:
 *
 *   1. getAuthenticatedBusiness — kräver inloggad session.
 *   2. business.business_id === process.env.DEMO_BUSINESS_ID — annars 403.
 *   3. business_users-rollen är owner/admin — annars 403.
 *
 * Utan DEMO_BUSINESS_ID satt i miljön svarar routen ALLTID 403.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const demoBusinessId = process.env.DEMO_BUSINESS_ID
    if (!demoBusinessId || business.business_id !== demoBusinessId) {
      return NextResponse.json(
        { error: 'Det här är inte demokontot. Testmötet kan bara skapas på demokontot.' },
        { status: 403 }
      )
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser) || !currentUser.user_id) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    let supabase
    try {
      supabase = getServerSupabase()
    } catch {
      return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    let customerId: string | undefined = body?.customerId
    let bookingId: string | undefined = body?.bookingId
    const transcript: string =
      typeof body?.transcript === 'string' && body.transcript.trim().length > 0
        ? body.transcript
        : DEFAULT_TRANSCRIPT

    if (!customerId) {
      const { data: customer } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      customerId = customer?.customer_id
    }
    if (!customerId) {
      return NextResponse.json(
        { error: 'Ingen kund hittades på demokontot. Kör "Återställ demon" på /dashboard/demo först.' },
        { status: 400 }
      )
    }

    if (!bookingId) {
      const { data: booking } = await supabase
        .from('booking')
        .select('booking_id')
        .eq('business_id', business.business_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      bookingId = booking?.booking_id
    }
    if (!bookingId) {
      return NextResponse.json(
        { error: 'Ingen bokning hittades på demokontot. Kör "Återställ demon" på /dashboard/demo först.' },
        { status: 400 }
      )
    }

    const { data: recording, error: insertError } = await supabase
      .from('call_recording')
      .insert({
        business_id: business.business_id,
        customer_id: customerId,
        booking_id: bookingId,
        source: 'site_visit',
        transcript,
        transcript_summary: null,
        transcribed_at: new Date().toISOString(),
        duration_seconds: 1080,
        direction: null,
        phone_number: null,
        recording_url: null,
      })
      .select('recording_id')
      .single()

    if (insertError || !recording) {
      return NextResponse.json(
        { error: `Kunde inte skapa testmötet: ${insertError?.message || 'okänt fel'}` },
        { status: 500 }
      )
    }

    // Till skillnad från produktionsvägen (fire-and-forget) AWAITAR vi
    // analysen här, så svaret kan gå direkt tillbaka till klienten.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    let analysis: any = null
    let analysisError: string | null = null
    try {
      const analyzeRes = await fetch(`${appUrl}/api/voice/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.CRON_SECRET || '',
        },
        body: JSON.stringify({ recording_id: recording.recording_id }),
      })
      analysis = await analyzeRes.json().catch(() => null)
      if (!analyzeRes.ok) {
        analysisError = analysis?.error || `Analysen svarade med status ${analyzeRes.status}`
      }
    } catch (err: any) {
      analysisError = err?.message || 'Analysanropet misslyckades'
    }

    // Mötet finns kvar i call_recording oavsett — vi rullar aldrig tillbaka
    // insättningen bara för att den efterföljande analysen misslyckas.
    if (analysisError) {
      return NextResponse.json(
        {
          success: false,
          error: `Testmötet skapades men analysen misslyckades: ${analysisError}`,
          recording_id: recording.recording_id,
          customer_id: customerId,
          booking_id: bookingId,
        },
        { status: 502 }
      )
    }

    return NextResponse.json({
      success: true,
      recording_id: recording.recording_id,
      customer_id: customerId,
      booking_id: bookingId,
      analysis,
    })
  } catch (error: any) {
    console.error('[demo-seed-meeting] Error:', error)
    return NextResponse.json({ error: error.message || 'Kunde inte skapa testmötet' }, { status: 500 })
  }
}
