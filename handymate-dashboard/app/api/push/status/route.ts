import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

// getAuthenticatedBusiness/getCurrentUser läser request.headers direkt — utan
// denna export cachas rutten som statisk och första svaret efter deploy kan
// serveras till ALLA företag (CLAUDE.md, svepet 2026-08-22).
export const dynamic = 'force-dynamic'

/**
 * GET /api/push/status
 *
 * Har DEN HÄR SERVERN en pushprenumeration för den inloggade personen?
 *
 * Bakgrund (2026-09-10). "Notiser var redan på" i Inställningar, samtidigt som
 * `push_subscriptions` i produktionsdatabasen hade noll rader — inte för något
 * konto, inte någon gång i historien. Båda var sanna, för de talade om olika
 * saker: `hamtaPushStatus()` frågade `reg.pushManager.getSubscription()`, dvs.
 * WEBBLÄSAREN, och aldrig servern. En webbläsare kan bära en fullt giltig
 * native prenumeration som servern inte känner till — och då går ingen push
 * fram, eftersom avsändaren läser sin egen databas.
 *
 * Det finns minst två vägar dit, och båda har hänt i det här projektet:
 *
 *   1. Prenumerationen POST:ades till en ANNAN instans. Repot bygger två
 *      Vercel-projekt (handymate-dashboard och handymate-vision-test). Är
 *      appen på telefonen installerad från testbygget hamnar raden i den
 *      instansens databas, och produktionen har ingenting att skicka till.
 *   2. POST:en misslyckades tyst. Före v198 fanns inte tabellen och varje
 *      försök gav 500 — se `PUSH_SUBSCRIBED_KEY` i
 *      lib/push/prenumerera-klient.ts, som döptes om till _v2 just för det.
 *
 * Den gamla statusen kunde inte skilja något av detta från "allt är bra". Den
 * här rutten är sanningen från serverns sida, så ytan kan säga
 * "ur synk — din telefon tror sig registrerad men vi har ingen rad" och
 * läka det genom att posta om prenumerationen (upsert, idempotent).
 *
 * Svarar alltid 200 med ett `registrerad`-fält; att inte veta räknas som
 * `false`, aldrig som `true`. En falsk "på" är precis felet vi rättar.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const currentUser = await getCurrentUser(request)
    const userId = currentUser?.user_id || business.user_id || null

    // Personens egen prenumeration är det som avgör om en RIKTAD push når
    // fram (target_user_id i /api/push/send). Kontots totala antal svarar på
    // en annan fråga — "finns någon enhet alls?" — och båda är värda att
    // visa, men bara den första får styra "På".
    const [minaRes, kontotsRes] = await Promise.all([
      userId
        ? supabase
            .from('push_subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('business_id', business.business_id)
            .eq('user_id', userId)
        : Promise.resolve({ count: 0, error: null }),
      supabase
        .from('push_subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', business.business_id),
    ])

    if (minaRes.error || kontotsRes.error) {
      console.error(
        '[push/status] uppslaget misslyckades:',
        minaRes.error?.message || kontotsRes.error?.message,
      )
      // Fail-safe: kan vi inte kontrollera säger vi INTE att det är på.
      return NextResponse.json({ registrerad: false, enheter: 0, pa_kontot: 0, osaker: true })
    }

    const mina = minaRes.count ?? 0
    return NextResponse.json({
      registrerad: mina > 0,
      enheter: mina,
      pa_kontot: kontotsRes.count ?? 0,
    })
  } catch (error: any) {
    console.error('GET /api/push/status error:', error)
    return NextResponse.json({ registrerad: false, enheter: 0, pa_kontot: 0, osaker: true })
  }
}
