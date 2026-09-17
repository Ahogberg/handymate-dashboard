import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeBranch } from '../branch'
import { IntakeQuestionError, intakeUnitsFromRows, readIntakeQuestions, seedIntakeQuestions, validateIntakeQuestions, type IntakeQuestion } from './intake-questions'

export interface IntakeQuestionsView {
  jobType: { slug: string; name: string }
  questions: IntakeQuestion[]
  /** Sant när listan är ett förslag ur branschen — inte sparad av firman. */
  seeded: boolean
  /** Enheterna i jobbtypens standardrader — det mängdfrågor kan sätta. */
  units: string[]
}

async function readJobType(db: SupabaseClient, businessId: string, slug: unknown) {
  if (typeof slug !== 'string' || !slug || slug.length > 100) throw new IntakeQuestionError(400, 'Välj en jobbtyp.')
  const { data, error } = await db.from('job_types').select('id, slug, name, intake_questions')
    .eq('business_id', businessId).eq('slug', slug).eq('is_active', true).maybeSingle()
  if (error) throw new IntakeQuestionError(503, 'Kunde inte läsa jobbtypen. Försök igen.')
  if (!data) throw new IntakeQuestionError(404, 'Jobbtypen finns inte i din firma.')
  return data as { id: string; slug: string; name: string; intake_questions: unknown }
}

async function readRowUnits(db: SupabaseClient, businessId: string, slug: string): Promise<string[]> {
  const { data, error } = await db.from('quote_templates').select('default_items')
    .eq('business_id', businessId).eq('job_type_slug', slug).limit(21)
  if (error) throw new IntakeQuestionError(503, 'Kunde inte läsa standardraderna. Försök igen.')
  const rows = (data || []).flatMap(t => Array.isArray(t.default_items) ? t.default_items : [])
  return intakeUnitsFromRows(rows)
}

/** Frågorna som ställs för jobbtypen: sparade, annars seedade ur bransch + standardrader. */
export async function loadIntakeQuestions(db: SupabaseClient, businessId: string, slug: unknown): Promise<IntakeQuestionsView> {
  const job = await readJobType(db, businessId, slug)
  const [units, config] = await Promise.all([
    readRowUnits(db, businessId, job.slug),
    db.from('business_config').select('branch').eq('business_id', businessId).maybeSingle(),
  ])
  if (config.error) throw new IntakeQuestionError(503, 'Kunde inte läsa företagets bransch.')
  const stored = readIntakeQuestions(job.intake_questions)
  const trade = normalizeBranch(config.data?.branch ?? null)
  return {
    jobType: { slug: job.slug, name: job.name },
    questions: stored ?? seedIntakeQuestions(trade, job.name, units),
    seeded: stored === null,
    units,
  }
}

/**
 * Skriver firmans egna frågor. `questions: null` återställer till förslagen.
 * Strikt nyckellista som quote-setup: okända fält är ett fel, inte brus.
 */
export async function writeIntakeQuestions(db: SupabaseClient, businessId: string, input: unknown): Promise<IntakeQuestionsView> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new IntakeQuestionError(400, 'Ogiltig begäran.')
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(k => !['jobTypeSlug', 'questions'].includes(k))) throw new IntakeQuestionError(400, 'Ogiltig begäran.')
  const job = await readJobType(db, businessId, body.jobTypeSlug)
  const questions = body.questions === null ? null : validateIntakeQuestions(body.questions)
  const { error } = await db.from('job_types').update({ intake_questions: questions })
    .eq('business_id', businessId).eq('id', job.id)
  if (error) throw new IntakeQuestionError(503, 'Frågorna kunde inte sparas. Försök igen.')
  return loadIntakeQuestions(db, businessId, job.slug)
}
