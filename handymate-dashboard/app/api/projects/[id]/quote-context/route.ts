import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getProjectQuoteContext } from '@/lib/projects/get-quote-context'

export const dynamic = 'force-dynamic'

/**
 * GET /api/projects/[id]/quote-context (Etapp 3.2, 2026-05-22).
 *
 * Returnerar offert-context (rader, textblock, PDF-länk) FRÅN ett
 * projekt via project.quote_id-referensen. Konsumeras av
 * ProjectQuoteSpec-komponenten i Offert-tabben.
 *
 * Roll-skydd: standard business-auth. Alla med projekt-access ser
 * offert-data (Andreas val 2026-05-22 — matchar att 'Visa offert'-
 * länken redan är synlig för alla). Om strikare gate behövs senare:
 * lägg till canSeeInternalCosts-mönster.
 *
 * has_quote=false vid saknat quote_id eller borttagen offert —
 * UI:n hanterar tomma vyn.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const context = await getProjectQuoteContext(
      supabase,
      params.id,
      business.business_id,
    )

    return NextResponse.json(context)
  } catch (error: any) {
    console.error('[quote-context] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
