import type { KernelDb } from './publish'
import { envelopeFromRow, type FinancialEventEnvelope, type FinancialEventRow } from './types'

export interface FinancialEventHandler { readonly consumer: string; handle(e: FinancialEventEnvelope, db: KernelDb): Promise<void> }
export interface ConsumeResult { claimed: number; delivered: number; failed: number; halted: boolean; leaseLost: boolean }
export const MAX_ATTEMPTS_DEFAULT = 5
export const LEASE_SECONDS_DEFAULT = 60
export const HANDLER_TIMEOUT_MS_DEFAULT = 20_000

function integer(value: number, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) throw new RangeError('Invalid consumer option')
}
async function invoke(db: KernelDb, name: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(name, args)
  if (error) throw new Error(error.message)
  return data
}
function rows<T>(data: unknown): T[] {
  if (!Array.isArray(data)) throw new TypeError('Invalid consumer RPC response')
  return data as T[]
}
function leaseLost(error: unknown): boolean { return error instanceof Error && error.message.includes('financial_consumer_lease_lost') }

/**
 * At-least-once only. A timeout cannot cancel arbitrary handler side effects.
 * C5 handlers must deduplicate by eventId; database effects and ack should share a domain RPC.
 * A handler may not outlive its lease and assume that it still owns the cursor.
 */
export async function consumeOnce(db: KernelDb, businessId: string, handler: FinancialEventHandler,
  opts: { limit?: number; maxAttempts?: number; leaseSeconds?: number; handlerTimeoutMs?: number } = {}): Promise<ConsumeResult> {
  const limit = opts.limit ?? 50, maxAttempts = opts.maxAttempts ?? MAX_ATTEMPTS_DEFAULT
  const leaseSeconds = opts.leaseSeconds ?? LEASE_SECONDS_DEFAULT
  const timeout = opts.handlerTimeoutMs ?? HANDLER_TIMEOUT_MS_DEFAULT
  integer(limit, 1, 500); integer(maxAttempts, 1, 2147483647); integer(leaseSeconds, 5, 3600)
  integer(timeout, 1, Math.floor(leaseSeconds * 1000 / 2))
  const base = { p_business_id: businessId, p_consumer: handler.consumer }
  const result: ConsumeResult = { claimed: 0, delivered: 0, failed: 0, halted: false, leaseLost: false }
  const batch = rows<FinancialEventRow & { lease_token: string }>(await invoke(db, 'claim_financial_events', { ...base, p_limit: limit, p_lease_seconds: leaseSeconds }))
  result.claimed = batch.length
  if (!batch.length) {
    const status = rows<{ halted_at: string | null }>(await invoke(db, 'get_financial_consumer_status', base))
    result.halted = status[0]?.halted_at != null
    return result
  }
  const token = batch[0].lease_token
  if (!token || batch.some(row => row.lease_token !== token)) throw new TypeError('Invalid claim lease token')
  const owned = { ...base, p_lease_token: token }
  try {
    for (const row of batch) {
      const eventArgs = { ...owned, p_event_id: row.id }
      const attempt = rows<{ delivered_at: string | null }>(await invoke(db, 'begin_financial_event_attempt', eventArgs))[0]
      if (!attempt) throw new TypeError('Missing attempt response')
      if (attempt.delivered_at === null) {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          await Promise.race([
            Promise.resolve().then(() => handler.handle(envelopeFromRow(row), db)),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Financial consumer handler timeout')), timeout) }),
          ])
        } catch (error) {
          if (leaseLost(error)) throw error
          const failure = rows<{ halted: boolean }>(await invoke(db, 'fail_financial_event', { ...eventArgs, p_error: error instanceof Error ? error.message : String(error), p_max_attempts: maxAttempts }))[0]
          if (!failure) throw new TypeError('Missing failure response')
          result.failed++; result.halted = failure.halted
          break
        } finally { if (timer !== undefined) clearTimeout(timer) }
      }
      // Transport errors after ack may mean it committed: never record a handler failure here.
      await invoke(db, 'ack_financial_event', { ...eventArgs, p_lease_seconds: leaseSeconds })
      result.delivered++
    }
  } catch (error) {
    if (leaseLost(error)) result.leaseLost = true
    else throw error
  } finally {
    // A known lost owner must not issue further mutations. Other releases are token-guarded.
    if (!result.leaseLost) await invoke(db, 'release_financial_consumer_lease', owned)
  }
  return result
}
