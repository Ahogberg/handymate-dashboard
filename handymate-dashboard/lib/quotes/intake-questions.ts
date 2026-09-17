/**
 * Frågeflöde per jobbtyp (2026-09-17, Andreas: "frågeflöden per jobbtyp byggs
 * först … seedade per bransch som kan redigeras, bytas ut och fyllas på").
 *
 * Ren modul: inga React-, fetch- eller databasanrop. Tre ansvar:
 *  1. FORMEN på frågor (job_types.intake_questions) och svar (quotes.intake_answers),
 *     med validering som aldrig litar på lagrad JSON.
 *  2. SEEDNINGEN: förslag ur standardraderna + bransch + jobbtypens namn, så att
 *     en firma som aldrig rört frågorna ändå får ett flöde som sätter mängder.
 *  3. KOPPLINGEN svar → rader: en fråga pekar på RADER (mallradens id), aldrig
 *     på en enhet eller en text. Ett mått sätter mängden på exakt de kopplade
 *     artikelrader frågan pekar på; ett ja/nej kryssar exakt de tillvalsrader
 *     frågan pekar på. Val och fritext går som text till Matte. Priser rörs
 *     ALDRIG här; de kommer ur företagets artiklar via resolveTemplateItemPrices.
 *
 * ═══ VARFÖR BINDNINGAR, INTE ENHETER (2026-09-17, andra versionen) ═══
 *
 * Första versionen satte ett måttsvar på alla kopplade rader med samma enhet
 * och kryssade tillval vars beskrivning innehöll ett ord. "Hur stor yta?" gav
 * golvytan till både golvraden och väggraden — samma enhet, olika betydelse.
 * Bytte firman ord i tillvalets text slutade kopplingen tyst fungera. Frågan
 * måste bära betydelsen, och betydelsen sitter i raden. Mallradens id är
 * stabilt (överlever redigering och omsortering av upplägget) och är därför
 * nyckeln. Enheten på frågan är härledd ur målraderna och används bara för
 * visning och i det sparade svaret.
 */
import { getTradeStartPackage } from '../onboarding/trade-start-packages'
import { sameUnit } from './job-type-setup'

export type IntakeQuestionKind = 'number' | 'yesno' | 'choice' | 'text'

export interface IntakeQuestion {
  /** Stabil nyckel, a–z 0–9 _ -, unik inom jobbtypen. */
  id: string
  label: string
  kind: IntakeQuestionKind
  /**
   * `number`: id på mallrader (kopplade artikelrader) vars mängd svaret sätter.
   * `yesno`: id på tillvalsrader som kryssas vid Ja och kryssas ur vid Nej.
   * Tom eller utelämnad: svaret rör ingen rad och går som text till Matte.
   */
  targets?: string[]
  /** Bara `number`: enheten svaret anges i — härledd ur målraderna. */
  unit?: string
  /** Bara `choice`: 2–12 alternativ. */
  choices?: string[]
}

/** En rad i upplägget som en fråga kan peka på. */
export interface IntakeTarget {
  id: string
  description: string
  unit: string
  /** quantity = kopplad artikelrad (mängd), option = tillvalsrad (kryss). */
  kind: 'quantity' | 'option'
}

export type IntakeAnswerValue = number | boolean | string | null
export type IntakeAnswers = Record<string, IntakeAnswerValue>

export interface IntakeAnswerRecord {
  id: string
  label: string
  kind: IntakeQuestionKind
  unit?: string
  /** Raderna svaret satte — fryses med offerten så det syns vad som styrdes av vad. */
  targets?: string[]
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
/** Seedningen får aldrig fylla hela taket — hantverkaren ska ha plats att fylla på. */
export const INTAKE_SEED_MAX = 12
export const INTAKE_MAX_TARGETS = 50
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
/** Mallradens id (qi_… ur generateItemId, eller äldre seedade former). */
const TARGET_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed.length <= max ? trimmed : null
}

function readTargets(raw: unknown, label: string): string[] {
  if (!Array.isArray(raw)) throw new IntakeQuestionError(400, `Raderna på "${label}" har fel form.`)
  if (raw.length > INTAKE_MAX_TARGETS) throw new IntakeQuestionError(400, `"${label}" pekar på för många rader (högst ${INTAKE_MAX_TARGETS}).`)
  const targets: string[] = []
  for (const t of raw) {
    if (typeof t !== 'string' || !TARGET_PATTERN.test(t)) throw new IntakeQuestionError(400, `"${label}" pekar på en rad med ogiltigt id.`)
    if (!targets.includes(t)) targets.push(t)
  }
  return targets
}

