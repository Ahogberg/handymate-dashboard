import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { halsningsljud } from '@/lib/voice/halsning'
import { verifieraElksWebhook, larmaAvvisadElksWebhook, medElksHemlighet } from '@/lib/elks-webhook-auth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/voice/greeting
 * 46elks `play`-mål i röstbrevlåde-flödet (voice/incoming). Spelar upp ett
 * hälsningsmeddelande via svensk TTS. Routen saknades → 46elks fick 404 och
 * inget meddelande spelades. Företaget härleds från det uppringda numret (`to`).
 *
 * Tenant-svepet 2026-09-01: rutten saknade kontroll (syskonen voice/incoming,
 * voice/missed, voice/recording, voice/consent hade den) och svarade även på
 * GET. Vem som helst kunde slå upp vilket företag som äger ett 46elks-nummer.
 *
 * 2026-09-10: kontrollen var en HMAC över headern X-46elks-Signature, som
 * 46elks aldrig skickar — den avvisade alltså allt. Nu samma
 * verifieraElksWebhook som resten (delad hemlighet i URL:en, se
 * lib/elks-webhook-auth.ts). GET är kvar eftersom 46elks hämtar ett
 * `play`-mål med GET, men kräver nu samma hemlighet som POST.
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

  return NextResponse.json({ play: halsningsljud(businessName) })
}

export async function POST(request: NextRequest) {
  const text = await request.text()
  const elksVerdikt = verifieraElksWebhook(request)
  if (!elksVerdikt.ok) {
    larmaAvvisadElksWebhook('voice/greeting', elksVerdikt)
    return new NextResponse('Unauthorized', { status: 401 })
  }
  const params = new URLSearchParams(text)
  return handle(params.get('to') || '')
}

export async function GET(request: NextRequest) {
  // 46elks hämtar ett `play`-mål med GET. Tidigare var GET öppen bara med
  // skip-flaggan, alltså i praktiken aldrig i produktion; nu duger samma
  // hemlighet som POST-vägen kräver.
  const elksVerdikt = verifieraElksWebhook(request)
  if (!elksVerdikt.ok) {
    larmaAvvisadElksWebhook('voice/greeting[GET]', elksVerdikt)
    return new NextResponse('Unauthorized', { status: 401 })
  }
  return handle(request.nextUrl.searchParams.get('to') || '')
}
