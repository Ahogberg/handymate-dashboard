/**
 * Playbook Pattern Confirmation V1 — mönsterdetektion (Debrief → Playbook,
 * V2-lagret, tasks/todo.md "Playbook Pattern Confirmation V1" 2026-08-16
 * natt).
 *
 * ═══ VARFÖR EN EGEN MODUL ═══
 *
 * V1 (Project Debrief Capture) läser redan enskilda project_lesson-rader
 * rakt in i offertprompten (lib/ai-quote-generator.ts, fetchRecentLessons)
 * — ingen AI-inferens, bara vidarebefordrade citat. Den här modulen gör
 * motsatsen: EN Haiku-analys av flera lärdomar för SAMMA jobbtyp, för att
 * avgöra om de faktiskt upprepar samma tema. Skillnaden är avsiktlig — en
 * enskild lärdom är ett faktum, ett "upprepat tema" är en TOLKNING, och en
 * tolkning ska alltid kunna säga "vet inte".
 *
 * ═══ HELLRE MISSA ÄN GISSA ═══
 *
 * Att hitta på ett mönster av orelaterade lärdomar är ett VÄRRE fel än att
 * missa ett äkta mönster — ett påhittat mönster blir en företagsomfattande
 * regel som formar VARJE framtida offert av jobbtypen (till skillnad från
 * en enskild lärdom som bara syns i en offert). Prompten instrueras
 * därför explicit: modellen FÅR och FÖRVÄNTAS svara att det inte finns
 * något tydligt mönster — det är ett fullgott, förväntat svar, inte ett
 * misslyckande. Samma princip upprätthålls som KOD, inte bara prompttillit
 * — se parsePatternDetectionSvar: minst två oberoende belägg krävs för att
 * ett svar ens räknas som ett mönster.
 *
 * MIN_SAMPLE_SIZE = 5 (högre än aggregateOutcomesByJobType/
 * getEfterkalkylInsight-familjens 3, lib/efterkalkyl/get-insight.ts): den
 * här funktionen föreslår en företagsomfattande regel, inte en enskild
 * offerts varningsbanner — ribban för att ens FRÅGA modellen ligger högre.
 *
 * Kastar aldrig — varje fel (nätverk, parsing, saknad API-nyckel) landar i
 * "inget mönster hittades", aldrig ett kastat undantag som skulle kunna
 * fälla anroparen (lib/playbook/propose-pattern.ts, cron-svepet).
 */
import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getClaudeModel } from '@/lib/ai/get-model'
import { buildDecisionRecord, type DecisionRecord } from '@/lib/ai/decision-record'

/** Högre än de 3 som gäller för en enskild offerts varningsbanner (se
 *  filhuvudet) — det här föreslår en regel som gäller ALLA framtida
 *  offerter av jobbtypen. */
export const MIN_SAMPLE_SIZE = 5

/** Strukturerad klassificering (JSON in/ut), ingen kundvänd konversation
 *  — Haiku räcker, samma modellklass som customer-facts/extract-from-text.ts. */
export const PLAYBOOK_PATTERN_DETECT_MODEL = getClaudeModel('extraction')

export interface LessonForDetection {
  id: string
  lesson_text: string
  impact_hint: string | null
  created_at: string
}

export interface DetectedPattern {
  pattern_text: string
  confidence: number
  evidence_lesson_ids: string[]
}

/** Detsamma som skickas till Haiku (buildPrompt) — utdraget till en egen
 *  funktion så att beslutspostens inputHash (lib/ai/decision-record.ts)
 *  hashar EXAKT det underlag modellen faktiskt fick, inte en omgjord
 *  approximation som kan glida isär från prompten. */
function buildLessonsText(lessons: LessonForDetection[]): string {
  return lessons
    .map((l, i) => `${i}. "${l.lesson_text}"${l.impact_hint ? ` (fråga: ${l.impact_hint})` : ''}`)
    .join('\n')
}

function buildPrompt(jobType: string, lessons: LessonForDetection[]): string {
  const lista = buildLessonsText(lessons)

  return `Du analyserar bekräftade lärdomar från ett hantverksföretags avslutade projekt, alla av jobbtypen "${jobType}". Lärdomarna är hantverkarens egna ord från projektstängningar — inte AI-gissningar.

=== LÄRDOMAR (index 0-${lessons.length - 1}) ===
${lista}

=== UPPGIFT ===
Avgör om flera av dessa lärdomar UPPREPAR SAMMA TEMA — ett genuint mönster som är värt att göra till en fast regel för ALLA framtida offerter av jobbtypen "${jobType}".

VIKTIGT — HELLRE MISSA ÄN GISSA:
Du FÅR och FÖRVÄNTAS svara att det inte finns något tydligt mönster. Att hitta på ett mönster av lärdomar som egentligen handlar om olika saker är ETT VÄRRE FEL än att missa ett äkta mönster — en felaktig regel skulle påverka VARJE framtida offert av den här jobbtypen, inte bara en enskild offert. Om lärdomarna är spretiga, för få till antalet som faktiskt hör ihop, eller bara ytligt lika: svara has_pattern: false. Gissa aldrig ihop ett mönster för att verka hjälpsam.

Om (och bara om) du hittar ett äkta upprepat mönster:
- pattern_text: en kort, konkret regel på svenska, i samma torra, icke-tekniska ton som en hantverkare själv skulle skriva den — t.ex. "Räkna alltid med en extra dag för rivning på badrumsrenoveringar". INGEN motivering, bara regeln.
- confidence: 0.0-1.0, hur säker du är.
- evidence_indices: en lista med index (ur numreringen ovan) på de lärdomar som FAKTISKT stödjer mönstret. Minst två index krävs — ett enda belägg är ingen upprepning.

Svara ENDAST med JSON i detta format:
{
  "has_pattern": true|false,
  "pattern_text": "regeln på svenska, eller tom sträng",
  "confidence": 0.0-1.0,
  "evidence_indices": [0, 2]
}

Svara ENDAST med JSON, ingen annan text.`
}

