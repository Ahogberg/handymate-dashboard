import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { canActOnApproval, type ApprovalRoutingRow } from '@/lib/approvals/routing'
import { arTestdataApproval } from '@/lib/testdata'
import { hittaProjektCase, CASE_APPROVAL_TYPES, type CasebarApproval } from '@/lib/jarvis/project-case'
import { deriveProjectReality } from '@/lib/projects/project-reality'

export const dynamic = 'force-dynamic'

/**
 * GET /api/project-cases
 *
 * Cross-Agent Case (Business Twin-epiken, 2026-08-14) — egen hämtning, samma
 * skäl som /api/next-best-action: JarvisHomes vanliga kö (/api/approvals?
 * status=pending) är kapad till 15 senaste, en signal som hör till ett case
 * kan vara äldre än så.
 *
 * Hämtar pending approvals av CASE_APPROVAL_TYPES, filtrerar testdata +
 * behörighet (samma väg som huvudkön), grupperar till projekt-case via
 * hittaProjektCase (lib/jarvis/project-case.ts), och komponerar varje
 * case-projekts verklighet (fas + ekonomi) via deriveProjectReality
 * (lib/projects/project-reality.ts).
 *
 * Marginal visas ALDRIG utan KÄNT/UPPSKATTAT-märkning, och ALDRIG alls om
 * arbetskostnad inte är konfigurerad eller projektet är tomt — samma
 * ärlighetskontrakt som resten av godkännande-kön (Kvittoprincipen: en
 * summa är inte en åsikt, men den får heller aldrig låtsas vara säkrare
 * än den är).
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const currentUser = await getCurrentUser(request)
    if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    const { data: approvalRows, error: approvalErr } = await supabase
      .from('pending_approvals')
      .select('*')
      .eq('business_id', business.business_id)
      .eq('status', 'pending')
      .in('approval_type', [...CASE_APPROVAL_TYPES])
    if (approvalErr) throw approvalErr

    const visibleRows = ((approvalRows || []) as ApprovalRoutingRow[]).filter(row => !arTestdataApproval(row as any))
    const permits = await Promise.all(visibleRows.map(row => canActOnApproval(supabase, currentUser, row)))
    const permittedRows: CasebarApproval[] = visibleRows
      .filter((_, i) => permits[i])
      .map(row => ({
        id: (row as any).id,
        approval_type: (row as any).approval_type,
        title: (row as any).title,
        payload: (row as any).payload,
      }))

    const projectCases = hittaProjektCase(permittedRows)

    const cases = await Promise.all(projectCases.map(async pc => {
      const reality = await deriveProjectReality(supabase, business.business_id, pc.project_id)
      const marginalKand = !!reality
        && reality.economics.marginal.arbetskostnad_konfigurerad
        && !reality.economics.marginal.är_tomt

      return {
        project_id: pc.project_id,
        name: pc.project_name,
        signals: pc.signals,
        reality: reality ? {
          fasLabel: reality.lifecycle.label,
          marginalPct: marginalKand ? reality.economics.marginal.marginal_pct : null,
          marginalKind: marginalKand
            ? (reality.economics.marginal.kostnad_sannolikt_komplett ? 'KÄNT' : 'UPPSKATTAT')
            : null,
          forvantadIntaktKr: reality.economics.intakter.forvantad_intakt_kr,
        } : null,
      }
    }))

    return NextResponse.json({ cases })
  } catch (error: any) {
    console.error('GET /api/project-cases error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
