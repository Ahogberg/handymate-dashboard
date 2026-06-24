import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET/POST /api/voice/greeting
 * 46elks `play`-mål i röstbrevlåde-flödet (voice/incoming). Spelar upp ett
 * hälsningsmeddelande via svensk TTS. Routen saknades → 46elks fick 404 och
 * inget meddelande spelades. Företaget härleds från det uppringda numret (`to`).
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  const supabase = getServerSupabase()
  // 46elks skickar from/to/callid som formdata (POST) eller query (GET-test)
  let to = ''
  try {
    const fd = await request.formData()
    to = (fd.get('to') as string) || ''
  } catch { /* GET / ingen body */ }
  const url = new URL(request.url)
  to = to || url.searchParams.get('to') || ''

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

export async function POST(request: NextRequest) { return handle(request) }
export async function GET(request: NextRequest) { return handle(request) }