/**
 * Strikt validering av en frågelista från klient eller databas. Kastar
 * IntakeQuestionError(400) — anroparen bestämmer om det ska bli ett svar
 * eller (vid läsning) en tom lista. Kontrollerar FORMEN; att målraderna
 * finns i upplägget kontrolleras av `bindIntakeQuestions` mot mallen.
 */
export function validateIntakeQuestions(input: unknown): IntakeQuestion[] {
  if (!Array.isArray(input)) throw new IntakeQuestionError(400, 'Frågorna har fel form.')
  if (input.length > INTAKE_MAX_QUESTIONS) throw new IntakeQuestionError(400, `Högst ${INTAKE_MAX_QUESTIONS} frågor per jobbtyp.`)
  const seen = new Set<string>()
  return input.map((raw, index) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new IntakeQuestionError(400, `Fråga ${index + 1} har fel form.`)
    const q = raw as Record<string, unknown>
    if (Object.keys(q).some(k => !['id', 'label', 'kind', 'targets', 'unit', 'choices'].includes(k))) throw new IntakeQuestionError(400, `Fråga ${index + 1} har okända fält.`)
    const id = typeof q.id === 'string' && ID_PATTERN.test(q.id) ? q.id : null
    if (!id) throw new IntakeQuestionError(400, `Fråga ${index + 1} saknar giltig nyckel.`)
    if (seen.has(id)) throw new IntakeQuestionError(400, `Två frågor delar nyckeln "${id}".`)
    seen.add(id)
    const label = cleanText(q.label, 200)
    if (!label) throw new IntakeQuestionError(400, `Fråga ${index + 1} behöver en text på högst 200 tecken.`)
    const kind = INTAKE_KINDS.includes(q.kind as IntakeQuestionKind) ? (q.kind as IntakeQuestionKind) : null
    if (!kind) throw new IntakeQuestionError(400, `Fråga ${index + 1} har en okänd typ.`)
    const question: IntakeQuestion = { id, label, kind }
    if (kind === 'number' || kind === 'yesno') {
      if (q.targets !== undefined && q.targets !== null) {
        const targets = readTargets(q.targets, label)
        if (targets.length) question.targets = targets
      }
    } else if (q.targets !== undefined) throw new IntakeQuestionError(400, `Bara mått, antal och ja/nej kan peka på rader ("${label}").`)
    if (kind === 'number') {
      if (q.unit !== undefined && q.unit !== null && q.unit !== '') {
        const unit = cleanText(q.unit, 20)
        if (!unit) throw new IntakeQuestionError(400, `Enheten på "${label}" är för lång.`)
        question.unit = unit
      }
    } else if (q.unit !== undefined) throw new IntakeQuestionError(400, `Bara mått och antal har en enhet ("${label}").`)
    if (kind === 'choice') {
      const choices = Array.isArray(q.choices) ? q.choices.map(c => cleanText(c, 60)) : null
      if (!choices || choices.length < 2 || choices.length > 12 || choices.some(c => c === null)) throw new IntakeQuestionError(400, `"${label}" behöver 2–12 alternativ på högst 60 tecken.`)
      if (new Set(choices).size !== choices.length) throw new IntakeQuestionError(400, `"${label}" har dubbla alternativ.`)
      question.choices = choices as string[]
    } else if (q.choices !== undefined) throw new IntakeQuestionError(400, `Bara valfrågor har alternativ ("${label}").`)
    return question
  })
}

/** Läsning ur databasen: null = aldrig redigerade (seedas), skräp = inga frågor. */
export function readIntakeQuestions(value: unknown): IntakeQuestion[] | null {
  if (value === null || value === undefined) return null
  try { return validateIntakeQuestions(value) } catch { return [] }
}

// ── Enheter ─────────────────────────────────────────────────────────────

/**
 * Stavningar av SAMMA enhet (m2/m²/kvm är en yta, inte tre). Ingen
 * omräkning mellan enheter (st↔paket, m↔m² finns inte här) — bara stavning.
 * Används när en fråga pekar på flera rader: de måste ha samma enhet, men
 * får stava den olika.
 */
const UNIT_ALIASES: string[][] = [
  ['m2', 'm²', 'kvm'],
  ['m', 'lpm', 'löpm', 'meter', 'lm'],
  ['m3', 'm³', 'kbm'],
  ['st', 'styck'],
  ['tim', 'h', 'timme', 'timmar'],
]

/** Exakt enhet (sameUnit) eller en känd stavningsvariant av samma enhet. */
export function equivalentUnit(a: string, b: string): boolean {
  if (sameUnit(a, b)) return true
  const group = UNIT_ALIASES.find(u => u.some(alias => sameUnit(alias, a)))
  return !!group && group.some(alias => sameUnit(alias, b))
}

