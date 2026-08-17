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
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { WON_QUOTE_STATUSES } from '@/lib/quotes/statuses'
import { TRUTH_CLASSES, type TruthClass } from './opportunity-portfolio'
import type { ValidatedMissionStep } from './plan-validation'

export interface MissionRow {
  id: string
  business_id: string
  goal_kr: number
  deadline: string
  status: 'active' | 'completed' | 'cancelled' | 'expired'
  plan_snapshot: { steps: ValidatedMissionStep[] }
  portfolio_generated_at: string
  created_at: string
  resolved_at: string | null
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
   */
  gap_kr: number
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

  // ── gap_kr: DET enda facit för hur nära målet uppdraget är. ────────────
  // Summerar verifieratBetaltKr över kr-klasserna — se kommentaren på
  // MissionProgress.gap_kr för varför det INTE är klassblandningen.
  let verifieratBetaltKr = 0
  for (const cls of Array.from(KR_CLASSES)) {
    verifieratBetaltKr += perClass[cls]?.verified_paid_kr ?? 0
  }
  const gapKr = Math.max(0, Math.round(Number(mission.goal_kr) || 0) - verifieratBetaltKr)

  return {
    per_class: perClass,
    decisions_outstanding: vantande,
    is_expired: mission.status === 'active' && deadlineDate !== '' && deadlineDate < nowDate,
    gap_kr: gapKr,
  }
}

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : []
}

/**
 * I/O: läser exakt de tre indata-mängderna den rena kärnan behöver —
 * mission-kort via payload.mission_id (samma .contains-konvention som
 * lib/autopilot/quote-nudge.ts), fakturor och offerter via planstegens/
 * artefakternas referenser. Fail-soft: vilket fel som helst (inklusive
 * att mission-tabellens grannar saknas) → nollprogress + loggad varning.
 */
export async function getMissionProgress(
  supabase: SupabaseClient,
  mission: MissionRow,
): Promise<MissionProgress> {
  const nowMs = Date.now()
  try {
    const { data: approvalRows, error: approvalError } = await supabase
      .from('pending_approvals')
      .select('id, status, approval_type, payload')
      .eq('business_id', mission.business_id)
      .contains('payload', { mission_id: mission.id })
    if (approvalError) throw new Error(`pending_approvals-uppslag misslyckades: ${approvalError.message}`)
    const missionApprovals = asRows<MissionApprovalInput>(approvalRows)
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

    return byggMissionProgress({ mission, invoices, missionApprovals, quotes, nowMs })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[mission-progress] kunde inte härleda progress (nollprogress):', msg)
    return byggMissionProgress({ mission, invoices: [], missionApprovals: [], quotes: [], nowMs })
  }
}
