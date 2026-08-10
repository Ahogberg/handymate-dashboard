import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { arTestdataObservation } from '@/lib/testdata'

export const dynamic = 'force-dynamic'

/**
 * GET /api/observations
 *
 * Lista active observations från business_knowledge för authenticated
 * business. Default LIMIT 5, sorterat by created_at DESC (senaste först).
 *
 * Query-params:
 * - limit (default 5, max 50)
 * - agent_id (filter, t.ex. 'karin')
 *
 * Returnerar { observations: Array<...> } för TeamObservationsCard.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ═══ ROLLGRIND (2026-08-07) ═══
    //
    // Rutten körde tidigare bara getAuthenticatedBusiness — som faller
    // tillbaka på business_users-uppslagning och alltså släpper in ANSTÄLLDA.
    // Karins observationer handlar om ekonomi (marginaler, obetalda fakturor,
    // förfallna kundfordringar) och Lars om projektlönsamhet. Allt det har
    // legat öppet för hela personalen.
    //
    // Det blir värre i samma sekund bolagskalendern börjar skriva hit —
    // moms, preliminärskatt och bokslut är inget en montör ska se i förbifarten.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Endast ägare och administratör' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const url = request.nextUrl
    const limitRaw = parseInt(url.searchParams.get('limit') || '5', 10)
    const limit = Math.min(Math.max(1, isNaN(limitRaw) ? 5 : limitRaw), 50)
    const agentId = url.searchParams.get('agent_id')

    let query = supabase
      .from('business_knowledge')
      .select('id, agent_id, knowledge_type, title, observation, suggestion, confidence, data_basis, related_approval_id, created_at')
      .eq('business_id', business.business_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (agentId) {
      query = query.eq('agent_id', agentId)
    }

    const { data, error } = await query

    if (error) {
      console.error('[observations/GET] query error:', error)
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          stage: 'business_knowledge_query',
        },
        { status: 500 },
      )
    }

    // Agera-återvändsgränds-fixen (2026-08-05, Andreas fynd): en observation
    // lever längre (dedup-fönster i dagar) än sin länkade approval (3 dagars
    // expiry, eller redan hanterad från annan yta). UI:t visar Agera-knappen
    // när related_approval_id finns — utan denna koll leder den då till en
    // tom kö utan kort att agera på. Nolla länken när approvalen inte längre
    // är pending; ett fel i kollen får aldrig fälla svaret (degradera till
    // ofiltrerat, dvs. dagens beteende).
    // Testdata-filter (2026-08-10): observationer härledda ur e2e-rader
    // ("E2E Testkund", test_-id:n i data_basis) göms vid läsning.
    let observations = (data || []).filter((o: any) => !arTestdataObservation(o))
    try {
      const linkedIds = observations
        .map((o: any) => o.related_approval_id)
        .filter((id: any): id is string => Boolean(id))
      if (linkedIds.length > 0) {
        const { data: pendingRows } = await supabase
          .from('pending_approvals')
          .select('id')
          .eq('business_id', business.business_id)
          .eq('status', 'pending')
          .in('id', linkedIds)
        const pendingSet = new Set((pendingRows || []).map((r: any) => r.id))
        // ═══ ETT AVFÄRDAT KORT SKA INTE ÅTERUPPSTÅ SOM NYHET (2026-08-08) ═══
        //
        // Nollningen ovan är rätt för Agera-knappen, men den hade en
        // bieffekt ingen såg: hemskärmens nyhetsfilter testar bara
        // `!related_approval_id`. Ett beslutskort man precis avfärdat dök
        // därför upp igen längre ned på sidan, som en nyhetsrad.
        //
        // `had_approval` skiljer "hade aldrig ett kort" från "hade ett kort
        // som är hanterat". Klienten filtrerar på båda.
        observations = observations.map((o: any) =>
          o.related_approval_id && !pendingSet.has(o.related_approval_id)
            ? { ...o, related_approval_id: null, had_approval: true }
            : o,
        )
      }
    } catch (linkErr) {
      console.warn('[observations/GET] approval-länkkoll hoppades över:', linkErr)
    }

    return NextResponse.json({ observations })
  } catch (err: any) {
    console.error('[observations/GET] unexpected error:', err)
    return NextResponse.json(
      { error: err?.message || 'Serverfel', stage: 'unexpected' },
      { status: 500 },
    )
  }
}
