/**
 * Kundlivstidsvärde — beräkna och uppdatera LTV per kund.
 * Körs nattligen via cron.
 */

import { getServerSupabase } from '@/lib/supabase'

export async function calculateCustomerLTV(businessId: string): Promise<{
  success: boolean
  updated: number
  reactivations: number
  error?: string
}> {
  const supabase = getServerSupabase()
  let updated = 0
  let reactivations = 0

  try {
    // Hämta alla kunder
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number, lifetime_value')
      .eq('business_id', businessId)

    if (!customers || customers.length === 0) {
      return { success: true, updated: 0, reactivations: 0 }
    }

    // Hämta alla betalda fakturor för detta företag
    const { data: invoices } = await supabase
      .from('invoice')
      .select('customer_id, total, invoice_date, due_date, paid_at, status')
      .eq('business_id', businessId)
      .in('status', ['paid', 'sent', 'overdue'])

    if (!invoices) {
      return { success: true, updated: 0, reactivations: 0 }
    }

    // Gruppera fakturor per kund
    const invoicesByCustomer = new Map<string, typeof invoices>()
    for (const inv of invoices) {
      if (!inv.customer_id) continue
      const list = invoicesByCustomer.get(inv.customer_id) || []
      list.push(inv)
      invoicesByCustomer.set(inv.customer_id, list)
    }

    const now = new Date()
    const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000)

    for (const customer of customers) {
      const custInvoices = invoicesByCustomer.get(customer.customer_id) || []
      const paidInvoices = custInvoices.filter((i: any) => i.status === 'paid')

      const lifetimeValue = paidInvoices.reduce((sum: number, i: any) => sum + (Number(i.total) || 0), 0)
      const jobCount = paidInvoices.length
      const avgJobValue = jobCount > 0 ? lifetimeValue / jobCount : 0

      // Senaste jobb
      const dates = paidInvoices
        .map((i: any) => i.invoice_date || i.paid_at)
        .filter(Boolean)
        .sort()
        .reverse()
      const lastJobDate = dates[0] || null

      // Genomsnittliga betalningsdagar
      let totalPaymentDays = 0
      let paymentCount = 0
      for (const inv of paidInvoices) {
        if (inv.paid_at && inv.due_date) {
          const paid = new Date(inv.paid_at)
          const due = new Date(inv.due_date)
          const days = Math.floor((paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
          totalPaymentDays += days
          paymentCount++
        }
      }
      const avgPaymentDays = paymentCount > 0 ? Math.round(totalPaymentDays / paymentCount) : 0

      // Uppdatera kund
      await supabase
        .from('customer')
        .update({
          lifetime_value: lifetimeValue,
          job_count: jobCount,
          last_job_date: lastJobDate,
          avg_job_value: Math.round(avgJobValue),
          avg_payment_days: avgPaymentDays,
          ltv_updated_at: now.toISOString(),
        })
        .eq('customer_id', customer.customer_id)

      updated++

      // Proaktiv reaktivering — VIP-kund som varit tyst
      if (
        lifetimeValue >= 50000 &&
        lastJobDate &&
        new Date(lastJobDate) < sixMonthsAgo
      ) {
        // Kolla om redan föreslagit senaste 60 dagarna
        const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()
        const { data: existing } = await supabase
          .from('v3_automation_logs')
          .select('id')
          .eq('business_id', businessId)
          .eq('rule_name', 'customer_lifetime_reactivation')
          .gte('created_at', sixtyDaysAgo)
          .contains('context', { customer_id: customer.customer_id })
          .limit(1)

        if (!existing || existing.length === 0) {
          const monthsSince = Math.floor((now.getTime() - new Date(lastJobDate).getTime()) / (30 * 24 * 60 * 60 * 1000))

          await supabase.from('pending_approvals').insert({
            id: crypto.randomUUID(),
            business_id: businessId,
            approval_type: 'customer_reactivation',
            title: `Reaktivera ${customer.name}`,
            description: `${customer.name} har betalat ${Math.round(lifetimeValue).toLocaleString('sv-SE')} kr totalt (${jobCount} jobb) men varit tyst i ${monthsSince} månader. Vill du att jag skickar ett personligt SMS?`,
            payload: {
              customer_id: customer.customer_id,
              customer_name: customer.name,
              customer_phone: customer.phone_number,
              lifetime_value: lifetimeValue,
              job_count: jobCount,
              months_inactive: monthsSince,
            },
            status: 'pending',
            risk_level: 'medium',
          })

          await supabase.from('v3_automation_logs').insert({
            business_id: businessId,
            rule_name: 'customer_lifetime_reactivation',
            trigger_type: 'cron',
            action_type: 'create_approval',
            status: 'success',
            context: {
              customer_id: customer.customer_id,
              customer_name: customer.name,
              lifetime_value: lifetimeValue,
              months_inactive: monthsSince,
            },
          })

          reactivations++
        }
      }
    }

    return { success: true, updated, reactivations }
  } catch (err: any) {
    console.error('[customer-ltv] Error:', err)
    return { success: false, updated, reactivations, error: err.message }
  }
}
