import { NextRequest, NextResponse } from 'next/server'
import { verifyElksSignature } from '@/lib/elks-signature'

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
      try { rawBody = await request.text() } catch { /* ingen body */ }

      // Verifiera 46elks-signatur (whenhangup-callbacken signeras med samma
      // HMAC som övriga webhooks). Utan detta kan call_missed → catch-SMS
      // triggas av en förfalskad POST. Kan inaktiveras via ELKS_SKIP_SIGNATURE.
      if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
        const req = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: rawBody })
        if (!verifyElksSignature(req, rawBody)) {
          console.error('[voice/missed] Ogiltig 46elks-signatur, avvisar webhook')
          return new NextResponse('Unauthorized', { status: 401 })
        }
      }
    }

    if (rawBody) {
      try {
        const body = new URLSearchParams(rawBody)
        state = String(body.get('state') || state)
        duration = Number(body.get('duration') || duration)
      } catch { /* ingen form-body */ }
    }

    const answered = state === 'success' || duration > 0
    console.log('[voice/missed] hangup', { businessId, from, callId, handled, state, duration, answered })

    if (handled !== '1' && !answered && businessId && from) {
      const { getServerSupabase } = await import('@/lib/supabase')
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(getServerSupabase(), 'call_missed', businessId, {
        phone: from,
        call_id: callId,
      })
      console.log('[voice/missed] missat samtal → call_missed fyrat (catch-SMS)')
    }
  } catch (err) {
    console.error('[voice/missed] error (non-blocking):', err)
  }
  return NextResponse.json({})
}

export async function POST(request: NextRequest) { return handle(request) }
export async function GET(request: NextRequest) { return handle(request) }
