import { createHash } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'
import { getFortnoxInvoices, getFortnoxInvoice, isFortnoxConnected, type FortnoxInvoice } from '@/lib/fortnox'
import { mapFortnoxInvoice } from './map-invoice'
import { withFortnoxLock } from './operation-lock'
import { logFortnoxOperation } from './api-log'
import { rotRutLaborBasis, splitLine } from '@/lib/rot-rut-basis'

type Existing = { invoice_id: string; status: string; invoice_type: string; customer_id: string | null; fortnox_document_number: string | null; fortnox_invoice_number: string | null; fortnox_sync_status: string | null; fortnox_synced_at?: string | null }

/** Only Fortnox-owned commercial fields. Never replace job links, internal notes, reminders or delivery receipts. */
export function invoiceContentFromFortnox(fi: FortnoxInvoice) {
  if (!fi.DocumentNumber || fi.Total == null || !Number.isFinite(Number(fi.Total)) || !Array.isArray(fi.InvoiceRows)) throw new Error('Ofullständigt fakturaunderlag från Fortnox')
  if (fi.Currency && fi.Currency !== 'SEK') throw new Error('Fakturan har annan valuta än SEK och behöver hanteras separat')
  if (Number(fi.Total) < 0 || (fi.InvoiceType && fi.InvoiceType !== 'INVOICE')) throw new Error('Kredit- eller kontantfakturan behöver hanteras separat')
  const items = fi.InvoiceRows.map((row, index) => {
    const quantity = Number(row.DeliveredQuantity)
    const price = Number(row.Price)
    if (!Number.isFinite(quantity) || !Number.isFinite(price)) throw new Error('Ofullständig fakturarad från Fortnox')
    const source = row as typeof row & { Total?: number; Discount?: number; DiscountType?: string }
    if (source.Total == null && Number(source.Discount || 0) !== 0) throw new Error('Rabatterad fakturarad saknar radbelopp')
    const total = source.Total != null ? Number(source.Total) : quantity * price
    const houseWork = Boolean((row as any).HouseWork)
    return { id: `fortnox-${index}`, item_type: 'item', description: row.Description, quantity, unit: row.Unit || 'st', unit_price: price,
      total, vat_rate: row.VAT ?? 25, ...splitLine(total, houseWork ? 1 : 0, 0),
      rot_rut_type: houseWork && fi.TaxReductionType ? fi.TaxReductionType.toLowerCase() : null,
      is_rot_eligible: houseWork && fi.TaxReductionType === 'ROT', is_rut_eligible: houseWork && fi.TaxReductionType === 'RUT' }
  })
  const type = fi.TaxReductionType === 'ROT' ? 'rot' : fi.TaxReductionType === 'RUT' ? 'rut' : null
  return {
    invoice_number: fi.DocumentNumber,
    total: Number(fi.Total),
    ...(fi.Net != null ? { subtotal: Number(fi.Net) } : {}),
    ...(fi.TotalVAT != null ? { vat_amount: Number(fi.TotalVAT) } : {}),
    invoice_date: fi.InvoiceDate, due_date: fi.DueDate || null, items,
    rot_work_cost: type === 'rot' ? rotRutLaborBasis(items, 'rot') : 0,
    rut_work_cost: type === 'rut' ? rotRutLaborBasis(items, 'rut') : 0,
    ...(fi.TaxReductionType === 'ROT' || fi.TaxReductionType === 'RUT' ? {
      rot_rut_type: fi.TaxReductionType.toLowerCase(), rot_rut_deduction: Number(fi.TaxReduction || 0),
      customer_pays: fi.TotalToPay ?? Number(fi.Total) - Number(fi.TaxReduction || 0),
    } : {}),
  }
}

