/**
 * Cross-Agent Customer Case V1 (2026-08-15).
 *
 * Ett kund-case sammanför flera OLIKA väntande signaltyper om samma kund.
 * Modulen är ren: den beskriver uttryckligen hur varje godkänd approval-typ
 * hittar sin kund och grupperar redan tenantverifierade rader. Databasuppslag,
 * behörighet och projektets ägarskap ligger i /api/customer-cases.
 */
import { agentForApproval } from '@/lib/jarvis/approval-view'

export const CUSTOMER_CASE_APPROVAL_TYPES = [
  // Befintliga projekt-case-signaler. Projektuppslag är sanningen; signalen
  // exkluderas senare om den redan ägs av ett synligt projekt-case.
  'profitability_warning',
  'create_ata_draft',
  'missad_intakt',
  'fakturera_projekt',
  // Offert-/fakturaflöden vars payload inte konsekvent bär customer_id.
  'quote_nudge',
  'four_eyes_quote',
  'invoice_reminder',
  'review_auto_invoice',
  // Kundkopplingen finns explicit på den producerade raden.
  'review_request',
  'scheduled_review_request',
  'warranty_followup',
  'create_invoice_from_report',
  // customer_id ligger i pending_approvals.package_data, inte payload.
  'autopilot_package',
] as const

export type CustomerCaseApprovalType = typeof CUSTOMER_CASE_APPROVAL_TYPES[number]

export interface CustomerCaseApprovalLike {
  approval_type: string
  payload: Record<string, unknown> | null
  package_data: Record<string, unknown> | null
}

export type CustomerReference = {
  kind: 'customer' | 'quote' | 'invoice' | 'project'
  id: string
}

const PROJECT_LOOKUP_TYPES = new Set<CustomerCaseApprovalType>([
  'profitability_warning',
  'create_ata_draft',
  'missad_intakt',
  'fakturera_projekt',
])

const QUOTE_LOOKUP_TYPES = new Set<CustomerCaseApprovalType>([
  'quote_nudge',
  'four_eyes_quote',
])

const INVOICE_LOOKUP_TYPES = new Set<CustomerCaseApprovalType>([
  'invoice_reminder',
  'review_auto_invoice',
])

const DIRECT_CUSTOMER_TYPES = new Set<CustomerCaseApprovalType>([
  'review_request',
  'scheduled_review_request',
  'warranty_followup',
  'create_invoice_from_report',
])

/**
 * Explicit resolver-allowlist. En okänd typ får aldrig råka kvalificera bara
 * för att dess payload råkar innehålla ett fält som heter customer_id.
 */
export function kundReferensForApproval(
  approval: CustomerCaseApprovalLike,
): CustomerReference | null {
  if (!CUSTOMER_CASE_APPROVAL_TYPES.includes(approval.approval_type as CustomerCaseApprovalType)) {
    return null
  }

  const type = approval.approval_type as CustomerCaseApprovalType
  if (PROJECT_LOOKUP_TYPES.has(type)) {
    return reference('project', approval.payload?.project_id)
  }
  if (QUOTE_LOOKUP_TYPES.has(type)) {
    return reference('quote', approval.payload?.quote_id)
  }
  if (INVOICE_LOOKUP_TYPES.has(type)) {
    return reference('invoice', approval.payload?.invoice_id)
  }
  if (DIRECT_CUSTOMER_TYPES.has(type)) {
    return reference('customer', approval.payload?.customer_id)
  }
  if (type === 'autopilot_package') {
    return reference('customer', approval.package_data?.customer_id)
  }
  return null
}

function reference(kind: CustomerReference['kind'], value: unknown): CustomerReference | null {
  return typeof value === 'string' && value.trim() ? { kind, id: value } : null
}

export interface CustomerCaseResolvedApproval extends CustomerCaseApprovalLike {
  id: string
  title: string
  customer_id: string
  customer_name: string | null
}

export interface KundCaseSignal {
  approval_id: string
  approval_type: string
  agentId: string
  title: string
}

export interface KundCase {
  customer_id: string
  customer_name: string | null
  signals: KundCaseSignal[]
  communication_overlap: boolean
}

/** Endast signaler som uttryckligen kan leda till kundkontakt i sin V1-form. */
const CUSTOMER_CONTACT_TYPES = new Set<string>([
  'quote_nudge',
  'four_eyes_quote',
  'invoice_reminder',
  'review_auto_invoice',
  'review_request',
  'scheduled_review_request',
  'warranty_followup',
])

/**
 * Grupperar tenantverifierade rader. Projektägda approval-id:n tas bort FÖRE
 * tvåtypsgränsen så samma signal aldrig berättas i både ProjektCaseKort och
 * KundCaseKort.
 */
export function hittaKundCase(
  approvals: CustomerCaseResolvedApproval[],
  projectOwnedApprovalIds: ReadonlySet<string>,
): KundCase[] {
  const groups = new Map<string, CustomerCaseResolvedApproval[]>()

  for (const approval of approvals) {
    if (projectOwnedApprovalIds.has(approval.id)) continue
    const bucket = groups.get(approval.customer_id)
    if (bucket) bucket.push(approval)
    else groups.set(approval.customer_id, [approval])
  }

  const cases: KundCase[] = []
  for (const [customerId, rows] of Array.from(groups.entries())) {
    const distinctTypes = new Set(rows.map(row => row.approval_type))
    if (distinctTypes.size < 2) continue

    const contactTypes = new Set(
      rows
        .map(row => row.approval_type)
        .filter(type => CUSTOMER_CONTACT_TYPES.has(type)),
    )
    const named = rows.find(row => row.customer_name)

    cases.push({
      customer_id: customerId,
      customer_name: named?.customer_name ?? null,
      communication_overlap: contactTypes.size >= 2,
      signals: rows.map(row => ({
        approval_id: row.id,
        approval_type: row.approval_type,
        agentId: agentForApproval({ approval_type: row.approval_type, payload: row.payload }),
        title: row.title,
      })),
    })
  }

  cases.sort((a, b) => b.signals.length - a.signals.length)
  return cases
}
