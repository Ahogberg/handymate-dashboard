import { selectRevenueRecoveryCasesForDashboard, type RevenueRecoveryCase, type RevenueRecoveryPhase } from './revenue-recovery-case'

export const QUEUE_GROUPS = { action: 'Din tur', waiting: 'Väntar', control: 'Behöver kontrolleras', closed: 'Avslutade' } as const
export type QueueGroup = keyof typeof QUEUE_GROUPS
const groups: Record<RevenueRecoveryPhase, QueueGroup> = {
  needs_review: 'action', needs_ata_send: 'action', ready_to_invoice: 'action', invoice_draft: 'action',
  awaiting_customer: 'waiting', awaiting_delivery: 'waiting', awaiting_payment: 'waiting',
  unknown: 'control', failed: 'control', paid: 'closed', declined: 'closed', dismissed: 'closed',
}
export const QUEUE_HINTS: Record<RevenueRecoveryPhase, string> = {
  needs_review: 'Kontrollera underlaget innan du godkänner fyndet.',
  needs_ata_send: 'Granska ÄTA-utkastet och välj om det ska skickas till kunden.',
  ready_to_invoice: 'Granska fakturaunderlaget och ta ställning till fakturering.',
  invoice_draft: 'Öppna fakturautkastet och kontrollera det före utskick.',
  awaiting_customer: 'Kundens svar saknas i den här kedjan. Kontrollera ÄTA:n i projektet.',
  awaiting_delivery: 'Kunden har godkänt. Kontrollera projektets arbete innan det markeras avslutat.',
  awaiting_payment: 'Betalning är ännu inte bekräftad. Se fakturan för förfallodatum och betalningsläge.',
  unknown: 'Underlaget räcker inte för att avgöra nästa ekonomiska steg.',
  failed: 'Den tidigare handlingen misslyckades. Kontrollera källan innan du försöker igen.',
  paid: 'Betalningen är bekräftad på den länkade fakturan.',
  declined: 'Kunden har tackat nej till tillägget.',
  dismissed: 'Fyndet har avfärdats.',
}
export function queueGroup(phase: RevenueRecoveryPhase): QueueGroup { return groups[phase] ?? 'control' }
const priority: Partial<Record<RevenueRecoveryPhase, number>> = { ready_to_invoice: 0, invoice_draft: 1, needs_ata_send: 2, needs_review: 3 }
export function selectQueue(cases: RevenueRecoveryCase[], group: QueueGroup, search = '') {
  const term = search.trim().toLocaleLowerCase('sv-SE')
  return cases.filter(row => queueGroup(row.phase) === group && [row.project_name, row.invoice_number].some(value => !term || value?.toLocaleLowerCase('sv-SE').includes(term)))
    .sort((a, b) => (priority[a.phase] ?? 9) - (priority[b.phase] ?? 9) || a.created_at.localeCompare(b.created_at) || a.case_id.localeCompare(b.case_id))
}
/** Queue preserves every phase and age; the home view retains its existing three-card selection. */
export function recoveryResponseCases(cases: RevenueRecoveryCase[], view: string | null, now: number) {
  return view === 'queue' ? cases : selectRevenueRecoveryCasesForDashboard(cases, now)
}
