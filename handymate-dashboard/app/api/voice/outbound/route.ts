import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyElksSignature } from '@/lib/elks-signature'
import { recordingNoticeUrl } from '@/lib/voice/retention'
import { loadOutboundBusinessConfig, resolveCraftsmanPhone } from './_shared'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * voice_start-webhook för "Ring via Handymate" (utgående inspelat samtal).
 *
 * Kunden är A-benet (se start/route.ts för varför). 46elks anropar den här
 * URL:en när kunden svarat, och sedan igen per steg via `next`:
 *
 *   (utan step)   kunden svarade → spela inspelningsmeddelandet
 *   step=connect  meddelandet klart → koppla till hantverkarens mobil.
 *                 recordcall BARA vid result === 'ok' (fail-closed, samma
 *                 regel som consent-routen: ett meddelande som inte spelades
 *                 upp ger inget samtycke och därmed ingen inspelning).
 *   step=after    kopplingen avslutad → bokför utfallet, lägg på.
 *
 * Inga telefonnummer i URL:er: raden bär allt, hantverkarnumret löses på
 * nytt server-side i connect-steget.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
      const signed = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: rawBody })
      if (!verifyElksSignature(signed, rawBody)) {
        console.error('[voice/outbound] Ogiltig 46elks-signatur, avvisar webhook')
        return new NextResponse('Unauthorized', { status: 401 })
      }
    }

    const params = new URLSearchParams(rawBody)
    const from = params.get('from') || ''
    const to = params.get('to') || ''
    const callId = params.get('callid') || ''
    const result = params.get('result') || ''
    const step = request.nextUrl.searchParams.get('step') || ''
    const recordingId = request.nextUrl.searchParams.get('recording_id') || ''

    console.log('[voice/outbound] steg', { step, recordingId, from, to, callId, result })

    if (!recordingId) return NextResponse.json({ hangup: 'no_recording_ref' })

    const supabase = getServerSupabase()
    const { data: row, error } = await supabase
      .from('call_recording')
      .select('*')
      .eq('recording_id', recordingId)
      .eq('direction', 'outbound')
      .is('raw_deleted_at', null)
      .maybeSingle()
    if (error || !row) {
      console.error('[voice/outbound] ingen utgående rad för', recordingId, error?.message)
      return NextResponse.json({ hangup: 'unknown_call' })
    }

    const config = await loadOutboundBusinessConfig(supabase, row.business_id)
    if (!config?.assigned_phone_number) return NextResponse.json({ hangup: 'business_not_found' })

    // Webhooken måste beskriva exakt det samtal raden avser: från vårt nummer
    // till kundens. Allt annat är ett främmande samtal med vårt recording_id.
    if (from !== config.assigned_phone_number || to !== row.phone_number) {
      console.error('[voice/outbound] nummer matchar inte raden', { from, to, expectedFrom: config.assigned_phone_number, expectedTo: row.phone_number })
      return NextResponse.json({ hangup: 'call_mismatch' }, { status: 403 })
    }

    // Läk elks_recording_id om start-routen inte hann spara det.
    if (!row.elks_recording_id && callId) {
      await supabase
        .from('call_recording')
        .update({ elks_recording_id: callId })
        .eq('recording_id', recordingId)
        .eq('business_id', row.business_id)
    }

    const stepUrl = (s: string) => `${APP_URL}/api/voice/outbound?recording_id=${encodeURIComponent(recordingId)}&step=${s}`
    const buildConnect = () => connectAction(supabase, config, row.initiated_by_user_id || null, stepUrl('after'))

    // ── (a) kunden svarade → inspelningsmeddelandet FÖRE kopplingen ──
    if (!step) {
      const noticeUrl = recordingNoticeUrl()
      await supabase
        .from('call_recording')
        .update({ call_status: 'answered' })
        .eq('recording_id', recordingId)
        .eq('business_id', row.business_id)
      if (noticeUrl && config.call_recording_enabled) {
        return NextResponse.json({ play: noticeUrl, skippable: false, next: stepUrl('connect') })
      }
      // Grindarna släppte mellan knapptryck och svar: koppla UTAN inspelning
      // hellre än att lämna kunden i tystnad — ingen recordcall utan meddelande.
      const connect = await buildConnect()
      return NextResponse.json(connect ?? { hangup: 'no_forward_number' })
    }

    // ── (b) meddelandet klart → koppla till hantverkaren ──
    if (step === 'connect') {
      const connect = await buildConnect()
      if (!connect) return NextResponse.json({ hangup: 'no_forward_number' })
      // 'next' körs även efter misslyckad uppspelning. Bara uttrycklig framgång får spela in.
      if (result === 'ok') {
        return NextResponse.json({ ...connect, recordcall: `${APP_URL}/api/voice/recording` })
      }
      return NextResponse.json(connect)
    }

    // ── (c) efter kopplingen ──
    if (step === 'after') {
      const callStatus =
        result === 'ok' || result === 'success' ? 'connected'
        : result === 'busy' ? 'busy'
        : 'craftsman_no_answer'
      await supabase
        .from('call_recording')
        .update({ call_status: callStatus })
        .eq('recording_id', recordingId)
        .eq('business_id', row.business_id)
      return NextResponse.json({ hangup: 'done' })
    }

    return NextResponse.json({ hangup: 'unknown_step' })
  } catch (err) {
    console.error('[voice/outbound] fel:', err)
    return NextResponse.json({ hangup: 'error' })
  }
}

/**
 * Kopplingssteget: hantverkarnumret löses här, server-side, i samma stund
 * som det ska ringas — aldrig ur en URL. Ligger efter POST i filen med
 * flit: uppspelningen (play) kommer före kopplingen (connect) även i
 * källordningen, så facit i tests/utgaende-samtal.spec.ts läser som flödet.
 */
async function connectAction(
  supabase: ReturnType<typeof getServerSupabase>,
  config: NonNullable<Awaited<ReturnType<typeof loadOutboundBusinessConfig>>>,
  businessUserId: string | null,
  nextUrl: string,
) {
  const craftsmanPhone = await resolveCraftsmanPhone(supabase, config, businessUserId)
  if (!craftsmanPhone) return null
  return {
    connect: craftsmanPhone,
    callerid: config.assigned_phone_number,
    timeout: 25,
    next: nextUrl,
  }
}
