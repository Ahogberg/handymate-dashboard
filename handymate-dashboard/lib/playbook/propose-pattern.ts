/**
 * Playbook Pattern Confirmation V1 — kortflöde (Debrief → Playbook,
 * V2-lagret, tasks/todo.md "Playbook Pattern Confirmation V1" 2026-08-16
 * natt).
 *
 * Per business_id + job_type: läser bekräftade lärdomar (project_lesson),
 * kollar tre dedup-spärrar, och om inget hindrar och ett äkta mönster
 * upptäcks (lib/playbook/detect-pattern.ts) skapas ETT kort i
 * pending_approvals (approval_type='playbook_pattern_confirmation').
 * Godkännande skriver EN rad i business_knowledge — se
 * app/api/approvals/[id]/route.ts, case 'playbook_pattern_confirmation'.
 *
 * ═══ DEDUP (tre spärrar, alla måste passera) ═══
 *
 *   a) inget VÄNTANDE kort för samma jobbtyp redan.
 *   b) inget AKTIVT bekräftat mönster för samma jobbtyp redan (skulle
 *      annars föreslå att bekräfta samma sak två gånger).
 *   c) inget AVVISAT kort för samma jobbtyp inom de senaste 30 dagarna —
 *      en karens. Ägaren sa nej, och ska inte tjatas på direkt igen.
 *      Ingen egen "avvisad"-tabell behövs — historiken läses direkt ur
 *      pending_approvals (status='rejected', samma rad som redan finns).
 *
 * Fail-safe genomgående: varje enskild kontroll och själva kortskapandet
 * kastar aldrig. Ett förlorat mönsterförslag får aldrig fälla cron-svepet
 * som anropar denna funktion för flera jobbtyper i rad — samma princip
 * som lib/debrief/create-debrief-card.ts.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { rapporteraTystFel, arSchemaSaknas } from '@/lib/observability/driftlarm'
import { withDecisionRecord } from '@/lib/ai/decision-record'
import { detectPattern, MIN_SAMPLE_SIZE, type LessonForDetection } from './detect-pattern'

/** Karensen i dedup-gren c) — se filhuvudet. */
const REJECTION_COOLDOWN_DAYS = 30

/** 14 dagar — längre än debrief-kortets 7 (lib/debrief/create-debrief-card.ts):
 *  det här är inget tidskänsligt "hur gick det just nu"-ögonblick utan ett
 *  förslag ägaren kan behöva fundera på, gärna vid nästa lugna stund. */
const PATTERN_CARD_EXPIRES_DAYS = 14

/** Tak på hur många lärdomar som skickas till detektionen per jobbtyp —
 *  inte samma sak som MIN_SAMPLE_SIZE (golvet för att ens fråga). Utan tak
 *  skulle en jobbtyp med hundratals lärdomar blåsa upp prompten i onödan;
 *  50 senaste räcker gott för att hitta ett upprepat tema. */
const MAX_LESSONS_FOR_DETECTION = 50

export type ProposePatternResult =
  | 'created'
  | 'skipped_too_few_lessons'
  | 'skipped_pending_exists'
  | 'skipped_already_confirmed'
  | 'skipped_recently_rejected'
  | 'skipped_no_pattern_found'
  | 'skipped_error'

/**
 * Alla bekräftade lärdomar för en jobbtyp (obegränsat av V1:s
 * fetchRecentLessons-limit(3) — den här funktionen behöver tillräckligt
 * många rader för att kunna upptäcka en upprepning). Fail-safe: kastar
 * aldrig, degraderar till tom lista (samma arSchemaSaknas-guard som
 * lib/ai-quote-generator.ts).
 */
async function fetchLessonsForJobType(
  supabase: SupabaseClient,
  businessId: string,
  jobType: string,
): Promise<LessonForDetection[]> {
  try {
    const { data, error } = await supabase
      .from('project_lesson')
      .select('id, lesson_text, impact_hint, created_at')
      .eq('business_id', businessId)
      .eq('job_type', jobType)
      .order('created_at', { ascending: false })
      .limit(MAX_LESSONS_FOR_DETECTION)

    if (error) {
      console.error('[playbook/propose-pattern] lärdoms-läsning misslyckades (fail-safe, tom lista):', error.message)
      if (!arSchemaSaknas(error)) {
        await rapporteraTystFel(supabase, businessId, 'playbook/propose-pattern:fetchLessons', error.message, { jobType })
      }
      return []
    }
    return (data || []).map(row => ({
      id: (row as any).id as string,
      lesson_text: (row as any).lesson_text as string,
      impact_hint: ((row as any).impact_hint as string | null) ?? null,
      created_at: (row as any).created_at as string,
    }))
  } catch (err) {
    console.error('[playbook/propose-pattern] lärdoms-läsning kastade (fail-safe, tom lista):', err)
    if (!arSchemaSaknas(err)) {
      await rapporteraTystFel(
        supabase, businessId, 'playbook/propose-pattern:fetchLessons-unexpected',
        err instanceof Error ? err.message : String(err), { jobType },
      )
    }
    return []
  }
}

/** Dedup a) — redan ett väntande kort för samma jobbtyp. Osäkert DB-läge
 *  (fel vid läsningen) tolkas som "finns" — hellre missa ett förslag än
 *  riskera en dubblett. */
