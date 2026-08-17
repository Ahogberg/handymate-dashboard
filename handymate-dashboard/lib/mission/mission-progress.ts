/**
 * Härledd uppdragsprogress — Goal-to-Plan V1 (Etapp A).
 *
 * ═══ PROGRESS LAGRAS ALDRIG — DEN HÄRLEDS VID VARJE LÄSNING ═══
 *
 * Value Ledger-mönstret (lib/value/ledger.ts): mission-tabellen bär bara
 * målet och den frysta planen; varje kr-siffra i progressen räknas fram ur
 * invoice/pending_approvals/quotes i läsögonblicket. Det som inte lagras
 * kan inte driva isär från verkligheten.
 *
 * ═══ ATTRIBUTIONSREGLERNA (konservativa, medvetet snåla) ═══
 *
 * 1. En fakturas kronor räknas som VERIFIERAT BETALT enbart när fakturan är
 *    DIREKT refererad — av ett planstegs bevis (evidence.table 'invoice')
 *    eller av ett mission-korts payload.execution_result.artifacts.invoice_id
 *    (samma direktreferens-regel som lib/value/recovered-revenue.ts) — OCH
 *    status är 'paid' med paid_at inom uppdragsfönstret
 *    [created_at, resolved_at ?? nu]. En betalning som råkar landa under
 *    uppdraget utan referens attribuerar ALDRIG (sammanträffande är inte
 *    bevis). Beloppet är FAKTURANS, aldrig planstegets frysta mått.
 * 2. Fakturerat följer ledger-konventionen: fakturan finns och har lämnat
 *    utkastläget (status bortom 'draft'). Delmängdssemantik som ledgern:
 *    betalt ⊆ fakturerat.
 * 3. Pipeline rapporterar RÖRELSE: refererade offerter som nått vunnen
 *    status (WON_QUOTE_STATUSES) räknas i antal — aldrig kronor in i betalt.
 * 4. Återaktivering rapporterar antal godkända mission-kort i sin klass.
 *    Klasstillhörighet för ett kort: payload.truth_class (stämplas av
 *    Etapp B:s verkställning) i första hand, annars en snål
 *    approval_type-mappning; okänd typ attribuerar ingenting.
 * 5. Kronor ackumuleras BARA i kr-klasserna (indrivningsbart,
 *    faktureringsklart) — och varje faktura räknas högst en gång, även när
 *    flera referenser pekar på den.
 * 6. 'expired' härleds vid läsning (deadline passerad, ren datumjämförelse)
 *    — ingen cron.
 *
 * Ren kärna (byggMissionProgress, facit i tests/mission-progress.spec.ts)
 * + fail-soft I/O (getMissionProgress): tabellfel → nollprogress med
 * loggad varning, aldrig ett kastat fel upp till användaren.
 *
 * ═══ ETAPP F: KAPACITETSMÅL (Goal-to-Plan V2) ═══
 *
 * En kapacitetsmission (goal_type 'capacity') mäter INGA kronor — målet är
 * TIMMAR att boka i en enda målvecka, mot lib/capacity/week-capacity.ts:s
 * redan levande kapacitetstal (ÅTERANVÄNT, aldrig omimplementerat). Samma
 * per-klass-attribution (verified_paid_kr osv.) körs oförändrat även för
 * kapacitetsmissioner om ett plansteg råkar referera en faktura — det är
 * fortfarande "pengar på banken" som fakta, det är bara det att uppdragets
 * GAP (gap_hours) aldrig läser den summan. gap_kr och gap_hours är därför
 * ömsesidigt uteslutande på toppnivå (se MissionProgress-kommentarerna),
 * även om per_class kan innehålla kr-fakta i båda fallen.
 *
 * MÅLVECKANS REGEL (byggMissionProgress tar emot den redan uträknad — se
 * capacityTargetWeekMonday + getMissionProgress för I/O:t): veckan som
 * innehåller uppdragets deadline, MEN aldrig längre bort än nästa vecka.
 * En kapacitetsplan är per definition "fyll NÄSTA veckas luckor" (se
 * Design-avsnittet i tasks/jaunty-pondering-hummingbird.md); en avlägsen
 * deadline ska inte få oss att mäta mot en ännu obestämd framtida vecka —
 * då faller vi tillbaka på nästa vecka. En snäv deadline i INNEVARANDE
 * vecka ("boka innan fredag") mäts mot den veckan, inte nästa.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { WON_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { TRUTH_CLASSES, type TruthClass } from './opportunity-portfolio'
import type { ValidatedMissionStep } from './plan-validation'
import { resolveGoalType, type MissionGoalType } from './goal-type'
import { getWeekCapacity, mondayOfWeek } from '@/lib/capacity/week-capacity'
import { svDateStrPlusDays } from '@/lib/dates'

export interface MissionRow {
  id: string
  business_id: string
  /** null för kapacitetsuppdrag (goal_type 'capacity'). */
  goal_kr: number | null
  deadline: string
  status: 'active' | 'completed' | 'cancelled' | 'expired'
  plan_snapshot: { steps: ValidatedMissionStep[] }
  portfolio_generated_at: string
  created_at: string
  resolved_at: string | null
  /**
   * Etapp F. Optional — miljöer där sql/v145 inte körts saknar kolumnen
   * helt; varje läsning defaultar via resolveGoalType() (lib/mission/
   * goal-type.ts) till 'money', ALDRIG en krasch eller en gissad
   * kapacitetsplan.
   */
  goal_type?: MissionGoalType
  /** null för pengauppdrag; optional av samma fail-soft-skäl som goal_type. */
  goal_hours?: number | null
}

