import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { summariseAutomationValue, type AutomationLogRow, type InvoiceFacit, type QuoteFacit } from '@/lib/value/automation-value'

// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

/**
 * GET /api/automation/value — automationernas resultat senaste 7 dagarna.
 *
 * 2026-09-14 (ROI-audit P0): tid räknas inte längre om till kronor. Pengar
 * (`confirmed_value`) kommer bara från faktura- och offertrader i databasen;
 * sparad tid rapporteras som `estimated_minutes` med schablonen i
 * `estimate_basis`. Härledningen är ren och facit-testad i
 * lib/value/automation-value.ts; den här filen gör bara uppslagen.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: logs } = await supabase
    .from('v3_automation_logs')
    .select('rule_name, action_type, context, result, status, created_at')
    .eq('business_id', business.business_id)
    .eq('status', 'success')
    .gte('created_at', sevenDaysAgo)
    .order('created_at', { ascending: false })

  const rows = (logs || []) as AutomationLogRow[]
  const quoteIds = new Set<string>()
  const invoiceIds = new Set<string>()
  for (const log of rows) {
    const ctx = log.context || {}
    const res = log.result || {}
    if (log.rule_name === 'quote_followup' || log.action_type === 'send_sms') {
      const quoteId = (ctx.quote_id ?? res.quote_id) as string | undefined
      if (quoteId) quoteIds.add(quoteId)
    }
    if (log.rule_name === 'invoice_reminder') {
      const invoiceId = (ctx.invoice_id ?? res.invoice_id) as string | undefined
      if (invoiceId) invoiceIds.add(invoiceId)
    }
  }

  const quotes = new Map<string, QuoteFacit>()
  if (quoteIds.size > 0) {
    const { data } = await supabase
      .from('quotes')
      .select('quote_id, status, total, title')
      .eq('business_id', business.business_id)
      .in('quote_id', Array.from(quoteIds))
    for (const q of data || []) quotes.set(q.quote_id, { status: q.status, total: q.total, title: q.title })
  }

  const invoices = new Map<string, InvoiceFacit>()
  if (invoiceIds.size > 0) {
    const { data } = await supabase
      .from('invoice')
      .select('invoice_id, status, total, paid_amount, paid_at, invoice_number')
      .eq('business_id', business.business_id)
      .in('invoice_id', Array.from(invoiceIds))
    for (const inv of data || []) {
      invoices.set(inv.invoice_id, { status: inv.status, total: inv.total, paid_amount: inv.paid_amount, paid_at: inv.paid_at, invoice_number: inv.invoice_number })
    }
  }

  return NextResponse.json(summariseAutomationValue(rows, { quotes, invoices }))
}
