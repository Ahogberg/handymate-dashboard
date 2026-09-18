import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifieraElksWebhook, larmaAvvisadElksWebhook } from '@/lib/elks-webhook-auth'
import { tolkaLeveransrapport, type Leveransutfall } from '@/lib/sms/leveransrapport'

/**
 * 46elks leveransrapport (`whendelivered`).
 *
 * Före den här rutten betydde `sms_log.status = 'sent'` bara att 46elks
 * svarade HTTP 200 på vårt anrop. Ett SMS till ett avstängt nummer såg
 * likadant ut som ett som landade i kundens telefon, och `lib/outbound/status.ts`
 * sa det rakt ut: "Leveransbesked saknas". Nu postar 46elks hit när operatören
 * har sagt sitt, och leveransen sparas som ETT EGET FAKTUM
 * (`delivery_status`/`delivered_at`) vid sidan av sändningsstatusen. Ett sent
 * kvitto får aldrig skriva om vad vi försökte göra.
 *
 * Tolkningen av kroppen bor i lib/sms/leveransrapport.ts (med sitt
 * dokumenterade antagande om 46elks fältnamn): en route-fil i Next.js 14 får
 * bara exportera sina HTTP-metoder och segmentinställningar, allt annat
 * fäller typkontrollen i `.next/types`.
 *
 * ALDRIG 500. 46elks retry:ar på femhundra, och ett okänt `elks_id` (t.ex.
 * ett SMS skickat från en annan miljö) är inget fel hos oss — det loggas och
 * kvitteras med 200, annars byggs en retry-kö som aldrig kan tömmas.
 */

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const rawBody = await request.text()

  const verdikt = verifieraElksWebhook(request)
  if (!verdikt.ok) {
    larmaAvvisadElksWebhook('sms/delivered', verdikt)
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    const rapport = tolkaLeveransrapport(rawBody, request.headers.get('content-type'))
    if (!rapport.elksId || !rapport.utfall) {
      console.warn('[sms/delivered] rapport utan id eller tolkbar status — ingen skrivning', {
        harId: !!rapport.elksId, status: rapport.utfall,
      })
      return new NextResponse('OK')
    }

    const supabase = getServerSupabase()
    const nu = rapport.tidpunkt || new Date().toISOString()

    const { data: rader, error: uppdateringsfel } = await supabase
      .from('sms_log')
      .update({ delivery_status: rapport.utfall, delivered_at: nu })
      .eq('elks_id', rapport.elksId)
      .select('sms_id, business_id')

    if (uppdateringsfel) {
      // Ett skrivfel hos oss får inte bli en retry-storm hos 46elks.
      console.error('[sms/delivered] sms_log kunde inte uppdateras:', uppdateringsfel.message)
      return new NextResponse('OK')
    }

    if (!rader || rader.length === 0) {
      console.warn('[sms/delivered] okänt elks_id, ingen sms_log-rad matchade', { elks_id: rapport.elksId })
      return new NextResponse('OK')
    }

    // Samma utskick kan ha ett H3b-löfte bakom sig. Leveransen skrivs dit
    // också — men aldrig status: sent|failed|unknown är sändningens utfall,
    // leverans är ett annat faktum.
    await speglaTillOutboundIntent(supabase, rapport.elksId, rapport.utfall, nu)

    return new NextResponse('OK')
  } catch (fel) {
    console.error('[sms/delivered] oväntat fel (svarar ändå OK för att undvika retry-storm):', fel)
    return new NextResponse('OK')
  }
}

async function speglaTillOutboundIntent(
  supabase: ReturnType<typeof getServerSupabase>,
  providerRef: string,
  utfall: Leveransutfall,
  nar: string,
): Promise<void> {
  if (process.env.OUTBOUND_INTENTS_ENABLED !== 'true') return
  try {
    const { data: intent } = await supabase
      .from('outbound_intents')
      .select('business_id')
      .eq('provider_ref', providerRef)
      .maybeSingle()
    if (!intent?.business_id) return
    const { error } = await supabase.rpc('mark_outbound_delivered', {
      p_business_id: intent.business_id,
      p_provider_ref: providerRef,
      p_status: utfall,
      p_at: nar,
    })
    if (error) console.error('[sms/delivered] mark_outbound_delivered misslyckades:', error.message)
  } catch (fel) {
    console.error('[sms/delivered] outbound_intents-spegling kastade:', fel)
  }
}