export interface ClassProgress {
  /** Fakturans belopp när betalningen är direktrefererad och i fönstret.
      Alltid 0 för antalsklasserna. */
  verified_paid_kr: number
  /** Refererade fakturor bortom utkastläget (betalt ingår — delmängd). */
  invoiced_kr: number
  /** Pipeline: vunna refererade offerter. Återaktivering: godkända kort. */
  moved_count: number
  step_count: number
}

export interface MissionProgress {
  per_class: Partial<Record<TruthClass, ClassProgress>>
  /** Öppna mission-kort (payload.mission_id) som väntar på ägaren. */
  decisions_outstanding: number
  /** Deadline passerad medan status ännu är 'active' — härlett, ej lagrat. */
  is_expired: boolean
  /**
   * max(0, goal_kr − verifierat betalt över kr-klasserna). DETTA är inte
   * den förbjudna klassblandningen: att summera VERIFIERAT BETALDA kronor
   * över indrivningsbart och faktureringsklart är samma epistemiska klass
   * (pengar på banken) oavsett vilken kr-klass fakturan kom ur — till
   * skillnad från att blanda IHOP olika SLAGS sanning (betalt, fakturerat,
   * pipeline, antal) till en gemensam siffra, vilket förblir förbjudet.
   *
   * Etapp F: null för kapacitetsuppdrag — se gap_hours. Ett uppdrag har
   * ALDRIG både gap_kr och gap_hours satta.
   */
  gap_kr: number | null
  /**
   * Etapp F (kapacitetsmål). max(0, goal_hours − bokade timmar i
   * uppdragets MÅLVECKA) — "bokade timmar" kommer från
   * lib/capacity/week-capacity.ts (återanvänt, se filhuvudet för
   * målveckans regel). null för pengauppdrag OCH när målveckans kapacitet
   * saknar en verklig inställning (se capacity_unconfigured) — ett gap
   * räknas ALDRIG fram ur en gissning.
   */
  gap_hours: number | null
  /**
   * True bara när uppdraget är ett kapacitetsmål och målveckans kapacitet
   * INTE kommer från en verklig inställning (week-capacity source !==
   * 'settings'). Alltid false för pengauppdrag. Ytan visar då "—", aldrig
   * ett påhittat gap.
   */
  capacity_unconfigured: boolean
}

/** Bokade timmar + proveniens för uppdragets målvecka — I/O-lagrets
    (getMissionProgress) redan uträknade indata till den rena kärnan. */
