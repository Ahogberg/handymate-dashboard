/**
 * Project Debrief Capture (2026-08-12).
 *
 * Skapar 'project_debrief'-kortet när ett projekt stängs. Kortet ställer
 * 2-3 korta frivilliga frågor ur efterkalkyl-deltat (lib/efterkalkyl/
 * freeze-outcome.ts) — svaren blir bekräftade lärdomar (project_lesson,
 * sql/v121_project_lesson.sql) som offertgenereringen läser vid nästa
 * liknande jobb (lib/ai-quote-generator.ts).
 *
 * Anropas från BÅDA dörrarna ett projekt kan stängas genom
 * (app/api/projects/route.ts PUT och app/api/booking/complete-job/route.ts)
 * — gemensam logik hit så de inte hinner gå isär.
 *
 * Fail-safe: kastar ALDRIG. Ett förlorat debrief-kort får aldrig fälla en
 * projektstängning.
 *
 * LIVSTIDS-DEDUPE: skapar inte kortet om det NÅGONSIN funnits ett
 * project_debrief-kort för samma project_id — oavsett status (pending,
 * approved, rejected, expired). Denna buggklass (dedupe som av misstag
 * filtrerar på status och därför skapar dubbletter för redan hanterade
 * kort) har bitit oss tre gånger tidigare, så: INGET statusfilter här.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { byggDebriefFragor } from '@/lib/debrief/build-debrief-questions'

export interface DebriefProjekt {
  project_id: string
  project_name?: string | null
  quote_id?: string | null
  job_type?: string | null
  hours_diff_pct?: number | null
  amount_diff_pct?: number | null
  margin_pct?: number | null
}

export async function skapaDebriefKort(
  supabase: SupabaseClient,
  businessId: string,
  projekt: DebriefProjekt,
): Promise<void> {
  try {
    if (!projekt.project_id) return

    // Livstids-dedupe — se filkommentaren. UTAN statusfilter, avsiktligt.
    const { data: existing, error: dedupeErr } = await supabase
      .from('pending_approvals')
      .select('id')
      .eq('business_id', businessId)
      .eq('approval_type', 'project_debrief')
      .contains('payload', { project_id: projekt.project_id })
      .limit(1)

    if (dedupeErr) {
      console.error('[skapaDebriefKort] dedupe-läsning misslyckades (fail-safe, skapar inte kortet):', dedupeErr.message)
      return
    }
    if (existing && existing.length > 0) return

    const questions = byggDebriefFragor({
      hours_diff_pct: projekt.hours_diff_pct ?? null,
      amount_diff_pct: projekt.amount_diff_pct ?? null,
    })

    const projektnamn = projekt.project_name?.trim() || 'projektet'

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      business_id: businessId,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      approval_type: 'project_debrief',
      title: `Hur gick ${projektnamn}?`,
      description: '30 sekunder — det du säger nu gör nästa offert på liknande jobb bättre.',
      risk_level: 'low',
      payload: {
        project_id: projekt.project_id,
        quote_id: projekt.quote_id ?? null,
        job_type: projekt.job_type ?? null,
        questions,
        hours_diff_pct: projekt.hours_diff_pct ?? null,
        amount_diff_pct: projekt.amount_diff_pct ?? null,
        agent_id: 'matte',
      },
    })

    if (insertErr) {
      console.error('[skapaDebriefKort] kunde inte skapa kortet:', insertErr.message)
    }
  } catch (err) {
    // Fail-safe: får aldrig fälla projektstängningen.
    console.error('[skapaDebriefKort] oväntat fel (fail-safe):', err)
  }
}
