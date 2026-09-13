import type { FinancialEventHandler } from './consume'

export const AUTOMATION_BRIDGE_CONSUMER = 'automation-bridge'
/** C5 owns mappings and scheduling. This placeholder has no callers or side effects. */
export const automationBridge: FinancialEventHandler = {
  consumer: AUTOMATION_BRIDGE_CONSUMER,
  async handle(event) {
    switch (event.eventType) { default: return }
  },
}
