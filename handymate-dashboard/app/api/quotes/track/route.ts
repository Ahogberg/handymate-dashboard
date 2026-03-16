import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { createHash } from 'crypto'

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
)

const pixelHeaders = {
  'Content-Type': 'image/gif',
  'Cache-Control': 'no-cache, no-store, must-revalidate',
  'Pragma': 'no-cache',
}

function hashIP(ip: string): string {
  return createHash('sha256').update(ip + 'hm-salt').digest('hex').slice(0, 16)
}

/**
 * GET /api/quotes/track?q=[quoteId]&e=[event]&s=[sessionId]&dur=[seconds]
 * Publik endpoint — ingen auth krävs. Returnerar 1x1 pixel.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const quoteId = searchParams.get('q')
  const event = searchParams.get('e') || 'opened'
  const sessionId = searchParams.get('s') || 'unknown'
  const duration = parseInt(searchParams.get('dur') || '0') || 0

  if (!quoteId) {
    return new Response(PIXEL, { headers: pixelHeaders })
  }

  try {
    const supabase = getServerSupabase()

    // Hämta quote för business_id
    const { data: quote } = await supabase
      .from('quotes')
      .select('business_id, customer_id, title, view_count, first_viewed_at, status')
      .eq('quote_id', quoteId)
      .single()

    if (!quote) {
      return new Response(PIXEL, { headers: pixelHeaders })
    }

    // Logga tracking event
    await supabase.from('quote_tracking_events').insert({
      quote_id: quoteId,
      business_id: quote.business_id,
      event_type: event,
      session_id: sessionId,
      duration_seconds: duration > 0 ? duration : null,
      ip_hash: hashIP(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''),
      user_agent: (req.headers.get('user-agent') || '').slice(0, 200),
    })

    // Uppdatera sammanfattning på quote
    if (event === 'opened') {
      const newViewCount = (quote.view_count || 0) + 1
      await supabase.from('quotes').update({
        view_count: newViewCount,
        first_viewed_at: quote.first_viewed_at || new Date().toISOString(),
        last_viewed_at: new Date().toISOString(),
        status: quote.status === 'sent' ? 'opened' : quote.status,
      }).eq('quote_id', quoteId)

      // Trigga nudge vid 3+ visningar utan svar
      if (newViewCount >= 3 && ['sent', 'opened'].includes(quote.status)) {
        try {
          const { createQuoteNudge } = await import('@/lib/autopilot/quote-nudge')
          await createQuoteNudge(quote.business_id, quoteId, newViewCount)
        } catch { /* non-blocking */ }
      }
    }

    // Om closed event med duration — uppdatera total view time
    if (event === 'closed' && duration > 0) {
      const { data: current } = await supabase
        .from('quotes')
        .select('total_view_seconds')
        .eq('quote_id', quoteId)
        .single()

      await supabase.from('quotes').update({
        total_view_seconds: (current?.total_view_seconds || 0) + duration,
      }).eq('quote_id', quoteId)
    }
  } catch (err) {
    console.error('Quote tracking error:', err)
  }

  return new Response(PIXEL, { headers: pixelHeaders })
}

/**
 * POST /api/quotes/track — för beacon API (page unload)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { quoteId, event, sessionId, duration } = body

    if (!quoteId) return Response.json({ ok: true })

    const supabase = getServerSupabase()

    const { data: quote } = await supabase
      .from('quotes')
      .select('business_id, total_view_seconds')
      .eq('quote_id', quoteId)
      .single()

    if (!quote) return Response.json({ ok: true })

    await supabase.from('quote_tracking_events').insert({
      quote_id: quoteId,
      business_id: quote.business_id,
      event_type: event || 'closed',
      session_id: sessionId,
      duration_seconds: duration > 0 ? duration : null,
      ip_hash: hashIP(req.headers.get('x-forwarded-for') || ''),
      user_agent: (req.headers.get('user-agent') || '').slice(0, 200),
    })

    if (duration > 0) {
      await supabase.from('quotes').update({
        total_view_seconds: (quote.total_view_seconds || 0) + duration,
      }).eq('quote_id', quoteId)
    }
  } catch { /* non-blocking */ }

  return Response.json({ ok: true })
}
