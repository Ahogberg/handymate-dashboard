/**
 * Delade typer + utility-funktioner för agent-aggregation.
 *
 * Varje agent (karin/daniel/lars/hanna) har sin egen aggregator i
 * lib/agents/{agent}/observation-prompt.ts som plockar och kombinerar
 * relevanta data-källor. Denna fil tillhandahåller byggblock som är
 * agent-agnostiska: row-typer, stats-funktioner, period-helpers.
 *
 * Tidigare inline i karin/observation-prompt.ts. Extraherat 2026-05-18.
 */

// ─────────────────────────────────────────────────────────────────
// Delade row-typer (matchar Supabase-tabell-schemata)
// ─────────────────────────────────────────────────────────────────

export interface InvoiceRow {
  invoice_id: string
  invoice_number: string | null
  customer_id: string | null
  total: number
  invoice_date: string
  due_date: string | null
  paid_at: string | null
  status: string
  rot_work_cost: number | null
  rot_rut_deduction: number | null
  rot_rut_type: string | null
}

export interface ProjectRow {
  project_id: string
  name: string | null
  customer_id: string | null
  status: string
  budget_hours: number | null
  budget_amount: number | null
  actual_hours: number | null
  actual_labor_cost: number | null
  actual_material_cost: number | null
  profitability_status: string | null
  completed_at: string | null
}

export interface QuoteRow {
  quote_id: string
  status: string
  total: number | null
  signed_at: string | null
  accepted_at: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────────
// Invoice-stats (Karin's basis, kan användas av Hanna också)
// ─────────────────────────────────────────────────────────────────

export interface InvoiceStats {
  count: number
  total_invoiced_kr: number
  total_paid_kr: number
  total_overdue_kr: number
  paid_count: number
  overdue_count: number
  sent_pending_count: number
  avg_days_to_payment: number | null
  payment_rate_percent: number
  rot_invoiced_kr: number
  rot_count: number
}

export function computeInvoiceStats(invoices: InvoiceRow[]): InvoiceStats {
  const count = invoices.length
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total || 0), 0)
  const paid = invoices.filter(i => i.status === 'paid' && i.paid_at)
  const overdue = invoices.filter(i => i.status === 'overdue')
  const sent = invoices.filter(i => i.status === 'sent')

  const totalPaid = paid.reduce((s, i) => s + Number(i.total || 0), 0)
  const totalOverdue = overdue.reduce((s, i) => s + Number(i.total || 0), 0)

  let avgDso: number | null = null
  if (paid.length > 0) {
    const totalDays = paid.reduce((s, i) => {
      const days = (new Date(i.paid_at as string).getTime() - new Date(i.invoice_date).getTime()) / 86400000
      return s + days
    }, 0)
    avgDso = Math.round(totalDays / paid.length)
  }

  const rotInvoices = invoices.filter(i => (Number(i.rot_work_cost) || 0) > 0)
  const rotTotal = rotInvoices.reduce((s, i) => s + Number(i.total || 0), 0)

  return {
    count,
    total_invoiced_kr: Math.round(totalInvoiced),
    total_paid_kr: Math.round(totalPaid),
    total_overdue_kr: Math.round(totalOverdue),
    paid_count: paid.length,
    overdue_count: overdue.length,
    sent_pending_count: sent.length,
    avg_days_to_payment: avgDso,
    payment_rate_percent: count > 0 ? Math.round((paid.length / count) * 100) : 0,
    rot_invoiced_kr: Math.round(rotTotal),
    rot_count: rotInvoices.length,
  }
}

// ─────────────────────────────────────────────────────────────────
// Period-helpers
// ─────────────────────────────────────────────────────────────────

/** Returnerar 'YYYY-MM'-nyckel för en Date — används för månads-buckets. */
export function ymKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Returnerar Date-objekt N dagar tillbaka från nu. */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000)
}
