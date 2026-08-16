/**
 * Revenue Recovery Case V1 — ren Business Twin-härledning.
 *
 * Ett case lagras inte. Det härleder samma ekonomiska ärende ur befintliga,
 * direkta referenser:
 *
 *   pending_approvals → project_change → project → invoice → paid_at
 *
 * Inga kund-, datum- eller beloppskorrelationer används. Om en referens
 * saknas, pekar på fel projekt eller motsäger en annan referens blir läget
 * `unknown`; ett trasigt uppslag får aldrig se ut som att inget återstår.
 */

export const REVENUE_RECOVERY_APPROVAL_TYPES = [
  'create_ata_draft',
  'missad_intakt',
] as const

export type RevenueRecoveryApprovalType = typeof REVENUE_RECOVERY_APPROVAL_TYPES[number]

export type RevenueRecoveryPhase =
  | 'needs_review'
  | 'needs_ata_send'
  | 'awaiting_customer'
  | 'awaiting_delivery'
  | 'ready_to_invoice'
  | 'invoice_draft'
  | 'awaiting_payment'
  | 'paid'
  | 'failed'
  | 'declined'
  | 'dismissed'
  | 'unknown'

export interface RevenueRecoveryApproval {
  id: string
  approval_type: string
  status: string
  title: string
  payload: Record<string, unknown> | null
  created_at: string
  resolved_at: string | null
}

export interface RevenueRecoveryProject {
  project_id: string
  name: string | null
  status: string | null
  completed_at: string | null
}

export interface RevenueRecoveryChange {
  change_id: string
  project_id: string
  status: string | null
  signed_at: string | null
  declined_at: string | null
  invoice_id: string | null
  invoiced_at: string | null
  total: number | null
  amount: number | null
}

export interface RevenueRecoveryInvoice {
  invoice_id: string
  project_id: string | null
  invoice_number: string | null
  status: string | null
  total: number | null
  sent_at: string | null
  paid_at: string | null
}

export interface RevenueRecoveryInput {
  approval: RevenueRecoveryApproval
  project: RevenueRecoveryProject | null
  changes: RevenueRecoveryChange[]
  invoice: RevenueRecoveryInvoice | null
}

export interface RevenueRecoveryEvidence {
  identified: true
  owner_verified: boolean
  ata_created: boolean
  customer_accepted: boolean
  delivery_proven: boolean
  invoice_created: boolean
  payment_confirmed: boolean
}

export interface RevenueRecoveryAction {
  label: string
  href: string
  kind: 'approval' | 'project' | 'invoice'
}

export interface RevenueRecoveryCase {
  case_id: string
  approval_id: string
  approval_type: RevenueRecoveryApprovalType
  project_id: string | null
  project_name: string | null
  phase: RevenueRecoveryPhase
  phase_label: string
  truth_note: string | null
  identified_kr: number | null
  invoice_total_kr: number | null
  invoice_id: string | null
  invoice_number: string | null
  paid_at: string | null
  evidence: RevenueRecoveryEvidence
  next_action: RevenueRecoveryAction | null
  created_at: string
}

