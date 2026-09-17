import { NextRequest, NextResponse } from 'next/server'
import { hasAcceptedCurrentAgreement } from '@/lib/partners/agreement'
import { getPartnerFromToken, getPartnerTokenFromRequest } from '@/lib/partners/auth'
import { getServerSupabase } from '@/lib/supabase'

// force-dynamic: läser partnersessionen via getPartnerTokenFromRequest, som
// läser request.cookies direkt (CLAUDE.md, kända fallgropar).
export const dynamic = 'force-dynamic'

/**
 * POST /api/partners/demo-entry
 *
 * En knapp in i det DELADE demokontot, utan att partnern skriver några
 * inloggningsuppgifter (Andreas beslut 2026-09-17: "alla partners kan ju
 * dela demokonto, och då är det ju smidigt om det bara är en knapp in").
 *
 * MEKANISMEN ÄR HUSETS EGEN, inte en ny: samma
 * supabase.auth.admin.generateLink('magiclink') som adminens fulla
 * impersonering använder (app/api/admin/impersonate/verify/route.ts).
 * Partnern får en engångslänk till demokontots egen Supabase-användare och
 * landar i en HELT VANLIG session. Ingen ny betrodd väg, inget lösenord i
 * miljön, ingen cookie som auth.ts måste lära sig lita på.
 *
 * ══ GRINDARNA ══
 *
 * 1. Giltig partnersession. 2. status === 'active'. 3. Accepterat gällande
 *    partneravtal. Exakt samma tre som POST /api/sales-case — den som inte
 *    får skapa ett case åt en kund ska inte heller få en session in i vårt
 *    demokonto.
 *
 * 4. MÅLET MÅSTE VARA MÄRKT SOM DEMO. Kontot väljs ur DEMO_BUSINESS_ID, men
 *    env-variabeln är inte grinden — is_demo_tenant är. Skulle variabeln
 *    peka på ett riktigt företag (felstavning, kopierad miljö, ett
 *    återställt värde) vägrar rutten i stället för att dela ut en session
 *    till en betalande kunds konto. Det är hela skillnaden mellan en
 *    demoknapp och en bakdörr.
 *
 * ══ LÄNKEN LOGGAS ALDRIG ══
 *
 * action_link är en engångsnyckel till en session. Den returneras till
 * anroparen och ingenting annat: inte till partner_demo_entry, inte till
 * console, inte in i ett felmeddelande. Loggen säger VEM som gick in och
 * NÄR — det är den frågan ett delat konto ställer när någon nollställer det
 * mitt i en annans möte.
 */
export async function POST(request: NextRequest) {
  try {
    const partnerToken = getPartnerTokenFromRequest(request)
    const partner = partnerToken ? await getPartnerFromToken(partnerToken) : null
    if (!partner) {
      return NextResponse.json({ error: 'Du är inte inloggad som partner.' }, { status: 401 })
    }
    if (partner.status !== 'active') {
      return NextResponse.json(
        { error: 'Ditt partnerkonto är inte aktivt ännu. Demot öppnas när kontot är godkänt.' },
        { status: 403 },
      )
    }
    if (!hasAcceptedCurrentAgreement(partner)) {
      return NextResponse.json(
        { error: 'Godkänn det gällande partneravtalet innan du öppnar demot.' },
        { status: 403 },
      )
    }

    const demoBusinessId = (process.env.DEMO_BUSINESS_ID || '').trim()
    if (!demoBusinessId) {
      console.error('[partner/demo-entry] DEMO_BUSINESS_ID saknas i miljön — demoknappen kan inte fungera.')
      return NextResponse.json({ error: 'Demot är inte konfigurerat. Vi tittar på det.' }, { status: 503 })
    }

    const supabase = getServerSupabase()
    const { data: demo, error: demoError } = await supabase
      .from('business_config')
      .select('business_id, business_name, user_id, is_demo_tenant')
      .eq('business_id', demoBusinessId)
      .maybeSingle()

    if (demoError) {
      console.error('[partner/demo-entry] kunde inte läsa demokontot:', demoError.message)
      return NextResponse.json({ error: 'Demot kunde inte öppnas. Försök igen.' }, { status: 503 })
    }
    // Grind 4. Ett konto som inte är märkt som demo får aldrig delas ut,
    // hur miljövariabeln än är satt.
    if (!demo || demo.is_demo_tenant !== true) {
      console.error(
        `[partner/demo-entry] DEMO_BUSINESS_ID=${demoBusinessId} är inte ett demokonto (is_demo_tenant=${demo?.is_demo_tenant ?? 'raden saknas'}). Vägrar.`,
      )
      return NextResponse.json({ error: 'Demot är inte konfigurerat. Vi tittar på det.' }, { status: 503 })
    }
    if (!demo.user_id) {
      console.error('[partner/demo-entry] demokontot saknar user_id — ingen session att skapa.')
      return NextResponse.json({ error: 'Demot är inte konfigurerat. Vi tittar på det.' }, { status: 503 })
    }

    const { data: demoUser, error: userError } = await supabase.auth.admin.getUserById(demo.user_id)
    const email = demoUser?.user?.email
    if (userError || !email) {
      console.error('[partner/demo-entry] hittade ingen e-post för demokontots användare:', userError?.message)
      return NextResponse.json({ error: 'Demot är inte konfigurerat. Vi tittar på det.' }, { status: 503 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    const { data: link, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: { redirectTo: `${appUrl}/dashboard` },
    })
    const actionLink = link?.properties?.action_link
    if (linkError || !actionLink) {
      // Felmeddelandet från Supabase kan bära e-postadressen men aldrig
      // länken; loggen är server-side och partnern får ett kort svar.
      console.error('[partner/demo-entry] magiclänken kunde inte skapas:', linkError?.message)
      return NextResponse.json({ error: 'Demot kunde inte öppnas. Försök igen.' }, { status: 503 })
    }

    // Best-effort logg. Ett misslyckat auditskrivande får inte hindra
    // partnern från att demonstrera — men det ska synas.
    const { error: auditError } = await supabase.from('partner_demo_entry').insert({
      partner_id: partner.id,
      business_id: demo.business_id,
      ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      user_agent: request.headers.get('user-agent')?.slice(0, 400) || null,
    })
    if (auditError) console.error('[partner/demo-entry] kunde inte logga öppningen:', auditError.message)

    return NextResponse.json({
      ok: true,
      url: actionLink,
      businessName: demo.business_name,
      delat: true,
    })
  } catch (err: any) {
    console.error('[partner/demo-entry] oväntat fel:', err?.message || err)
    return NextResponse.json({ error: 'Demot kunde inte öppnas. Försök igen.' }, { status: 503 })
  }
}