export interface MissionCapacityWeekInput {
  bookedHours: number
  /** true bara när talet kommer från en verklig inställning — week-
      capacity-regeln (source==='settings'), aldrig fallback-gissningen. */
  configured: boolean
}

/**
 * Kapacitetsuppdragets målvecka (måndag, YYYY-MM-DD) — se filhuvudets
 * "MÅLVECKANS REGEL" för motiveringen. Exporterad ren funktion så regeln
 * kan facit-testas isolerat.
 */
export function capacityTargetWeekMonday(deadline: string, now: Date): string {
  const nextWeekMonday = mondayOfWeek(svDateStrPlusDays(7, now))
  const deadlineDateOnly = typeof deadline === 'string' ? deadline.slice(0, 10) : ''
  if (!deadlineDateOnly) return nextWeekMonday
  const deadlineWeekMonday = mondayOfWeek(deadlineDateOnly)
  return deadlineWeekMonday > nextWeekMonday ? nextWeekMonday : deadlineWeekMonday
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

export interface MissionInvoiceInput {
  invoice_id: string
  total: number
  status: string
  paid_at: string | null
}

export interface MissionApprovalInput {
  id: string
  status: string
  approval_type: string
  payload: Record<string, unknown>
}

export interface MissionQuoteInput {
  quote_id: string
  status: string
}

/** Ledger-konventionen: godkänt är approved eller auto_approved. */
const APPROVED_STATUSES = new Set(['approved', 'auto_approved'])

/** Kronor får bara ackumuleras här — övriga klasser mäter antal/rörelse. */
const KR_CLASSES = new Set<TruthClass>(['indrivningsbart', 'faktureringsklart'])

/** Snål approval_type → klass-mappning för mission-kort utan stämplad
    payload.truth_class. Okänd typ → null (attribuerar ingenting). */
const APPROVAL_TYPE_CLASS: Record<string, TruthClass> = {
  invoice_reminder: 'indrivningsbart',
  missad_intakt: 'faktureringsklart',
  fakturera_projekt: 'faktureringsklart',
  quote_nudge: 'pipeline',
  profitability_warning: 'marginalskydd',
}

function isTruthClass(v: unknown): v is TruthClass {
  return typeof v === 'string' && (TRUTH_CLASSES as readonly string[]).includes(v)
}

function approvalClass(approval: MissionApprovalInput): TruthClass | null {
  const stamped = approval.payload?.truth_class
  if (isTruthClass(stamped)) return stamped
  return APPROVAL_TYPE_CLASS[approval.approval_type] ?? null
}

/** Direktreferensen ur ett verkställt korts artefakter — samma fält som
    lib/value/recovered-revenue.ts läser. */
export function approvalArtifactInvoiceId(payload: Record<string, unknown> | null | undefined): string | null {
  const execution = payload?.execution_result
  if (!execution || typeof execution !== 'object') return null
  const artifacts = (execution as Record<string, unknown>).artifacts
  if (!artifacts || typeof artifacts !== 'object') return null
  const invoiceId = (artifacts as Record<string, unknown>).invoice_id
  return typeof invoiceId === 'string' && invoiceId ? invoiceId : null
}

export function byggMissionProgress(input: {
  mission: MissionRow
  invoices: MissionInvoiceInput[]
  missionApprovals: MissionApprovalInput[]
  quotes: MissionQuoteInput[]
  nowMs: number
  /** Etapp F — bara relevant för kapacitetsuppdrag; null/utelämnat för
      pengauppdrag ELLER när I/O-lagret inte kunde läsa kapaciteten. */
  capacityWeek?: MissionCapacityWeekInput | null
}): MissionProgress {
  const { mission } = input
  const steps = Array.isArray(mission.plan_snapshot?.steps) ? mission.plan_snapshot.steps : []

  const perClass: Partial<Record<TruthClass, ClassProgress>> = {}
  const klass = (cls: TruthClass): ClassProgress => {
    let entry = perClass[cls]
    if (!entry) {
      entry = { verified_paid_kr: 0, invoiced_kr: 0, moved_count: 0, step_count: 0 }
      perClass[cls] = entry
    }
    return entry
  }

  for (const step of steps) {
    if (isTruthClass(step.truth_class)) klass(step.truth_class).step_count += 1
  }

  // ── Fakturaattribution: direktreferenser, varje faktura högst en gång. ─
  const invoiceById = new Map(input.invoices.map(inv => [inv.invoice_id, inv]))
  const attributions: Array<{ invoiceId: string; cls: TruthClass }> = []
  for (const step of steps) {
    if (step.evidence?.table === 'invoice' && typeof step.evidence.ref_id === 'string' && isTruthClass(step.truth_class)) {
      attributions.push({ invoiceId: step.evidence.ref_id, cls: step.truth_class })
    }
  }
  for (const approval of input.missionApprovals) {
    const invoiceId = approvalArtifactInvoiceId(approval.payload)
    const cls = approvalClass(approval)
    if (invoiceId && cls) attributions.push({ invoiceId, cls })
  }

  const createdMs = Date.parse(mission.created_at)
  const slutMs = mission.resolved_at ? Date.parse(mission.resolved_at) : input.nowMs

  const raknadeFakturor = new Set<string>()
  for (const { invoiceId, cls } of attributions) {
    if (!KR_CLASSES.has(cls)) continue
    if (raknadeFakturor.has(invoiceId)) continue
    const inv = invoiceById.get(invoiceId)
    if (!inv) continue
    raknadeFakturor.add(invoiceId)

    const belopp = Math.round(Number(inv.total) || 0)
    if (belopp <= 0) continue
    if (inv.status === 'draft') continue // utkast är ännu ingen faktura

    const entry = klass(cls)
    entry.invoiced_kr += belopp // FAKTURANS belopp — aldrig stegets frysta mått

    if (inv.status !== 'paid' || !inv.paid_at) continue
    const paidMs = Date.parse(inv.paid_at)
    const inomFonstret = Number.isFinite(paidMs)
      && Number.isFinite(createdMs)
      && paidMs >= createdMs
      && paidMs <= slutMs
    if (inomFonstret) entry.verified_paid_kr += belopp
  }

  // ── Pipeline-rörelse: refererade offerter som nått vunnen status. ─────
  const quoteById = new Map(input.quotes.map(q => [q.quote_id, q]))
  const wonStatuses = new Set<string>([...WON_QUOTE_STATUSES])
  for (const step of steps) {
    if (step.evidence?.table !== 'quotes' || !isTruthClass(step.truth_class)) continue
    const quote = quoteById.get(step.evidence.ref_id)
    if (quote && wonStatuses.has(quote.status)) klass(step.truth_class).moved_count += 1
  }

  // ── Återaktiverings-rörelse + väntande beslut. ────────────────────────
  let vantande = 0
  for (const approval of input.missionApprovals) {
    if (approval.status === 'pending') vantande += 1
    if (!APPROVED_STATUSES.has(approval.status)) continue
    if (approvalClass(approval) === 'ateraktivering') klass('ateraktivering').moved_count += 1
  }

  const nowDate = new Date(input.nowMs).toISOString().slice(0, 10)
  const deadlineDate = typeof mission.deadline === 'string' ? mission.deadline.slice(0, 10) : ''

  // ── Målgapet: ETT enda facit, grenat på goal_type — aldrig båda. ───────
  // Pengamål (Etapp D): summerar verifieratBetaltKr över kr-klasserna, se
  // kommentaren på MissionProgress.gap_kr för varför det INTE är
  // klassblandningen. Kapacitetsmål (Etapp F): timmar mot uppdragets
  // MÅLVECKA (capacityWeek, uträknad av I/O-lagret) — bara när veckan har
  // en verklig kapacitetsinställning, annars capacity_unconfigured.
  const goalType = resolveGoalType(mission.goal_type)
  let gapKr: number | null = null
  let gapHours: number | null = null
  let capacityUnconfigured = false

  if (goalType === 'money') {
    let verifieratBetaltKr = 0
    for (const cls of Array.from(KR_CLASSES)) {
      verifieratBetaltKr += perClass[cls]?.verified_paid_kr ?? 0
    }
    gapKr = Math.max(0, Math.round(Number(mission.goal_kr) || 0) - verifieratBetaltKr)
  } else {
    const cw = input.capacityWeek ?? null
    if (cw && cw.configured) {
      const bokat = round1(cw.bookedHours)
      const mal = round1(Number(mission.goal_hours) || 0)
      gapHours = Math.max(0, round1(mal - bokat))
    } else {
      capacityUnconfigured = true
    }
  }

  return {
    per_class: perClass,
    decisions_outstanding: vantande,
    is_expired: mission.status === 'active' && deadlineDate !== '' && deadlineDate < nowDate,
    gap_kr: gapKr,
    gap_hours: gapHours,
    capacity_unconfigured: capacityUnconfigured,
  }
}

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

/** Ett mission-korts approval-rad, MED title — samma rad som
    MissionApprovalInput men med kolumnen expansionspanelen (Etapp G)
    behöver för att lista beslutet begripligt. Egen lokal typ i stället för
    att bredda MissionApprovalInput: bara loadMissionProgressInputs/
    getMissionProgressWithDecisions bryr sig om title, resten av filen
    (byggMissionProgress) rör den aldrig. */
type MissionApprovalRow = MissionApprovalInput & { title?: string | null }

/**
 * I/O: läser exakt de indata-mängder den rena kärnan behöver — mission-kort
 * via payload.mission_id (samma .contains-konvention som lib/autopilot/
 * quote-nudge.ts), fakturor och offerter via planstegens/artefakternas
 * referenser, plus (Etapp F) kapacitetsuppdragets bokade timmar. Delad av
 * getMissionProgress OCH getMissionProgressWithDecisions (Etapp G) — samma
 * approvals-rader ska inte läsas två gånger för samma sida.
 *
 * Etapp H: exporterad (minimal ändring, byggMissionProgress orörd) så
 * lib/mission/mission-facit.ts:s listMissionFacit kan återanvända EXAKT
 * samma inläsning per uppdrag i historiken — ingen egen kopia av invoice-/
 * quotes-/kapacitetsuppslagen.
 */
export async function loadMissionProgressInputs(
  supabase: SupabaseClient,
  mission: MissionRow,
  nowMs: number,
): Promise<{
  invoices: MissionInvoiceInput[]
  missionApprovals: MissionApprovalRow[]
  quotes: MissionQuoteInput[]
  capacityWeek: MissionCapacityWeekInput | null
}> {
  const { data: approvalRows, error: approvalError } = await supabase
    .from('pending_approvals')
    .select('id, status, approval_type, payload, title')
    .eq('business_id', mission.business_id)
    .contains('payload', { mission_id: mission.id })
  if (approvalError) throw new Error(`pending_approvals-uppslag misslyckades: ${approvalError.message}`)
  const missionApprovals = asRows<MissionApprovalRow>(approvalRows)
    .map(row => ({ ...row, payload: (row.payload ?? {}) as Record<string, unknown> }))

  const steps = Array.isArray(mission.plan_snapshot?.steps) ? mission.plan_snapshot.steps : []
  const invoiceIds = new Set<string>()
  const quoteIds = new Set<string>()
  for (const step of steps) {
    if (step.evidence?.table === 'invoice' && typeof step.evidence.ref_id === 'string') {
      invoiceIds.add(step.evidence.ref_id)
    }
    if (step.evidence?.table === 'quotes' && typeof step.evidence.ref_id === 'string') {
      quoteIds.add(step.evidence.ref_id)
    }
  }
  for (const approval of missionApprovals) {
    const invoiceId = approvalArtifactInvoiceId(approval.payload)
    if (invoiceId) invoiceIds.add(invoiceId)
  }

  let invoices: MissionInvoiceInput[] = []
  if (invoiceIds.size > 0) {
    const { data, error } = await supabase
      .from('invoice')
      .select('invoice_id, total, status, paid_at')
      .eq('business_id', mission.business_id)
      .in('invoice_id', Array.from(invoiceIds))
    if (error) throw new Error(`invoice-uppslag misslyckades: ${error.message}`)
    invoices = asRows<MissionInvoiceInput>(data)
  }

  let quotes: MissionQuoteInput[] = []
  if (quoteIds.size > 0) {
    const { data, error } = await supabase
      .from('quotes')
      .select('quote_id, status')
      .eq('business_id', mission.business_id)
      .in('quote_id', Array.from(quoteIds))
    if (error) throw new Error(`quotes-uppslag misslyckades: ${error.message}`)
    quotes = asRows<MissionQuoteInput>(data)
  }

  // ── Etapp F: kapacitetsuppdragets bokade timmar i målveckan. ──────────
  // Egen try/catch: ett kapacitetsfel ska degradera till
  // capacity_unconfigured, aldrig fälla hela progress-läsningen (samma
  // fail-soft-linje som invoice-/quotes-uppslagen ovan hör till den
  // gemensamma try:n, men det här är en extra, separat I/O-källa).
  let capacityWeek: MissionCapacityWeekInput | null = null
  if (resolveGoalType(mission.goal_type) === 'capacity') {
    try {
      const targetWeek = capacityTargetWeekMonday(mission.deadline, new Date(nowMs))
      const wc = await getWeekCapacity(supabase, mission.business_id, targetWeek)
      capacityWeek = { bookedHours: wc.booked_hours, configured: wc.configured }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[mission-progress] kapacitet kunde inte läsas (gap_hours blir okonfigurerat):', msg)
      capacityWeek = null
    }
  }

  return { invoices, missionApprovals, quotes, capacityWeek }
}

/**
 * Fail-soft I/O: läser via loadMissionProgressInputs och kör den rena
 * kärnan. Vilket fel som helst (inklusive att mission-tabellens grannar
 * saknas) → nollprogress + loggad varning.
 */
export async function getMissionProgress(
  supabase: SupabaseClient,
  mission: MissionRow,
): Promise<MissionProgress> {
  const nowMs = Date.now()
  try {
    const { invoices, missionApprovals, quotes, capacityWeek } = await loadMissionProgressInputs(supabase, mission, nowMs)
    return byggMissionProgress({ mission, invoices, missionApprovals, quotes, nowMs, capacityWeek })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-progress] kunde inte härleda progress (nollprogress):', msg)
    return byggMissionProgress({ mission, invoices: [], missionApprovals: [], quotes: [], nowMs, capacityWeek: null })
  }
}

