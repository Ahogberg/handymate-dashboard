/**
 * Financial Kernel — Ledger (Paket C8, 2026-09-16).
 *
 * Tunna wrappers över de åtta RPC:erna i sql/v251_ledger_posting_engine.sql.
 * Samma form som lib/financial-kernel/receivables/service.ts: alla argument
 * heter p_*, null för det som saknas, belopp i minor units som strängar åt
 * båda hållen (aldrig Number, aldrig tolerans — ARCHITECTURE.md FK.0 regel 3).
 * Ingen affärsregel bor här: kontonummer, serier och momskoder är C9:s och
 * konsultens (brief §0). Ingen flagga, ingen cron-koppling.
 */
import type { KernelDb } from '../financial-kernel/events/publish'
import type { FinancialActorType } from '../financial-kernel/events/types'
import { bool, domainRpc, object, text } from '../financial-kernel/receivables/service'

export type LedgerActor = { type: FinancialActorType; id?: string }
export type LedgerAccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
export type LedgerAccountSource = 'proposal' | 'sie_import' | 'manual'

export interface LedgerPeriodView { id: string; startsOn: string; endsOn: string; status: 'open' | 'locked' }
export interface LedgerFiscalYearView { id: string; startsOn: string; endsOn: string; status: 'open' | 'closed'; periods: LedgerPeriodView[] }
export interface LedgerJournalView { id: string; series: string; name: string }
export interface LedgerAccountView {
  id: string; number: string; name: string; type: LedgerAccountType; active: boolean; source: LedgerAccountSource
  confirmedBy?: string; confirmedAt?: string
}

/** En rad in till RPC:n. Exakt en sida > 0; belopp som heltalssträngar i minor units. */
export interface LedgerLineInput {
  account: string
  debitMinor?: string
  creditMinor?: string
  vatCode?: string
  projectId?: string
  customerId?: string
  supplierId?: string
  metadata?: Record<string, unknown>
}
export interface LedgerLineView {
  lineNo: number; account: string; accountId: string; debitMinor: string; creditMinor: string
  vatCode?: string; projectId?: string; customerId?: string; supplierId?: string; metadata: Record<string, unknown>
}
export interface LedgerEntryView {
  id: string; journalId: string; series: string; fiscalYearId: string; periodId: string
  voucherNumber: number; journalType: string; effectiveDate: string; postedAt: string
  currency: string; totalMinor: string; description: string
  sourceEventId?: string; correlationId: string; postingRuleId: string; postingRuleVersion: number
  reversalOfEntryId?: string; reversedByEntryId?: string; status: 'posted' | 'reversed'
  postedEventId: string; actor: LedgerActor
  lines: LedgerLineView[]
}
export interface LedgerPeriodChange { id: string; status: 'open' | 'locked'; changed: boolean; eventId?: string }

function minor(value: unknown): string {
  const s = text(value)
  if (!/^\d+$/.test(s)) throw new TypeError('Expected lossless minor-unit string')
  return s
}
function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new TypeError('Expected integer')
  return value
}
function optional(value: unknown): string | undefined { return value == null ? undefined : text(value) }
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  const s = text(value)
  if (!allowed.includes(s as T)) throw new TypeError(`Unexpected value ${s}`)
  return s as T
}

