import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

const TIME_VALUE_PER_MIN = 15 // 900 kr/tim = 15 kr/min

interface ValueItem {
  type: 'quote_signed' | 'invoice_paid' | 'lead_converted' | 'time_saved'
  label: string
  amount: number
  status: 'confirmed' | 'pending'
  date?: string
}

/**
 * GET /api/automation/value — Beräkna faktiskt genererat värde från automationer (senaste 7 dagarna)
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Hämta automationsloggar senaste 7 dagarna
  const { data: logs } = await supabase
    .from('v3_automation_logs')
    .select('rule_name, action_type, context, result, status, created_at')
    .eq('business_id', business.business_id)
    .eq('status', 'success')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })

  const items: ValueItem[] = []
  let pendingCount = 0

  for (const log of logs || []) {
    const ctx = (log.context || {}) as Record<string, any>
    const res = (log.result || {}) as Record<string, any>

    // Offertuppföljning → kolla om offerten signerats
    if (log.rule_name === 'quote_followup' || log.action_type === 'send_sms') {
      const quoteId = ctx.quote_id || res.quote_id
      if (quoteId) {
        const { data: quote } = await supabase
          .from('quotes')
          .select('status, total, title')
          .eq('quote_id', quoteId)
          .maybeSingle()

        if (quote?.status === 'accepted') {
          items.push({
            type: 'quote_signed',
            label: `Offert signerad efter uppföljning${quote.title ? ': ' + quote.title : ''}`,
            amount: Number(quote.total) || 0,
            status: 'confirmed',
            date: log.created_at,
          })
        } else if (quote && quote.status !== 'declined') {
          pendingCount++
        }
      }
    }

    // Fakturapåminnelse → kolla om betalad inom 7 dagar
    if (log.rule_name === 'invoice_reminder') {
      const invoiceId = ctx.invoice_id || res.invoice_id
      if (invoiceId) {
        const { data: invoice } = await supabase
          .from('invoice')
          .select('status, total, paid_at, invoice_number')
          .eq('invoice_id', invoiceId)
          .maybeSingle()

        if (invoice?.status === 'paid' && invoice.paid_at) {
          const paidDate = new Date(invoice.paid_at)
          const reminderDate = new Date(log.created_at)
          const daysDiff = (paidDate.getTime() - reminderDate.getTime()) / (24 * 3600000)
          if (daysDiff <= 7 && daysDiff >= 0) {
            items.push({
              type: 'invoice_paid',
              label: `Faktura betald efter påminnelse: ${invoice.invoice_number || ''}`,
              amount: Number(invoice.total) || 0,
              status: 'confirmed',
              date: invoice.paid_at,
            })
          }
        }
      }
    }

    // Bokningspåminnelse: 5 min sparad
    if (log.rule_name === 'booking_reminder') {
      items.push({
        type: 'time_saved',
        label: 'Bokningspåminnelse skickad',
        amount: 5 * TIME_VALUE_PER_MIN, // 75 kr
        status: 'confirmed',
        date: log.created_at,
      })
    }

    // Pipeline-uppdatering: 2 min sparad
    if (log.action_type === 'update_pipeline' || log.action_type === 'move_deal') {
      items.push({
        type: 'time_saved',
        label: 'Pipeline uppdaterad automatiskt',
        amount: 2 * TIME_VALUE_PER_MIN, // 30 kr
        status: 'confirmed',
        date: log.created_at,
      })
    }
  }

  // Deduplicate by quote/invoice ID
  const seen = new Set<string>()
  const uniqueItems = items.filter(item => {
    const key = `${item.type}-${item.label}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const totalValue = uniqueItems
    .filter(i => i.status === 'confirmed')
    .reduce((s, i) => s + i.amount, 0)

  return NextResponse.json({
    total_value: totalValue,
    items: uniqueItems,
    pending_count: pendingCount,
    period_days: 7,
  })
}
