import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { computeInstantValue, type InstantHeadline } from '@/lib/onboarding/instant-value'
import { OPEN_QUOTE_STATUSES } from '@/lib/quotes/statuses'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/onboarding/company-scan
 *
 * Underlaget för Company Scan (tasks/jaunty-pondering-hummingbird.md) —
 * dashboardens allra första ögonblick, INNAN Hemturen. Matte sätter upp
 * firman med ✓-rader byggda på riktiga tal ur databasen; ingen rad är
 * påhittad och en rad med n=0 utelämnas hellre än att visas som antiklimax
 * (komponenten CompanyScan.tsx äger den regeln, den här rutten levererar
 * bara råa tal).
 *
 * Samma ägargrind som /api/onboarding/instant-value (see_financials) —
 * onboardingen körs i praktiken alltid av ägaren, så grinden stör aldrig
 * den riktiga resan. En anställd utan ekonomibehörighet får 403 här;
 * CompanyScan hoppar då hela skannen fail-safe (kraschar aldrig).
 *
 * Snabbt och tunt: några count/sum-queries scope:ade på business_id, ingen
 * skrivning, inga agentkörningar. Karin-fyndet delegeras till samma rena
 * beräkningsmotor som instant-value (computeInstantValue/pickHeadline) —
 * ingen ny sanning om samma kronor.
 */

export interface CompanyScanResult {
  customerCount: number
  openInvoicesCount: number
  activeProjectsCount: number
  openQuotesCount: number
  staleQuotesCount: number
  pendingApprovalsCount: number
  /**
   * Karins krona-fynd, bara satt när headline verkligen ÄR Karins (förfallet
   * eller obetalt > 0) — pickHeadline kan annars falla tillbaka på Daniel/
   * Hanna/Lisa, och den här raden i skannen är uttryckligen Karins rad.
   */
  karinHeadline: InstantHeadline | null
}

const STALE_QUOTE_DAYS = 5 // samma cadence som pengar-sidan (app/api/dashboard/pengar/route.ts)

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request, business.business_id)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const staleGrans = new Date(Date.now() - STALE_QUOTE_DAYS * 86_400_000).toISOString()

  const [invoicesRes, customerRes, projectsRes, quotesRes, pendingRes] = await Promise.all([
    // Öppna fakturor (sent/overdue) — samma konvention som cash-radarn och
    // instant-value. Radernas total+status matas rakt in i computeInstantValue
    // nedan, som ger både antal och Karins ev. krona-fynd på samma gång.
    supabase
      .from('invoice')
      .select('total, status')
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue'])
      .limit(5000),
    supabase
      .from('customer')
      .select('customer_id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('project')
      .select('project_id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'active'),
    // Öppna offerter — samma rader ger både totalantalet och den gamla
    // delmängden (>5 dagar sedan sent_at, pengar-sidans stale-regel).
    supabase
      .from('quotes')
      .select('sent_at')
      .eq('business_id', businessId)
      .in('status', [...OPEN_QUOTE_STATUSES])
      .limit(5000),
    // Väntande kort — inkluderar startkorten (team_intro) som redan ligger i
    // kön när importen är klar.
    supabase
      .from('pending_approvals')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'pending'),
  ])

  // Ren beräkning, delad med onboardingens payoff — inga deals/stages här
  // (skannen har ingen affärsrad), pickHeadline faller då tillbaka på
  // fakturorna eller kundantalet precis som väntat.
  const instant = computeInstantValue({
    invoices: invoicesRes.data ?? [],
    customerCount: customerRes.count ?? 0,
    deals: [],
    stages: [],
  })

  const quoteRows = quotesRes.data ?? []
  const staleQuotesCount = quoteRows.filter(q => q.sent_at && q.sent_at < staleGrans).length

  const result: CompanyScanResult = {
    customerCount: instant.customer_count,
    // unpaid_count = fakturor med status IN ('sent','overdue') — exakt samma
    // definition som queryn ovan redan filtrerat på.
    openInvoicesCount: instant.unpaid_count,
    activeProjectsCount: projectsRes.count ?? 0,
    openQuotesCount: quoteRows.length,
    staleQuotesCount,
    pendingApprovalsCount: pendingRes.count ?? 0,
    karinHeadline: instant.headline.agent === 'Karin' ? instant.headline : null,
  }

  return NextResponse.json(result)
}