export function ledgerPeriod(value: unknown): LedgerPeriodView {
  const r = object(value)
  return { id: text(r.id), startsOn: text(r.starts_on), endsOn: text(r.ends_on), status: oneOf(r.status, ['open', 'locked'] as const) }
}
export function ledgerFiscalYear(value: unknown): LedgerFiscalYearView {
  const r = object(value)
  if (!Array.isArray(r.periods)) throw new TypeError('Missing periods')
  return { id: text(r.id), startsOn: text(r.starts_on), endsOn: text(r.ends_on), status: oneOf(r.status, ['open', 'closed'] as const), periods: r.periods.map(ledgerPeriod) }
}
export function ledgerAccount(value: unknown): LedgerAccountView {
  const r = object(value)
  return {
    id: text(r.id), number: text(r.number), name: text(r.name),
    type: oneOf(r.type, ['asset', 'liability', 'equity', 'revenue', 'expense'] as const), active: bool(r.active),
    source: oneOf(r.source, ['proposal', 'sie_import', 'manual'] as const),
    ...(r.confirmed_by == null ? {} : { confirmedBy: text(r.confirmed_by) }),
    ...(r.confirmed_at == null ? {} : { confirmedAt: text(r.confirmed_at) }),
  }
}
export function ledgerLine(value: unknown): LedgerLineView {
  const r = object(value)
  const metadata = r.metadata == null ? {} : object(r.metadata)
  return {
    lineNo: int(r.line_no), account: text(r.account), accountId: text(r.account_id),
    debitMinor: minor(r.debit_minor), creditMinor: minor(r.credit_minor),
    ...(r.vat_code == null ? {} : { vatCode: text(r.vat_code) }),
    ...(r.project_id == null ? {} : { projectId: text(r.project_id) }),
    ...(r.customer_id == null ? {} : { customerId: text(r.customer_id) }),
    ...(r.supplier_id == null ? {} : { supplierId: text(r.supplier_id) }),
    metadata,
  }
}
export function ledgerEntry(value: unknown): LedgerEntryView {
  const r = object(value)
  if (!Array.isArray(r.lines)) throw new TypeError('Missing lines')
  const actorType = oneOf(r.actor_type, ['system', 'user', 'provider', 'import', 'agent'] as const)
  return {
    id: text(r.id), journalId: text(r.journal_id), series: text(r.series), fiscalYearId: text(r.fiscal_year_id), periodId: text(r.period_id),
    voucherNumber: int(r.voucher_number), journalType: text(r.journal_type), effectiveDate: text(r.effective_date), postedAt: text(r.posted_at),
    currency: text(r.currency), totalMinor: minor(r.total_minor), description: text(r.description),
    ...(r.source_event_id == null ? {} : { sourceEventId: text(r.source_event_id) }),
    correlationId: text(r.correlation_id), postingRuleId: text(r.posting_rule_id), postingRuleVersion: int(r.posting_rule_version),
    ...(r.reversal_of_entry_id == null ? {} : { reversalOfEntryId: text(r.reversal_of_entry_id) }),
    ...(r.reversed_by_entry_id == null ? {} : { reversedByEntryId: text(r.reversed_by_entry_id) }),
    status: oneOf(r.status, ['posted', 'reversed'] as const), postedEventId: text(r.posted_event_id),
    actor: { type: actorType, ...(r.actor_id == null ? {} : { id: text(r.actor_id) }) },
    lines: r.lines.map(ledgerLine),
  }
}
function periodChange(value: unknown): LedgerPeriodChange {
  const r = object(value)
  return { id: text(r.id), status: oneOf(r.status, ['open', 'locked'] as const), changed: bool(r.changed), ...(r.event_id == null ? {} : { eventId: text(r.event_id) }) }
}

/** Radform mot RPC:n (snake_case, bara satta fält). Belopp valideras här också så att ett fel syns före nätverket. */
export function ledgerLineArgs(line: LedgerLineInput): Record<string, unknown> {
  const debit = line.debitMinor ?? '0', credit = line.creditMinor ?? '0'
  if (!/^\d+$/.test(debit) || !/^\d+$/.test(credit)) throw new TypeError('Line amounts must be non-negative integer strings')
  return {
    account: line.account, debit_minor: debit, credit_minor: credit,
    ...(line.vatCode === undefined ? {} : { vat_code: line.vatCode }),
    ...(line.projectId === undefined ? {} : { project_id: line.projectId }),
    ...(line.customerId === undefined ? {} : { customer_id: line.customerId }),
    ...(line.supplierId === undefined ? {} : { supplier_id: line.supplierId }),
    ...(line.metadata === undefined ? {} : { metadata: line.metadata }),
  }
}

