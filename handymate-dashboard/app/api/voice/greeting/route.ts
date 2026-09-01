import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { verifyElksSignature } from '@/lib/elks-signature'

export const dynamic = 'force-dynamic'

/**
 * POST /api/voice/greeting
 * 46elks `play`-mål i röstbrevlåde-flödet (voice/incoming). Spelar upp ett
 * hälsningsmeddelande via svensk TTS. Routen saknades → 46elks fick 404 och
 * inget meddelande spelades. Företaget härleds från det uppringda numret (`to`).
 *
 * Tenant-svepet 2026-09-01: rutten saknade signaturkontroll (syskonen
 * voice/incoming, voice/missed, voice/recording, voice/consent har den) och
 * svarade även på GET. Vem som helst kunde slå upp vilket företag som äger
 * ett 46elks-nummer. Nu: samma verifyElksSignature som resten, POST only;
 * GET bara med ELKS_SKIP_SIGNATURE=true (lokal test).
 */
async function handle(to: string): Promise<NextResponse> {
  const supabase = getServerSupabase()

  let businessName = ''
  if (to) {
    // Bara verifierade kolumner (business_name) — undvik phantom-kolumn-fällan.
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('assigned_phone_number', to)
      .maybeSingle()
    businessName = (biz as any)?.business_name || ''
  }

  const message =
    `Hej och välkommen till ${businessName || 'oss'}. Vi kan tyvärr inte svara just nu. ` +
    `Lämna ett meddelande så hör vi av oss så snart vi kan.`

  return NextResponse.json({ play: `tts:sv-SE:${message}` })
}

export async function POST(request: NextRequest) {
  const text = await request.text()
  if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
    const req = new NextRequest(request.url, { method: 'POST', headers: request.headers, body: text })
    if (!verifyElksSignature(req, text)) {
      console.error('[voice/greeting] Ogiltig 46elks-signatur, avvisar')
      return new NextResponse('Unauthorized', { status: 401 })
    }
  }
  const params = new URLSearchParams(text)
  return handle(params.get('to') || '')
}

export async function GET(request: NextRequest) {
  if (process.env.ELKS_SKIP_SIGNATURE !== 'true') {
    return new NextResponse('Unauthorized', { status: 401 })
  }
  return handle(request.nextUrl.searchParams.get('to') || '')
}
