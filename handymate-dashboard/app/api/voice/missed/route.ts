import { NextRequest, NextResponse } from 'next/server'
import { verifieraElksWebhook, larmaAvvisadElksWebhook, medElksHemlighet } from '@/lib/elks-webhook-auth'

/**
 * GET/POST /api/voice/missed
 * 46elks `whenhangup`-mål för inkommande samtal.
 *
 * Tier 0 "missa aldrig ett jobb": ett MISSAT samtal ska alltid utlösa ett
 * catch-SMS till uppringaren (call_missed → seedad svar-SMS-regel → AI-tråd via
 * sms/incoming som kan boka). Tidigare fyrades call_missed BARA i röstbrevlåde-
 * grenen (voice/incoming) — en obesvarad TRANSFER (default agent_with_transfer)
 * gav inget SMS. Den luckan stängs här.
 *
 * Logik: fyra call_missed om samtalet (a) inte redan hanterats (röstbrevlåde-
 * grenen sätter handled=1 — den fyrade redan), OCH (b) inte besvarades. 46elks
 * skickar samtalsresultat i hangup-anropet (state='success' = besvarat;
 * failed/busy/noanswer = missat). Saknas state → fyra ändå (hellre fånga leadet
 * än missa det; röstbrevlådegrenen är redan exkluderad så ingen dubblett).
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const businessId = url.searchParams.get('business_id') || ''
    const from = url.searchParams.get('from') || ''
    const callId = url.searchParams.get('callid') || ''
    const handled = url.searchParams.get('handled') || ''

    // 46elks skickar state/duration i POST-bodyn (form-encoded). Läs båda; falla
    // tillbaka till query om de skulle ligga där.
    let state = url.searchParams.get('state') || ''
    let duration = Number(url.searchParams.get('duration') || 0)

    // Läs rå body EN gång — behövs både för signaturvalidering och parsning.
    let rawBody = ''
    if (request.method === 'POST') {
      try { rawBody = await request.text() } catch (err) { console.warn('[voice/missed] kunde inte läsa body:', err) }

      // Verifiera 46elks-signatur (whenhangup-callbacken signeras med samma
      // HMAC som övriga webhooks). Utan detta kan call_missed → catch-SMS
      // triggas av en förfalskad POST. Kan inaktiveras via ELKS_SKIP_SIGNATURE.
      const elksVerdikt = verifieraElksWebhook(request)
      if (!elksVerdikt.ok) {
        larmaAvvisadElksWebhook('voice/missed', elksVerdikt)
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    if (rawBody) {
      try {
        const body = new URLSearchParams(rawBody)
        state = String(body.get('state') || state)
        duration = Number(body.get('duration') || duration)
      } catch (err) {
        console.warn('[voice/missed] kunde inte parsa form-body:', err)
      }
    }

    const answered = state === 'success' || duration > 0
    console.log('[voice/missed] hangup', { businessId, from, callId, handled, state, duration, answered })

    // ═══ SAMTALSKOSTNADEN: PAYLOAD FÖRST, PRISLOGIK SEDAN (2026-08-08) ═══
    //
    // Vidarekopplingen till hantverkarens mobil är ett UTGÅENDE ben som
    // debiteras 0,57 kr/minut — största rörliga kostnaden per kund, och den
    // har aldrig haft en rad någonstans i schemat.
    //
    // Men vi vet inte säkert vad 46elks skickar här: bär `duration`
    // sekunder eller minuter, gäller den hela samtalet eller bara det
    // vidarekopplade benet, och debiteras påbörjad minut? Ett fel antagande
    // är fel med en faktor 60. Därför loggas hela payloaden RÅ först — när
    // den är avstämd mot en faktisk 46elks-faktura kopplas recordCost in
    // här med callCostOre().
    //
    // Loggen är avsiktligt en enda rad med hela bodyn, så den går att söka
    // fram i Vercel-loggen utan att gissa fältnamn.
    if (request.method === 'POST' && rawBody) {
      console.log('[voice/missed] RÅ PAYLOAD för kostnadsmätning (v100):', rawBody)
    }

    // ═══ BARA POST FÅR UTLÖSA NÅGOT (2026-08-08) ═══
    //
    // Signaturkontrollen ovan ligger inuti `if (request.method === 'POST')`,
    // men GET exporterades också — och business_id + from läses ur query-
    // strängen. En förfalskad GET kunde alltså fyra call_missed för VALFRITT
    // företag med VALFRITT telefonnummer, vilket skickar catch-SMS:et till
    // angriparens nummer på kundens räkning. Ett osignerat GET-anrop är
    // ingen webhook, det är en främling.
    //
    // GET svarar fortfarande 200 (46elks ska inte retry-storma) men muterar
    // ingenting. Loggraden finns för att vi ska SE om 46elks någonsin
    // faktiskt använder GET — då är rätt åtgärd att signera den, inte att
    // öppna den igen.
    if (request.method !== 'POST') {
      if (handled !== '1' && !answered && businessId && from) {
        console.warn('[voice/missed] GET som skulle ha fyrat call_missed avvisades — osignerad väg')
      }
      return NextResponse.json({})
    }

    if (handled !== '1' && !answered && businessId && from) {
      const { getServerSupabase } = await import('@/lib/supabase')
      const { fireEvent } = await import('@/lib/automation-engine')
      const supabase = getServerSupabase()
      // Tidsstämpel FÖRE regeln körs: pushen nedan får bara säga "SMS
      // skickat" om en sms_log-rad är yngre än den här.
      const sedanIso = new Date(Date.now() - 5_000).toISOString()
      await fireEvent(supabase, 'call_missed', businessId, {
        phone: from,
        call_id: callId,
      })
      console.log('[voice/missed] missat samtal → call_missed fyrat (catch-SMS)')

      // In-app-notis + push till ägaren — samma helper som röstbrevlådegrenen
      // i voice/incoming. Fail-soft, kastar aldrig.
      const { meddelaFangatSamtal } = await import('@/lib/voice/fangat-samtal')
      const utfall = await meddelaFangatSamtal({ supabase, businessId, phone: from, callId, sedanIso })

      // ═══ NOTISEN FÅR INTE PÅSTÅ MER ÄN VAD SOM HÄNDE (2026-09-10) ═══
      //
      // Touchpoint 3 (onboarding-följeskrift): första-händelse-SMS till ägaren.
      //
      // Provsamtalet den morgonen: fångst-SMS:et till kunden blockerades av en
      // spärr, men notisen till hantverkaren gick ut och sa "och skickade ett
      // svar-SMS". Kunden hade inte fått något. Utfallet fanns redan här —
      // meddelaFangatSamtal har just kontrollerat sms_log — men returvärdet
      // kastades bort och texten gissade. Nu bär den utfallet.
      //
      // Kundnamnet kommer från samma anrop (findCustomerByPhone med
      // nummervarianter) i stället för ett andra, snävare uppslag på exakt
      // phone_number som missade kunder vars nummer lagrats i annan form.
      try {
        const { sendFirstEventSms } = await import('@/lib/onboarding/first-event-sms')
        await sendFirstEventSms(businessId, 'missed_call', utfall.customer_name || '', {
          svarSkickat: utfall.sms_sent,
        })
      } catch (err) {
        console.error('[voice/missed] first-event-sms error (non-blocking):', err)
      }
    }
  } catch (err) {
    console.error('[voice/missed] error (non-blocking):', err)
  }
  return NextResponse.json({})
}

export async function POST(request: NextRequest) { return handle(request) }
export async function GET(request: NextRequest) { return handle(request) }
