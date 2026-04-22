/**
 * Matte månadsrapport — samlar affärsdata för en månad + AI-analys.
 *
 * Används av:
 *  - /api/cron/monthly-review   (1:a varje månad 07:00)
 *  - Manuell trigger från dashboarden
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface MonthlyReviewData {
  month: string                // "2026-03-01"
  month_label: string          // "Mars 2026"
  profitability: {
    invoiced_total: number     // Fakturerat denna månad (alla status)
    paid_total: number         // Inbetalat (status = 'paid')
    outstanding_total: number  // Utestående (ej betalda)
    outstanding_count: number
    overdue_total: number      // >30 dagar gamla obetalda
    overdue_count: number
    invoiced_prev_month: number
    mom_change_pct: number     // +12% vs föregående månad
    best_project: { name: string; margin_pct: number; revenue: number } | null
    worst_project: { name: string; margin_pct: number; revenue: number } | null
  }
  pipeline: {
    new_leads: number
    won_leads: number
    lost_leads: number
    conversion_rate_pct: number
    quotes_sent: number
    quotes_accepted: number
    quotes_open: number
    avg_quote_amount: number
  }
  customers: {
    new_customers: number
    inactive_60d_plus: { customer_id: string; name: string; last_job_date: string | null; lifetime_value: number }[]
    overdue_invoice_30d_plus: { customer_id: string; name: string; overdue_amount: number; days_overdue: number }[]
  }
}

export interface MonthlyReview {
  data: MonthlyReviewData
  analysis: string                // Claudes text-rapport
  recommendations: Array<{
    title: string
    description: string
    estimated_value_sek?: number
    action_type?: string
    target_customer_ids?: string[]
  }>
}

/**
 * Returnerar första dag i en månad (YYYY-MM-01) relativt angivet datum.
 * Default: föregående månad (dvs. den som just avslutats).
 */
export function getReviewMonth(reference?: Date): { start: Date; end: Date; iso: string; label: string } {
  const now = reference || new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const end = new Date(now.getFullYear(), now.getMonth(), 1)     // Exklusivt
  const iso = start.toISOString().slice(0, 10)
  const label = start.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long' })
  return { start, end, iso, label: label.charAt(0).toUpperCase() + label.slice(1) }
}

/**
 * Samlar all affärsdata för given månad.
 */
