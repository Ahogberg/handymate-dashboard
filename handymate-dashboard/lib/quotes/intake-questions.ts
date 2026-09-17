/**
 * Frågeflöde per jobbtyp (2026-09-17, Andreas: "frågeflöden per jobbtyp byggs
 * först … seedade per bransch som kan redigeras, bytas ut och fyllas på").
 *
 * Ren modul: inga React-, fetch- eller databasanrop. Tre ansvar:
 *  1. FORMEN på frågor (job_types.intake_questions) och svar (quotes.intake_answers),
 *     med validering som aldrig litar på lagrad JSON.
 *  2. SEEDNINGEN: förslag ur bransch + jobbtypens namn + enheterna i standardraderna,
 *     så att en firma som aldrig rört frågorna ändå får ett flöde som sätter mängder.
 *  3. KOPPLINGEN svar → rader: ett mått med enhet sätter mängden på alla standardrader
 *     med exakt samma enhet (sameUnit — ingen omräkning, ingen gissning), ett ja/nej
 *     med kopplat tillval kryssar tillvalsrader vars beskrivning innehåller texten.
 *     Val och fritext går som text till Matte. Priser rörs ALDRIG här; de kommer ur
 *     företagets artiklar via resolveTemplateItemPrices precis som förut.
 */
import { getTradeStartPackage } from '../onboarding/trade-start-packages'
import { sameUnit } from './job-type-setup'

export type IntakeQuestionKind = 'number' | 'yesno' | 'choice' | 'text'

export interface IntakeQuestion {
  /** Stabil nyckel, a–z 0–9 _ -, unik inom jobbtypen. */
  id: string
  label: string
  kind: IntakeQuestionKind
  /** Bara `number`: enheten svaret sätter mängd för (m², st, tim …). */
  unit?: string
  /** Bara `choice`: 2–12 alternativ. */
  choices?: string[]
  /** Bara `yesno`: tillvalsrader vars beskrivning innehåller texten kryssas vid Ja. */
  optionMatch?: string
}

export type IntakeAnswerValue = number | boolean | string | null
export type IntakeAnswers = Record<string, IntakeAnswerValue>

export interface IntakeAnswerRecord {
  id: string
  label: string
  kind: IntakeQuestionKind
  unit?: string
  value: IntakeAnswerValue
}

export interface IntakeAnswerSet {
  version: 1
  jobType: string
  /** V1: alltid hantverkaren. Kundsvar före besöket får ett eget värde senare. */
  source: 'hantverkare'
  answeredAt: string
  answers: IntakeAnswerRecord[]
}

export const INTAKE_MAX_QUESTIONS = 20
export const INTAKE_KINDS: readonly IntakeQuestionKind[] = ['number', 'yesno', 'choice', 'text']
export const INTAKE_KIND_LABELS: Record<IntakeQuestionKind, string> = {
  number: 'Mått eller antal',
  yesno: 'Ja eller nej',
  choice: 'Välj ett alternativ',
  text: 'Fritext',
}

export class IntakeQuestionError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

const ID_PATTERN = /^[a-z0-9_-]{1,40}$/

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

/**
 * Strikt validering av en frågelista från klient eller databas. Kastar
 * IntakeQuestionError(400) — anroparen bestämmer om det ska bli ett svar
 * eller (vid läsning) en tom lista.
 */
