import type { FinancialEventHandler } from '@/lib/financial-kernel/events/consume'
export const VALUE_LEDGER_CONSUMER = 'value-ledger'
/** Database-only, replay-safe. No external effect may be added to this handler. */
export const valueLedgerConsumer: FinancialEventHandler = {
  consumer: VALUE_LEDGER_CONSUMER,
  async handle(event, db) {
    const { error } = await db.rpc('record_value_money_event', {
      p_business_id: event.businessId,
      p_event_id: event.eventId,
    })
    if (error) throw new Error(error.message)
  },
}
export function kernelValueEnabled() {
  return process.env.VALUE_KERNEL_EVENTS_ENABLED === 'true'
}
