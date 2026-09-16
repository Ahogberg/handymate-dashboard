/**
 * Financial Kernel — posting engine (Paket C8, 2026-09-16).
 *
 * En kärnkonsument ('ledger-posting') som för varje event slår upp registrerade
 * regler för eventtypen, låter regeln rita ett balanserat utkast ur eventet och
 * kontexten, och bokför utkastet idempotent genom post_journal_entry.
 *
 * Regeln är ren: samma event + samma regelversion + samma kontext ⇒ samma
 * utkast, byte för byte (blueprint §14). Motorn läser ingen klocka och ingen
 * tabell; allt en regel får veta ligger i PostingRuleContext. Registret är
 * tomt i C8 — reglerna och kontonumren är C9:s och konsultens (brief §0), och
 * konsumenten kopplas till cronen först där, bakom auto_post_accounting_enabled.
 *
 * Fel är stopp: ett utkast som inte balanserar eller pekar på ett konto som
 * saknas i kontexten kastar innan något RPC anropas, och consume.ts registrerar
 * misslyckandet och stoppar konsumenten efter max försök med eventet kvar i kön.
 * Bokföringen är atomär per utkast (ett RPC-anrop = en transaktion) och
 * slutförd per event genom omförsök: ger ett regelset två utkast och det andra
 * faller, står det första kvar bokfört, leveransen misslyckas, och nästa försök
 * får det första som replay (inserted=false) och bokför det andra. Samma nyckel
 * kan aldrig ge två verifikat.
 *
 * Regelkontrakt: draft() är ren, läser ingen klocka och kastar aldrig ett
 * meddelande som innehåller payloadvärden (meddelandet hamnar i
 * financial_event_deliveries.last_error).
 */
import type { KernelDb } from '../financial-kernel/events/publish'
import type { FinancialEventEnvelope } from '../financial-kernel/events/types'
import type { FinancialEventType } from '../financial-kernel/events/catalog'
import type { FinancialEventHandler } from '../financial-kernel/events/consume'
import { postJournalEntry, type LedgerEntryView, type LedgerLineInput } from './service'

export const LEDGER_POSTING_CONSUMER = 'ledger-posting'

/** Allt en regel får veta utöver eventet. Kontokartan är logisk nyckel → kontonummer; C9 fyller den. */
export interface PostingRuleContext {
  readonly accounts: Readonly<Record<string, string>>
}
export interface JournalDraftLine {
  readonly account: string
  readonly debitMinor?: string
  readonly creditMinor?: string
  readonly vatCode?: string
  readonly projectId?: string
  readonly customerId?: string
  readonly supplierId?: string
  readonly metadata?: Readonly<Record<string, unknown>>
}
export interface JournalDraft {
  readonly series: string
  readonly journalType: string
  readonly effectiveDate: string
  readonly description: string
  readonly currency: string
  readonly lines: readonly JournalDraftLine[]
}
export interface PostingRule<T extends FinancialEventType = FinancialEventType> {
  readonly id: string
  /** Höjs vid varje ändring av utkastets innehåll; nyckeln bär versionen så en ny version bokför på nytt. */
  readonly version: number
  readonly eventTypes: readonly T[]
  /** null = regeln har inget att bokföra för just det här eventet (inte ett fel). */
  draft(event: FinancialEventEnvelope<T>, ctx: PostingRuleContext): JournalDraft | null
}

export class LedgerAccountMissingError extends Error {
  constructor(readonly key: string) { super(`ledger_account_missing:${key}`); this.name = 'LedgerAccountMissingError' }
}
export class JournalDraftInvalidError extends Error {
  constructor(readonly reason: string) { super(`ledger_draft_invalid:${reason}`); this.name = 'JournalDraftInvalidError' }
}

/** Kontonumret för en logisk nyckel; saknas den stannar bokföringen i stället för att gissa. */
export function accountFor(ctx: PostingRuleContext, key: string): string {
  const number = ctx.accounts[key]
  if (typeof number !== 'string' || number.length === 0) throw new LedgerAccountMissingError(key)
  return number
}

export interface RuleRegistry {
  register(rule: PostingRule): void
  rulesFor(eventType: FinancialEventType): readonly PostingRule[]
  readonly size: number
}
export function createRuleRegistry(): RuleRegistry {
  const rules: PostingRule[] = []
  return {
    register(rule) {
      if (!/^[a-z][a-z0-9_.-]{1,63}$/.test(rule.id) || rule.id === 'manual' || rule.id === 'reversal') throw new TypeError(`Invalid rule id ${rule.id}`)
      if (!Number.isInteger(rule.version) || rule.version < 1) throw new TypeError('Rule version must be a positive integer')
      if (rules.some(r => r.id === rule.id)) throw new TypeError(`Rule ${rule.id} already registered`)
      rules.push(rule)
    },
    rulesFor(eventType) { return rules.filter(r => (r.eventTypes as readonly string[]).includes(eventType)) },
    get size() { return rules.length },
  }
}

