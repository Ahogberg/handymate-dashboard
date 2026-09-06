import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { analyzeQuoteBeforeSend } from '@/lib/daniel-intelligence'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { AGENTRAD_MIN_SAMPLE, type AgentradEvidence } from '@/lib/daniel-agentrad'
import { getDanielAgentradEvidence } from '@/lib/daniel-agentrad-evidence'

// force-dynamic: läser auth via getAuthenticatedBusiness (cookies/headers) —
// utan detta kan Next cachea svaret statiskt vid bygget.
export const dynamic = 'force-dynamic'

/**
 * GET /api/quotes/intelligence?quoteId=xxx — Business Twin Reality Check.
 *
 * Svaret bär dessutom `agentrad` (Daniels agentrad på offertsidan,
 * lib/daniel-agentrad.ts): bevisen bakom varningen — exempelprojekt,
 * "N av M tog mer tid" och senaste debrief-lärdomen. Fältet är null när
 * raden inte är motiverad (ingen varning, färre än tre jobb, offerten är
 * inte längre ett utkast) så QuoteSendModal kan ignorera det helt.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const quoteId = request.nextUrl.searchParams.get('quoteId')
    if (!quoteId || !/^[a-zA-Z0-9_-]{1,160}$/.test(quoteId)) {
      return NextResponse.json({ error: 'Ogiltig offertreferens' }, { status: 400 })
    }

    const analysis = await analyzeQuoteBeforeSend(quoteId, business.business_id)
    const response = !hasPermission(currentUser, 'see_financials') && analysis.analysis
      ? {
          ...analysis,
          analysis: {
            ...analysis.analysis,
            financial_jobs: 0,
            avg_realized_margin_pct: null,
          },
        }
      : analysis

    // Agentradens bevis hämtas bara när verklighetskontrollen redan varnar
    // på ett tillräckligt urval — samma grind som raden själv använder.
    let agentrad: AgentradEvidence | null = null
    if (
      analysis.status === 'ready'
      && analysis.show_warning
      && analysis.analysis
      && analysis.analysis.similar_jobs >= AGENTRAD_MIN_SAMPLE
    ) {
      agentrad = await getDanielAgentradEvidence(getServerSupabase(), business.business_id, quoteId)
    }

    return NextResponse.json({ ...response, agentrad }, { status: analysis.status === 'unavailable' ? 503 : 200 })
  } catch (error: any) {
    console.error('[quote-intelligence] Error:', error)
    return NextResponse.json({
      status: 'unavailable',
      show_warning: false,
      analysis: null,
      reason: 'Verklighetskontrollen kunde inte köras.',
    }, { status: 500 })
  }
}
