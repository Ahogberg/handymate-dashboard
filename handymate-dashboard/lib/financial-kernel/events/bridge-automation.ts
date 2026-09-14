import type { FinancialEventHandler } from './consume'
import type { FinancialEventPayloads } from './types'
import { ensureEffectIntents } from '../commands/service'

export const AUTOMATION_BRIDGE_CONSUMER = 'automation-bridge'
export const BRIDGE_EFFECTS = [
  'pipeline', 'project_check', 'project_stage', 'smart_communication', 'payment_received_rules', 'portal_message',
] as const

/** Database-only and idempotent even if a timed-out handler outlives its lease. */
export const automationBridge: FinancialEventHandler = {
  consumer: AUTOMATION_BRIDGE_CONSUMER,
  async handle(event, db) {
    if (event.eventType !== 'receivable_settled') return
    const payload = event.payload as FinancialEventPayloads['receivable_settled']
    if (payload.component !== 'customer') return
    const receivableId = payload.receivable_id
    if (typeof receivableId !== 'string' || !receivableId) throw new TypeError('Missing receivable_id')
    await ensureEffectIntents(db, event.businessId, receivableId, event.eventId, [...BRIDGE_EFFECTS], { source: 'bridge' })
  },
}
