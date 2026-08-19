import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { materializeObligations, missingProfileFields } from '@/lib/karin/obligations'
import { obligationToEvent, customEventToEvent, sortByUrgency, needsAttention, groupByMonth, type CalendarEvent } from '@/lib/karin/calendar'
import type { CompanyProfile } from '@/lib/karin/obligation-rules'
import { HANDLED_KEY, parseEntries, applyKvittens, serializeEntries, suppresses, type Kvittens, type KvittensAndring } from '@/lib/karin/handled-store'
import { suggestEvents } from '@/lib/karin/event-suggestions'
import { dateStr } from '@/lib/karin/business-days'

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
    let kvittenser: Kvittens[] = []
    try {
      const { data: pref } = await supabase
        .from('business_preferences')
        .select('value')
        .eq('business_id', business.business_id)
        .eq('key', HANDLED_KEY)
        .maybeSingle()
      kvittenser = parseEntries((pref as { value?: string } | null)?.value)
    } catch (e) {
      console.warn('[karin/calendar] kunde inte läsa kvittenserna:', e)
    }

    const perId = new Map(kvittenser.map(k => [k.id, k]))

    // Egna poster (sql/v160) — samma händelseform som de härledda, källmärkta
    // 'egen'. Kvitterar/ångrar med EXAKT samma business_preferences-mekanism
    // som härledda poster, eftersom den aldrig frågade vad källan var. Ett
    // fel här får aldrig fälla kalendern: då visas bara de härledda posterna,
    // vilket är det säkra hållet (samma princip som kvittensläsningen ovan).
    let egnaEvents: CalendarEvent[] = []
    try {
      const { data: egna, error: egnaError } = await supabase
        .from('karin_custom_event')
        .select('id, title, event_date, note')
        .eq('business_id', business.business_id)
        .gte('event_date', dateStr(idag))
        .lte('event_date', dateStr(till))
      if (egnaError) throw egnaError
      egnaEvents = (egna || []).map(customEventToEvent)
    } catch (e) {
      console.warn('[karin/calendar] kunde inte läsa egna poster:', e)
    }

    // `kvittens` bär vad ägaren gjorde, av vem och när — så vyn kan visa det och
    // erbjuda ångra. `handled` är enbart "tystas den just nu?", och är avsiktligt
    // INTE samma sak: en kvitterad post som gått in i sista anflygningen har en
    // kvittens men tystas inte längre.
    const events = [...materializeObligations(profile, idag, till).map(obligationToEvent), ...egnaEvents]
      .map(e => {
        const k = perId.get(e.id)
        if (!k) return e
        return { ...e, kvittens: k, handled: suppresses(k, idag) }
      })
    const sorterade = sortByUrgency(events, idag)

    // Förslagen till "Lägg till"-modalen — deterministiska, filtrerade på
    // profilen, årstiden och vad som redan finns (se lib/karin/event-suggestions.ts).
    const suggestions = suggestEvents({
      companyForm: profile.company_form ?? null,
      employeeCount: (rad.employee_count as number) ?? null,
      fiscalYearEndMonth: profile.fiscal_year_end_month ?? null,
      existingTitles: events.map(e => e.title),
      today: idag,
    })

    return NextResponse.json({
      profile,
      // Vad som fattas för att kalendern ska kunna säga något vettigt.
      missing: missingProfileFields(profile),
      attention: sorterade.filter(e => needsAttention(e, idag)).slice(0, 5),
      months: groupByMonth(events),
      total: events.length,
      window_days: dagar,
      suggestions,
    })
  } catch (err: any) {
    console.error('[karin/calendar] oväntat fel:', err)
    return NextResponse.json({ error: err?.message || 'Serverfel' }, { status: 500 })
  }
}

/**
 * POST /api/karin/calendar — kvittera, skjut upp eller ångra.
 *
 * Body: `{ event_id: string, action: 'acknowledge' | 'snooze' | 'undo', until?: 'YYYY-MM-DD' }`
 *
 * Det gamla formatet `{ event_id, handled: boolean }` accepteras fortfarande och
 * tolkas som kvittera respektive ångra.
 *
 * ═══ INGEN ÅTGÄRD PÅSTÅR ATT NÅGOT ÄR INLÄMNAT ═══
 *
 * Det finns med flit inget `completed`. Vi kan inte verifiera att en deklaration
 * lämnats in — och de sista dagarna före förfall går inte att tysta med någon av
 * åtgärderna. Se lib/karin/handled-store.ts.
 *
 * Lagras i `business_preferences` under en enda nyckel. Listan gallras vid varje
 * skrivning så den inte växer för alltid.
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

    // Åtgärden. Gamla `handled`-formatet mappas så en klient som inte hunnit
    // uppdateras inte går sönder.
    const action: string = typeof body?.action === 'string'
      ? body.action
      : body?.handled === false ? 'undo' : 'acknowledge'

    // Aktören sparas för att en tystad påminnelse ska gå att härleda till en
    // människa. Utan den är en avbockning ett påstående utan avsändare.
    const actor = currentUser.name || currentUser.email || currentUser.user_id || null

    let andring: KvittensAndring
    if (action === 'undo') {
      andring = null
    } else if (action === 'snooze') {
      const until = body?.until
      if (typeof until !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(until)) {
        return NextResponse.json({ error: 'until krävs som YYYY-MM-DD' }, { status: 400 })
      }
      andring = { state: 'snoozed', actor, until }
    } else if (action === 'acknowledge') {
      andring = { state: 'acknowledged', actor }
    } else {
      return NextResponse.json({ error: 'okänd åtgärd' }, { status: 400 })
    }

    const nuvarande = parseEntries((pref as { value?: string } | null)?.value)
    const nasta = applyKvittens(nuvarande, eventId, andring, new Date())

    const { error } = await supabase
      .from('business_preferences')
      .upsert({
        business_id: business.business_id,
        key: HANDLED_KEY,
        value: serializeEntries(nasta),
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
