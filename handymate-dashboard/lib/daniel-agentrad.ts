/**
 * Daniels agentrad på offertsidan — ren kärna (ingen I/O).
 *
 * Skiss: docs/design/skisser-2026-09-06/agentnarvaro-offert.dc.html (bara
 * "agentrad"-mönstret; marginalnotisen är utanför scope). Raden återanvänder
 * Business Twin-verklighetskontrollen (lib/daniel-intelligence.ts) och
 * lägger BEVISEN ovanpå: upp till tre riktiga avslutade projekt, räkningen
 * "N av M tog mer tid" och senaste debrief-lärdomen. Inget i den här filen
 * gissar — varje siffra i meningen kommer från frusna project_outcome-rader.
 *
 * I/O:t bor i lib/daniel-agentrad-evidence.ts; den här filen är facit-
 * testad rent (tests/daniel-agentrad.spec.ts).
 */

export const AGENTRAD_MIN_SAMPLE = 3
export const AGENTRAD_SNOOZE_MS = 24 * 60 * 60 * 1000
/** Så många tecken av lärdomen som får plats i den hopfällda raden. */
export const AGENTRAD_LESSON_MAX_CHARS = 120

export interface AgentradExample {
  project_id: string
  name: string
  closed_at: string | null
  quoted_hours: number
  actual_hours: number
  /** actual − quoted, avrundat till hela timmar. */
  delta_hours: number
}

export interface AgentradLesson {
  project_id: string
  lesson_text: string
  created_at: string | null
}

export interface AgentradEvidence {
  examples: AgentradExample[]
  over_count: number
  sample_count: number
  lesson: AgentradLesson | null
}

export type AgentradChoice = 'lagg_till' | 'behall'
export const AGENTRAD_CHOICES: AgentradChoice[] = ['lagg_till', 'behall']

