import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { analyzeQuoteBeforeSend } from '@/lib/daniel-intelligence'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/** GET /api/quotes/intelligence?quoteId=xxx — Business Twin Reality Check. */
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
    return NextResponse.json(response, { status: analysis.status === 'unavailable' ? 503 : 200 })
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
