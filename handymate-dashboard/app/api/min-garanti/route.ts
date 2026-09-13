import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import {
  ADOPTION_FONSTER_DAGAR,
  ADOPTION_TROSKEL,
  YTA_NYCKLAR,
  YTOR,
  computeAdoption,
  hamtaAdoptionHandelser,
} from '@/lib/admin/adoption'

// force-dynamic: läser auth via getAuthenticatedBusiness, som läser
// request.headers direkt (CLAUDE.md, kända fallgropar). Utan den kan svaret
// frysas och serveras till ett annat företag.
export const dynamic = 'force-dynamic'

/**
 * GET /api/min-garanti — kundens EGEN användningsräknare.
 *
 * ═══ VARFÖR DEN FINNS ═══
 *
 * Grundarerbjudandets användningsgaranti (docs/gtm/grundarerbjudandet-hero-v1.md)
 * lovar: "använd Handymate på fyra av åtta ytor under dina första 30 dagar".
 * Måttet fanns redan och räknas i lib/admin/adoption.ts — men varje läsare
 * var intern (admin, kronorna, launch-desk). Kunden kunde alltså inte se
 * villkoret den bedöms på.
 *
 * En garanti som hänvisar till ett mått kunden inte kan kontrollera är inte
 * en garanti, den är en framtida tvist. Därför den här rutten, och därför
 * villkoret i heroutkastets §9: garantin får inte publiceras förrän ytan
 * finns.
 *
 * ═══ SAMMA SIFFRA SOM VI SJÄLVA SER ═══
 *
 * Rutten räknar med EXAKT samma funktion som admin (computeAdoption) och
 * samma källor (hamtaAdoptionHandelser). Ingen egen kundvänlig variant:
 * två räknare som kan glida isär är värre än ingen räknare, eftersom det är
 * skillnaden som blir tvisten.
 *
 * ═══ GRIND ═══
 *
 * Ägare och administratör. Det här är firmans avtalsvillkor, inte en
 * arbetsyta — en montör ska inte se företagets garantistatus.
 */

/** Dagen beslutet senast ska fattas, räknat från onboardingens slut. */
export const BESLUTSFONSTER_DAGAR = 90

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data: config, error } = await supabase
      .from('business_config')
      .select('business_id, onboarding_completed_at')
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (error) {
      console.error('[min-garanti] kunde inte läsa kontot:', error.message)
      return NextResponse.json({ error: 'Kunde inte läsa din användning just nu.' }, { status: 500 })
    }

    const rad = {
      business_id: business.business_id,
      onboarding_completed_at: (config?.onboarding_completed_at as string | null) ?? null,
    }

    const handelser = await hamtaAdoptionHandelser(supabase, [rad])
    const nuIso = new Date().toISOString()
    const adoption = computeAdoption(handelser.get(business.business_id) || [], rad, nuIso)

    // Varje yta med sin egen etikett och sitt eget ja/nej — kunden ska se
    // VILKA fyra som räknas, inte bara en siffra att lita på.
    const ytor = YTA_NYCKLAR.map(nyckel => ({
      nyckel,
      etikett: YTOR[nyckel],
      klar: adoption.ytor.includes(nyckel),
    }))

    // Dagar kvar räknas bara när fönstret faktiskt är igång. Utan slutförd
    // onboarding finns ingen startpunkt, och då svarar vi null i stället för
    // att hitta på en nedräkning.
    const dagarKvarIFonstret =
      adoption.dag == null ? null : Math.max(0, ADOPTION_FONSTER_DAGAR - adoption.dag + 1)
    const dagarKvarTillBeslut =
      adoption.dag == null ? null : Math.max(0, BESLUTSFONSTER_DAGAR - adoption.dag + 1)

    return NextResponse.json({
      ok: true,
      ytor,
      antal: adoption.antal,
      totalt: YTA_NYCKLAR.length,
      troskel: ADOPTION_TROSKEL,
      uppfyllt: adoption.aktiv,
      dag: adoption.dag,
      fonsterDagar: ADOPTION_FONSTER_DAGAR,
      fonsterKlart: adoption.fonsterKlart,
      dagarKvarIFonstret,
      beslutsfonsterDagar: BESLUTSFONSTER_DAGAR,
      dagarKvarTillBeslut,
      onboardingKlar: rad.onboarding_completed_at !== null,
    })
  } catch (err: any) {
    console.error('[min-garanti] oväntat fel:', err?.message || err)
    return NextResponse.json({ error: 'Kunde inte läsa din användning just nu.' }, { status: 500 })
  }
}
