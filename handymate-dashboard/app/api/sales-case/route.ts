import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import {
  byggCaseLank,
  byggOnboardingLank,
  SALES_CASE_TTL_DAGAR,
  type SalesCasePayload,
} from '@/lib/sales/sales-case'

// force-dynamic: läser auth via getAuthenticatedBusiness, som läser
// request.headers direkt (CLAUDE.md, kända fallgropar).
export const dynamic = 'force-dynamic'

/**
 * POST /api/sales-case
 *
 * Sparar en säljgenomgång och returnerar den personliga länken.
 * Anropas av Handymate Sales Experience när säljaren trycker "Skicka" —
 * i stället för localStorage, som inte överlever resan till kundens egen
 * webbläsare (se lib/sales/sales-case.ts).
 *
 * GRIND: kräver inloggad session. Det är SÄLJAREN som skapar caset, aldrig
 * en anonym besökare — annars vore rutten en öppen skrivväg till en tabell
 * vars rader delas ut som publika länkar.
 *
 * Rutten skriver ALDRIG till business_config och skapar inget konto. Den
 * lägger bara en rad som onboardingen senare får läsa.
 */

/** Så stor får en genomgång vara. Säljsidans payload är några kB; taket stoppar en skenande klient. */
const MAX_PAYLOAD_TECKEN = 100_000

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Ogiltig genomgång.' }, { status: 400 })
    }

    const payload = (body.payload ?? body) as SalesCasePayload
    const foretagsnamn = typeof payload?.company?.name === 'string' ? payload.company.name.trim() : ''
    if (!foretagsnamn) {
      // Utan företagsnamn går caset inte att visa och inte att känna igen i
      // en lista. Det är det enda obligatoriska fältet.
      return NextResponse.json(
        { error: 'Genomgången saknar företagsnamn och kan inte sparas.' },
        { status: 400 },
      )
    }

    const serialiserad = JSON.stringify(payload)
    if (serialiserad.length > MAX_PAYLOAD_TECKEN) {
      return NextResponse.json({ error: 'Genomgången är för stor att spara.' }, { status: 413 })
    }

    const token = crypto.randomUUID()
    const nu = Date.now()
    const supabase = getServerSupabase()

    const { error } = await supabase.from('sales_case').insert({
      token,
      business_name: foretagsnamn,
      org_number: typeof payload?.company?.org === 'string' ? payload.company.org : null,
      prospect_name: typeof payload?.prospect?.name === 'string' ? payload.prospect.name || null : null,
      prospect_email: typeof payload?.prospect?.email === 'string' ? payload.prospect.email || null : null,
      payload,
      created_by_user_id: null,
      created_by_business_id: business.business_id,
      expires_at: new Date(nu + SALES_CASE_TTL_DAGAR * 24 * 60 * 60 * 1000).toISOString(),
    })

    if (error) {
      console.error('[sales-case] kunde inte spara genomgången:', error.message)
      return NextResponse.json({ error: 'Kunde inte spara genomgången.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      token,
      url: byggCaseLank(token),
      onboardingUrl: byggOnboardingLank(token),
      expiresInDays: SALES_CASE_TTL_DAGAR,
    })
  } catch (err: any) {
    console.error('[sales-case] oväntat fel:', err?.message || err)
    return NextResponse.json({ error: 'Kunde inte spara genomgången.' }, { status: 500 })
  }
}
