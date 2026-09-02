import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/demo-onboarding-replay
 *
 * "Visa onboardingen"-knappen i PresenterBar/dashboard/demo — kör om
 * onboarding-flödet på demokontot UTAN att röra kund-/affärsdata (det är
 * "Återställ demon"s jobb, se app/api/admin/demo-reset/route.ts). Två saker
 * nollställs:
 *
 *   1. onboarding_completed_at → NULL, onboarding_step → 1 (Step2Business,
 *      se app/onboarding/page.tsx:s stegkarta). onboarding_data (JSONB)
 *      lämnas ORÖRD — den förifyllda datan gör nästa genomkörning snabb i
 *      stället för att presentatören måste fylla i formuläret på nytt.
 *   2. Fortnox-simläget (se demo-fortnox-sim/route.ts) återställs så replay
 *      nummer N+1 ser orört ut: metadata i business_config nollställs,
 *      demo-tokenraden i business_integration_credentials tas bort, och
 *      raderna simmen skrev i fortnox_api_log + fortnox_sync raderas.
 *      sql/v155_demo_reset_v2.sql (den "riktiga" demo-resetten) rör INTE de
 *      två tabellerna idag — de är sim-specifika och städas här istället.
 *
 * Kund-/fakturadata som Fortnox-simmen skapat (customer/invoice) raderas
 * INTE av den här rutten — det är fortfarande "Återställ demon"s jobb
 * (v155 tar customer/invoice/quotes/deal osv i sin helhet, i rätt
 * FK-ordning). Samspelet mellan de två knapparna:
 *   - "Visa onboardingen" (den här rutten) = ren FLÖDESVISNING. Kör om
 *     onboarding-UI:t från början utan att döda befintlig demodata.
 *   - "Återställ demon" = den enda vägen till en helt orörd demo.
 * En presentatör som kör "Visa onboardingen" flera gånger i rad utan att
 * återställa demon däremellan ackumulerar alltså fler Fortnox-sim-kunder/
 * fakturor för varje varv (dedupen i demo-fortnox-sim/route.ts gör att
 * upprepade körningar ändå är säkra — bara långsamt växande) — förväntat,
 * inte en bugg.
 *
 * Samma hårda grind som demo-reset/demo-seed-meeting (kopierat exakt):
 *   1. getAuthenticatedBusiness — kräver inloggad session.
 *   2. business.business_id === process.env.DEMO_BUSINESS_ID — annars 403.
 *   3. business_users-rollen är owner/admin — annars 403.
 * Utan DEMO_BUSINESS_ID satt i miljön svarar routen ALLTID 403, oavsett
 * vem som är inloggad.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const demoBusinessId = process.env.DEMO_BUSINESS_ID
    if (!demoBusinessId || business.business_id !== demoBusinessId) {
      return NextResponse.json(
        { error: 'Det här är inte demokontot. Onboardingen kan bara köras om på demokontot.' },
        { status: 403 }
      )
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser) || !currentUser.user_id) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    const { error: updateError } = await supabase
      .from('business_config')
      .update({
        onboarding_completed_at: null,
        onboarding_step: 1,
        // Fortnox-simläget — samma "orört läge" som ett konto som aldrig
        // kopplat Fortnox. onboarding_data rörs MEDVETET INTE (se filhuvud).
        fortnox_connected: false,
        fortnox_company_name: null,
        fortnox_connected_at: null,
        fortnox_last_synced_at: null,
      })
      .eq('business_id', business.business_id)

    if (updateError) {
      console.error('[demo-onboarding-replay] business_config update failed:', updateError.message)
      return NextResponse.json({ error: 'Kunde inte nollställa onboardingen.' }, { status: 500 })
    }

    const { error: credentialsError } = await supabase
      .from('business_integration_credentials')
      .delete()
      .eq('business_id', business.business_id)
    if (credentialsError) {
      console.error('[demo-onboarding-replay] credential cleanup failed:', credentialsError.message)
      return NextResponse.json({ error: 'Kunde inte nollställa Fortnox-simuleringen.' }, { status: 500 })
    }

    // Rensning av logg-/synkspår från en ev. tidigare Fortnox-simulering.
    // Non-blocking (samma hållning som logFortnoxOperation): dessa två
    // tabeller är debug-/statistikspår, inte kärndata — ett misslyckat
    // städ ska aldrig fälla hela "Visa onboardingen"-anropet, bara loggas.
    const { error: apiLogError } = await supabase
      .from('fortnox_api_log')
      .delete()
      .eq('business_id', business.business_id)
    if (apiLogError) {
      console.error('[demo-onboarding-replay] fortnox_api_log delete failed:', apiLogError.message)
    }

    const { error: syncError } = await supabase
      .from('fortnox_sync')
      .delete()
      .eq('business_id', business.business_id)
    if (syncError) {
      console.error('[demo-onboarding-replay] fortnox_sync delete failed:', syncError.message)
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[demo-onboarding-replay] Error:', error)
    return NextResponse.json({ error: error.message || 'Kunde inte köra om onboardingen' }, { status: 500 })
  }
}