// ── Rader som går att peka på ───────────────────────────────────────────

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
 * 1, och enheten är "st" även för timmar. En fråga som pekat på de raderna hade
 * skrivit över både 160 och 25 348 och tagit offerten från 170 000 kr till
 * knappt 2 000 — tyst, mitt framför kunden.
 *
 * Bindningen ensam är alltså ingen garanti för att antalet ÄR ett antal. Det är
 * artikelkopplingen som är det: en kopplad rad har sin enhet och sitt á-pris
 * från artikelregistret, så mängden är per definition en mängd. Vakten gäller
 * oavsett vad frågan pekar på: en okopplad rad går inte att peka på i
 * redigeraren, och skulle raden tappa sin koppling efteråt rörs den inte.
 *
 * Tillval (ja/nej → option_selected) rör aldrig belopp och omfattas inte.
 */
export function intakeRowTakesQuantity(row: { item_type?: string | null; itemType?: string | null; linked_product_id?: string | null }): boolean {
  const type = row.item_type ?? row.itemType ?? 'item'
  return type === 'item' && typeof row.linked_product_id === 'string' && row.linked_product_id.length > 0
}

interface IntakeRow {
  id?: string | null
  item_type?: string | null
  description?: string | null
  unit?: string | null
  quantity?: number | null
  linked_product_id?: string | null
  option_selected?: boolean | null
  option_default?: boolean | null
}

/**
 * Raderna i upplägget som en fråga kan peka på, i radordning: kopplade
 * artikelrader (mängd) och tillvalsrader (kryss). Rader utan id går inte att
 * peka på och utelämnas — servern ser till att nya rader alltid får id.
 */
export function intakeTargetsFromRows(rows: ReadonlyArray<IntakeRow>): IntakeTarget[] {
  const targets: IntakeTarget[] = []
  for (const row of rows) {
    const id = typeof row.id === 'string' && TARGET_PATTERN.test(row.id) ? row.id : null
    if (!id || targets.some(t => t.id === id)) continue
    const description = typeof row.description === 'string' ? row.description.trim() : ''
    const unit = typeof row.unit === 'string' ? row.unit.trim() : ''
    if (intakeRowTakesQuantity(row) && unit) targets.push({ id, description: description || 'Rad utan namn', unit, kind: 'quantity' })
    else if ((row.item_type ?? 'item') === 'option') targets.push({ id, description: description || 'Tillval utan namn', unit, kind: 'option' })
  }
  return targets
}

/**
 * Kontroll mot upplägget: varje rad en fråga pekar på ska finnas, vara av
 * rätt slag (mängdfråga → kopplad artikelrad, ja/nej → tillvalsrad) och
 * mängdfrågans rader ska dela enhet. Enheten på frågan sätts ur raderna.
 * Kastar 400 med hantverkarens ord. Används vid SPARNING — vid läsning får
 * en fråga vars rad försvunnit ur upplägget stå kvar (redigeraren visar det).
 */
export function bindIntakeQuestions(questions: readonly IntakeQuestion[], targets: readonly IntakeTarget[]): IntakeQuestion[] {
  const byId = new Map(targets.map(t => [t.id, t]))
  return questions.map(q => {
    if (!q.targets?.length) {
      if (q.kind === 'number' && q.unit) return q
      const { unit: _unit, ...rest } = q
      return rest
    }
    const rows = q.targets.map(id => {
      const t = byId.get(id)
      if (!t) throw new IntakeQuestionError(400, `"${q.label}" pekar på en rad som inte finns i upplägget.`)
      return t
    })
    if (q.kind === 'number') {
      const wrong = rows.find(t => t.kind !== 'quantity')
      if (wrong) throw new IntakeQuestionError(400, `"${q.label}" kan bara sätta mängd på rader som är kopplade till en artikel ("${wrong.description}" är det inte).`)
      const unit = rows[0].unit
      const other = rows.find(t => !equivalentUnit(t.unit, unit))
      if (other) throw new IntakeQuestionError(400, `Raderna på "${q.label}" har olika enheter (${unit} och ${other.unit}) — dela upp i två frågor.`)
      return { ...q, unit }
    }
    const wrong = rows.find(t => t.kind !== 'option')
    if (wrong) throw new IntakeQuestionError(400, `"${q.label}" kan bara kryssa tillvalsrader ("${wrong.description}" är inget tillval).`)
    return q
  })
}

/** Raderna en fråga pekar på som inte längre finns i upplägget. */
export function missingIntakeTargets(question: IntakeQuestion, targets: readonly IntakeTarget[]): string[] {
  return (question.targets ?? []).filter(id => !targets.some(t => t.id === id))
}

