export function impactEnabled() {
  return (
    process.env.VALUE_IMPACT_ENABLED === 'true' &&
    process.env.VALUE_EVENTS_ENABLED === 'true' &&
    process.env.VALUE_KERNEL_EVENTS_ENABLED === 'true'
  )
}
