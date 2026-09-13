import type { FinancialEventHandler } from './consume'

export const AUTOMATION_BRIDGE_CONSUMER = 'automation-bridge'
/**
 * C5 owns mappings and scheduling. This placeholder has no callers or side effects.
 * TODO(C5): before firing any automation, persist the bridge's own idempotency marker
 * per receivable_id for payment_received (C4 review): reversal and re-settlement create
 * distinct events but must not thank the customer twice. The delivery ledger still tracks
 * eventId. Database effects, marker and ack must share a transaction. The delivery
 * ledger alone cannot protect side effects when a lease expires mid-handler.
 * External delivery also needs durable dispatch/retry semantics: a marker alone must
 * not turn a crash before sending into a permanently lost notification.
 */
export const automationBridge: FinancialEventHandler = {
  consumer: AUTOMATION_BRIDGE_CONSUMER,
  async handle(event) {
    switch (event.eventType) { default: return }
  },
}