export function validateIntakeQuestions(input: unknown): IntakeQuestion[] {
  if (!Array.isArray(input)) throw new IntakeQuestionError(400, 'Frågorna har fel form.')
  if (input.length > INTAKE_MAX_QUESTIONS) throw new IntakeQuestionError(400, `Högst ${INTAKE_MAX_QUESTIONS} frågor per jobbtyp.`)
  const seen = new Set<string>()
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new IntakeQuestionError(400, `Fråga ${index + 1} har fel form.`)
    const q = raw as Record<string, unknown>
    if (Object.keys(q).some(k => !['id', 'label', 'kind', 'unit', 'choices', 'optionMatch'].includes(k))) throw new IntakeQuestionError(400, `Fråga ${index + 1} har okända fält.`)
    const id = typeof q.id === 'string' && ID_PATTERN.test(q.id) ? q.id : null
    if (!id) throw new IntakeQuestionError(400, `Fråga ${index + 1} saknar giltig nyckel.`)
    if (seen.has(id)) throw new IntakeQuestionError(400, `Två frågor delar nyckeln "${id}".`)
    seen.add(id)
    const label = cleanText(q.label, 200)
    if (!label) throw new IntakeQuestionError(400, `Fråga ${index + 1} behöver en text på högst 200 tecken.`)
    const kind = INTAKE_KINDS.includes(q.kind as IntakeQuestionKind) ? (q.kind as IntakeQuestionKind) : null
    if (!kind) throw new IntakeQuestionError(400, `Fråga ${index + 1} har en okänd typ.`)
    const question: IntakeQuestion = { id, label, kind }
    if (kind === 'number') {
      if (q.unit !== undefined) {
        const unit = cleanText(q.unit, 20)
        if (!unit) throw new IntakeQuestionError(400, `Enheten på "${label}" är för lång eller tom.`)
        question.unit = unit
      }
    } else if (q.unit !== undefined) throw new IntakeQuestionError(400, `Bara mått och antal har en enhet ("${label}").`)
    if (kind === 'choice') {
      const choices = Array.isArray(q.choices) ? q.choices.map(c => cleanText(c, 60)) : null
      if (!choices || choices.length < 2 || choices.length > 12 || choices.some(c => c === null)) throw new IntakeQuestionError(400, `"${label}" behöver 2–12 alternativ på högst 60 tecken.`)
      if (new Set(choices).size !== choices.length) throw new IntakeQuestionError(400, `"${label}" har dubbla alternativ.`)
      question.choices = choices as string[]
    } else if (q.choices !== undefined) throw new IntakeQuestionError(400, `Bara valfrågor har alternativ ("${label}").`)
    if (kind === 'yesno') {
      if (q.optionMatch !== undefined && q.optionMatch !== null && q.optionMatch !== '') {
        const match = cleanText(q.optionMatch, 80)
        if (!match) throw new IntakeQuestionError(400, `Det kopplade tillvalet på "${label}" är för långt.`)
        question.optionMatch = match
      }
    } else if (q.optionMatch !== undefined) throw new IntakeQuestionError(400, `Bara ja/nej-frågor kan koppla ett tillval ("${label}").`)
    return question
  })
}

/** Läsning ur databasen: null = aldrig redigerade (seedas), skräp = inga frågor. */
export function readIntakeQuestions(value: unknown): IntakeQuestion[] | null {
  if (value === null || value === undefined) return null
  try { return validateIntakeQuestions(value) } catch { return [] }
}

// ── Seedning ────────────────────────────────────────────────────────────

/** Startpaketen finns för sju branscher; närliggande branscher lånar. */
const TRADE_FALLBACK: Record<string, string> = {
  carpenter: 'construction', flooring: 'construction', hvac: 'plumber', gardening: 'groundworks',
}

/**
 * Stavningar av SAMMA enhet (m2/m²/kvm är en yta, inte tre). Ingen
 * omräkning mellan enheter (st↔paket, m↔m² finns inte här) — bara
 * stavning. Används av seedningen (en fråga per enhet) och av svar→rader
 * (frågan träffar raden oavsett hur firman råkat stava enheten).
 */
const UNIT_QUESTIONS: Array<{ units: string[]; id: string; label: string }> = [
  { units: ['m2', 'm²', 'kvm'], id: 'yta_m2', label: 'Hur stor yta gäller det?' },
  { units: ['m', 'lpm', 'löpm', 'meter'], id: 'langd_m', label: 'Hur många meter?' },
  { units: ['m3', 'm³', 'kbm'], id: 'volym_m3', label: 'Hur många kubikmeter?' },
  { units: ['st', 'styck'], id: 'antal_st', label: 'Hur många stycken?' },
  { units: ['tim', 'h', 'timme', 'timmar'], id: 'timmar', label: 'Hur många arbetstimmar räknar du med?' },
]

/** Exakt enhet (sameUnit) eller en känd stavningsvariant av samma enhet. */
export function equivalentUnit(a: string, b: string): boolean {
  if (sameUnit(a, b)) return true
  const group = UNIT_QUESTIONS.find(u => u.units.some(alias => sameUnit(alias, a)))
  return !!group && group.units.some(alias => sameUnit(alias, b))
}

function unitKey(unit: string): string {
  return unit.trim().toLowerCase().replace(/[^a-z0-9åäö]/g, '_').replace(/^_+|_+$/g, '').slice(0, 20) || 'enhet'
}

/**
 * Förslag för en jobbtyp som aldrig fått egna frågor. Ordningen är den som
 * gör offerten prissatt fortast: mängdfrågor för varje enhet som faktiskt
 * finns i standardraderna, sedan branschpaketets egna frågor, sist en öppen
 * fråga om det som påverkar tiden. Högst åtta.
 */
