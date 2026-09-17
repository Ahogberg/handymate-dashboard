import { NextRequest, NextResponse } from 'next/server'
import { hasAcceptedCurrentAgreement } from '@/lib/partners/agreement'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { byggCaseLank } from '@/lib/sales/sales-case'
import { caseLage } from '@/lib/sales/case-lage'
import { getServerSupabase } from '@/lib/supabase'

// force-dynamic: läser partnersessionen via getPartnerTokenFromRequest, som
// läser request.cookies direkt (CLAUDE.md, kända fallgropar).
export const dynamic = 'force-dynamic'

/**
 * GET /api/partners/sales-cases
 *
 * Partnerns EGNA säljgenomgångar och vad som hände med dem.
 *
 * Hålet den täpper till: partnern kör mötet, trycker Skicka, får en länk —
 * och hör sedan aldrig något igen. Databasen vet: `opened_at` stämplas när
 * prospektet öppnar länken (app/api/sales-case/[token]), `consumed_at` när
 * onboardingen förbrukar caset (app/api/onboarding). Ingen yta läste det
 * förrän nu.
 *
 * GRIND: samma som GET /api/partners/leads — giltig partnersession OCH
 * accepterat gällande avtal. Portalen ligger redan bakom samma grind, och
 * två närliggande partnerrutter som grindar olika är en grind man till slut
 * läser fel.
 *
 * VAD SOM INTE LÄMNAR RUTTEN: `payload`. Genomgångens innehåll är prospektets
 * egna siffror och behövs inte för att visa en lista — partnern som vill se
 * genomgången öppnar länken.
 *
 * LÄNKEN följer bara med när den fortfarande leder någonstans (caseLage
 * .kanDelas). Partnern skapade caset och fick länken en gång; att kunna
 * skicka om den när kunden tappat mejlet är ett riktigt behov. Men en länk
 * till ett förbrukat eller utgånget case är ett löfte som bryts i kundens
 * webbläsare, så den skickas inte med.
 */

/** Så många genomgångar visas. En partner med fler får de senaste. */
const TAK = 50

export async function GET(request: NextRequest) {
  try {
    const token = getPartnerTokenFromRequest(request)
    const partner = token ? await getPartnerFromToken(token) : null
    if (!partner || !hasAcceptedCurrentAgreement(partner)) {
      return NextResponse.json(
        { error: 'Logga in med ett aktivt partnerkonto och godkänt avtal.' },
        { status: 401 },
      )
    }

    const { data, error } = await getServerSupabase()
      .from('sales_case')
      .select('id, token, business_name, prospect_name, created_at, expires_at, opened_at, consumed_at')
      .eq('created_by_partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(TAK)

    if (error) {
      console.error('[partners/sales-cases] kunde inte läsa genomgångarna:', error.message)
      return NextResponse.json({ error: 'Kunde inte hämta dina genomgångar. Försök igen.' }, { status: 500 })
    }

    const nu = Date.now()
    const genomgangar = (data || []).map(rad => {
      const lage = caseLage(rad, nu)
      return {
        id: rad.id,
        foretag: rad.business_name,
        kontakt: rad.prospect_name || null,
        skickad: rad.created_at,
        lage: lage.kod,
        rubrik: lage.rubrik,
        tidpunkt: lage.tidpunkt,
        // Bara när länken fortfarande leder någonstans.
        url: lage.kanDelas ? byggCaseLank(rad.token) : null,
      }
    })

    return NextResponse.json(
      { genomgangar, total: genomgangar.length },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (err: any) {
    console.error('[partners/sales-cases] oväntat fel:', err?.message || err)
    return NextResponse.json({ error: 'Kunde inte hämta dina genomgångar. Försök igen.' }, { status: 500 })
  }
}
