import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeBranch } from '../branch'
import { IntakeQuestionError, bindIntakeQuestions, intakeTargetsFromRows, readIntakeQuestions, seedIntakeQuestions, validateIntakeQuestions, type IntakeQuestion, type IntakeTarget } from './intake-questions'

export interface IntakeQuestionsView {
  jobType: { slug: string; name: string }
  questions: IntakeQuestion[]
  /** Sant när listan är ett förslag ur branschen — inte sparad av firman. */
  seeded: boolean
  /** Raderna i jobbtypens upplägg som frågor kan peka på (kopplade artikelrader och tillval). */
  targets: IntakeTarget[]
  /**
   * Artiklarna som valfrågornas alternativ pekar på, med priset som gäller NU.
   * Läses här och inte när frågan skrevs — annars skulle priserna i
   * frågeflödet ruttna medan artikelregistret uppdateras. Bara de artiklar
   * frågorna faktiskt nämner; registret i sin helhet hör hemma i editorn.
   */
  choiceArticles: IntakeChoiceArticle[]
}

export interface IntakeChoiceArticle {
  id: string
  name: string
  unit: string
  salesPrice: number
}

async function readJobType(db: SupabaseClient, businessId: string, slug: unknown) {
  if (typeof slug !== 'string' || !slug || slug.length > 100) throw new IntakeQuestionError(400, 'Välj en jobbtyp.')
  const { data, error } = await db.from('job_types').select('id, slug, name, intake_questions')
    .eq('business_id', businessId).eq('slug', slug).eq('is_active', true).maybeSingle()
  if (error) throw new IntakeQuestionError(503, 'Kunde inte läsa jobbtypen. Försök igen.')
  if (!data) throw new IntakeQuestionError(404, 'Jobbtypen finns inte i din firma.')
  return data as { id: string; slug: string; name: string; intake_questions: unknown }
}

async function readRowTargets(db: SupabaseClient, businessId: string, slug: string): Promise<IntakeTarget[]> {
  const { data, error } = await db.from('quote_templates').select('default_items')
    .eq('business_id', businessId).eq('job_type_slug', slug).limit(21)
  if (error) throw new IntakeQuestionError(503, 'Kunde inte läsa standardraderna. Försök igen.')
  const rows = (data || []).flatMap(t => Array.isArray(t.default_items) ? t.default_items : [])
  return intakeTargetsFromRows(rows)
}

/** Frågorna som ställs för jobbtypen: sparade, annars seedade ur bransch + standardrader. */
export async function loadIntakeQuestions(db: SupabaseClient, businessId: string, slug: unknown): Promise<IntakeQuestionsView> {
  const job = await readJobType(db, businessId, slug)
  const [targets, config] = await Promise.all([
    readRowTargets(db, businessId, job.slug),
    db.from('business_config').select('branch').eq('business_id', businessId).maybeSingle(),
  ])
  if (config.error) throw new IntakeQuestionError(503, 'Kunde inte läsa företagets bransch.')
  const stored = readIntakeQuestions(job.intake_questions)
  const trade = normalizeBranch(config.data?.branch ?? null)
  const questions = stored ?? seedIntakeQuestions(trade, job.name, targets)
  return {
    jobType: { slug: job.slug, name: job.name },
    // En sparad fråga vars rad försvunnit ur upplägget står kvar (redigeraren
    // visar det); bindningen kontrolleras hårt bara vid sparning.
    questions,
    seeded: stored === null,
    targets,
    choiceArticles: await readChoiceArticles(db, businessId, questions),
  }
}

/** Artiklarna valfrågorna pekar på. Tom lista när ingen fråga binder till någon. */
async function readChoiceArticles(db: SupabaseClient, businessId: string, questions: readonly IntakeQuestion[]): Promise<IntakeChoiceArticle[]> {
  const ids = Array.from(new Set(questions.flatMap(q => (q.choices ?? []).map(c => c.productId).filter((id): id is string => !!id))))
  if (!ids.length) return []
  const { data, error } = await db.from('products').select('id, name, unit, sales_price')
    .eq('business_id', businessId).in('id', ids)
  // Fail-soft: utan artiklarna går frågeflödet att köra, valen lägger bara
  // inte in någon rad. Att blockera hela intaget för en produktläsning vore
  // ett sämre byte.
  if (error || !data) return []
  return data.map(p => ({
    id: String(p.id),
    name: String(p.name ?? ''),
    unit: typeof p.unit === 'string' && p.unit ? p.unit : 'st',
    salesPrice: Number(p.sales_price ?? 0) || 0,
  })).filter(p => p.id && p.name)
}

/**
 * Skriver firmans egna frågor. `questions: null` återställer till förslagen.
 * Strikt nyckellista som quote-setup: okända fält är ett fel, inte brus.
 * Varje rad en fråga pekar på kontrolleras mot upplägget (finns, rätt slag,
 * samma enhet) — en fråga som pekar fel sparas aldrig.
 */
export async function writeIntakeQuestions(db: SupabaseClient, businessId: string, input: unknown): Promise<IntakeQuestionsView> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new IntakeQuestionError(400, 'Ogiltig begäran.')
  const body = input as Record<string, unknown>
  if (Object.keys(body).some(k => !['jobTypeSlug', 'questions'].includes(k))) throw new IntakeQuestionError(400, 'Ogiltig begäran.')
  const job = await readJobType(db, businessId, body.jobTypeSlug)
  const questions = body.questions === null ? null
    : bindIntakeQuestions(validateIntakeQuestions(body.questions), await readRowTargets(db, businessId, job.slug))
  const { error } = await db.from('job_types').update({ intake_questions: questions })
    .eq('business_id', businessId).eq('id', job.id)
  if (error) throw new IntakeQuestionError(503, 'Frågorna kunde inte sparas. Försök igen.')
  return loadIntakeQuestions(db, businessId, job.slug)
}
