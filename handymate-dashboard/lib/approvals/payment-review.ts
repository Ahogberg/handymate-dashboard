import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { decidePaymentOutcome } from '@/lib/invoices/payment-decision'

const kr = (value: number) => `${value.toLocaleString('sv-SE')} kr`

export async function preparePaymentReview(
  db: SupabaseClient,
  businessId: string,
  payload: Record<string, any>,
  overrides?: Record<string, string>,
): Promise<{ review: ApprovalReview; snapshot: Record<string, unknown>; executionPayload: Record<string, unknown>; executionEvidence: Record<string, unknown> }> {
  if (typeof payload.invoice_id !== 'string' || !payload.invoice_id) throw new Error('Fakturan saknas i betalningsunderlaget.')
  const { data: invoice, error } = await db.from('invoice')
    .select('invoice_id, invoice_number, fortnox_invoice_number, status, customer_id, project_id, total, rot_rut_type, rot_rut_deduction, customer_pays, paid_amount, paid_at')
    .eq('invoice_id', payload.invoice_id).eq('business_id', businessId).maybeSingle()
  if (error || !invoice) throw new Error('Fakturan kunde inte verifieras i företaget.')
  if (payload.customer_id && payload.customer_id !== invoice.customer_id) throw new Error('Fakturans kund har ändrats sedan uppgiften skapades.')
  if (payload.invoice_number && ![invoice.invoice_number, invoice.fortnox_invoice_number].includes(payload.invoice_number)) throw new Error('Fakturanumret har ändrats sedan uppgiften skapades.')
  if (Number.isFinite(payload.total) && Number(payload.total) !== Number(invoice.total)) throw new Error('Fakturabeloppet har ändrats sedan uppgiften skapades.')

  let customer: any = null
  if (invoice.customer_id) {
    const result = await db.from('customer').select('customer_id, name, phone_number, email, portal_token, portal_enabled')
      .eq('customer_id', invoice.customer_id).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Fakturans kund kunde inte verifieras i företaget.')
    customer = result.data
  }
  let project: any = null
  if (invoice.project_id) {
    const result = await db.from('project').select('project_id, name, status')
      .eq('project_id', invoice.project_id).eq('business_id', businessId).maybeSingle()
    if (result.error || !result.data) throw new Error('Fakturans projekt kunde inte verifieras i företaget.')
    project = result.data
  }

  const amount = payload.amount == null ? undefined : Number(payload.amount)
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0)) throw new Error('Betalningsbeloppet måste vara större än noll.')
  const decision = decidePaymentOutcome(invoice, amount)
  const choices = [
    { id: 'update_workflows', label: 'Uppdatera affär och projekt', description: 'Kör pipeline-, projektledar- och projektstegsföljder efter registreringen.', defaultSelected: true },
    { id: 'prepare_customer_messages', label: 'Förbered kundbesked', description: 'Skapar separata granskningskort för aktuellt portal-/tackmejl och omdömes-SMS; inget skickas nu.', defaultSelected: true },
    { id: 'run_automation_rules', label: 'Förbered automationsföljder', description: 'Kör payment_received-regler, men varje faktisk regelhandling skapas som ett nytt granskningskort.', defaultSelected: true },
  ]
  const selected = Object.fromEntries(choices.map(choice => [choice.id, overrides?.[choice.id] !== 'rejected']))
  const invoiceNumber = invoice.invoice_number || invoice.fortnox_invoice_number || invoice.invoice_id
  const transition = decision.already_settled
    ? 'Fakturan är redan helt betald; ingen ny betalningsövergång görs'
    : decision.transition === 'to_customer_paid'
      ? `Kundens andel registreras; ${kr(decision.remaining_rot_kr)} återstår från Skatteverket`
      : decision.transition === 'settled'
        ? 'Återstående skattereduktion registreras och fakturan blir helt betald'
        : `Fakturan markeras betald med ${kr(decision.paid_amount)}`
  const executionPayload = { invoiceId: invoice.invoice_id, amount: amount ?? null, choices: selected }
  const executionEvidence = {
    kind: 'confirm_payment', ...executionPayload, invoiceNumber, customerId: invoice.customer_id || null,
    customerName: customer?.name || null, projectId: invoice.project_id || null, projectName: project?.name || null,
    currentStatus: invoice.status, resultingStatus: decision.status, paidAmount: decision.paid_amount,
    remainingRotKr: decision.remaining_rot_kr, transition,
    customerMessageEffect: selected.prepare_customer_messages ? 'Nya konkreta granskningskort skapas; inget kundutskick sker nu' : 'Inga kundbesked förbereds',
    automationEffect: selected.run_automation_rules ? 'Regelhandlingar kräver nya godkännanden' : 'payment_received-regler körs inte',
  }
  return {
    executionPayload,
    executionEvidence,
    // Bind the live underlay and allowed choice list in the review contract;
    // the user's selection is supplied only at final confirmation.
    snapshot: { payment: { invoice, customer, project, decision } },
    review: {
      title: `Granska betalning — faktura ${invoiceNumber}`,
      effect: `Registrerar betalningsutfallet: ${transition}. Valda följder redovisas separat. Inget kundmeddelande skickas av detta beslut.`,
      confirmLabel: decision.already_settled ? 'Bekräfta att den redan är betald' : 'Registrera betalningen och valda följder',
      messages: [],
      choices,
      details: [
        { label: 'Faktura', text: String(invoiceNumber) },
        { label: 'Kund', text: customer?.name || 'Kund saknas' },
        { label: 'Projekt', text: project?.name || 'Ingen verifierad projektkoppling' },
        { label: 'Nuvarande status', text: invoice.status || 'Status saknas' },
        { label: 'Fakturabelopp', text: kr(Number(invoice.total || 0)) },
        { label: 'Registreras som betalt', text: kr(decision.paid_amount) },
        { label: 'ROT/RUT-avdrag', text: kr(Number(invoice.rot_rut_deduction || 0)) },
        { label: 'Återstår från Skatteverket', text: kr(decision.remaining_rot_kr) },
        { label: 'Betalningsföljd', text: transition },
        { label: 'Kundutskick nu', text: 'Inget; valda besked blir nya granskningskort' },
      ],
    },
  }
}
