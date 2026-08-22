import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { computeInstantValue } from '@/lib/onboarding/instant-value'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding/instant-value
 *
 * Onboardingens "payoff": DETERMINISTISK, synkron sammanfattning av kundens
 * NYSS importerade data — inget cron, ingen agent, inga externa anrop. Detta
 * ger LiveTour (steg 6) den EMOTIONELLA toppen: "Karin har hittat 3 förfallna
 * fakturor värda 45 000 kr", räknat direkt ur databasen.
 *
 * Rutten är ett tunt lager: den hämtar rader ur databasen och delegerar ALL
 * beräkning till lib/onboarding/instant-value.ts (ren, enhetstestad). Se den
 * filen för ärlighets-/prioritetslogiken.
 *
 * Snabb (<1s): några count/sum-queries scope:ade på business_id. Ingen skrivning,
 * inga utskick, inga agent-körningar.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Rollgrind (2026-08-11, behörighetskontraktet): getAuthenticatedBusiness
  // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
  // Onboardingen körs i praktiken alltid av ägaren (som alltid har
  // see_financials), så grinden stör aldrig den riktiga onboarding-resan.
  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id

  // Obetalda fakturor (samma konvention som cash-radar-data: status IN
  // ('sent','overdue'), belopp = total). Öppna deals filtreras via stage-flaggor.
  // 90-dagarsfönstret för genomgångens counts — samma period som
  // agentobservationerna analyserar. Bara head-counts: onboardingen får
  // aldrig vänta på tung analys.
  const nittioDagar = new Date(Date.now() - 90 * 86_400_000).toISOString()

  const [invoicesRes, paidInvoicesRes, customerRes, dealRows, stagesRes, quotesCountRes, projectsCountRes, invoicesCountRes] = await Promise.all([
    supabase
      .from('invoice')
      .select('total, status')
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue'])
      .limit(5000),
    // Betald historik (2026-08-15, Fortnox-historik-widening) — stödjande
    // statistik för payoff-heron, se lib/onboarding/instant-value.ts.
    supabase
      .from('invoice')
      .select('total, invoice_date')
      .eq('business_id', businessId)
      .eq('status', 'paid')
      .limit(5000),
    supabase
      .from('customer')
      .select('customer_id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('deal')
      .select('value, stage_id')
      .eq('business_id', businessId)
      .limit(2000),
    supabase
      .from('pipeline_stage')
      .select('id, is_won, is_lost')
      .eq('business_id', businessId),
    supabase
      .from('quotes')
      .select('quote_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', nittioDagar),
    supabase
      .from('project')
      .select('project_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', nittioDagar),
    // invoice_date, inte created_at: Fortnox-importerade fakturor (onboarding
    // steg 5) bevarar sitt riktiga invoice_date men får created_at stämplat
    // med import-ögonblicket — created_at hade räknat gammal, historisk
    // fakturering som "senaste 90 dagarna".
    supabase
      .from('invoice')
      .select('invoice_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('invoice_date', nittioDagar),
  ])

  const result = computeInstantValue({
    invoices: invoicesRes.data ?? [],
    customerCount: customerRes.count ?? 0,
    deals: dealRows.data ?? [],
    stages: stagesRes.data ?? [],
    quotesAnalyzed: quotesCountRes.count ?? 0,
    projectsAnalyzed: projectsCountRes.count ?? 0,
    invoicesAnalyzed: invoicesCountRes.count ?? 0,
    paidInvoices: paidInvoicesRes.data ?? [],
  })

  return NextResponse.json(result)
}