export function seedIntakeQuestions(trade: string | null | undefined, jobTypeName: string, rowUnits: readonly string[]): IntakeQuestion[] {
  const questions: IntakeQuestion[] = []
  for (const raw of rowUnits) {
    const unit = typeof raw === 'string' ? raw.trim() : ''
    if (!unit || questions.some(q => q.unit && equivalentUnit(q.unit, unit))) continue
    const known = UNIT_QUESTIONS.find(u => u.units.some(alias => sameUnit(alias, unit)))
    // Frågan bär radens EGEN stavning (första förekomsten); svar→rader träffar
    // sedan alla stavningsvarianter via equivalentUnit.
    questions.push(known
      ? { id: known.id, label: known.label, kind: 'number', unit }
      : { id: `antal_${unitKey(unit)}`, label: `Hur många ${unit}?`, kind: 'number', unit })
  }
  const tradeKey = trade ? (TRADE_FALLBACK[trade] || trade) : undefined
  const pack = getTradeStartPackage(tradeKey, jobTypeName)
  pack?.questions.forEach((label, index) => questions.push({ id: `paket_${index + 1}`, label, kind: 'text' }))
  questions.push({ id: 'paverkar_tiden', label: 'Något som påverkar tiden — åtkomst, skick, bortforsling?', kind: 'text' })
  return questions.slice(0, 8)
}

/**
 * Sant när en mängdfråga får röra raden: en artikelrad kopplad till en artikel
 * i företagets register.
 *
 * ═══ VARFÖR KOPPLINGEN ÄR ETT KRAV (2026-09-17) ═══
 *
 * Bee Services badrumsmall i produktion ser ut så här:
 *
 *   Arbete                             160 st × 570 kr
 *   Material> färdigt Tätskigt      25 348 st ×   1 kr
 *   Standard paketet Kakel/klinker  55 211 st ×   1 kr
 *
 * Mallen används som miniräknare: BELOPPET ligger i antalskolumnen, á-priset är
 * 1, och enheten är "st" även för timmar. En fråga med enheten "st" hade skrivit
 * över både 160 och 25 348 och tagit offerten från 170 000 kr till knappt 2 000 —
 * tyst, mitt framför kunden.
 *
 * Enheten ensam är alltså ingen garanti för att antalet ÄR ett antal. Det är
 * artikelkopplingen som är det: en kopplad rad har sin enhet och sitt á-pris
 * från artikelregistret, så mängden är per definition en mängd. I hela
 * produktionsdatabasen bär 4 av 221 mallrader en koppling — regeln gör alltså
 * ingenting på dagens mallar, och det är avsikten. Kopplingen är det som låser
 * upp frågeflödet, inte tvärtom.
 *
 * Tillval (ja/nej → option_selected) rör aldrig belopp och omfattas inte.
 */
export function intakeRowTakesQuantity(row: { item_type?: string | null; itemType?: string | null; linked_product_id?: string | null }): boolean {
  const type = row.item_type ?? row.itemType ?? 'item'
  return type === 'item' && typeof row.linked_product_id === 'string' && row.linked_product_id.length > 0
}

/**
 * Enheterna som en mängdfråga faktiskt kan sätta, i radordning, utan dubbletter.
 * Bara kopplade artikelrader räknas — en fråga om en enhet som ingen kopplad rad
 * bär vore ett löfte flödet inte kan hålla.
 */
export function intakeUnitsFromRows(rows: ReadonlyArray<{ unit?: string | null; item_type?: string | null; itemType?: string | null; linked_product_id?: string | null }>): string[] {
  const units: string[] = []
  for (const row of rows) {
    if (!intakeRowTakesQuantity(row)) continue
    const unit = typeof row.unit === 'string' ? row.unit.trim() : ''
    if (unit && !units.some(u => equivalentUnit(u, unit))) units.push(unit)
  }
  return units
}

// ── Svar ────────────────────────────────────────────────────────────────

