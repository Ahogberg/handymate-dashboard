import { createInvoice } from '../create-invoice'
import { add, makeSnapshot, stageItems, subtract, zero, type PlanSnapshot, type Amounts } from './calculations'

export const paymentPlanEnabled = () => process.env.PAYMENT_PLAN_INVOICING_ENABLED === 'true'
export async function loadPlan(db: any, businessId: string, projectId: string) {
  const { data, error } = await db.from('invoice_payment_plan').select('*').eq('business_id', businessId).eq('project_id', projectId).maybeSingle()
  if (error) throw error
  return data
}
export async function planState(db: any, plan: any) {
  const { data, error } = await db.from('invoice_payment_stage').select('*, invoice:invoice_id(*)').eq('quote_id', plan.quote_id).order('step')
  if (error) throw error
  const entries: any[] = data || []
  const billed = entries.filter(e => e.kind !== 'credit' || e.invoice.status !== 'draft').reduce((sum, e) => add(sum, e.amounts), zero())
  return { entries, billed, remaining: subtract(plan.snapshot.amounts, billed) }
}
export async function activatePlan(db: any, businessId: string, projectId: string) {
  const { data: source, error } = await db.rpc('payment_plan_source', { p_business: businessId, p_project: projectId })
  if (error) throw error
  if (!source) throw new Error('Projektet saknar en kopplad offert för samma kund')
  const snapshot = makeSnapshot(source.quote, source.rows.length ? source.rows : source.quote.items || [])
  const { data, error: writeError } = await db.rpc('activate_invoice_payment_plan', { p_business: businessId, p_project: projectId, p_source: source, p_snapshot: snapshot })
  if (writeError) throw writeError
  return data
}
export async function createPlanInvoice(db: any, businessId: string, projectId: string, step: number, originalId?: string) {
  const plan = await loadPlan(db, businessId, projectId)
  if (!plan) throw new Error('Aktivera betalplanen först')
  const snapshot: PlanSnapshot = plan.snapshot
  const state = await planState(db, plan)
  const existing = state.entries.find(e => originalId ? e.original_id === originalId : e.kind !== 'credit' && e.step === step)
  if (existing) return existing.invoice
  const original = originalId && state.entries.find(e => e.invoice_id === originalId && e.kind !== 'credit')
  if (originalId && !original) throw new Error('Originalfakturan saknas i betalplanen')
  if (!Number.isInteger(step) || step < 0 || step >= snapshot.stages.length) throw new Error('Ogiltigt betalsteg')
  const final = step === snapshot.stages.length - 1
  const amounts: Amounts = original ? subtract(zero(), original.amounts) : final ? state.remaining : snapshot.stages[step].amounts
  const total = (amounts.net + amounts.vat) / 100
  const label = original ? `Kredit för ${original.invoice.invoice_number}` : final ? 'Slutavräkning' : snapshot.stages[step].label
  const quote = plan.source.quote
  const { data: config, error: configError } = await db.from('business_config').select('business_name,org_number,bankgiro,plusgiro,bank_account_number,default_payment_days').eq('business_id', businessId).single()
  if (configError) throw configError
  if (!config?.business_name || !config.org_number || !(config.bankgiro || config.plusgiro || config.bank_account_number)) throw new Error('Komplettera företagsnamn, organisationsnummer och betalkonto i inställningar')
  const items = original ? original.invoice.items.map((i: any) => ({ ...i, unit_price: -Number(i.unit_price || 0), total: -Number(i.total || 0), labor_amount: i.labor_amount == null ? null : -Number(i.labor_amount) })) : stageItems(snapshot, amounts, label, state.billed.net + state.billed.vat)
  const result = await createInvoice(db, {
    businessId, projectId, customerId: plan.customer_id, quoteId: plan.quote_id,
    invoiceType: original ? 'credit' : final ? 'final' : 'partial', status: 'draft', requireAtomicNumber: true,
    items, subtotal: amounts.net / 100, vatRate: snapshot.vatRate, vatAmount: amounts.vat / 100, total,
    rotRutType: snapshot.taxType, rotRutDeduction: amounts.deduction / 100, customerPays: total - amounts.deduction / 100,
    personnummer: quote.personnummer, fastighetsbeteckning: quote.fastighetsbeteckning,
    dueDays: original ? 0 : config.default_payment_days ?? 30,
    introductionText: `${label}. Offert ${snapshot.quoteNumber}. ${snapshot.stages[step].due}`,
    conclusionText: final ? 'Tidigare fakturerade belopp är avräknade. ÄTA faktureras separat.' : 'Fakturan avser en etapp i den avtalade betalplanen.',
    extraFields: {
      partial_number: step + 1, partial_total: snapshot.stages.length,
      ...(snapshot.taxType === 'rut' ? { rut_work_cost: amounts.labor / 100, rut_deduction: amounts.deduction / 100 } : { rot_work_cost: amounts.labor / 100, rot_deduction: amounts.deduction / 100 }),
      rot_personal_number: quote.personnummer || null, rot_property_designation: quote.fastighetsbeteckning || null,
      ...(original ? { is_credit_note: true, credit_for_invoice_id: originalId, original_invoice_id: originalId, credit_reason: label } : {}),
    },
    persist: async row => {
      const { data, error } = await db.rpc('write_payment_plan_invoice', { p_business: businessId, p_project: projectId, p_step: step, p_original: originalId || null, p_row: row })
      if (error) throw error
      return data
    },
  })
  return result.invoice
}
