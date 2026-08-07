import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { materializeObligations, missingProfileFields } from '@/lib/karin/obligations'
import { obligationToEvent, sortByUrgency, needsAttention, groupByMonth } from '@/lib/karin/calendar'
import type { CompanyProfile } from '@/lib/karin/obligation-rules'
import { HANDLED_KEY, parseHandled, applyHandledChange } from '@/lib/karin/handled-store'

export const dynamic = 'force-dynamic'

/**
 * GET /api/karin/calendar?days=90
 *
 * Bolagskalendern: de myndighetsdatum företaget faktiskt har framför sig.
 *
 * ═══ VARFÖR ÄGARE/ADMIN ═══
 *
 * Moms, preliminärskatt och bokslut hör till den som driver bolaget. En
 * montör ska inte se dem i förbifarten — och admin är i praktiken ofta den
 * som sköter böckerna, så gränsen går där och inte snävare.
 *
 * ═══ VARFÖR PROFILENS LUCKOR RETURNERAS ═══
 *
 * En tom kalender som betyder "vi vet inte" får aldrig se ut som en som
 * betyder "allt är lugnt". Saknas momsperioden i profilen skickas det med
 * som `missing`, så gränssnittet kan be om uppgiften i stället för att visa
 * tomhet.
 */
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

    const dagarRaw = parseInt(request.nextUrl.searchParams.get('days') || '90', 10)
    const dagar = Math.min(Math.max(1, isNaN(dagarRaw) ? 90 : dagarRaw), 400)

    const supabase = getServerSupabase()

    // Kolumnerna kommer med v94, som körs manuellt i Supabase. PostgREST
    // avvisar HELA frågan om en uppräknad kolumn saknas — därför `*`, precis
    // som backfill-rutten gör med secondary_branches.
    const { data, error } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    if (error || !data) {
      console.error('[karin/calendar] kunde inte läsa företagsprofilen:', error?.message)
      return NextResponse.json({ error: 'Kunde inte läsa företagsuppgifterna' }, { status: 500 })
    }

    const rad = data as Record<string, unknown>
    const profile: CompanyProfile = {
      company_form: (rad.company_form as string) ?? null,
      fiscal_year_end_month: (rad.fiscal_year_end_month as number) ?? null,
      vat_period: (rad.vat_period as CompanyProfile['vat_period']) ?? null,
      is_employer: (rad.is_employer as boolean) ?? null,
      f_skatt_registered: (rad.f_skatt_registered as boolean) ?? null,
    }

    const idag = new Date()
    const till = new Date()
    till.setDate(till.getDate() + dagar)

    // Hanterat-markeringarna ligger i business_preferences (nyckel-värde) —
    // ingen egen tabell behövs, och därmed ingen migration som måste köras
    // manuellt innan funktionen fungerar. Ett fel här får aldrig fälla
    // kalendern: då visas allt som ohanterat, vilket är det säkra hållet.
    let hanterade = new Set<string>()
    try {
      const { data: pref } = await supabase
        .from('business_preferences')
        .select('value')
        .eq('business_id', business.business_id)
        .eq('key', HANDLED_KEY)
        .maybeSingle()
      hanterade = parseHandled((pref as { value?: string } | null)?.value)
    } catch (e) {
      console.warn('[karin/calendar] kunde inte läsa hanterat-listan:', e)
    }

    const events = materializeObligations(profile, idag, till)
      .map(obligationToEvent)
      .map(e => (hanterade.has(e.id) ? { ...e, handled: true } : e))
    const sorterade = sortByUrgency(events, idag)

    return NextResponse.json({
      profile,
      // Vad som fattas för att kalendern ska kunna säga något vettigt.
      missing: missingProfileFields(profile),
      attention: sorterade.filter(e => needsAttention(e, idag)).slice(0, 5),
      months: groupByMonth(events),
      total: events.length,
      window_days: dagar,
    })
  } catch (err: any) {
    console.error('[karin/calendar] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}

/**
 * POST /api/karin/calendar — markera en händelse som hanterad, eller ångra.
 *
 * Body: `{ event_id: string, handled: boolean }`
 *
 * Lagras i `business_preferences` under en enda nyckel. Listan gallras vid
 * varje skrivning så den inte växer för alltid — tolv arbetsgivardeklarationer
 * om året blir hundratals rader på några år, och de allra flesta pekar på
 * datum som passerat för länge sedan.
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const body = await request.json().catch(() => null)
    const eventId = body?.event_id
    if (typeof eventId !== 'string' || !eventId) {
      return NextResponse.json({ error: 'event_id krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: pref } = await supabase
      .from('business_preferences')
      .select('value')
      .eq('business_id', business.business_id)
      .eq('key', HANDLED_KEY)
      .maybeSingle()

    const nuvarande = parseHandled((pref as { value?: string } | null)?.value)
    const nasta = applyHandledChange(nuvarande, eventId, body?.handled !== false, new Date())

    const { error } = await supabase
      .from('business_preferences')
      .upsert({
        business_id: business.business_id,
        key: HANDLED_KEY,
        value: JSON.stringify(nasta),
        source: 'user',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'business_id,key' })

    if (error) {
      console.error('[karin/calendar POST]', error.message)
      return NextResponse.json({ error: 'Kunde inte spara' }, { status: 500 })
    }

    return NextResponse.json({ success: true, handled: nasta })
  } catch (err: any) {
    console.error('[karin/calendar POST] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}
