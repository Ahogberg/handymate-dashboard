import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

// getAuthenticatedBusiness/getCurrentUser läser request.headers direkt. Utan
// force-dynamic cachas GET:en som statisk och första svaret efter deploy kan
// serveras till ALLA företag (CLAUDE.md, svepet 2026-08-22). Här vore det
// särskilt illa: svaret avgör om en demoknapp visas.
export const dynamic = 'force-dynamic'

/**
 * /api/admin/demo-onboarding-exit — vägen TILLBAKA från onboardingen till
 * det inloggade demoläget.
 *
 * Bakgrund (2026-09-10, Andreas). "Visa onboardingen" i PresenterBar kör
 * POST /api/admin/demo-onboarding-replay, som avsiktligt sätter
 * onboarding_completed_at = NULL och onboarding_step = 1. Men det fanns
 * ingen väg tillbaka:
 *
 *   - Dashboardgrinden (app/dashboard/layout.tsx) kräver completed_at ELLER
 *     onboarding_step >= 9 och skickar annars vidare till /onboarding.
 *   - PresenterBar renderas BARA i app/dashboard/layout.tsx. Så fort replayen
 *     landat på /onboarding är knappen som tog dig dit borta.
 *   - "← Lämna guiden" (#25) leder till /, och därifrån "Öppna Handymate" →
 *     /dashboard → tillbaka till /onboarding. En rundgång, inte en utgång.
 *
 * En presentatör som visade onboardingen mitt i ett kundmöte kunde alltså
 * bara komma tillbaka genom att klicka igenom hela guiden. Demokontot stod
 * dessutom parkerat i just det läget när det här skrevs (steg 2), med 90
 * godkännandekort och 146 notiser bakom grinden som ingen kunde se.
 *
 * Den här rutten är replay:ens spegelbild och gör samma sak som finalize
 * (POST /api/onboarding) gör i slutet av flödet: onboarding_step = 10 +
 * onboarding_completed_at. Den rör MEDVETET inget annat:
 *
 *   - onboarding_data lämnas orörd, precis som replayen lämnar den — nästa
 *     genomkörning ska fortfarande vara förifylld.
 *   - Fortnox-simläget rörs inte. Det ägs av demo-fortnox-sim och nollställs
 *     av replayen; att städa det här hade gjort "tillbaka" till en halv
 *     återställning, och "Återställ demon" är den enda vägen till ett orört
 *     demoläge.
 *
 * Samma hårda grind som demo-onboarding-replay/demo-reset (kopierad exakt):
 *   1. getAuthenticatedBusiness — kräver inloggad session.
 *   2. business.business_id === process.env.DEMO_BUSINESS_ID — annars 403.
 *   3. business_users-rollen är owner/admin — annars 403.
 * Utan DEMO_BUSINESS_ID i miljön svarar rutten ALLTID 403 på POST och
 * visa:false på GET, oavsett vem som är inloggad.
 */

/** Delad grind för båda metoderna. Returnerar företaget eller ett svar. */
async function grind(request: NextRequest): Promise<
  { ok: true; businessId: string } | { ok: false; status: number; error: string }
> {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return { ok: false, status: 401, error: 'Unauthorized' }

  const demoBusinessId = process.env.DEMO_BUSINESS_ID
  if (!demoBusinessId || business.business_id !== demoBusinessId) {
    return {
      ok: false,
      status: 403,
      error: 'Det här är inte demokontot. Vägen tillbaka finns bara på demokontot.',
    }
  }

  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !isOwnerOrAdmin(currentUser) || !currentUser.user_id) {
    return { ok: false, status: 403, error: 'Endast ägare och administratör' }
  }

  return { ok: true, businessId: business.business_id }
}

/**
 * GET — ska knappen visas?
 *
 * Onboardingsidan ligger utanför BusinessProvider/CurrentUserProvider (de
 * mountas bara i dashboardens layout), så klienten kan inte avgöra det här
 * själv. Servern är auktoriteten — samma hållning som /api/push/status:
 * vet vi inte, svarar vi nej. Aldrig ett 4xx, eftersom en riktig kund på
 * onboardingen inte gör något fel genom att fråga.
 */
export async function GET(request: NextRequest) {
  const g = await grind(request)
  return NextResponse.json({ visa: g.ok })
}

export async function POST(request: NextRequest) {
  try {
    const g = await grind(request)
    if (!g.ok) return NextResponse.json({ error: g.error }, { status: g.status })

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('business_config')
      .update({
        onboarding_step: 10,
        onboarding_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('business_id', g.businessId)

    if (error) {
      console.error('[demo-onboarding-exit] business_config update failed:', error.message)
      return NextResponse.json({ error: 'Kunde inte gå tillbaka till demoläget.' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[demo-onboarding-exit] error:', err?.message || err)
    return NextResponse.json({ error: 'Kunde inte gå tillbaka till demoläget.' }, { status: 500 })
  }
}
