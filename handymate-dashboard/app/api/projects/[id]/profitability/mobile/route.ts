import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { computeProjectEconomics } from '@/lib/projects/compute-economics'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * GET /api/projects/[id]/profitability/mobile
 * Optimerat svar för mobilappen — minimal payload.
 *
 * Migrerad (2026-08-12) från legacy lib/profitability.ts (calculateProfitability)
 * till den kanoniska ekonomimotorn (compute-economics.ts) — samma migrering
 * som Margin Guardian gjorde tidigare samma dag. Legacy-motorn läste stale
 * project.actual_labor_cost, en kolumn en DB-trigger fyllde med KUNDENS pris
 * (time_entry.hourly_rate) i stället för intern kostnad — falsk marginal.
 * Svarsformen nedan är oförändrad så mobilklienten (se
 * mobile-profitability-patch.md, annat repo) inte behöver ändras.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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

    const { id: projectId } = await params

    const supabase = getServerSupabase()
    const economics = await computeProjectEconomics(supabase, projectId, business.business_id)

    if (!economics) {
      return NextResponse.json({
        status: 'on_track',
        cost_percent: 0,
        margin: 0,
        message: 'Ingen budgetdata',
      })
    }

    const { intakter, kostnader, marginal } = economics

    // Samma golv-princip som Guardian (lib/projects/margin-guardian.ts): bas =
    // budget + signerad ÄTA, kandKostnad räknar arbete som 0 om intern
    // timkostnad inte kan bestämmas — konservativt, aldrig fabricerat.
    const bas = intakter.budget_amount + intakter.ata_signerat_kr
    const kandKostnad = (kostnader.arbete_kr ?? 0) + kostnader.material_inkop_kr + kostnader.extra_kr
    const costPercent = bas > 0 ? Math.round((kandKostnad / bas) * 100) : 0

    let status: 'on_track' | 'at_risk' | 'over_budget' = 'on_track'
    if (bas > 0) {
      if (costPercent > 95) status = 'over_budget'
      else if (costPercent > 75) status = 'at_risk'
    }

    // Ärlighetsprincip: marginal bara om intern timkostnad är konfigurerad —
    // annars gissar vi aldrig (se compute-economics.ts docstring).
    const margin = marginal.arbetskostnad_konfigurerad ? marginal.marginal_kr : null
    const marginPercent = marginal.arbetskostnad_konfigurerad ? marginal.marginal_pct : null

    let message: string
    if (bas <= 0) {
      message = 'Ingen budget satt'
    } else if (!marginal.arbetskostnad_konfigurerad) {
      message = 'Intern timkostnad ej konfigurerad'
    } else {
      message = `${costPercent}% av budget använt`
    }

    return NextResponse.json({
      status,
      cost_percent: costPercent,
      margin,
      margin_percent: marginPercent,
      message,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
