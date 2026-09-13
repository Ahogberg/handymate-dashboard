import { classify } from './action-contract'

export function historyStatus(approval: { status: string; approval_type: string; payload?: any }) {
  const neutral = 'bg-gray-100 text-gray-600'
  const execution = approval.payload?.execution_result
  const decided = ['approved', 'auto_approved'].includes(approval.status)
  if (decided && (['failed', 'retrying'].includes(execution?.outcome) || ['partial', 'failed', 'needs_action'].includes(execution?.receipt?.state))) {
    return { label: 'Behöver följas upp', className: 'bg-amber-50 text-amber-800' }
  }
  if (decided) {
    const kind = classify(approval.approval_type)
    return { label: kind === 'INFORMATIONAL' ? 'Läst' : kind === 'ACKNOWLEDGEMENT' ? 'Noterad' : approval.status === 'auto_approved' ? 'Automatiskt beslut' : 'Beslut godkänt', className: neutral }
  }
  return { label: approval.status === 'rejected' ? 'Avvisad' : 'Utgången', className: neutral }
}