/** Minsta gemensamma nämnare för en project_outcome-rad i den här filen. */
export interface AgentradOutcomeRow {
  project_id: string
  closed_at?: string | null
  quoted_hours: number | null
  actual_hours: number | null
  hours_diff_pct?: number | null
  time_learning_eligible?: boolean | null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** Samma urval som getEfterkalkylInsight räknar på: kvalitetsgrindad + mätbar avvikelse. */
export function eligibleOutcomeRows<T extends AgentradOutcomeRow>(rows: T[]): T[] {
  return rows.filter(row => {
    if (row.time_learning_eligible === false) return false
    const hasPair = isFiniteNumber(Number(row.quoted_hours)) && row.quoted_hours != null
      && isFiniteNumber(Number(row.actual_hours)) && row.actual_hours != null
    const hasPct = row.hours_diff_pct != null && isFiniteNumber(Number(row.hours_diff_pct))
    return hasPair || hasPct
  })
}

/** "7 av 7": hur många av de kvalificerade utfallen tog mer tid än offererat. */
export function countOverruns(rows: AgentradOutcomeRow[]): { over_count: number; sample_count: number } {
  const eligible = eligibleOutcomeRows(rows)
  let over = 0
  for (const row of eligible) {
    if (row.quoted_hours != null && row.actual_hours != null) {
      if (Number(row.actual_hours) > Number(row.quoted_hours)) over += 1
    } else if (Number(row.hours_diff_pct) > 0) {
      over += 1
    }
  }
  return { over_count: over, sample_count: eligible.length }
}

/** Nyast avslutade först; rader utan closed_at hamnar sist. */
export function sortNewestClosedFirst<T extends { closed_at?: string | null }>(rows: T[]): T[] {
  const time = (value: string | null | undefined) => {
    if (!value) return Number.NEGATIVE_INFINITY
    const ms = Date.parse(value)
    return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY
  }
  return [...rows].sort((a, b) => time(b.closed_at) - time(a.closed_at))
}

/**
 * Upp till `limit` exempelkort. Bara rader med både offererade och faktiska
 * timmar duger som exempel — ett kort utan delta säger ingenting.
 */
export function buildAgentradExamples(
  rows: AgentradOutcomeRow[],
  names: Record<string, string | null | undefined>,
  limit = 3,
): AgentradExample[] {
  const usable = eligibleOutcomeRows(rows).filter(row => (
    row.quoted_hours != null && row.actual_hours != null
  ))
  return sortNewestClosedFirst(usable).slice(0, Math.max(0, limit)).map(row => {
    const quoted = Number(row.quoted_hours)
    const actual = Number(row.actual_hours)
    return {
      project_id: row.project_id,
      name: (names[row.project_id] || '').trim() || 'Projekt utan namn',
      closed_at: row.closed_at ?? null,
      quoted_hours: Math.round(quoted * 10) / 10,
      actual_hours: Math.round(actual * 10) / 10,
      delta_hours: Math.round(actual - quoted),
    }
  })
}

export interface AgentradGateInput {
  status: 'ready' | 'insufficient' | 'unavailable' | string | null | undefined
  show_warning: boolean | null | undefined
  similar_jobs: number | null | undefined
  quote_status: string | null | undefined
}

/**
 * Raden finns bara när verklighetskontrollen är klar OCH varnar, urvalet är
 * minst tre jobb och offerten fortfarande är ett utkast. En skickad eller
 * accepterad offert får ingen rad — timmarna går inte längre att ändra.
 */
export function shouldShowAgentrad(input: AgentradGateInput): boolean {
  if (input.status !== 'ready') return false
  if (input.show_warning !== true) return false
  if (!isFiniteNumber(Number(input.similar_jobs)) || Number(input.similar_jobs) < AGENTRAD_MIN_SAMPLE) return false
  return input.quote_status === 'draft'
}

export function formatHours(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return rounded.toLocaleString('sv-SE', { maximumFractionDigits: 1 })
}

export function truncateLesson(text: string, max = AGENTRAD_LESSON_MAX_CHARS): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  const cut = clean.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,.;:!?–-]+$/, '')}…`
}

export interface AgentradSentenceInput {
  sample_count: number
  over_count: number
  suggested_buffer_hours: number
  quoted_hours: number
  lesson?: AgentradLesson | null
}

/**
 * Den ärliga meningen i raden. Varje tal är mätt: antal jobb, antal som gick
 * över, snittbufferten (halvtimmesavrundad i verklighetskontrollen) och
 * offertens egna timmar. Lärdomen citeras bara när den finns.
 */
export function buildAgentradSentence(input: AgentradSentenceInput): string {
  const parts = [
    `Lärdom från ${input.sample_count} liknande jobb: ${input.over_count} av ${input.sample_count} tog mer tid än offererat, i snitt +${formatHours(input.suggested_buffer_hours)} h. Den här offerten räknar med ${formatHours(input.quoted_hours)} h.`,
  ]
  const lesson = input.lesson?.lesson_text?.trim()
  if (lesson) parts.push(`Från debriefen: ”${truncateLesson(lesson)}”`)
  return parts.join(' ')
}

export function buildDecisionPreference(choice: AgentradChoice, hours: number): string {
  return choice === 'lagg_till'
    ? `Lägger till Daniels föreslagna buffert (+${formatHours(hours)} h) när liknande jobb gått över tid.`
    : `Behåller sina egna timmar (${formatHours(hours)} h) trots att liknande jobb gått över tid.`
}

// ─── Snooza / avfärda — per offert och webbläsare ────────────────────────

export function agentradStorageKey(quoteId: string): string {
  return `hm_daniel_rad_${quoteId}`
}

export function snoozeUntil(now: number): number {
  return now + AGENTRAD_SNOOZE_MS
}

export type AgentradStoredState = { until: number } | { dismissed: true }

export type AgentradVisibility = 'visible' | 'snoozed' | 'dismissed'

interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Läser tillståndet utan att någonsin kasta — ingen storage ⇒ synlig. */
export function readAgentradVisibility(
  quoteId: string,
  storage: StorageLike | null | undefined,
  now: number,
): AgentradVisibility {
  try {
    const raw = storage?.getItem(agentradStorageKey(quoteId))
    if (!raw) return 'visible'
    const parsed = JSON.parse(raw) as Partial<{ until: unknown; dismissed: unknown }>
    if (parsed && parsed.dismissed === true) return 'dismissed'
    if (parsed && typeof parsed.until === 'number' && Number.isFinite(parsed.until) && parsed.until > now) {
      return 'snoozed'
    }
    return 'visible'
  } catch {
    return 'visible'
  }
}

export function writeAgentradState(
  quoteId: string,
  storage: StorageLike | null | undefined,
  state: AgentradStoredState,
): void {
  try {
    storage?.setItem(agentradStorageKey(quoteId), JSON.stringify(state))
  } catch {
    // Privat läge/blockerad lagring — raden fungerar ändå, bara inte minnet.
  }
}

// ─── Datumformat i korten ────────────────────────────────────────────────

const MONTHS_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december']

/** "september 2026" — för "Projekt · avslutat {månad år}". */
export function formatMonthYear(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${MONTHS_SV[date.getMonth()]} ${date.getFullYear()}`
}

/** "12 aug 2026" — för "Debrief · {datum}". */
export function formatShortDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getDate()} ${MONTHS_SV[date.getMonth()].slice(0, 3)} ${date.getFullYear()}`
}

/** "+9 h" i mono-amber, "−2 h" när jobbet gick snabbare, "±0 h" på pricken. */
export function formatDeltaHours(delta: number): string {
  if (delta > 0) return `+${delta} h`
  if (delta < 0) return `−${Math.abs(delta)} h`
  return '±0 h'
}
