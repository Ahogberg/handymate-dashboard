import { importInvoicesForBusiness } from './import-invoices'
import { syncFortnoxPaymentsForBusiness } from './sync-payments'
import { getServerSupabase } from '@/lib/supabase'

/** One inbound round for manual sync, history and cron. Timestamp means the entire round succeeded. */
export async function syncInvoicesFromFortnox(businessId: string) {
  const imported = await importInvoicesForBusiness(businessId)
  const payments = await syncFortnoxPaymentsForBusiness(businessId, { stamp: false, excludeDocumentNumbers: imported.errors.map(e => e.documentNumber) })
  const errors = [...imported.errors.map(e => `${e.documentNumber}: ${e.error}`), ...payments.errors]
  if (!errors.length) {
    const { error } = await getServerSupabase().from('business_config').update({ fortnox_last_synced_at: new Date().toISOString() }).eq('business_id', businessId)
    if (error) errors.push('Synken gick igenom men tidpunkten kunde inte sparas')
  }
  return { ...imported, ...payments, errors, success: errors.length === 0 }
}
