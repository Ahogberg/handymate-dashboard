import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getPublishedJobbpassByToken, assembleJobbpassView } from '@/lib/jobbpass/jobbpass'
import { loadAttribution } from '@/lib/branding/attribution'

export const dynamic = 'force-dynamic'

/**
 * GET /api/jobbpass/public/[token] — Etapp Ä (Jobbpass V1). Ingen auth,
 * samma publika-länk-mönster som app/api/quotes/public/[token].
 *
 * Svarar BARA för ett jobbpass med status 'published' —
 * getPublishedJobbpassByToken filtrerar bort draft-rader även om en token
 * mot förmodan skulle finnas på en (den kan inte, se v154:s CHECK-
 * constraint, men rutten litar aldrig på det ensamt). Allt annat är 404,
 * aldrig ett läckt "hittades inte men här är strukturen ändå".
 *
 * Sammansättningen (källdata + signerade foton + derivation) bor i
 * assembleJobbpassView — delad med kundportalen (Fastighetspasset steg 1).
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params.token
    if (!token) return NextResponse.json({ error: 'Token saknas' }, { status: 400 })

    const supabase = getServerSupabase()
    const jobbpass = await getPublishedJobbpassByToken(supabase, token)
    if (!jobbpass) {
      return NextResponse.json({ error: 'Jobbpasset hittades inte eller är inte publicerat' }, { status: 404 })
    }

    const view = await assembleJobbpassView(supabase, jobbpass)
    if (!view) {
      return NextResponse.json({ error: 'Jobbpasset hittades inte' }, { status: 404 })
    }

    // "Skickat via Handymate"-stämpeln i sidfoten — en laddning per visning,
    // fallback-säker (kastar aldrig, texten utan länk vid fel).
    const attribution = await loadAttribution(supabase, jobbpass.business_id)

    return NextResponse.json({ jobbpass: view, attribution })
  } catch (error) {
    console.error('[jobbpass/public] oväntat fel:', error)
    return NextResponse.json({ error: 'Jobbpasset kunde inte visas' }, { status: 500 })
  }
}