export async function collectMonthlyData(
  supabase: SupabaseClient,
  businessId: string,
  monthStart: Date,
  monthEnd: Date
): Promise<MonthlyReviewData> {
  const startIso = monthStart.toISOString()
  const endIso = monthEnd.toISOString()

  // Föregående månad för MoM-jämförelse
  const prevStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1)
  const prevEnd = monthStart

  // ── FAKTUROR ──
  const [{ data: monthInvoices }, { data: prevInvoices }] = await Promise.all([
    supabase.from('invoice').select('invoice_id, status, total, customer_id, paid_at, due_date, invoice_date, created_at')
      .eq('business_id', businessId).gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('invoice').select('invoice_id, total, status')
      .eq('business_id', businessId).gte('created_at', prevStart.toISOString()).lt('created_at', prevEnd.toISOString()),
  ])

  const invoicedTotal = (monthInvoices || []).reduce((s, i) => s + (Number(i.total) || 0), 0)
  const paidTotal = (monthInvoices || []).filter(i => i.status === 'paid').reduce((s, i) => s + (Number(i.total) || 0), 0)
  const outstanding = (monthInvoices || []).filter(i => i.status !== 'paid' && i.status !== 'credited')
  const outstandingTotal = outstanding.reduce((s, i) => s + (Number(i.total) || 0), 0)

  const now = new Date()
  const overdue = outstanding.filter(i => {
    if (!i.due_date) return false
    const due = new Date(i.due_date)
    return (now.getTime() - due.getTime()) > 30 * 86_400_000
  })
  const overdueTotal = overdue.reduce((s, i) => s + (Number(i.total) || 0), 0)

  const prevInvoicedTotal = (prevInvoices || []).reduce((s, i) => s + (Number(i.total) || 0), 0)
  const momChangePct = prevInvoicedTotal > 0
    ? Math.round(((invoicedTotal - prevInvoicedTotal) / prevInvoicedTotal) * 100)
    : 0

  // ── LÖNSAMHET PER PROJEKT ──
  const { data: projects } = await supabase.from('project')
    .select('project_id, name, budget_amount, completed_at, customer_id')
    .eq('business_id', businessId)
    .gte('completed_at', startIso)
    .lt('completed_at', endIso)

  let bestProject: MonthlyReviewData['profitability']['best_project'] = null
  let worstProject: MonthlyReviewData['profitability']['worst_project'] = null

  if (projects && projects.length > 0) {
    const projectIds = projects.map(p => p.project_id)
    const [{ data: materials }, { data: timeEntries }] = await Promise.all([
      supabase.from('project_material').select('project_id, total_purchase, total_sell').in('project_id', projectIds),
      supabase.from('time_entry').select('project_id, duration_minutes, hourly_rate, cost_rate').in('project_id', projectIds),
    ])

    const margins = projects.map(p => {
      const mats = (materials || []).filter(m => m.project_id === p.project_id)
      const time = (timeEntries || []).filter(t => t.project_id === p.project_id)
      const materialCost = mats.reduce((s, m) => s + (Number(m.total_purchase) || 0), 0)
      const materialRevenue = mats.reduce((s, m) => s + (Number(m.total_sell) || 0), 0)
      const laborCost = time.reduce((s, t) => s + ((Number(t.duration_minutes) || 0) / 60) * (Number(t.cost_rate) || Number(t.hourly_rate) || 0), 0)
      const revenue = Number(p.budget_amount) || materialRevenue
      const totalCost = materialCost + laborCost
      const margin = revenue - totalCost
      const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0
      return { name: p.name || 'Okänt projekt', margin_pct: marginPct, revenue }
    })

    margins.sort((a, b) => b.margin_pct - a.margin_pct)
    bestProject = margins[0] || null
    worstProject = margins[margins.length - 1] || null
  }

  // ── PIPELINE ──
  const [{ data: leads }, { data: quotes }] = await Promise.all([
    supabase.from('leads').select('lead_id, status, created_at, converted_at')
      .eq('business_id', businessId).gte('created_at', startIso).lt('created_at', endIso),
    supabase.from('quotes').select('quote_id, status, total, accepted_at, sent_at, created_at')
      .eq('business_id', businessId).gte('created_at', startIso).lt('created_at', endIso),
  ])

  const newLeads = leads?.length || 0
  const wonLeads = (leads || []).filter(l => l.status === 'won').length
  const lostLeads = (leads || []).filter(l => l.status === 'lost').length
  const conversionRate = newLeads > 0 ? Math.round((wonLeads / newLeads) * 100) : 0

  const quotesSent = (quotes || []).filter(q => q.sent_at || ['sent', 'opened', 'accepted', 'rejected'].includes(q.status)).length
  const quotesAccepted = (quotes || []).filter(q => q.status === 'accepted').length
  const quotesOpen = (quotes || []).filter(q => ['sent', 'opened'].includes(q.status)).length
  const avgQuoteAmount = quotesSent > 0
    ? Math.round((quotes || []).reduce((s, q) => s + (Number(q.total) || 0), 0) / quotesSent)
    : 0

  // ── KUNDER ──
  const { data: newCustomers } = await supabase.from('customer').select('customer_id')
    .eq('business_id', businessId).gte('created_at', startIso).lt('created_at', endIso)

  // Inaktiva 60+ dagar (utifrån last_job_date eller created_at som fallback)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10)
  const { data: inactiveCustomers } = await supabase.from('customer')
    .select('customer_id, name, last_job_date, lifetime_value')
    .eq('business_id', businessId)
    .lt('last_job_date', sixtyDaysAgo)
    .gt('lifetime_value', 0)
    .order('lifetime_value', { ascending: false })
    .limit(10)

  // Förfallna fakturor 30+ dagar
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)
  const { data: overdueInvoices } = await supabase.from('invoice')
    .select('invoice_id, customer_id, total, due_date, customer:customer_id(name)')
    .eq('business_id', businessId)
    .not('status', 'in', '("paid","credited","draft")')
    .lt('due_date', thirtyDaysAgo)
    .order('due_date', { ascending: true })
    .limit(10) as any

  const overdueCustomers = (overdueInvoices || []).map((inv: any) => ({
    customer_id: inv.customer_id,
    name: inv.customer?.name || 'Okänd kund',
    overdue_amount: Number(inv.total) || 0,
    days_overdue: Math.floor((now.getTime() - new Date(inv.due_date).getTime()) / 86_400_000),
  }))

  return {
    month: monthStart.toISOString().slice(0, 10),
    month_label: monthStart.toLocaleDateString('sv-SE', { year: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase()),
    profitability: {
      invoiced_total: Math.round(invoicedTotal),
      paid_total: Math.round(paidTotal),
      outstanding_total: Math.round(outstandingTotal),
      outstanding_count: outstanding.length,
      overdue_total: Math.round(overdueTotal),
      overdue_count: overdue.length,
      invoiced_prev_month: Math.round(prevInvoicedTotal),
      mom_change_pct: momChangePct,
      best_project: bestProject,
      worst_project: worstProject,
    },
    pipeline: {
      new_leads: newLeads,
      won_leads: wonLeads,
      lost_leads: lostLeads,
      conversion_rate_pct: conversionRate,
      quotes_sent: quotesSent,
      quotes_accepted: quotesAccepted,
      quotes_open: quotesOpen,
      avg_quote_amount: avgQuoteAmount,
    },
    customers: {
      new_customers: newCustomers?.length || 0,
      inactive_60d_plus: (inactiveCustomers || []).map(c => ({
        customer_id: c.customer_id,
        name: c.name,
        last_job_date: c.last_job_date,
        lifetime_value: Number(c.lifetime_value) || 0,
      })),
      overdue_invoice_30d_plus: overdueCustomers,
    },
  }
}

