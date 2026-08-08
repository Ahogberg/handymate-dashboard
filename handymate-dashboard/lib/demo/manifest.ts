/**
 * Stabilt entity-kontrakt mellan demo-resetten och Epic 5:s storylager.
 *
 * Värdena är alltid ID:n som kom tillbaka från de riktiga insertsen. Storyn
 * får därmed navigera till produktionsroutes utan att känna till seedordning
 * eller hårdkoda slump-ID:n.
 */
export const DEMO_STORY_ENTITY_KEYS = [
  'morning_brief',
  'stale_quote',
  'margin_project',
  'overdue_invoice',
  'live_matte_project',
  'value_recap',
] as const

export const DEMO_SUPPORTING_ENTITY_KEYS = [
  'ata_missed',
  'material_missed',
  'profitability_warning',
  'invoice_reminder',
] as const

export type DemoStoryEntityKey = typeof DEMO_STORY_ENTITY_KEYS[number]
export type DemoSupportingEntityKey = typeof DEMO_SUPPORTING_ENTITY_KEYS[number]
export type DemoManifestKey = DemoStoryEntityKey | DemoSupportingEntityKey

export type DemoManifest = Record<DemoManifestKey, string>

export interface DemoManifestInput {
  businessId: string
  staleQuoteId: string
  marginProjectId: string
  overdueInvoiceId: string
  ataMissedApprovalId: string
  materialMissedApprovalId: string
  profitabilityWarningApprovalId: string
  invoiceReminderApprovalId: string
}

export function buildDemoManifest(input: DemoManifestInput): DemoManifest {
  return {
    morning_brief: input.businessId,
    stale_quote: input.staleQuoteId,
    margin_project: input.marginProjectId,
    overdue_invoice: input.overdueInvoiceId,
    live_matte_project: input.marginProjectId,
    value_recap: input.businessId,
    ata_missed: input.ataMissedApprovalId,
    material_missed: input.materialMissedApprovalId,
    profitability_warning: input.profitabilityWarningApprovalId,
    invoice_reminder: input.invoiceReminderApprovalId,
  }
}
