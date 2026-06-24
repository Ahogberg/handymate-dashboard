import { NextRequest, NextResponse } from 'next/server'

/**
 * GET/POST /api/voice/missed
 * 46elks `whenhangup`-mål för inkommande samtal. Routen saknades → 46elks fick
 * 404 vid varje lurpåläggning. call_missed-eventet (→ svar-SMS-regeln) fyras
 * redan i voice/incoming för röstbrevlåde-grenen, så här bara kvitterar vi
 * hangupen (46elks förväntar inget svar utöver 200) och loggar för felsökning.
 */
async function handle(request: NextRequest): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const from = url.searchParams.get('from') || ''
    const callId = url.searchParams.get('callid') || ''
    console.log('[voice/missed] hangup', { from, callId })
  } catch { /* ignore */ }
  return NextResponse.json({})
}

export async function POST(request: NextRequest) { return handle(request) }
export async function GET(request: NextRequest) { return handle(request) }
