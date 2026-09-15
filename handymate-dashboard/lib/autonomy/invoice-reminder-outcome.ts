export interface InvoiceReminderDelivery {
  skipped: boolean
  smsSent: boolean
  emailSent: boolean
}

export function invoiceReminderOutcome(
  delivery: InvoiceReminderDelivery,
): 'success' | 'failed' | 'skipped' {
  if (delivery.skipped) return 'skipped'
  return delivery.smsSent || delivery.emailSent ? 'success' : 'failed'
}