/**
 * Kör Claude-analys och extraherar strukturerade rekommendationer.
 */
export async function generateAnalysis(data: MonthlyReviewData): Promise<{ analysis: string; recommendations: MonthlyReview['recommendations'] }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      analysis: `Månadsrapport för ${data.month_label} — AI-analys saknas (ANTHROPIC_API_KEY ej konfigurerad).`,
      recommendations: [],
    }
  }

  const system = `Du är Matte, AI-chefsassistent för ett svenskt hantverksföretag.
Du har fått föregående månads affärsdata. Skriv en kort, ärlig och handlingsorienterad månadsrapport på svenska.

Strukturera svaret EXAKT så här (använd dessa rubriker):

MÅNADSSAMMANFATTNING
[2-3 meningar om hur månaden gick totalt]

TOPPHÄNDELSER
- [Positiv sak 1]
- [Positiv sak 2]
- [Eventuell utmaning]

REKOMMENDATIONER DENNA MÅNAD
1. [Konkret action med estimerad effekt i kr]
2. [Konkret action med estimerad effekt i kr]
3. [Konkret action med estimerad effekt i kr]

SIFFROR I KORTHET
Fakturerat: X kr | Inbetalat: X kr | Utestående: X kr
Leads: X | Konvertering: X% | Nya kunder: X

Var specifik, inte generell. Nämn faktiska belopp och kundnamn när det är relevant.
Max 300 ord totalt.`

  const userMsg = `Affärsdata för ${data.month_label}:\n\n${JSON.stringify(data, null, 2)}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1200,
        system,
        messages: [{ role: 'user', content: userMsg }],
      }),
    })
    if (!res.ok) {
      return {
        analysis: `Kunde inte generera AI-analys (${res.status}). Siffrorna finns i datan.`,
        recommendations: [],
      }
    }
    const json = await res.json()
    const analysis: string = json.content?.[0]?.text || ''

    // Extrahera rekommendationer (numrerade rader under "REKOMMENDATIONER")
    const recommendations: MonthlyReview['recommendations'] = []
    const recMatch = analysis.match(/REKOMMENDATIONER[^\n]*\n([\s\S]*?)(?=\n[A-ZÅÄÖ]{3,}|\n$|$)/)
    if (recMatch) {
      const lines = recMatch[1].split('\n').filter(l => /^\d+\./.test(l.trim()))
      for (const line of lines) {
        const text = line.replace(/^\d+\.\s*/, '').trim()
        if (!text) continue
        const valMatch = text.match(/(\d[\d\s]*?)\s*kr/i)
        const valueNum = valMatch ? parseInt(valMatch[1].replace(/\s/g, ''), 10) : undefined
        recommendations.push({
          title: text.split(/[.:—]/)[0].trim().slice(0, 80),
          description: text,
          estimated_value_sek: Number.isFinite(valueNum) ? valueNum : undefined,
        })
      }
    }

    // Knyt inaktiva kunder till reaktiverings-rekommendation om sådan finns
    if (data.customers.inactive_60d_plus.length > 0) {
      const reactRec = recommendations.find(r => /reaktiver|återkom|kontakta|ring/i.test(r.title + r.description))
      if (reactRec) {
        reactRec.action_type = 'reactivation_campaign'
        reactRec.target_customer_ids = data.customers.inactive_60d_plus.slice(0, 5).map(c => c.customer_id)
      }
    }

    return { analysis, recommendations }
  } catch (err: any) {
    return {
      analysis: `AI-analysen misslyckades: ${err?.message || 'okänt fel'}.`,
      recommendations: [],
    }
  }
}

/**
 * Kör hela flödet: samla data + AI-analys.
 */
export async function generateMonthlyReview(
  supabase: SupabaseClient,
  businessId: string,
  monthDate?: Date
): Promise<MonthlyReview> {
  const { start, end } = getReviewMonth(monthDate ? new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1) : undefined)
  const data = await collectMonthlyData(supabase, businessId, start, end)
  const { analysis, recommendations } = await generateAnalysis(data)
  return { data, analysis, recommendations }
}

/**
 * Bygg SMS-notis-texten.
 */
export function buildMonthlyReviewSms(data: MonthlyReviewData, recCount: number): string {
  const momSign = data.profitability.mom_change_pct >= 0 ? '+' : ''
  const mom = data.profitability.invoiced_prev_month > 0
    ? ` (${momSign}${data.profitability.mom_change_pct}% vs förra månaden)`
    : ''
  return `📊 Månadsrapport ${data.month_label} klar!
Fakturerat: ${data.profitability.invoiced_total.toLocaleString('sv-SE')} kr${mom}
${recCount} rekommendation${recCount === 1 ? '' : 'er'} väntar.
Se rapporten: app.handymate.se/dashboard/monthly-review
// Handymate`
}
