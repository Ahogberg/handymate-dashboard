import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { analyzeQuoteBeforeSend } from '@/lib/daniel-intelligence'

/**
 * GET /api/quotes/intelligence?quoteId=xxx
 * Daniels offert-intelligens — analyserar innan skickning.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const quoteId = request.nextUrl.searchParams.get('quoteId')
    if (!quoteId) {
      return NextResponse.json({ error: 'Missing quoteId' }, { status: 400 })
    }

    const analysis = await analyzeQuoteBeforeSend(quoteId, business.business_id)

    return NextResponse.json({
      analysis,
      has_warning: analysis?.show_warning || false,
    })
  } catch (error: any) {
    console.error('[quote-intelligence] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
