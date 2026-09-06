import type { RevenueRecoveryCase, RevenueRecoveryPhase } from '../lib/value/revenue-recovery-case'
export function recoveryRow(phase: RevenueRecoveryPhase, id: string = phase): RevenueRecoveryCase {
  return {
    case_id: id, title: 'Extra uttag i badrummet', approval_id: id, approval_type: 'create_ata_draft', project_id: 'project-1',
    project_name: 'Badrum Åkervägen', phase, phase_label: phase === 'paid' ? 'Bekräftat betalt' : phase === 'unknown' ? 'Kedjan behöver kontrolleras' : 'Klart att fakturera',
    truth_note: phase === 'unknown' ? 'Projektkopplingen saknas.' : null,
    identified_kr: 1500, invoice_total_kr: 5000, invoice_id: 'invoice-1', invoice_number: '1042',
    paid_at: phase === 'paid' ? '2026-01-01T00:00:00Z' : null,
    evidence: { identified: true, owner_verified: true, ata_created: true, customer_accepted: true, delivery_proven: true, invoice_created: true, payment_confirmed: phase === 'paid' },
    next_action: phase === 'paid' ? null : { label: 'Granska fakturaunderlaget', href: '/dashboard/projects/project-1/invoice-preview', kind: 'project' },
    created_at: '2026-01-01T00:00:00Z',
  }
}
