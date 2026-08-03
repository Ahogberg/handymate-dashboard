/**
 * Motor 1 (Lärande prissättning) — Våg 2d (tasks/value-chain-plan.md).
 *
 * getProjectOutcome() läser den frusna efterkalkylen för ETT specifikt
 * projekt ur `project_outcome` (lib/efterkalkyl/freeze-outcome.ts skriver
 * raden). Skiljer sig från getEfterkalkylInsight (lib/efterkalkyl/
 * get-insight.ts) som är ett AGGREGAT över flera projekt av samma jobbtyp/
 * mall — detta är enskild-projekt-nivå, tänkt för Lars direkt vid
 * job_completed-triggern (efter att ett jobb avslutats).
 *
 * Fail-safe: kastar aldrig. Om raden inte finns än (t.ex. projektet
 * stängdes innan v73-migrationen kördes, eller detta är den allra första
 * läsningen efter frysning i samma request) görs ett on-demand-
 * frysningsförsök — samma lazy-backfill-princip som getEfterkalkylInsight —
 * men bara om projektet faktiskt är 'completed'. Om det fortfarande
 * misslyckas (tabellen saknas, projektet inte klart, etc.) returneras
 * found:false istället för att kasta.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { freezeProjectOutcome } from '@/lib/efterkalkyl/freeze-outcome'

export interface ProjectOutcomeReadResult {
  found: boolean
  project_id: string
  job_type: string | null
  template_id: string | null

  quoted_amount: number | null
  quoted_hours: number | null
  quoted_labor_kr: number | null
  quoted_material_kr: number | null

  actual_hours: number | null
  actual_labor_kr: number | null
  actual_material_purchase_kr: number | null
  actual_material_billable_kr: number | null
  ata_signed_kr: number | null
  invoiced_kr: number | null
  margin_kr: number | null
  margin_pct: number | null

  hours_diff_pct: number | null
  amount_diff_pct: number | null

  closed_at: string | null
  /** true om projektet finns men ännu inte är 'completed' — ingen
      efterkalkyl att hämta än (skiljs från found:false/tabell saknas). */
  not_completed?: boolean
}

// `as const` kräver en enda strängliteral (ingen konkatenering) — annars
// faller Supabase-klientens .select()-typinferens tillbaka till
// GenericStringError, vilket gör `row`/`retried` otypade och spread nedan
// till ett TS2352-fel.
const OUTCOME_COLUMNS = 'job_type, template_id, quoted_amount, quoted_hours, quoted_labor_kr, quoted_material_kr, actual_hours, actual_labor_kr, actual_material_purchase_kr, actual_material_billable_kr, ata_signed_kr, invoiced_kr, margin_kr, margin_pct, hours_diff_pct, amount_diff_pct, closed_at' as const

function emptyResult(projectId: string, extra?: Partial<ProjectOutcomeReadResult>): ProjectOutcomeReadResult {
  return {
    found: false,
    project_id: projectId,
    job_type: null,
    template_id: null,
    quoted_amount: null,
    quoted_hours: null,
    quoted_labor_kr: null,
    quoted_material_kr: null,
    actual_hours: null,
    actual_labor_kr: null,
    actual_material_purchase_kr: null,
    actual_material_billable_kr: null,
    ata_signed_kr: null,
    invoiced_kr: null,
    margin_kr: null,
    margin_pct: null,
    hours_diff_pct: null,
    amount_diff_pct: null,
    closed_at: null,
    ...extra,
  }
}

export async function getProjectOutcome(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<ProjectOutcomeReadResult> {
  try {
    const { data: row, error } = await supabase
      .from('project_outcome')
      .select(OUTCOME_COLUMNS)
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (error) {
      console.error('[get-project-outcome] läsning misslyckades, degraderar till found:false', error)
      return emptyResult(projectId)
    }

    if (row) {
      return { found: true, project_id: projectId, ...(row as Record<string, unknown>) } as ProjectOutcomeReadResult
    }

    // Ingen frusen rad — försök on-demand-frysning, men bara om projektet
    // faktiskt är avslutat (annars finns inget att jämföra ännu).
    const { data: project } = await supabase
      .from('project')
      .select('status')
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (!project) return emptyResult(projectId)
    if ((project as { status: string | null }).status !== 'completed') {
      return emptyResult(projectId, { not_completed: true })
    }

    await freezeProjectOutcome(supabase, businessId, projectId)

    const { data: retried } = await supabase
      .from('project_outcome')
      .select(OUTCOME_COLUMNS)
      .eq('business_id', businessId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (!retried) return emptyResult(projectId)
    return { found: true, project_id: projectId, ...(retried as Record<string, unknown>) } as ProjectOutcomeReadResult
  } catch (err) {
    console.error('[get-project-outcome] oväntat fel (fail-safe, degraderar till found:false)', { projectId, businessId, error: err })
    return emptyResult(projectId)
  }
}