/** En öppen (status 'pending') beslutsrad kopplad till uppdraget —
    expansionspanelens (Etapp G) "Beslut"-sektion. Samma räknare som
    MissionProgress.decisions_outstanding, bara med id/title/typ per rad. */
export interface MissionDecision {
  id: string
  title: string
  status: string
  approval_type: string
}

/**
 * Etapp G (expansionspanelen): samma I/O-källa som getMissionProgress —
 * läses EN gång, delas mellan progress och beslutslistan — men svarar också
 * med de öppna besluten så panelen kan lista dem utan en andra fråga.
 * Fail-soft identiskt med getMissionProgress: ett läsfel ger nollprogress +
 * tom beslutslista, aldrig ett kastat fel.
 */
export async function getMissionProgressWithDecisions(
  supabase: SupabaseClient,
  mission: MissionRow,
): Promise<{ progress: MissionProgress; decisions: MissionDecision[] }> {
  const nowMs = Date.now()
  try {
    const { invoices, missionApprovals, quotes, capacityWeek } = await loadMissionProgressInputs(supabase, mission, nowMs)
    const progress = byggMissionProgress({ mission, invoices, missionApprovals, quotes, nowMs, capacityWeek })
    const decisions: MissionDecision[] = missionApprovals
      .filter(a => a.status === 'pending')
      .map(a => ({
        id: a.id,
        title: typeof a.title === 'string' && a.title ? a.title : 'Beslut väntar på dig',
        status: a.status,
        approval_type: a.approval_type,
      }))
    return { progress, decisions }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-progress] kunde inte härleda progress (nollprogress):', msg)
    return {
      progress: byggMissionProgress({ mission, invoices: [], missionApprovals: [], quotes: [], nowMs, capacityWeek: null }),
      decisions: [],
    }
  }
}