export async function openFiscalYear(db: KernelDb, businessId: string, input: { startsOn: string; endsOn: string }): Promise<LedgerFiscalYearView> {
  return ledgerFiscalYear(await domainRpc(db, 'open_ledger_fiscal_year', { p_business_id: businessId, p_starts_on: input.startsOn, p_ends_on: input.endsOn }))
}
export async function ensureJournal(db: KernelDb, businessId: string, input: { series: string; name: string }): Promise<LedgerJournalView> {
  const r = await domainRpc(db, 'ensure_ledger_journal', { p_business_id: businessId, p_series: input.series, p_name: input.name })
  return { id: text(r.id), series: text(r.series), name: text(r.name) }
}
export async function upsertAccount(db: KernelDb, businessId: string, input: {
  number: string; name: string; type: LedgerAccountType; source: LedgerAccountSource; confirmedBy?: string; active?: boolean
}): Promise<LedgerAccountView> {
  return ledgerAccount(await domainRpc(db, 'upsert_ledger_account', {
    p_business_id: businessId, p_number: input.number, p_name: input.name, p_type: input.type, p_source: input.source,
    p_confirmed_by: input.confirmedBy ?? null, p_active: input.active ?? true,
  }))
}
export interface PostJournalEntryInput {
  series: string
  journalType: string
  effectiveDate: string
  description: string
  lines: LedgerLineInput[]
  /** Kärneventet som orsakar verifikationen. Utelämnas bara för manuella verifikat (rule 'manual' v0, actor user). */
  sourceEventId?: string
  ruleId: string
  ruleVersion: number
  idempotencyKey: string
  actor: LedgerActor
  currency?: string
}
export async function postJournalEntry(db: KernelDb, businessId: string, input: PostJournalEntryInput): Promise<{ inserted: boolean; entry: LedgerEntryView }> {
  const r = await domainRpc(db, 'post_journal_entry', {
    p_business_id: businessId, p_series: input.series, p_journal_type: input.journalType, p_effective_date: input.effectiveDate,
    p_description: input.description, p_lines: input.lines.map(ledgerLineArgs), p_source_event_id: input.sourceEventId ?? null,
    p_posting_rule_id: input.ruleId, p_posting_rule_version: input.ruleVersion, p_idempotency_key: input.idempotencyKey,
    p_actor_type: input.actor.type, p_actor_id: input.actor.id ?? null, p_currency: input.currency ?? 'SEK',
  })
  return { inserted: bool(r.inserted), entry: ledgerEntry(r) }
}
export async function reverseJournalEntry(db: KernelDb, businessId: string, input: {
  entryId: string; effectiveDate: string; reason: string; idempotencyKey: string; actor: LedgerActor
}): Promise<{ inserted: boolean; entry: LedgerEntryView; reversedEventId?: string }> {
  const r = await domainRpc(db, 'reverse_journal_entry', {
    p_business_id: businessId, p_entry_id: input.entryId, p_effective_date: input.effectiveDate, p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey, p_actor_type: input.actor.type, p_actor_id: input.actor.id ?? null,
  })
  return { inserted: bool(r.inserted), entry: ledgerEntry(r), ...(r.reversed_event_id == null ? {} : { reversedEventId: text(r.reversed_event_id) }) }
}
export async function lockPeriod(db: KernelDb, businessId: string, input: { periodId: string; actorId: string }): Promise<LedgerPeriodChange> {
  return periodChange(await domainRpc(db, 'lock_ledger_period', { p_business_id: businessId, p_period_id: input.periodId, p_actor_id: input.actorId }))
}
export async function unlockPeriod(db: KernelDb, businessId: string, input: { periodId: string; actorId: string; reason: string }): Promise<LedgerPeriodChange> {
  return periodChange(await domainRpc(db, 'unlock_ledger_period', { p_business_id: businessId, p_period_id: input.periodId, p_actor_id: input.actorId, p_reason: input.reason }))
}
export async function readEntry(db: KernelDb, businessId: string, entryId: string): Promise<LedgerEntryView | null> {
  const { data, error } = await db.rpc('read_ledger_entry', { p_business_id: businessId, p_entry_id: entryId })
  if (error) throw new Error(error.message)
  return data == null ? null : ledgerEntry(data)
}