/** Pull only. Both scheduled and manual sync use this service. Historical imports send nothing. */
export async function importInvoicesForBusiness(businessId: string) {
  return withFortnoxLock(businessId, 'invoice-import', async assertOwned => {
    if (!await isFortnoxConnected(businessId)) throw new Error('Fortnox behöver återanslutas')
    const deadline = Date.now() + 210_000
    const db = getServerSupabase()
    const result = { imported: 0, updated: 0, skipped: 0, unlinked: 0, total: 0, total_outstanding_kr: 0, errors: [] as { documentNumber: string; error: string }[] }
    const existing: Existing[] = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from('invoice').select('invoice_id,status,invoice_type,customer_id,fortnox_document_number,fortnox_invoice_number,fortnox_sync_status,fortnox_synced_at').eq('business_id', businessId).order('invoice_id').range(offset, offset + 999)
      if (error) throw new Error('Kunde inte läsa befintliga fakturor')
      existing.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    const byDoc = new Map(existing.flatMap(row => {
      const number = row.fortnox_document_number || row.fortnox_invoice_number
      return number ? [[number, row] as const] : []
    }))
    const listed = await getFortnoxInvoices(businessId)
    // Previously linked invoices stay in scope even when older than the history window or now paid/cancelled.
    const numbers = new Set([...listed.map(row => row.DocumentNumber || row.InvoiceNumber).filter((n): n is string => !!n), ...Array.from(byDoc.keys())])
    result.total = numbers.size
    for (const number of Array.from(numbers).sort((a, b) => (Date.parse(byDoc.get(a)?.fortnox_synced_at || '') || 0) - (Date.parse(byDoc.get(b)?.fortnox_synced_at || '') || 0))) {
      if (Date.now() > deadline) throw new Error('Synken hann inte bli klar. Kör igen för att fortsätta.')
      await assertOwned()
      try {
        const fi = await getFortnoxInvoice(businessId, number)
        if (!fi || String(fi.DocumentNumber) !== number) throw new Error('Fortnox returnerade fel faktura')
        const current = byDoc.get(number)
        if (current?.fortnox_sync_status === 'pending' || current?.fortnox_sync_status === 'failed') throw new Error('Fakturan har en oavslutad överföring som behöver stämmas av först')
        if (!current && fi.ExternalInvoiceReference1 && existing.some(row => row.invoice_id === fi.ExternalInvoiceReference1)) throw new Error('Fakturan hör till en befintlig Handymate-faktura. Stäm av överföringen först')
        const mapped = mapFortnoxInvoice(fi, new Date().toISOString().slice(0, 10))
        if (!mapped) throw new Error('Fakturan saknar dokumentnummer')
        if (current?.status === 'paid' && (fi.Cancelled || (fi.Balance != null && Number(fi.Balance) > 0))) throw new Error('En tidigare betald faktura har återöppnats eller makulerats i Fortnox och behöver stämmas av')
        const content = invoiceContentFromFortnox(fi)
        let customerId = current?.customer_id || null
        if (!customerId && fi.CustomerNumber) {
          const { data, error } = await db.from('customer').select('customer_id').eq('business_id', businessId).eq('fortnox_customer_number', fi.CustomerNumber).maybeSingle()
          if (error) throw new Error('Kunde inte matcha fakturans kund')
          customerId = data?.customer_id || null
        }
        if (!customerId) result.unlinked++
        const receipt = { fortnox_document_number: number, fortnox_invoice_number: number, fortnox_synced_at: new Date().toISOString(), fortnox_sync_status: 'synced' }
        await assertOwned()
        if (current) {
          // Payments/cancellation on existing rows go through the existing payment transition service.
          // Only draft/sent/overdue presentation may move here; never reset settled/customer-paid states.
          const displayStatus = ['draft', 'sent', 'overdue'].includes(current.status) && ['draft', 'sent', 'overdue'].includes(mapped.row.status) ? { status: mapped.row.status } : {}
          const { data, error } = await db.from('invoice').update({ ...content, ...receipt, ...displayStatus, ...(customerId && !current.customer_id ? { customer_id: customerId } : {}) }).eq('business_id', businessId).eq('invoice_id', current.invoice_id).eq('status', current.status).select('invoice_id').maybeSingle()
          if (error || !data) throw new Error('Fakturan ändrades under synken eller kunde inte sparas. Försök igen')
          result.updated++
        } else {
          const invoiceId = 'inv_fn_' + createHash('sha256').update(JSON.stringify([businessId, number])).digest('hex').slice(0, 32)
          const { error } = await db.from('invoice').insert({ ...mapped.row, ...content, ...receipt, invoice_id: invoiceId, business_id: businessId, customer_id: customerId })
          if (error) throw new Error('Fakturan kunde inte sparas. Försök igen')
          result.imported++
        }
        result.total_outstanding_kr += mapped.outstanding
      } catch (error) { result.errors.push({ documentNumber: number, error: error instanceof Error ? error.message : 'Importen misslyckades' }) }
    }
    await logFortnoxOperation(businessId, 'import_invoices', { ...result, errors: undefined, error_count: result.errors.length })
    return { ...result, success: result.errors.length === 0 }
  })
}