const VERIFIED_APPROVAL_STATUSES = new Set(['approved', 'auto_approved'])
const ACCEPTED_ATA_STATUSES = new Set(['approved', 'signed', 'invoiced'])

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function positiveNumber(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function payloadFor(approval: RevenueRecoveryApproval): Record<string, unknown> {
  return approval.payload || {}
}

export function recoveryProjectId(approval: RevenueRecoveryApproval): string | null {
  return stringValue(payloadFor(approval).project_id)
}

export function recoveryChangeIds(approval: RevenueRecoveryApproval): string[] {
  const payload = payloadFor(approval)
  if (approval.approval_type === 'create_ata_draft') {
    const execution = payload.execution_result as Record<string, unknown> | null | undefined
    const artifacts = execution?.artifacts as Record<string, unknown> | null | undefined
    const ataId = stringValue(artifacts?.ata_id)
    return ataId ? [ataId] : []
  }
  if (approval.approval_type === 'missad_intakt') {
    const ids = Array.isArray(payload.source_ids) ? payload.source_ids : []
    return Array.from(new Set(ids.map(stringValue).filter((id): id is string => id !== null)))
  }
  return []
}

export function recoveryInvoiceIds(
  approval: RevenueRecoveryApproval,
  changes: RevenueRecoveryChange[],
): string[] {
  const payload = payloadFor(approval)
  const direct = approval.approval_type === 'missad_intakt'
    ? stringValue(payload.draft_invoice_id)
    : null
  return Array.from(new Set([
    direct,
    ...changes.map(change => stringValue(change.invoice_id)),
  ].filter((id): id is string => id !== null)))
}

function identifiedAmount(approval: RevenueRecoveryApproval): number | null {
  const payload = payloadFor(approval)
  return approval.approval_type === 'create_ata_draft'
    ? positiveNumber(payload.amount_estimate ?? payload.amount_kr)
    : positiveNumber(payload.amount_kr)
}

function phaseLabel(phase: RevenueRecoveryPhase): string {
  const labels: Record<RevenueRecoveryPhase, string> = {
    needs_review: 'Behöver verifieras',
    needs_ata_send: 'ÄTA-utkastet väntar',
    awaiting_customer: 'Väntar på kundens svar',
    awaiting_delivery: 'Godkänt — väntar på avslutat projekt',
    ready_to_invoice: 'Klart att fakturera',
    invoice_draft: 'Fakturautkastet väntar',
    awaiting_payment: 'Väntar på betalning',
    paid: 'Bekräftat betalt',
    failed: 'Handlingen misslyckades',
    declined: 'Kunden tackade nej',
    dismissed: 'Fyndet avfärdades',
    unknown: 'Kedjan behöver kontrolleras',
  }
  return labels[phase]
}

function actionFor(
  phase: RevenueRecoveryPhase,
  approval: RevenueRecoveryApproval,
  projectId: string | null,
  invoiceId: string | null,
): RevenueRecoveryAction | null {
  if (phase === 'paid' || phase === 'declined' || phase === 'dismissed') return null
  if (phase === 'needs_review') {
    return approval.approval_type === 'missad_intakt'
      ? { label: 'Granska fyndet', href: '/dashboard/pengar', kind: 'approval' }
      : { label: 'Öppna godkännandet', href: '/dashboard/approvals', kind: 'approval' }
  }
  if (invoiceId && (phase === 'invoice_draft' || phase === 'awaiting_payment')) {
    return { label: 'Öppna fakturan', href: `/dashboard/invoices/${invoiceId}`, kind: 'invoice' }
  }
  if (!projectId) return null
  if (phase === 'ready_to_invoice') {
    return {
      label: 'Granska fakturaunderlaget',
      href: `/dashboard/projects/${projectId}/invoice-preview`,
      kind: 'project',
    }
  }
  if (phase === 'failed' || phase === 'unknown') {
    return { label: 'Kontrollera projektet', href: `/dashboard/projects/${projectId}`, kind: 'project' }
  }
  return {
    label: phase === 'needs_ata_send' ? 'Öppna ÄTA-utkastet' : 'Öppna projektet',
    href: `/dashboard/projects/${projectId}?tab=changes`,
    kind: 'project',
  }
}

function unknownCase(
  input: RevenueRecoveryInput,
  note: string,
  projectId: string | null,
  invoiceId: string | null = null,
): RevenueRecoveryCase {
  return buildCase(input, {
    phase: 'unknown',
    truthNote: note,
    projectId,
    invoiceId,
    invoice: input.invoice,
    changes: input.changes,
  })
}

function buildCase(
  input: RevenueRecoveryInput,
  values: {
    phase: RevenueRecoveryPhase
    truthNote: string | null
    projectId: string | null
    invoiceId: string | null
    invoice: RevenueRecoveryInvoice | null
    changes: RevenueRecoveryChange[]
  },
): RevenueRecoveryCase {
  const { approval, project } = input
  const ownerVerified = VERIFIED_APPROVAL_STATUSES.has(approval.status)
  const customerAccepted = values.changes.length > 0 && values.changes.every(change => (
    Boolean(change.signed_at) || ACCEPTED_ATA_STATUSES.has(change.status || '')
  ))
  const deliveryProven = Boolean(project && (project.status === 'completed' || project.completed_at))
  const paymentConfirmed = Boolean(
    values.invoice?.status === 'paid' && values.invoice.paid_at,
  )

  return Object.freeze({
    case_id: `recovery:${approval.id}`,
    approval_id: approval.id,
    approval_type: approval.approval_type as RevenueRecoveryApprovalType,
    project_id: values.projectId,
    project_name: project?.name ?? null,
    phase: values.phase,
    phase_label: phaseLabel(values.phase),
    truth_note: values.truthNote,
    identified_kr: identifiedAmount(approval),
    invoice_total_kr: values.invoice ? positiveNumber(values.invoice.total) : null,
    invoice_id: values.invoiceId,
    invoice_number: values.invoice?.invoice_number ?? null,
    paid_at: paymentConfirmed ? values.invoice!.paid_at : null,
    evidence: Object.freeze({
      identified: true as const,
      owner_verified: ownerVerified,
      ata_created: values.changes.length > 0,
      customer_accepted: customerAccepted,
      delivery_proven: deliveryProven,
      invoice_created: values.invoice !== null,
      payment_confirmed: paymentConfirmed,
    }),
    next_action: actionFor(values.phase, approval, values.projectId, values.invoiceId),
    created_at: approval.created_at,
  })
}

/**
 * Härleder ett enda case. Varje direktreferens kontrolleras innan fasen
 * bestäms; ordningen är säkerhetskritisk eftersom en pending approval med en
 * trasig projekt-/ÄTA-länk inte får visas som ett tryggt “granska”-läge.
 */
export function deriveRevenueRecoveryCase(input: RevenueRecoveryInput): RevenueRecoveryCase {
  const { approval, project, changes, invoice } = input
  if (!REVENUE_RECOVERY_APPROVAL_TYPES.includes(approval.approval_type as RevenueRecoveryApprovalType)) {
    return unknownCase(input, 'Godkännandet har en okänd intäktstyp.', null)
  }

  const projectId = recoveryProjectId(approval)
  if (!projectId) return unknownCase(input, 'Projektkopplingen saknas.', null)
  if (!project || project.project_id !== projectId) {
    return unknownCase(input, 'Det länkade projektet kunde inte verifieras.', projectId)
  }

  const expectedChangeIds = recoveryChangeIds(approval)
  if (expectedChangeIds.length > 0) {
    const foundIds = new Set(changes.map(change => change.change_id))
    if (expectedChangeIds.some(id => !foundIds.has(id))) {
      return unknownCase(input, 'En länkad ÄTA-rad kunde inte verifieras.', projectId)
    }
    if (changes.some(change => change.project_id !== projectId)) {
      return unknownCase(input, 'En ÄTA-rad pekar på ett annat projekt.', projectId)
    }
  }

  if (approval.status === 'rejected') {
    return buildCase(input, {
      phase: 'dismissed', truthNote: null, projectId, invoiceId: null, invoice: null, changes,
    })
  }

  if (approval.status === 'pending') {
    return buildCase(input, {
      phase: 'needs_review', truthNote: null, projectId, invoiceId: null, invoice: null, changes,
    })
  }

  if (!VERIFIED_APPROVAL_STATUSES.has(approval.status)) {
    return unknownCase(input, `Godkännandet har okänd status: ${approval.status}.`, projectId)
  }

  // Alla missad_intakt-kort är först granskningssignaler. Material- och
  // projektfynd har avsiktligt inga ÄTA-källrader och får därför visas som
  // needs_review ovan. Först när ett fynd påstås vara godkänt och ha gått
  // vidare krävs den direkta ÄTA-kedjan; annars kan vi inte följa det säkert.
  if (approval.approval_type === 'missad_intakt' && expectedChangeIds.length === 0) {
    return unknownCase(input, 'Det granskade intäktsfyndet saknar sina ÄTA-källrader.', projectId)
  }

  if (approval.approval_type === 'create_ata_draft') {
    const execution = payloadFor(approval).execution_result as Record<string, unknown> | null | undefined
    if (execution?.outcome === 'failed' || execution?.outcome === 'skipped') {
      return buildCase(input, {
        phase: 'failed',
        truthNote: stringValue(execution.error_text) || 'ÄTA-utkastet skapades inte.',
        projectId,
        invoiceId: null,
        invoice: null,
        changes,
      })
    }
    if (execution?.outcome !== 'success') {
      return unknownCase(input, 'Godkännandets körresultat saknas.', projectId)
    }
    if (expectedChangeIds.length !== 1 || changes.length !== 1) {
      return unknownCase(input, 'Godkännandet saknar en entydig skapad ÄTA.', projectId)
    }
  }

  const invoiceIds = recoveryInvoiceIds(approval, changes)
  if (invoiceIds.length > 1) {
    return unknownCase(input, 'Ärendet pekar på flera olika fakturor.', projectId)
  }
  const invoiceId = invoiceIds[0] ?? null
  if (invoiceId && (!invoice || invoice.invoice_id !== invoiceId)) {
    return unknownCase(input, 'Den länkade fakturan kunde inte verifieras.', projectId, invoiceId)
  }
  if (!invoiceId && invoice) {
    return unknownCase(input, 'En faktura laddades utan direktreferens från ärendet.', projectId)
  }
  if (invoice?.project_id && invoice.project_id !== projectId) {
    return unknownCase(input, 'Fakturan pekar på ett annat projekt.', projectId, invoiceId)
  }

  if (approval.approval_type === 'missad_intakt' && !invoiceId) {
    return unknownCase(input, 'Det granskade fyndet saknar sitt fakturautkast.', projectId)
  }

  if (invoice) {
    const paidStatus = invoice.status === 'paid'
    const paidTimestamp = Boolean(invoice.paid_at)
    if (paidStatus !== paidTimestamp) {
      return unknownCase(input, 'Fakturans betalstatus och betaldatum motsäger varandra.', projectId, invoiceId)
    }
    if (paidStatus && paidTimestamp) {
      return buildCase(input, {
        phase: 'paid', truthNote: null, projectId, invoiceId, invoice, changes,
      })
    }
    if (invoice.status === 'draft') {
      return buildCase(input, {
        phase: 'invoice_draft', truthNote: null, projectId, invoiceId, invoice, changes,
      })
    }
    if (invoice.status === 'sent' || invoice.status === 'overdue') {
      return buildCase(input, {
        phase: 'awaiting_payment', truthNote: null, projectId, invoiceId, invoice, changes,
      })
    }
    return unknownCase(input, `Fakturan har okänd status: ${invoice.status || 'saknas'}.`, projectId, invoiceId)
  }

  const declined = changes.some(change => change.status === 'declined' || Boolean(change.declined_at))
  if (declined) {
    return buildCase(input, {
      phase: 'declined', truthNote: null, projectId, invoiceId: null, invoice: null, changes,
    })
  }

  const accepted = changes.length > 0 && changes.every(change => (
    Boolean(change.signed_at) || ACCEPTED_ATA_STATUSES.has(change.status || '')
  ))
  const delivered = project.status === 'completed' || Boolean(project.completed_at)
  if (accepted && delivered) {
    return buildCase(input, {
      phase: 'ready_to_invoice', truthNote: null, projectId, invoiceId: null, invoice: null, changes,
    })
  }
  if (accepted) {
    return buildCase(input, {
      phase: 'awaiting_delivery', truthNote: null, projectId, invoiceId: null, invoice: null, changes,
    })
  }

  if (changes.length === 1 && (changes[0].status === 'draft' || changes[0].status === 'pending')) {
    return buildCase(input, {
      phase: 'needs_ata_send', truthNote: null, projectId, invoiceId: null, invoice: null, changes,
    })
  }
  if (changes.length === 1 && changes[0].status === 'sent') {
    return buildCase(input, {
      phase: 'awaiting_customer', truthNote: null, projectId, invoiceId: null, invoice: null, changes,
    })
  }

  return unknownCase(input, 'ÄTA-läget kan inte härledas säkert.', projectId)
}

const ACTION_PHASES = new Set<RevenueRecoveryPhase>([
  'needs_review', 'needs_ata_send', 'ready_to_invoice', 'invoice_draft', 'failed', 'unknown',
])

/** Dashboardurval: öppna case först; betalda visas som kvitto i högst 30 dagar. */
export function selectRevenueRecoveryCasesForDashboard(
  cases: RevenueRecoveryCase[],
  nowMs: number,
  max = 3,
): RevenueRecoveryCase[] {
  const paidWindowMs = 30 * 24 * 60 * 60 * 1000
  return [...cases]
    .filter(recoveryCase => {
      if (recoveryCase.phase === 'dismissed' || recoveryCase.phase === 'declined') return false
      if (recoveryCase.phase !== 'paid') return true
      const paidAtMs = recoveryCase.paid_at ? new Date(recoveryCase.paid_at).getTime() : NaN
      return Number.isFinite(paidAtMs) && nowMs - paidAtMs >= 0 && nowMs - paidAtMs <= paidWindowMs
    })
    .sort((a, b) => {
      const actionDelta = Number(ACTION_PHASES.has(b.phase)) - Number(ACTION_PHASES.has(a.phase))
      if (actionDelta !== 0) return actionDelta
      return (b.identified_kr ?? 0) - (a.identified_kr ?? 0)
        || b.created_at.localeCompare(a.created_at)
    })
    .slice(0, max)
}
