import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { extractUserId } from '@/lib/permissions'
import { raderaPersondata } from '@/lib/account/radera'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Raderingen gör ett obestämt antal DELETE-anrop (ett per tabell i RADERAS,
// i flera varv vid beroendekedjor, se lib/account/radera.ts) plus
// auth.admin.deleteUser per inloggning. 60s — samma marginal som
// approvals/[id] tar för sin tyngsta kedja (kall Chromium-PDF).
export const maxDuration = 60

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null
  return new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-01-28.clover' as any,
  })
}

/**
 * POST /api/account/delete — kontoradering (Apple 5.1.1(v), Google Play).
 *
 * tasks/plan-kontoradering.md, beslut Andreas 2026-09-04: ägaren raderar
 * hela firman. Inloggningar och persondata raderas hårt. Fakturaunderlag
 * behålls 7 år (bokföringslagen) — se lib/account/radera.ts BEHALLS.
 *
 * Bara ägaren (business_config.user_id === den inloggades eget auth-id, INTE
 * business_users.role) får radera firman. En anställd får 403 — texten i
 * app/(tabs)/profile.tsx i mobilen ska aldrig lova att en anställd kan
 * avsluta firman härifrån (utanför scope, se planens "Utanför scope").
 *
 * Kroppen måste innehålla `bekraftelse` som EXAKT matchar
 * business_config.business_name. Jämförelsen görs HÄR, på servern — aldrig
 * på klienten, annars är spärren mot ett tryck av misstag meningslös.
 *
 * Fail-loud, i den ordning planen kräver: Stripe → persondata → auth-
 * användare → business_users → business_config. Ett fel mitt i kastar och
 * säger EXAKT vad som gick fel — aldrig ett påstående om att något raderats
 * som faktiskt inte raderades.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (business._impersonation) {
      // Samma princip som approvals/[id]: superadmin-impersonation har ingen
      // egen business_users-rad i target-businessen, och att låta en
      // impersonerad session radera en kunds firma är precis den sortens
      // skriv-operation impersonation (v1: read-only) aldrig ska tillåta.
      return NextResponse.json(
        { error: 'Kontoradering kan inte göras via impersonation' },
        { status: 403 },
      )
    }

    const callerUserId = await extractUserId(request)
    if (!callerUserId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Färsk rad, INTE cachead via getAuthenticatedBusiness — deleted_at och
    // stripe_subscription_id är inte typade på AuthenticatedBusiness
    // (select('*') hämtar dem i praktiken, men de saknas i det delade
    // gränssnittet), och user_id/business_name måste läsas rått för
    // ägarjämförelsen och redan-raderad-spärren.
    const { data: firma, error: firmaError } = await supabase
      .from('business_config')
      .select('business_id, business_name, user_id, deleted_at, stripe_subscription_id')
      .eq('business_id', business.business_id)
      .single()

    if (firmaError || !firma) {
      return NextResponse.json({ error: 'Företaget hittades inte' }, { status: 404 })
    }

    // Bara ägaren — den vars auth-id business_config.user_id faktiskt pekar
    // på — får radera firman. Jämförs på servern, aldrig på klienten.
    if (firma.user_id !== callerUserId) {
      return NextResponse.json(
        { error: 'Bara ägaren kan avsluta firman. Kontakta ägaren om du vill radera ditt eget konto.' },
        { status: 403 },
      )
    }

    if (firma.deleted_at) {
      return NextResponse.json({ error: 'Kontot är redan avslutat' }, { status: 409 })
    }

    const body = await request.json().catch(() => null)
    const bekraftelse = typeof body?.bekraftelse === 'string' ? body.bekraftelse : ''
    if (bekraftelse !== firma.business_name) {
      return NextResponse.json(
        { error: 'Företagsnamnet stämmer inte. Skriv namnet exakt som det står för att bekräfta.' },
        { status: 400 },
      )
    }

    // ── 2. Stripe-prenumerationen ──
    // Ett genuint Stripe-fel (nätverk, autentisering, ett verkligt aktivt
    // abonnemang som inte går att avsluta) är fail-loud: fortsätter vi ändå
    // fortsätter Handymate fakturera ett konto som inte längre existerar.
    // "Prenumerationen finns redan inte" (resource_missing) är däremot inget
    // fel — bara ett tecken på att den redan sagts upp via portalen.
    if (firma.stripe_subscription_id) {
      const stripe = getStripe()
      if (!stripe) {
        return NextResponse.json(
          { error: 'Betalsystemet är inte konfigurerat — kontakta support innan du försöker igen' },
          { status: 500 },
        )
      }
      try {
        await stripe.subscriptions.cancel(firma.stripe_subscription_id)
      } catch (stripeErr: any) {
        if (stripeErr?.code !== 'resource_missing') {
          console.error('[account/delete] Stripe-avslut misslyckades:', stripeErr)
          return NextResponse.json(
            { error: 'Kunde inte avsluta prenumerationen — kontot raderades inte. Försök igen eller kontakta support.' },
            { status: 502 },
          )
        }
      }
    }

    // ── 3. Persondata bort ──
    let raderingsresultat
    try {
      raderingsresultat = await raderaPersondata(supabase, firma.business_id)
    } catch (raderaErr: any) {
      console.error('[account/delete] Persondata-raderingen misslyckades:', raderaErr)
      return NextResponse.json(
        {
          error: 'Kontot kunde inte raderas fullständigt — inget har tagits bort permanent förrän detta är löst. Kontakta support.',
          detaljer: raderaErr?.message || String(raderaErr),
        },
        { status: 500 },
      )
    }

    // ── 4. Inloggningar bort ──
    // Läses INNAN business_users-raderna tas bort (steg 5) — annars finns
    // inget sätt att veta vilka auth-användare som hörde till firman.
    const { data: teammedlemmar, error: teamError } = await supabase
      .from('business_users')
      .select('id, user_id')
      .eq('business_id', firma.business_id)

    if (teamError) {
      console.error('[account/delete] Kunde inte läsa business_users för inloggningsradering:', teamError)
      return NextResponse.json(
        {
          error: 'Persondata raderades, men inloggningarna kunde inte identifieras — kontot är i ett osäkert mellanläge. Kontakta support omedelbart.',
          raderat: raderingsresultat.raderat,
        },
        { status: 500 },
      )
    }

    const userIdsAttRadera = new Set<string>()
    for (const rad of teammedlemmar || []) {
      if (rad.user_id) userIdsAttRadera.add(rad.user_id)
    }
    userIdsAttRadera.add(firma.user_id)

    const inloggningsfel: string[] = []
    for (const userId of Array.from(userIdsAttRadera)) {
      const { error: deleteUserError } = await supabase.auth.admin.deleteUser(userId)
      if (deleteUserError) {
        // "User not found" betyder att inloggningen redan är borta (t.ex. en
        // tidigare avbruten körning) — inte ett fel värt att stoppa på.
        const redanBorta = /not.?found/i.test(deleteUserError.message || '')
        if (!redanBorta) {
          inloggningsfel.push(`${userId}: ${deleteUserError.message}`)
        }
      }
    }

    if (inloggningsfel.length > 0) {
      console.error('[account/delete] Kunde inte radera alla inloggningar:', inloggningsfel)
      return NextResponse.json(
        {
          error: 'Persondata raderades, men inte alla inloggningar kunde tas bort. Kontot är i ett osäkert mellanläge — kontakta support omedelbart.',
          detaljer: inloggningsfel,
          raderat: raderingsresultat.raderat,
        },
        { status: 500 },
      )
    }

    // ── 5. business_users-raderna ──
    const { error: buDeleteError } = await supabase
      .from('business_users')
      .delete()
      .eq('business_id', firma.business_id)

    if (buDeleteError) {
      console.error('[account/delete] Kunde inte radera business_users:', buDeleteError)
      return NextResponse.json(
        {
          error: 'Persondata och inloggningar raderades, men de anställdas rader kunde inte tas bort. Kontakta support omedelbart.',
          detaljer: buDeleteError.message,
          raderat: raderingsresultat.raderat,
        },
        { status: 500 },
      )
    }

    // ── 6. Mjukradera business_config ──
    // business_name och org_number behålls MEDVETET — fakturorna (BEHALLS)
    // pekar på den här raden och behöver kunna härledas till en firma i 7 år.
    const { error: uppdateraError } = await supabase
      .from('business_config')
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: callerUserId,
        subscription_status: 'deleted',
        agents_globally_paused: true,
        assigned_phone_number: null,
        contact_name: null,
        contact_email: null,
        phone_number: null,
      })
      .eq('business_id', firma.business_id)

    if (uppdateraError) {
      console.error('[account/delete] Kunde inte mjukradera business_config:', uppdateraError)
      return NextResponse.json(
        {
          error: 'Persondata, inloggningar och anställda raderades, men firmans rad kunde inte stängas av. Kontakta support omedelbart.',
          detaljer: uppdateraError.message,
          raderat: raderingsresultat.raderat,
        },
        { status: 500 },
      )
    }

    // ── 7. Svaret speglar vad som FAKTISKT raderades ──
    return NextResponse.json({
      success: true,
      message: 'Kontot är raderat. Fakturaunderlaget behålls i 7 år enligt bokföringslagen.',
      raderat_per_tabell: raderingsresultat.raderat,
      inloggningar_raderade: userIdsAttRadera.size,
    })
  } catch (error: any) {
    console.error('[account/delete] Oväntat fel:', error)
    return NextResponse.json({ error: error?.message || 'Ett oväntat fel inträffade' }, { status: 500 })
  }
}