async function hasPendingCard(supabase: SupabaseClient, businessId: string, jobType: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('business_id', businessId)
    .eq('approval_type', 'playbook_pattern_confirmation')
    .eq('status', 'pending')
    .contains('payload', { job_type: jobType })
    .limit(1)

  if (error) {
    console.error('[playbook/propose-pattern] dedup a)-läsning misslyckades (fail-safe, hoppar):', error.message)
    return true
  }
  return !!data && data.length > 0
}

/** Dedup b) — redan ett aktivt bekräftat mönster för samma jobbtyp. Kan
 *  legitimt sakna kolumnen (v141 ej körd än) — arSchemaSaknas dämpar det
 *  fallet, men returnerar ändå "finns" (fail-safe: hellre inget nytt
 *  förslag än ett som krockar med en migration som inte körts). */
async function hasActiveConfirmedPattern(supabase: SupabaseClient, businessId: string, jobType: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('business_knowledge')
    .select('id')
    .eq('business_id', businessId)
    .eq('knowledge_type', 'pattern')
    .eq('job_type', jobType)
    .eq('status', 'active')
    .limit(1)

  if (error) {
    if (!arSchemaSaknas(error)) {
      console.error('[playbook/propose-pattern] dedup b)-läsning misslyckades (fail-safe, hoppar):', error.message)
    }
    return true
  }
  return !!data && data.length > 0
}

/** Dedup c) — avvisat inom karensen. */
async function wasRecentlyRejected(supabase: SupabaseClient, businessId: string, jobType: string): Promise<boolean> {
  const cutoffIso = new Date(Date.now() - REJECTION_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await supabase
    .from('pending_approvals')
    .select('id')
    .eq('business_id', businessId)
    .eq('approval_type', 'playbook_pattern_confirmation')
    .eq('status', 'rejected')
    .contains('payload', { job_type: jobType })
    .gte('resolved_at', cutoffIso)
    .limit(1)

  if (error) {
    console.error('[playbook/propose-pattern] dedup c)-läsning misslyckades (fail-safe, hoppar):', error.message)
    return true
  }
  return !!data && data.length > 0
}

/** Svensk kortcopy, terse Matte/Daniel-ton — samma register som
 *  skapaDebriefKort/buildCopy i cron/expectation-drift. */
function buildCardCopy(jobType: string, patternText: string, sampleCount: number): { title: string; description: string } {
  return {
    title: `Mönster upptäckt: ${jobType}`,
    description: `"${patternText}" — baserat på ${sampleCount} liknande jobb. Bekräfta så gäller det alla framtida offerter av den här jobbtypen.`,
  }
}

export async function proposePattern(
  supabase: SupabaseClient,
  businessId: string,
  jobType: string,
): Promise<ProposePatternResult> {
  try {
    if (!jobType) return 'skipped_too_few_lessons'

    const lessons = await fetchLessonsForJobType(supabase, businessId, jobType)
    if (lessons.length < MIN_SAMPLE_SIZE) return 'skipped_too_few_lessons'

    if (await hasPendingCard(supabase, businessId, jobType)) return 'skipped_pending_exists'
    if (await hasActiveConfirmedPattern(supabase, businessId, jobType)) return 'skipped_already_confirmed'
    if (await wasRecentlyRejected(supabase, businessId, jobType)) return 'skipped_recently_rejected'

    const detected = await detectPattern({ businessId, jobType, lessons, supabase })
    if (!detected) return 'skipped_no_pattern_found'

    const { title, description } = buildCardCopy(jobType, detected.pattern_text, lessons.length)

    const { error: insertErr } = await supabase.from('pending_approvals').insert({
      id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      business_id: businessId,
      status: 'pending',
      expires_at: new Date(Date.now() + PATTERN_CARD_EXPIRES_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      approval_type: 'playbook_pattern_confirmation',
      // owner_admin: en bekräftad regel formar ALLA framtida offerter av
      // jobbtypen (multi-employee-parity-plan.md, etapp 3b).
      routing_role: 'owner_admin',
      title,
      description,
      risk_level: 'low',
      // _decision (lib/ai/decision-record.ts): modell/prompt/version/
      // inputhash för Haiku-anropet som avgjorde mönstret.
      payload: withDecisionRecord({
        job_type: jobType,
        pattern_text: detected.pattern_text,
        confidence: detected.confidence,
        evidence_lesson_ids: detected.evidence_lesson_ids,
        sample_count: lessons.length,
        agent_id: 'daniel', // Daniel äger offertjakten/offertmotorn.
      }, detected.decision),
    })

    if (insertErr) {
      console.error('[playbook/propose-pattern] kunde inte skapa kortet:', insertErr.message)
      await rapporteraTystFel(supabase, businessId, 'playbook/propose-pattern:insert', insertErr.message, { jobType })
      return 'skipped_error'
    }
    return 'created'
  } catch (err) {
    console.error('[playbook/propose-pattern] oväntat fel (fail-safe):', err)
    await rapporteraTystFel(
      supabase, businessId, 'playbook/propose-pattern:unexpected',
      err instanceof Error ? err.message : String(err), { jobType },
    )
    return 'skipped_error'
  }
}
