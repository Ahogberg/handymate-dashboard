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
 *   - FAIL-CLOSED (ändrat 2026-08-15, Andreas beslut efter Codex fynd P0):
 *     kan konfig/projekt inte läsas — vare sig via ett Supabase-fel eller
 *     en kastad exception — blockeras stängningen. Ursprungsversionen
 *     (2026-08-09) tänkte "fail-open, men med error satt så anroparen
 *     själv får välja" — i praktiken läste ingen av de tre dörrarna
 *     `.error`, bara `.gated`, så en transient läshicka på ETT konto med
 *     fyra ögon påslaget stängde tysta miljonprojekt förbi kontrollen.
 *     En blockerad stängning är synlig och går att försöka igen; en
 *     kringgången kontroll är osynlig. `reason` skiljer det overifierbara
 *     låget ('verification_failed') från ett äkta väntande kort
 *     ('approval_required') så anroparen kan visa rätt besked.
 */

export interface FourEyesGateResult {
  /** Sant = stäng INTE projektet — antingen väntar ett kort, eller så gick grinden inte att verifiera säkert. */
  gated: boolean
  /** Varför grinden slog till — avgör vilket besked anroparen ska visa. */
  reason?: 'approval_required' | 'verification_failed'
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
    const { data: config, error: configError } = await supabase
      .from('business_config')
      .select('four_eyes_enabled, four_eyes_threshold_sek')
      .eq('business_id', businessId)
      .single()

    if (configError) {
      console.error('[four-eyes-gate] business_config kunde inte läsas — blockerar fail-closed:', configError.message, { businessId, projectId })
      return { gated: true, reason: 'verification_failed', error: configError.message }
    }

    if (!config?.four_eyes_enabled) return { gated: false }

    const { data: project, error: projectError } = await supabase
      .from('project')
      .select('budget_amount, name')
      .eq('project_id', projectId)
      .eq('business_id', businessId)
      .single()

    if (projectError) {
      console.error('[four-eyes-gate] project kunde inte läsas — blockerar fail-closed:', projectError.message, { businessId, projectId })
      return { gated: true, reason: 'verification_failed', error: projectError.message }
    }

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

    if (existing) return { gated: true, approvalId: existing.id, budgetAmount, reason: 'approval_required' }

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
      return { gated: true, reason: 'verification_failed', budgetAmount, error: insertError.message }
    }

    return { gated: true, approvalId, budgetAmount, reason: 'approval_required' }
  } catch (err: any) {
    console.error('[four-eyes-gate] kontrollen kastade — blockerar fail-closed:', err?.message || err, { projectId })
    return { gated: true, reason: 'verification_failed', error: err?.message || 'okänt fel' }
  }
}
