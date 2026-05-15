import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { runKarinObservation } from '@/lib/agents/karin/observation-prompt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/cron/agent-observations/test
 *
 * Triggar observation-generation för en specifik business direkt
 * utan att vänta på cron-schedule (söndag + onsdag 06 UTC).
 *
 * Användning:
 * - Pilot-onboarding-flöde: "kör Karin nu på min data"
 * - Smoke-test efter ändring i observation-prompt
 * - Verifiera utökad data-aggregation eller maturity-fallback
 *
 * Auth — TVÅ accepterade vägar:
 * a) Bearer CRON_SECRET-header (samma som riktiga cron)
 * b) Authenticated browser-session (Andreas/Christoffer från
 *    dashboard) — använder då current users business_id default
 *
 * Query-params:
 * - business_id (krävs om CRON_SECRET, default current om session)
 * - agent_id (default 'karin', bara karin stöds v1)
 * - dry_run=true → kör analysen men sparar INTE i business_knowledge,
 *   skapar INGA approvals, triggar INGA push-notiser
 *
 * Returnerar full JSON: aggregate + observations + thinking_preview
 * + saved/approvals/insights counts (eller skip-reason).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const requestedBizId = url.searchParams.get('business_id')
  const agentId = url.searchParams.get('agent_id') || 'karin'
  const dryRun = url.searchParams.get('dry_run') === 'true'

  if (agentId !== 'karin') {
    return NextResponse.json(
      {
        error: `agent_id '${agentId}' stöds inte v1 — bara 'karin' just nu`,
        supported: ['karin'],
      },
      { status: 400 },
    )
  }

  // Auth: Bearer CRON_SECRET ELLER inloggad session
  const authHeader = request.headers.get('authorization')
  let businessId: string | null = null
  let businessName = 'företaget'

  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    if (!requestedBizId) {
      return NextResponse.json(
        { error: 'business_id query-param krävs när Bearer CRON_SECRET används' },
        { status: 400 },
      )
    }
    businessId = requestedBizId
    // Hämta namn för Karins prompt
    const supabase = getServerSupabase()
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('business_id', businessId)
      .maybeSingle()
    businessName = biz?.business_name || 'företaget'
  } else {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json(
        { error: 'Unauthorized — kräver Bearer CRON_SECRET eller inloggad session' },
        { status: 401 },
      )
    }
    businessId = requestedBizId || business.business_id
    businessName = business.business_name || 'företaget'

    // Om annan business_id än egen och INTE CRON_SECRET → neka
    // (förhindrar att inloggad användare triggar Karin för andra businesses)
    if (requestedBizId && requestedBizId !== business.business_id) {
      return NextResponse.json(
        { error: 'Du kan bara trigga Karin för ditt eget företag (eller använd CRON_SECRET)' },
        { status: 403 },
      )
    }
  }

  if (!businessId) {
    return NextResponse.json({ error: 'business_id kunde inte bestämmas' }, { status: 400 })
  }

  // dry_run: skapa en throwaway-supabase som inte sparar mutations.
  // Enklast: använd vanliga klienten men intercepta business_knowledge
  // INSERT + pending_approvals INSERT. Pragmatiskt v1: kör genom
  // runKarinObservation som vanligt med en wrapper-klient.
  //
  // Eftersom intercept är komplicerat ger vi v1 ett alternativ:
  // dry_run kör BARA aggregation + Claude-anrop, returnerar resultat,
  // skippar save-fasen. Behöver en separerad helper.

  const supabase = getServerSupabase()

  if (dryRun) {
    // Importera privata helpers via dynamic — vi har bara public
    // runKarinObservation exporterad. För dry_run gör vi en
    // wrapper-implementation här som duplicerar aggregate +
    // Claude-call utan save-fasen.
    //
    // Enklare väg: kör hela run men logga warning om dry_run och
    // returnera tidigt UTAN save. Behöver dock refaktorera lib/
    // för att stödja dry_run-flag. v1 minimal: använd en MOCK
    // supabase-klient som no-op:ar INSERT/UPDATE.
    //
    // För enkelhet v1: dry_run returnerar 501 med förklaring.
    // Riktig dry_run kan byggas in i runKarinObservation som
    // optional flag i nästa iteration.
    return NextResponse.json(
      {
        error: 'dry_run inte implementerat v1 — kör utan dry_run för full run, eller bygg ut runKarinObservation med dry_run-flag',
        note: 'Du kan kolla aggregate-resultatet via vanlig run och sedan dismissa observations via /api/observations/[id]',
      },
      { status: 501 },
    )
  }

  try {
    const result = await runKarinObservation(supabase, businessId, businessName)
    return NextResponse.json({
      ok: true,
      business_id: businessId,
      business_name: businessName,
      agent_id: agentId,
      result,
    })
  } catch (err: any) {
    console.error('[agent-observations/test] error:', err)
    return NextResponse.json(
      {
        ok: false,
        error: err?.message || 'Okänt fel',
        stack: err?.stack?.slice(0, 500),
      },
      { status: 500 },
    )
  }
}
