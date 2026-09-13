import { AGENT_INFO } from '@/components/dashboard/agentPersonas'
import { approvalDisplay, type ApprovalDisplay } from '@/lib/jarvis/approval-view'
import type { ActionClass } from '@/lib/approvals/action-contract'

export interface ApprovalPresentationInput {
  approval_type: string
  payload?: Record<string, unknown> | null
  display?: ApprovalDisplay
}

/** Prefer the server-bound presentation; derive through the same canonical
 * helper for older payloads or malformed agent metadata. */
export function approvalPresentation(approval: ApprovalPresentationInput): ApprovalDisplay {
  const display = approval.display
  if (
    display && typeof display.type_label === 'string' && display.type_label.trim() !== '' &&
    typeof display.agent === 'string' && AGENT_INFO[display.agent] &&
    typeof display.approve_label === 'string' && display.approve_label.trim() !== ''
  ) return display
  return approvalDisplay(approval)
}

export const APPROVAL_EDIT_REVIEW_LABEL = 'Granska ändring'
export const AUTONOMY_REVIEW_LABEL = 'Granska förtroende'
export function approvalGroupReviewLabel(count: number, actionClass: ActionClass | null): string {
  if (actionClass === 'INFORMATIONAL') return `Markera grupp som läst (${count})`
  if (actionClass === 'ACKNOWLEDGEMENT') return `Notera grupp (${count})`
  return `Granska grupp (${count})`
}
export const approvalPackageReviewLabel = (count: number) => `Granska paket (${count})`
