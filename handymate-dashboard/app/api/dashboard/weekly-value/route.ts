import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/dashboard/weekly-value
 *
 * "Din vecka med Handymate" — ETT ärligt veckovärde i tre nivåer, lett av den
 * HÅRDASTE siffran (bekräftade kronor), inte den mjukaste (tid). Epistemisk
 * hygien (samma princip som saved-scoreboard — vi hittar inte på kr):
 *   - confirmed_kr  BEKRÄFTAT: offert signerad efter uppföljning + faktura
 *     betald inom 7 dagar efter påminnelse. Riktiga belopp ur quotes/invoice.
 *     (Samma attribueringslogik som /api/automation/value, batchad.)
 *   - captured      POTENTIAL: leads fångade senaste 7 dagarna × estimated_value
 *     (konservativ schablon när värde saknas). Märks tydligt som potential.
 *   - time_minutes  UPPSKATTNING: viktad per åtgärdstyp (mer trovärdig än platt
 *     15-min-schablon).
 */

const ROLLING_DAYS = 7
const DEFAULT_LEAD_VALUE = 5000 // konservativ schablon när lead saknar estimated_value

// Viktad tidsåtgång per åtgärd (minuter) — mer trovärdig än en platt schablon.
const RUN_MINUTES: Record<string, number> = { phone_call: 12, incoming_sms: 6 }
const RUN_DEFAULT = 10
const ACTION_MINUTES: Record<string, number> = {
  send_sms: 6,
  send_email: 6,
  send_reminder: 12,
  send_invoice_reminder: 12,
  create_booking: 10,
  schedule_followup: 10,
  notify_owner: 4,
  create_approval: 4,
}
const ACTION_DEFAULT = 6

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const sinceIso = new Date(Date.now() - ROLLING_DAYS * 24 * 3600_000).toISOString()

  const [runsRes, logsRes, leadsRes] = await Promise.all([
    supabase
      .from('agent_runs')
      .select('trigger_type')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .limit(5000),
    supabase
      .from('v3_automation_logs')
      .select('action_type, rule_name, context, result, created_at')
      .eq('business_id', businessId)
      .eq('status', 'success')
      .gte('created_at', sinceIso)
      .limit(5000),
    supabase
      .from('leads')
      .select('estimated_value')
      .eq('business_id', businessId)
      .gte('created_at', sinceIso)
      .limit(5000),
  ])

  const runs = runsRes.data || []
  const logs = logsRes.data || []
  const leads = leadsRes.data || []

  // ── Nivå 3: viktad tid (uppskattning) ──
  let timeMinutes = 0
  for (const r of runs) timeMinutes += RUN_MINUTES[(r.trigger_type as string) || ''] ?? RUN_DEFAULT
  for (const l of logs) timeMinutes += ACTION_MINUTES[(l.action_type as string) || ''] ?? ACTION_DEFAULT

  // ── Nivå 2: fångad potential ──
  const capturedCount = leads.length
  let capturedKr = 0
  for (const l of leads) {
    const v = Number(l.estimated_value)
    capturedKr += v > 0 ? v : DEFAULT_LEAD_VALUE
  }

  // ── Nivå 1: bekräftade kronor ──
  // Samla quote/invoice-id:n ur loggarna och batch-hämta (undviker N+1).
  const quoteIds = new Set<string>()
  const invoiceRemindedAt = new Map<string, number>() // invoiceId → tidigaste påminnelse (ms)
  for (const l of logs) {
    const ctx = (l.context || {}) as Record<string, any>
    const res = (l.result || {}) as Record<string, any>
    const qid = ctx.quote_id || res.quote_id
    if (qid && (l.rule_name === 'quote_followup' || l.action_type === 'send_sms')) {
      quoteIds.add(String(qid))
    }
    const iid = ctx.invoice_id || res.invoice_id
    if (iid && l.rule_name === 'invoice_reminder') {
      const t = new Date(l.created_at).getTime()
      const prev = invoiceRemindedAt.get(String(iid))
      if (prev == null || t < prev) invoiceRemindedAt.set(String(iid), t)
    }
  }

  let confirmedKr = 0
  const confirmedItems: Array<{ label: string; amount: number }> = []

  if (quoteIds.size > 0) {
    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_id, status, total, title')
      .eq('business_id', businessId)
      .in('quote_id', Array.from(quoteIds))
    for (const q of quotes || []) {
      if (q.status === 'accepted') {
        const amount = Number(q.total) || 0
        confirmedKr += amount
        confirmedItems.push({
          label: `Offert signerad efter påminnelse${q.title ? ': ' + q.title : ''}`,
          amount,
        })
      }
    }
  }

  if (invoiceRemindedAt.size > 0) {
    const { data: invoices } = await supabase
      .from('invoice')
      .select('invoice_id, status, total, paid_at, invoice_number')
      .eq('business_id', businessId)
      .in('invoice_id', Array.from(invoiceRemindedAt.keys()))
    for (const inv of invoices || []) {
      if (inv.status === 'paid' && inv.paid_at) {
        const paid = new Date(inv.paid_at).getTime()
        const reminded = invoiceRemindedAt.get(inv.invoice_id) as number
        const days = (paid - reminded) / (24 * 3600_000)
        if (days >= 0 && days <= 7) {
          const amount = Number(inv.total) || 0
          confirmedKr += amount
          confirmedItems.push({
            label: `Faktura ${inv.invoice_number || ''} betald efter påminnelse`.trim(),
            amount,
          })
        }
      }
    }
  }

  return NextResponse.json({
    range_days: ROLLING_DAYS,
    confirmed_kr: Math.round(confirmedKr),
    confirmed_items: confirmedItems,
    captured_count: capturedCount,
    captured_kr: Math.round(capturedKr),
    time_minutes: timeMinutes,
    time_hours: Math.round((timeMinutes / 60) * 10) / 10,
  })
}