function isAnswered(value: IntakeAnswerValue | undefined): value is number | boolean | string {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

/** Svaret i den form som frågan kräver, annars null (ett hoppat svar är inget svar). */
export function normalizeIntakeAnswer(question: IntakeQuestion, value: unknown): IntakeAnswerValue {
  switch (question.kind) {
    case 'number': {
      const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.').trim()) : NaN
      return Number.isFinite(n) && n >= 0 && value !== '' ? Math.round(n * 100) / 100 : null
    }
    case 'yesno': return typeof value === 'boolean' ? value : null
    case 'choice': return typeof value === 'string' && question.choices?.includes(value) ? value : null
    case 'text': return typeof value === 'string' && value.trim() ? value.trim().slice(0, 1500) : null
  }
}

/** Det som sparas på offerten. null när inget alls besvarats. */
export function buildIntakeAnswerSet(jobType: string, questions: readonly IntakeQuestion[], answers: IntakeAnswers, answeredAt = new Date().toISOString()): IntakeAnswerSet | null {
  const records: IntakeAnswerRecord[] = []
  for (const q of questions) {
    const value = normalizeIntakeAnswer(q, answers[q.id])
    if (!isAnswered(value)) continue
    records.push({ id: q.id, label: q.label, kind: q.kind, ...(q.unit ? { unit: q.unit } : {}), value })
  }
  return records.length ? { version: 1, jobType, source: 'hantverkare', answeredAt, answers: records } : null
}

/** Serverns läsning av body.intake_answers: rätt form eller null — aldrig skräp i kolumnen. */
export function readIntakeAnswerSet(value: unknown): IntakeAnswerSet | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const set = value as Record<string, unknown>
  if (set.version !== 1 || set.source !== 'hantverkare' || typeof set.jobType !== 'string' || !set.jobType || set.jobType.length > 120) return null
  if (typeof set.answeredAt !== 'string' || Number.isNaN(Date.parse(set.answeredAt)) || !Array.isArray(set.answers) || set.answers.length > INTAKE_MAX_QUESTIONS) return null
  const answers: IntakeAnswerRecord[] = []
  for (const raw of set.answers) {
    if (!raw || typeof raw !== 'object') return null
    const a = raw as Record<string, unknown>
    const id = typeof a.id === 'string' && ID_PATTERN.test(a.id) ? a.id : null
    const label = cleanText(a.label, 200)
    const kind = INTAKE_KINDS.includes(a.kind as IntakeQuestionKind) ? (a.kind as IntakeQuestionKind) : null
    if (!id || !label || !kind) return null
    const question: IntakeQuestion = { id, label, kind }
    if (kind === 'choice' && typeof a.value === 'string') question.choices = [a.value]
    const unit = a.unit === undefined ? undefined : cleanText(a.unit, 20)
    if (unit === null) return null
    const value = normalizeIntakeAnswer(question, a.value)
    if (!isAnswered(value)) return null
    answers.push({ id, label, kind, ...(unit ? { unit } : {}), value })
  }
  return answers.length ? { version: 1, jobType: set.jobType, source: 'hantverkare', answeredAt: set.answeredAt, answers } : null
}

interface IntakeRow {
  item_type?: string | null
  description?: string | null
  unit?: string | null
  quantity?: number | null
  linked_product_id?: string | null
  option_selected?: boolean | null
  option_default?: boolean | null
}

/**
 * Svar → rader. Returnerar en NY lista; rader utan träff är samma objekt som
 * förut. Mängder ändras bara på rader som klarar `intakeRowTakesQuantity`
 * (artikelrad kopplad till registret) OCH har samma enhet som frågan (exakt
 * eller känd stavningsvariant, aldrig omräkning). Tillval kryssas bara på
 * tillvalsrader vars beskrivning innehåller det kopplade ordet. Anroparen kör
 * recalculateItems/prisresolvern efteråt.
 */
export function applyIntakeAnswers<T extends IntakeRow>(rows: readonly T[], questions: readonly IntakeQuestion[], answers: IntakeAnswers): T[] {
  let result = rows.slice()
  for (const q of questions) {
    const value = normalizeIntakeAnswer(q, answers[q.id])
    if (!isAnswered(value)) continue
    if (q.kind === 'number' && q.unit && typeof value === 'number' && value > 0) {
      result = result.map(row => intakeRowTakesQuantity(row) && equivalentUnit(String(row.unit ?? ''), q.unit!) ? { ...row, quantity: value } : row)
    } else if (q.kind === 'yesno' && q.optionMatch && typeof value === 'boolean') {
      const needle = q.optionMatch.toLocaleLowerCase('sv')
      result = result.map(row => row.item_type === 'option' && String(row.description ?? '').toLocaleLowerCase('sv').includes(needle)
        ? { ...row, option_selected: value, option_default: value } : row)
    }
  }
  return result
}

/** Läsbar sammanfattning för Matte och source_transcript. Tom sträng utan svar. */
export function intakeAnswersText(set: IntakeAnswerSet | null): string {
  if (!set || !set.answers.length) return ''
  const lines = set.answers.map(a => {
    const shown = typeof a.value === 'boolean' ? (a.value ? 'Ja' : 'Nej')
      : typeof a.value === 'number' ? `${a.value.toLocaleString('sv-SE')}${a.unit ? ` ${a.unit}` : ''}`
      : String(a.value)
    return `- ${a.label} ${shown}`
  })
  return ['Uppgifter från platsbesöket:', ...lines].join('\n')
}