export function postingIdempotencyKey(eventId: string, rule: Pick<PostingRule, 'id' | 'version'>): string {
  return `ledger:${eventId}:${rule.id}:v${rule.version}`
}

/** Kanonisk heltalssträng i minor units: ingen ledande nolla, högst 18 siffror (v251:s gräns; BIGINT). */
const INTEGER = /^(0|[1-9][0-9]{0,17})$/
const ZERO = BigInt(0)
/** Balans och radform kontrolleras här med BigInt innan något lämnar processen; RPC:n kontrollerar igen. */
export function validateDraft(draft: JournalDraft): void {
  if (draft.lines.length < 2) throw new JournalDraftInvalidError('lines_required')
  let debit = ZERO, credit = ZERO
  for (const l of draft.lines) {
    const d = l.debitMinor ?? '0', c = l.creditMinor ?? '0'
    if (!INTEGER.test(d) || !INTEGER.test(c)) throw new JournalDraftInvalidError('amount_invalid')
    const dn = BigInt(d), cn = BigInt(c)
    if ((dn > ZERO) === (cn > ZERO)) throw new JournalDraftInvalidError('line_one_side')
    if (typeof l.account !== 'string' || l.account.length === 0) throw new JournalDraftInvalidError('account_required')
    debit += dn; credit += cn
  }
  if (debit !== credit || debit === ZERO) throw new JournalDraftInvalidError('unbalanced')
}

function toLineInput(l: JournalDraftLine): LedgerLineInput {
  return {
    account: l.account,
    ...(l.debitMinor === undefined ? {} : { debitMinor: l.debitMinor }),
    ...(l.creditMinor === undefined ? {} : { creditMinor: l.creditMinor }),
    ...(l.vatCode === undefined ? {} : { vatCode: l.vatCode }),
    ...(l.projectId === undefined ? {} : { projectId: l.projectId }),
    ...(l.customerId === undefined ? {} : { customerId: l.customerId }),
    ...(l.supplierId === undefined ? {} : { supplierId: l.supplierId }),
    ...(l.metadata === undefined ? {} : { metadata: { ...l.metadata } }),
  }
}

export interface PostingOutcome { ruleId: string; ruleVersion: number; inserted: boolean; entry: LedgerEntryView }

/**
 * Ritar och bokför allt registret har för eventet. Utkasten ritas och valideras
 * alla först, så ett ogiltigt utkast stoppar leveransen innan något RPC anropas.
 * Därefter bokförs de i regelordning, ett RPC-anrop (en transaktion) per utkast;
 * ett fel mitt i listan lämnar de tidigare bokförda, och omförsöket får dem som
 * replay via nyckeln.
 */
export async function postEvent(db: KernelDb, event: FinancialEventEnvelope, registry: RuleRegistry, ctx: PostingRuleContext): Promise<PostingOutcome[]> {
  const drafts = registry.rulesFor(event.eventType).flatMap(rule => {
    const draft = rule.draft(event, ctx)
    if (draft === null) return []
    validateDraft(draft)
    return [{ rule, draft }]
  })
  const outcomes: PostingOutcome[] = []
  for (const { rule, draft } of drafts) {
    const r = await postJournalEntry(db, event.businessId, {
      series: draft.series, journalType: draft.journalType, effectiveDate: draft.effectiveDate, description: draft.description,
      currency: draft.currency, lines: draft.lines.map(toLineInput), sourceEventId: event.eventId,
      ruleId: rule.id, ruleVersion: rule.version, idempotencyKey: postingIdempotencyKey(event.eventId, rule), actor: { type: 'system' },
    })
    outcomes.push({ ruleId: rule.id, ruleVersion: rule.version, inserted: r.inserted, entry: r.entry })
  }
  return outcomes
}

/**
 * Konsumenten. `resolveContext` är C9:s (kontokarta per företag); C8 lämnar den
 * som en injicerad funktion så motorn själv aldrig läser en tabell.
 */
export function ledgerPostingHandler(
  registry: RuleRegistry,
  resolveContext: (businessId: string, db: KernelDb) => Promise<PostingRuleContext>,
): FinancialEventHandler {
  return {
    consumer: LEDGER_POSTING_CONSUMER,
    async handle(event, db) {
      // Ett event utan regel ackas utan bokföring: kursorn är strikt ordnad (v236), så ett
      // oackat event skulle blockera alla senare för konsumenten.
      if (registry.rulesFor(event.eventType).length === 0) return
      const ctx = await resolveContext(event.businessId, db)
      await postEvent(db, event, registry, ctx)
    },
  }
}
