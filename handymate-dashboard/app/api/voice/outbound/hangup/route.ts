import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyElksSignature } from '@/lib/elks-signature'
import { recordCost } from '@/lib/costs/record'
import { billableMinutes, callCostOre, classifySwedishNumber } from '@/lib/costs/meter'
import { loadOutboundBusinessConfig, resolveCraftsmanPhone } from '../_shared'

export const dynamic = 'force-dynamic'

/**
 * whenhangup-webhook för "Ring via Handymate" (utgående inspelat samtal).
 *
 * Två uppgifter:
 *  1. Sluta statusen. Står raden kvar i 'initiated'/'answered' när samtalet
 *     lades på svarade kunden aldrig (eller var upptagen) — voice_start-
 *     stegen hann aldrig sätta något senare.
 *  2. Bokföra samtalskostnaden. Det här är den ENDA vägen som skapar
 *     utgående minuter medvetet, och till skillnad från voice/missed (där
 *     payloaden fortfarande bara loggas) vet vi här att båda benen är våra:
 *     A-benet till kunden och B-benet till hantverkarens mobil. Payloaden
 *     loggas rå ändå — samma avstämningskrav mot 46elks-fakturan gäller.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
      const signed = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: rawBody })
      if (!verifyElksSignature(signed, rawBody)) {
        console.error('[voice/outbound/hangup] Ogiltig 46elks-signatur, avvisar webhook')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    console.log('[voice/outbound/hangup] RÅ PAYLOAD för kostnadsmätning:', rawBody)

    const params = new URLSearchParams(rawBody)
    const state = params.get('state') || ''
    const duration = Math.max(0, Number(params.get('duration') || 0) || 0)
    const recordingId = request.nextUrl.searchParams.get('recording_id') || ''
    if (!recordingId) return NextResponse.json({})

    const supabase = getServerSupabase()
    const { data: row, error } = await supabase
      .from('call_recording')
      .select('*')
      .eq('recording_id', recordingId)
      .eq('direction', 'outbound')
      .is('raw_deleted_at', null)
      .maybeSingle()
    if (error || !row) {
      console.error('[voice/outbound/hangup] ingen utgående rad för', recordingId, error?.message)
      return NextResponse.json({})
    }

    // ── 1. Statusen ──
    if (row.call_status === 'initiated' || row.call_status === 'answered' || !row.call_status) {
      const callStatus = state === 'busy' ? 'busy' : 'no_answer'
      await supabase
        .from('call_recording')
        .update({ call_status: callStatus })
        .eq('recording_id', recordingId)
        .eq('business_id', row.business_id)
    }

    // ── 2. Kostnaden — bara om samtalet faktiskt pågick ──
    if (duration > 0) {
      const config = await loadOutboundBusinessConfig(supabase, row.business_id)
      const craftsmanPhone = config
        ? await resolveCraftsmanPhone(supabase, config, row.initiated_by_user_id || null)
        : null
      // Två utgående ben. B-benet är i verkligheten kortare än A-benet
      // (kunden hör meddelandet först), så hela durationen på båda är en
      // övre gräns — rätt riktning för en marginalberäkning.
      const legA = callCostOre(duration, classifySwedishNumber(row.phone_number || ''))
      const legB = callCostOre(duration, classifySwedishNumber(craftsmanPhone || ''))
      await recordCost({
        supabase,
        businessId: row.business_id,
        resource: 'call_out',
        units: billableMinutes(duration),
        costOre: legA + legB,
        refType: 'call_recording',
        refId: recordingId,
        meta: {
          legs: 2,
          direction: 'outbound',
          duration_seconds: duration,
          state,
          elks_cost_raw: params.get('cost'),
        },
      })
    }

    return NextResponse.json({})
  } catch (err) {
    console.error('[voice/outbound/hangup] fel (non-blocking):', err)
    return NextResponse.json({})
  }
}
