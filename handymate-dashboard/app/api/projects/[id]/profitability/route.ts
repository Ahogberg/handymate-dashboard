import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { computeProjectEconomics } from '@/lib/projects/compute-economics'

/**
 * GET /api/projects/[id]/profitability
 *
 * Returnerar ProjectEconomics-shape (Etapp 2.2, v53 2026-05-21).
 *
 * Bakgrund: tidigare returnerade routen en bredare shape (revenue/costs/
 * budget/invoicing/extra_costs/margin) baserat på inline-aggregation
 * direkt i routen. Andreas spec 2026-05-21 — 'en sanning': all beräkning
 * sker nu i lib/projects/compute-economics.ts (helpern). Routen är en
 * tunn HTTP-omslag runt helpern.
 *
 * Konsekvenser för andra konsumenter:
 * - /api/projects/[id]/profitability/mobile använder en separat lib
 *   (lib/profitability), opåverkad av denna ändring.
 * - Economy-tab på projekt-detalj-sidan använder nu
 *   ProjectEconomicsCard som förväntar sig ProjectEconomics-shape.
 * - extra_costs (project_cost-tabellen) och cost-modal-funktionalitet
 *   är temporärt urkopplade. Återinförs i Etapp 2.3 via helpern (TD-60).
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
    const economics = await computeProjectEconomics(
      supabase,
      params.id,
      business.business_id,
    )

    if (!economics) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    return NextResponse.json(economics)
  } catch (error: any) {
    console.error('Get profitability error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