/**
 * Ren funktion — plockar ut och validerar AI-svaret. Facit-testad direkt i
 * tests/playbook-pattern.spec.ts. Speglar parseFaktaSvar-mönstret (lib/
 * customer-facts/extract-from-text.ts): svaret är nästan alltid ren JSON,
 * men modellen lägger ibland text runt den ändå.
 *
 * Gränsen "minst två belägg" är KOD, inte prompttillit — även om modellen
 * skulle strunta i instruktionen (eller bara hitta ett enda löst citat)
 * filtreras ett för svagt "mönster" bort här. Ett enda citat är per
 * definition ingen upprepning.
 */
export function parsePatternDetectionSvar(
  text: string,
  lessons: LessonForDetection[],
): DetectedPattern | null {
  try {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) return null
      parsed = JSON.parse(match[0])
    }
    const obj = parsed as Record<string, unknown>
    if (obj?.has_pattern !== true) return null

    const patternText = typeof obj.pattern_text === 'string' ? obj.pattern_text.trim() : ''
    if (!patternText) return null

    const confidence = typeof obj.confidence === 'number'
      ? Math.min(Math.max(obj.confidence, 0), 1)
      : 0.5

    const rawIndices = Array.isArray(obj.evidence_indices) ? obj.evidence_indices : []
    const validIndices = rawIndices.filter(
      (i): i is number => typeof i === 'number' && Number.isInteger(i) && i >= 0 && i < lessons.length,
    )
    const uniqueIndices = Array.from(new Set(validIndices))
    if (uniqueIndices.length < 2) return null

    const evidenceLessonIds = uniqueIndices.map(i => lessons[i].id)

    return { pattern_text: patternText, confidence, evidence_lesson_ids: evidenceLessonIds }
  } catch {
    return null
  }
}

/**
 * Anropar Haiku för att avgöra om lärdomarna för en jobbtyp bär ett äkta
 * upprepat mönster. Kastar ALDRIG — se filhuvudet.
 *
 * `supabase` behövs för den obligatoriska kostnadsmätningen (samma
 * cost-guard-mönster som customer-facts/extract-from-text.ts).
 *
 * Returnerar `DetectedPattern` UTÖKAT med en `decision`-stämpel (lib/ai/
 * decision-record.ts) — bara när ett mönster faktiskt hittades. Svarade
 * modellen "inget mönster" togs inget AI-BESLUT att stämpla (jfr.
 * price_adjustment-korten, decision-record.ts:s egen princip), så det
 * fallet returnerar null precis som förut, utan någon DecisionRecord.
 */
export async function detectPattern(params: {
  businessId: string
  jobType: string
  lessons: LessonForDetection[]
  supabase: SupabaseClient
}): Promise<(DetectedPattern & { decision: DecisionRecord }) | null> {
  const { businessId, jobType, lessons, supabase } = params
  if (lessons.length < MIN_SAMPLE_SIZE) return null
  if (!process.env.ANTHROPIC_API_KEY) return null

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const response = await anthropic.messages.create({
      model: PLAYBOOK_PATTERN_DETECT_MODEL,
      max_tokens: 800,
      messages: [{ role: 'user', content: buildPrompt(jobType, lessons) }],
    })

    // COGS: mätningen går genom cost-guard (enda tillåtna llm-skrivaren per
    // cogs-facit) och får aldrig fälla detektionen.
    try {
      const { meterDirectLlmCall } = await import('@/lib/agents/shared/cost-guard')
      const { llmCostUsd } = await import('@/lib/costs/meter')
      await meterDirectLlmCall({
        supabase,
        businessId,
        usage: response.usage,
        costUsd: llmCostUsd(response.usage, PLAYBOOK_PATTERN_DETECT_MODEL),
        refType: 'playbook_pattern_detect',
        refId: jobType,
        meta: { prompt: 'playbookPatternDetect', jobType, sampleCount: lessons.length },
      })
    } catch (costErr) {
      console.warn('[playbook/detect-pattern] kostnadsmätning misslyckades:', costErr)
    }

    const svarstext = response.content[0]?.type === 'text' ? response.content[0].text : ''
    const parsed = parsePatternDetectionSvar(svarstext, lessons)
    if (!parsed) return null

    return {
      ...parsed,
      decision: buildDecisionRecord({
        model: PLAYBOOK_PATTERN_DETECT_MODEL,
        prompt: 'playbookPatternDetection',
        input: buildLessonsText(lessons),
        now: new Date(),
      }),
    }
  } catch (err) {
    console.warn('[playbook/detect-pattern] detektion misslyckades (fail-safe, inget mönster):', err)
    return null
  }
}
