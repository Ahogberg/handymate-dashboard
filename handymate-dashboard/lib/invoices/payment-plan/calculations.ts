import { mapQuoteItemsToInvoiceItems, rotRutLaborBasis } from '../quote-to-invoice-items'

/** All persisted amounts are integer öre. Cumulative allocation puts rounding
 * residue in the last stage, never in an untracked balancing invoice. */
export function cents(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n) || Math.abs(n) > 1_000_000_000) throw new Error('Ogiltigt belopp')
  return Math.round(n * 100)
}
export interface Amounts { net: number; vat: number; deduction: number; labor: number }
export interface PlanSnapshot {
  version: 1
  quoteNumber: string
  vatRate: number
  taxType: 'rot' | 'rut' | null
  amounts: Amounts
  stages: Array<{ label: string; percent: number; due: string; amounts: Amounts }>
}
export function subtract(a: Amounts, b: Amounts): Amounts {
  return { net: a.net - b.net, vat: a.vat - b.vat, deduction: a.deduction - b.deduction, labor: a.labor - b.labor }
}
export function add(a: Amounts, b: Amounts): Amounts {
  return { net: a.net + b.net, vat: a.vat + b.vat, deduction: a.deduction + b.deduction, labor: a.labor + b.labor }
}
export const zero = (): Amounts => ({ net: 0, vat: 0, deduction: 0, labor: 0 })
export function makeSnapshot(quote: any, rows: any[]): PlanSnapshot {
  if (!['accepted', 'signed'].includes(quote.status)) throw new Error('Offerten måste vara accepterad')
  const plan = quote.payment_plan
  if (!Array.isArray(plan) || plan.length < 2 || plan.length > 10) throw new Error('Betalplanen måste ha 2–10 steg')
  const weights = plan.map((s: any) => cents(s.percent))
  if (weights.some((w: number) => w <= 0) || weights.reduce((a: number, b: number) => a + b, 0) !== 10000) throw new Error('Betalplanen måste summera till 100 procent')
  const items = mapQuoteItemsToInvoiceItems(rows)
  const economic = items.filter(i => i.item_type === 'item')
  const grossNet = economic.reduce((s, i) => s + cents(i.total), 0)
  const discount = cents(quote.discount_amount ?? 0)
  const vatRate = Number(quote.vat_rate ?? 25)
  if (vatRate !== 25) throw new Error('Betalplansflödet kräver 25 procent moms')
  if (!economic.length || grossNet <= 0 || discount < 0 || discount >= grossNet) throw new Error('Offertens rader och rabatt måste kontrolleras')
  const net = grossNet - discount
  const vat = cents(quote.vat_amount)
  if (Math.abs(vat - Math.round(net * vatRate / 100)) > 1 || cents(quote.total) !== net + vat) throw new Error('Offertens totalsumma stämmer inte med raderna')
  const taxType = quote.rot_rut_type === 'rot' || quote.rot_rut_type === 'rut' ? quote.rot_rut_type : null
  if (Number(quote.rot_deduction) > 0 && Number(quote.rut_deduction) > 0 || Number(quote.gron_deduction) > 0) throw new Error('Blandade avdrag behöver en separat betalplan')
  const deduction = cents(quote.rot_rut_deduction ?? (taxType === 'rot' ? quote.rot_deduction : quote.rut_deduction) ?? 0)
  const labor = taxType ? Math.round(cents(rotRutLaborBasis(items, taxType)) * net / grossNet) : 0
  if (labor < 0 || labor > net || deduction < 0 || deduction > Math.round(labor * 1.25 * (taxType === 'rut' ? .5 : .3)) || !taxType && deduction !== 0) throw new Error('Offertens arbetsunderlag eller avdrag behöver rättas')
  const amounts = { net, vat, deduction, labor }
  let cumulative = 0
  let allocated = zero()
  const stages = plan.map((s: any, index: number) => {
    cumulative += weights[index]
    const target = Object.fromEntries(Object.entries(amounts).map(([k, v]) => [k, Math.round(v * cumulative / 10000)])) as unknown as Amounts
    const part = subtract(target, allocated)
    allocated = target
    if (part.net <= 0) throw new Error('Ett betalsteg är för litet')
    if (s.amount != null && Math.abs(cents(s.amount) - Math.round((net + vat) * weights[index] / 10000)) > 1) throw new Error('Betalplanens sparade belopp avviker från offerten')
    return { label: String(s.label || `Steg ${index + 1}`).slice(0, 200), percent: weights[index] / 100, due: String(s.due_description || '').slice(0, 500), amounts: part }
  })
  return { version: 1, quoteNumber: String(quote.quote_number || ''), vatRate, taxType, amounts, stages }
}
export function stageItems(snapshot: PlanSnapshot, amounts: Amounts, label: string, previous: number) {
  const row = (description: string, amount: number, labor: boolean) => ({
    item_type: 'item', description, quantity: 1, unit: 'st', unit_price: amount / 100, total: amount / 100,
    labor_amount: labor ? amount / 100 : 0,
    is_rot_eligible: labor && snapshot.taxType === 'rot', is_rut_eligible: labor && snapshot.taxType === 'rut',
  })
  return [
    ...(amounts.labor ? [row(`${label} – arbete enligt offert ${snapshot.quoteNumber}`, amounts.labor, true)] : []),
    ...(amounts.net !== amounts.labor ? [row(`${label} – övrigt enligt offert ${snapshot.quoteNumber}`, amounts.net - amounts.labor, false)] : []),
    { item_type: 'text', description: `Offert inklusive moms: ${((snapshot.amounts.net + snapshot.amounts.vat) / 100).toFixed(2)} kr. Tidigare fakturerat efter utfärdade krediter: ${(previous / 100).toFixed(2)} kr. Denna faktura: ${((amounts.net + amounts.vat) / 100).toFixed(2)} kr.`, quantity: 0, unit_price: 0, total: 0 },
  ].map((row, index) => ({ ...row, id: `plan_${index}`, sort_order: index }))
}
