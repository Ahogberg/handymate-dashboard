import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { computeProjectEconomics, type ProjectEconomics } from '@/lib/projects/compute-economics'
import { computeGuardianVarningForProject, getExplicitMarginTarget } from '@/lib/profitability'
import type { LonsamhetsVarning } from '@/lib/projects/margin-guardian'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

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

    // Rollgrind (2026-08-06, behörighetskontraktet): getAuthenticatedBusiness
    // avgör vilket FÖRETAG anropet gäller — inte vad användaren får se i det.
    const currentUser = await getCurrentUser(request, business.business_id)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
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

    // ROT/RUT-fotrad (Projektvy Fas 2, 2026-07-31): projektets kopplade
    // offert äger de redan lagrade ROT/RUT-fälten — lib/rot-rut.ts gör
    // beräkningen vid offert-skapande/uppdatering. Vi vidarebefordrar
    // ENDAST lagrade kolumner, ingen omräkning här (se ProjectEconomics.
    // quote_rot_rut docstring i compute-economics.ts).
    economics.quote_rot_rut = await getQuoteRotRut(supabase, params.id, business.business_id)

    // Kvittoprincipen Fall 2 (docs/design/SYNLIG-INTELLIGENS.md, 2026-08-13):
    // samma kanoniska bedömning som skriver godkännandekortet, beräknad
    // live här — "så länge motorn flaggar projektet", oavsett om kortet
    // finns kvar eller redan hanterats. Icke-blockerande: ett fel här ska
    // aldrig fälla resten av ekonomisvaret.
    let guardian: LonsamhetsVarning | null = null
    try {
      const { data: projectRow } = await supabase
        .from('project')
        .select('name, budget_hours')
        .eq('project_id', params.id)
        .eq('business_id', business.business_id)
        .maybeSingle()
      const marginTargetPercent = await getExplicitMarginTarget(supabase, business.business_id)
      guardian = await computeGuardianVarningForProject(supabase, business.business_id, {
        project_id: params.id,
        name: projectRow?.name ?? null,
        budget_hours: projectRow?.budget_hours ?? null,
      }, marginTargetPercent)
    } catch (guardianErr) {
      console.error('[profitability] Guardian-beräkning misslyckades (icke-blockerande):', guardianErr)
    }

    return NextResponse.json({ ...economics, guardian })
  } catch (error: any) {
    console.error('Get profitability error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Hämtar ROT/RUT-fält från projektets kopplade offert (om någon).
 * Ren vidarebefordran av lagrade quotes-kolumner — se
 * ProjectEconomics['quote_rot_rut'] i compute-economics.ts för
 * kontrakt och fallback-regler. Fält som är null utelämnas ur svaret.
 */
async function getQuoteRotRut(
  supabase: SupabaseClient,
  projectId: string,
  businessId: string,
): Promise<ProjectEconomics['quote_rot_rut']> {
  const { data: projectRow } = await supabase
    .from('project')
    .select('quote_id')
    .eq('project_id', projectId)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!projectRow?.quote_id) return null

  const { data: quoteRow } = await supabase
    .from('quotes')
    .select('rot_rut_type, rot_work_cost, rot_deduction, rot_rut_deduction, rut_work_cost, rut_deduction, customer_pays')
    .eq('quote_id', projectRow.quote_id)
    .eq('business_id', businessId)
    .maybeSingle()

  if (!quoteRow || (quoteRow.rot_rut_type !== 'rot' && quoteRow.rot_rut_type !== 'rut')) {
    return null
  }

  // rot_deduction har legacy-fallback till rot_rut_deduction, exakt som
  // app/api/quotes/pdf/route.ts gör (offerter skapade innan ROT/RUT-
  // splitten infördes har bara den kombinerade legacy-kolumnen ifylld).
  const fields: Record<string, number | string | null | undefined> = {
    rot_rut_type: quoteRow.rot_rut_type,
    rot_work_cost: quoteRow.rot_work_cost,
    rot_deduction: quoteRow.rot_deduction ?? quoteRow.rot_rut_deduction,
    rut_work_cost: quoteRow.rut_work_cost,
    rut_deduction: quoteRow.rut_deduction,
    customer_pays: quoteRow.customer_pays,
  }

  const result: Record<string, number | string> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== null && value !== undefined) result[key] = value
  }

  // rot_rut_type är obligatoriskt för att raden ska vara meningsfull —
  // redan säkerställt av guard-checken ovan.
  return result as ProjectEconomics['quote_rot_rut']
}
