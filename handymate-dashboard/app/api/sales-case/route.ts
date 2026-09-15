import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
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
 * TVÅ SLAGS SÄLJARE (2026-09-15, Andreas): vi själva med ett
 * Handymate-konto, ELLER en partner med en aktiv partnersession. Partnern
 * ska kunna skapa case åt sina egna kunder, och då måste attributionen
 * följa med — annars gör partnern arbetet och affären blir oattribuerad.
 *
 * Partnerns `referral_code` läses ur partnerns EGEN rad, aldrig ur bodyn.
 * En kod som klienten får skicka är en kod någon annan kan göra anspråk på.
 * Själva bedömningen av om koden får ge provision (self_referral,
 * already_attributed, agreement_not_current …) görs fortfarande av
 * claimPartnerAttribution vid registreringen — den är enda domaren.
 *
 * Rutten skriver ALDRIG till business_config och skapar inget konto. Den
 * lägger bara en rad som onboardingen senare får läsa.
 */

/** Så stor får en genomgång vara. Säljsidans payload är några kB; taket stoppar en skenande klient. */
const MAX_PAYLOAD_TECKEN = 100_000

export async function POST(request: NextRequest) {
  try {
    // Vår egen session först; annars en partnersession.
    const business = await getAuthenticatedBusiness(request)
    let partnerId: string | null = null
    let referralCode: string | null = null

    if (!business) {
      const partnerToken = getPartnerTokenFromRequest(request)
      const partner = partnerToken ? await getPartnerFromToken(partnerToken) : null
      if (!partner) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
      // En partner som inte är aktiv ska inte producera länkar som utlovar
      // en attribution registreringen sedan avvisar.
      if (partner.status !== 'active') {
        return NextResponse.json(
          { error: 'Ditt partnerkonto är inte aktivt ännu. Genomgången kan visas, men inte sparas som ett case.' },
          { status: 403 },
        )
      }
      partnerId = partner.id
      referralCode = partner.referral_code || null
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
      created_by_business_id: business?.business_id ?? null,
      created_by_partner_id: partnerId,
      referral_code: referralCode,
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
      onboardingUrl: byggOnboardingLank(token, referralCode),
      expiresInDays: SALES_CASE_TTL_DAGAR,
    })
  } catch (err: any) {
    console.error('[sales-case] oväntat fel:', err?.message || err)
    return NextResponse.json({ error: 'Kunde inte spara genomgången.' }, { status: 500 })
  }
}
