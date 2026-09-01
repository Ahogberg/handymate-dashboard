import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { createHash } from 'crypto'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'

// Läser x-forwarded-for/user-agent — får aldrig cachas statiskt (CLAUDE.md).
export const dynamic = 'force-dynamic'

/** Visningstid per event klampas — klienten kunde tidigare skicka vad som helst. */
const QUOTE_TRACK_MAX_DURATION_SECONDS = 4 * 3600
function begransaDuration(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(QUOTE_TRACK_MAX_DURATION_SECONDS, Math.round(value))
}

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
  const signToken = searchParams.get('t')
  const event = searchParams.get('e') || 'opened'
  const sessionId = (searchParams.get('s') || 'unknown').slice(0, 80)
  const duration = begransaDuration(parseInt(searchParams.get('dur') || '0') || 0)

  // Tenant-svepet 2026-09-01: quote_id ensamt är ingen hemlighet (syns i
  // dashboardens URL:er och payloads, Math.random-genererat) — och rutten
  // flippade status sent→opened och skrev händelser i offertens tenant.
  // Nu krävs offertens sign_token (t) för varje skrivning. Pixeln
  // returneras alltid så gamla mejl inte visar trasig bild.
  if (!quoteId || !signToken) {
    return new Response(PIXEL, { headers: pixelHeaders })
  }

  try {
    const supabase = getServerSupabase()

    // Hämta quote för business_id. MEDVETET bara kolumner som bevisligen
    // finns: den gamla listan tog med v16-räknarna (view_count,
    // first_viewed_at) — saknas en enda kolumn i prod 400:ar PostgREST hela
    // frågan, quote blir null och pixeln returneras utan att NÅGOT loggas.
    // Felet läses nu också (2026-08-10).
    const { data: quote, error: quoteErr } = await supabase
      .from('quotes')
      .select('business_id, status')
      .eq('quote_id', quoteId)
      .eq('sign_token', signToken)
      .single()

    if (quoteErr) {
      console.error('[quotes/track] kunde inte läsa offerten — inget spårades:', quoteErr.message, { quoteId })
      return new Response(PIXEL, { headers: pixelHeaders })
    }
    if (!quote) {
      return new Response(PIXEL, { headers: pixelHeaders })
    }

    // Öppningar går genom den delade vägen (lib/quotes/track-open.ts) så att
    // pixeln, kundvyn och portalen registrerar EXAKT samma sak. Övriga
    // event-typer loggas som förut direkt här.
    if (event === 'opened') {
      const { registerQuoteOpen } = await import('@/lib/quotes/track-open')
      await registerQuoteOpen(supabase, quoteId, {
        sessionId,
        ipHash: hashIP(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''),
        userAgent: req.headers.get('user-agent'),
        source: 'pixel',
      })
    } else {
      const { error: eventErr } = await supabase.from('quote_tracking_events').insert({
        quote_id: quoteId,
        business_id: quote.business_id,
        event_type: event,
        session_id: sessionId,
        duration_seconds: duration > 0 ? duration : null,
        ip_hash: hashIP(req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || ''),
        user_agent: (req.headers.get('user-agent') || '').slice(0, 200),
      })
      if (eventErr) console.error('[quotes/track] händelseloggen misslyckades:', eventErr.message, { quoteId, event })
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
    const { quoteId, signToken, event, sessionId } = body
    const duration = begransaDuration(Number(body.duration) || 0)

    // Samma tokenkrav som GET (tenant-svepet 2026-09-01).
    if (!quoteId || typeof signToken !== 'string' || !signToken) return Response.json({ ok: true })

    const supabase = getServerSupabase()

    const { data: quote } = await supabase
      .from('quotes')
      .select('business_id, total_view_seconds')
      .eq('quote_id', quoteId)
      .eq('sign_token', signToken)
      .single()

    if (!quote) return Response.json({ ok: true })

    await supabase.from('quote_tracking_events').insert({
      quote_id: quoteId,
      business_id: quote.business_id,
      event_type: typeof event === 'string' ? event.slice(0, 40) : 'closed',
      session_id: typeof sessionId === 'string' ? sessionId.slice(0, 80) : 'unknown',
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