// ── Seedning ────────────────────────────────────────────────────────────

/** Startpaketen finns för sju branscher; närliggande branscher lånar. */
const TRADE_FALLBACK: Record<string, string> = {
  carpenter: 'construction', flooring: 'construction', hvac: 'plumber', gardening: 'groundworks',
}

function slugKey(text: string): string {
  return text.toLowerCase().replace(/[åä]/g, 'a').replace(/ö/g, 'o').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24) || 'rad'
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base, n = 2
  while (taken.has(id)) id = `${base}_${n++}`
  taken.add(id)
  return id
}

/**
 * Förslag för en jobbtyp som aldrig fått egna frågor. EN fråga per kopplad
 * artikelrad och en per tillvalsrad — aldrig en fråga per enhet. En felaktig
 * sammanslagning ("hur stor yta?" som sätter både golv och vägg) prissätter
 * fel i tysthet; en onödig uppdelning kostar en fråga till. Att slå ihop två
 * rader under en fråga är hantverkarens uttalade handling i redigeraren.
 * Därefter branschpaketets egna frågor, sist en öppen om det som påverkar
 * tiden. Högst INTAKE_SEED_MAX.
 */
export function seedIntakeQuestions(trade: string | null | undefined, jobTypeName: string, targets: readonly IntakeTarget[]): IntakeQuestion[] {
  const questions: IntakeQuestion[] = []
  const taken = new Set<string>()
  for (const t of targets) {
    if (t.kind === 'quantity') {
      questions.push({ id: uniqueId(`rad_${slugKey(t.description)}`, taken), label: `${t.description}: hur många ${t.unit}?`, kind: 'number', unit: t.unit, targets: [t.id] })
    } else {
      questions.push({ id: uniqueId(`tillval_${slugKey(t.description)}`, taken), label: `Ska ${t.description} ingå?`, kind: 'yesno', targets: [t.id] })
    }
  }
  const tradeKey = trade ? (TRADE_FALLBACK[trade] || trade) : undefined
  const pack = getTradeStartPackage(tradeKey, jobTypeName)
  pack?.questions.forEach((label, index) => questions.push({ id: uniqueId(`paket_${index + 1}`, taken), label, kind: 'text' }))
  questions.push({ id: uniqueId('paverkar_tiden', taken), label: 'Något som påverkar tiden — åtkomst, skick, bortforsling?', kind: 'text' })
  return questions.slice(0, INTAKE_SEED_MAX)
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
    records.push({ id: q.id, label: q.label, kind: q.kind, ...(q.unit ? { unit: q.unit } : {}), ...(q.targets?.length ? { targets: q.targets.slice() } : {}), value })
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
    let targets: string[] | undefined
    if (a.targets !== undefined) {
      try { targets = readTargets(a.targets, label) } catch { return null }
      if (!targets.length) targets = undefined
    }
    const value = normalizeIntakeAnswer(question, a.value)
    if (!isAnswered(value)) return null
    answers.push({ id, label, kind, ...(unit ? { unit } : {}), ...(targets ? { targets } : {}), value })
  }
  return answers.length ? { version: 1, jobType: set.jobType, source: 'hantverkare', answeredAt: set.answeredAt, answers } : null
}

/**
 * Svar → rader. Returnerar en NY lista; rader utan träff är samma objekt som
 * förut. En rad rörs BARA om frågan pekar på dess id. Mängder sätts dessutom
 * bara på rader som klarar `intakeRowTakesQuantity` (artikelrad kopplad till
 * registret) — vakten gäller även om bindningen säger annat. Tillval kryssas
 * bara på tillvalsrader. Ingen enhets- eller textmatchning: rader som råkar
 * ha samma enhet eller samma ord rörs aldrig. Anroparen kör
 * recalculateItems/prisresolvern efteråt.
 */
export function applyIntakeAnswers<T extends IntakeRow>(rows: readonly T[], questions: readonly IntakeQuestion[], answers: IntakeAnswers): T[] {
  let result = rows.slice()
  for (const q of questions) {
    if (!q.targets?.length) continue
    const value = normalizeIntakeAnswer(q, answers[q.id])
    if (!isAnswered(value)) continue
    const pointsAt = (row: IntakeRow) => typeof row.id === 'string' && q.targets!.includes(row.id)
    if (q.kind === 'number' && typeof value === 'number' && value > 0) {
      result = result.map(row => pointsAt(row) && intakeRowTakesQuantity(row) ? { ...row, quantity: value } : row)
    } else if (q.kind === 'yesno' && typeof value === 'boolean') {
      result = result.map(row => pointsAt(row) && row.item_type === 'option' ? { ...row, option_selected: value, option_default: value } : row)
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
