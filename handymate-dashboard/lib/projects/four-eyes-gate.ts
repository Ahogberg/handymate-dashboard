import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Four-eyes-grinden för projektstängning — EN definition, alla dörrar
 * (2026-08-09, projektauditen P1-5 + sidodörren i booking/complete-job).
 *
 * ═══ VARFÖR EN DELAD FUNKTION ═══
 *
 * Grinden fanns bara i PUT /api/projects — och gick dessutom att kringgå med
 * ett body-belopp. När den lagades återstod sidodörren: mobilens
 * complete-job stänger projektet direkt när sista bokningen bockas av, utan
 * att fråga. En policy med två dörrar och ett lås är ingen policy.
 *
 * Regler:
 *   - Beslutet fattas ALLTID på databasens budget_amount — aldrig klientens.
 *   - Ett pending-kort återanvänds; upprepade försök ger inte kort på hög.
 *   - Fail-open är avsiktligt fel riktning här: kan konfig/projekt inte
 *     läsas svarar grinden gated=false men med error satt, så anroparen
 *     själv får välja. Stängningsvägar som redan är i drift ska inte börja
 *     440:a för att en konfigläsning hickade.
 */

export interface FourEyesGateResult {
  /** Sant = stäng INTE projektet; ett godkännandekort väntar i stället. */
  gated: boolean
  approvalId?: string
  /** Projektets databasvärde — för anroparens besked till användaren. */
  budgetAmount?: number
  error?: string
}

export async function checkFourEyesGate(
  supabase: SupabaseClient,
  businessId: string,
  projectId: string,
): Promise<FourEyesGateResult> {
  try {
    const { data: config } = await supabase
      .from('business_config')
      .select('four_eyes_enabled, four_eyes_threshold_sek')
      .eq('business_id', businessId)
      .single()

    if (!config?.four_eyes_enabled) return { gated: false }

    const { data: project } = await supabase
      .from('project')
      .select('budget_amount, name')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .single()

    const budgetAmount = project?.budget_amount || 0
    const threshold = config.four_eyes_threshold_sek || 50000
    if (budgetAmount < threshold) return { gated: false }

    // Ett pending-kort per projekt — upprepade stängningsförsök återanvänder.
    const { data: existing } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'four_eyes_project_close')
      .eq('status', 'pending')
      .contains('payload', { project_id: projectId })
      .limit(1)
      .maybeSingle()

    if (existing) return { gated: true, approvalId: existing.id, budgetAmount }

    const approvalId = `appr_4e_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
    const { error: insertError } = await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: businessId,
      approval_type: 'four_eyes_project_close',
      // Etapp 3b (multi-employee-parity-plan.md): kö-routing.
      routing_role: 'owner_admin',
      title: `Projektstängning kräver godkännande — ${budgetAmount.toLocaleString('sv-SE')} kr`,
      description: `Projektets värde överstiger gränsen på ${threshold.toLocaleString('sv-SE')} kr.`,
      payload: { project_id: projectId, budget_amount: budgetAmount, threshold },
      status: 'pending',
      risk_level: 'high',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })

    if (insertError) {
      // Kortet gick inte att skapa — men grinden GÄLLER fortfarande.
      // Att stänga för att kön var trasig vore att låta felet öppna låset.
      console.error('[four-eyes-gate] kortet kunde inte skapas:', insertError.message, { projectId })
      return { gated: true, budgetAmount, error: insertError.message }
    }

    return { gated: true, approvalId, budgetAmount }
  } catch (err: any) {
    console.error('[four-eyes-gate] kontrollen kastade:', err?.message || err, { projectId })
    return { gated: false, error: err?.message || 'okänt fel' }
  }
}
