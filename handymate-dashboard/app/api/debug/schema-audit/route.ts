import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/debug/schema-audit
 *
 * Jämför förväntat schema (som koden kräver) mot faktisk databas.
 * Rapporterar saknade tabeller och kolumner per migration-version.
 *
 * Metod: SELECT kolumn med LIMIT 0 per kritisk kolumn.
 *   - Lyckas  → kolumn finns
 *   - 42703   → kolumn saknas
 *   - 42P01   → tabell saknas
 */

export const maxDuration = 30

interface ExpectedColumn {
  table: string
  column: string
  migration: string
  critical: boolean
}

const EXPECTED: ExpectedColumn[] = [
  // v16 quote tracking
  { table: 'quotes', column: 'sign_token', migration: 'v16_quote_tracking', critical: true },
  { table: 'quotes', column: 'sent_at', migration: 'v16_quote_tracking', critical: true },
  { table: 'quotes', column: 'signed_at', migration: 'v16_quote_tracking', critical: true },
  { table: 'quotes', column: 'opened_at', migration: 'v16_quote_tracking', critical: false },

  // vat_rate
  { table: 'quotes', column: 'vat', migration: 'vat_rate', critical: true },
  { table: 'quote_items', column: 'vat_rate', migration: 'vat_rate', critical: false },

  // v20 customer LTV
  { table: 'customer', column: 'lifetime_value', migration: 'v20_customer_ltv', critical: true },
  { table: 'customer', column: 'job_count', migration: 'v20_customer_ltv', critical: true },
  { table: 'customer', column: 'last_job_date', migration: 'v20_customer_ltv', critical: false },
  { table: 'customer', column: 'avg_job_value', migration: 'v20_customer_ltv', critical: false },
  { table: 'customer', column: 'avg_payment_days', migration: 'v20_customer_ltv', critical: false },
  { table: 'customer', column: 'ltv_updated_at', migration: 'v20_customer_ltv', critical: false },

  // v21 agent specialization
  { table: 'v3_automation_rules', column: 'agent_id', migration: 'v21_agent_specialization', critical: true },
  { table: 'v3_automation_logs', column: 'agent_id', migration: 'v21_agent_specialization', critical: true },
  { table: 'agent_runs', column: 'agent_id', migration: 'v21_agent_specialization', critical: true },

  // v21 agent memory
  { table: 'agent_memories', column: 'memory_id', migration: 'v21_agent_memory', critical: false },
  { table: 'agent_memories', column: 'embedding', migration: 'v21_agent_memory', critical: false },

  // v23 review requests
  { table: 'review_request', column: 'review_url', migration: 'v23_review_requests', critical: true },
  { table: 'review_request', column: 'sms_text', migration: 'v23_review_requests', critical: false },
  { table: 'review_request', column: 'status', migration: 'v23_review_requests', critical: true },

  // v23 quote signed email & job report (business_config)
  { table: 'business_config', column: 'quote_signed_email_enabled', migration: 'v23_quote_signed_email', critical: true },
  { table: 'business_config', column: 'job_report_enabled', migration: 'v23_job_report', critical: true },

  // v19 leads outbound
  { table: 'leads_outbound', column: 'lead_id', migration: 'v19_leads_outbound', critical: false },
  { table: 'leads_monthly_usage', column: 'usage_id', migration: 'v19_leads_outbound', critical: false },

  // v22 SMS usage
  { table: 'sms_usage', column: 'business_id', migration: 'v22_sms_usage', critical: false },

  // v2 pending approvals
  { table: 'pending_approvals', column: 'approval_id', migration: 'v2_pending_approvals', critical: true },

  // v2 push subscriptions
  { table: 'push_subscriptions', column: 'subscription_id', migration: 'v2_push_subscriptions', critical: false },

  // v4 pipeline stages
  { table: 'pipeline_stages', column: 'key', migration: 'v4_pipeline_stages', critical: true },
  { table: 'pipeline_stages', column: 'slug', migration: 'v4_pipeline_stages', critical: true },

  // v24 project document
  { table: 'project_document', column: 'document_id', migration: 'v24_documents_fix', critical: true },
  { table: 'project_document', column: 'project_id', migration: 'v24_documents_fix', critical: true },

  // v15 autopilot
  { table: 'business_config', column: 'autopilot_enabled', migration: 'v15_autopilot', critical: false },
  { table: 'business_config', column: 'autopilot_level', migration: 'v15_autopilot', critical: false },

  // v25 profitability
  { table: 'project', column: 'profitability', migration: 'v25_profitability', critical: false },

  // v26 quote intelligence
  { table: 'quotes', column: 'quote_intelligence', migration: 'v26_quote_intelligence', critical: false },

  // v27 pipeline hantverkare
  { table: 'deal', column: 'stage_id', migration: 'v27_pipeline_hantverkare', critical: true },

  // v38 calendar realtime
  { table: 'booking', column: 'updated_at', migration: 'v38_calendar_realtime', critical: false },
]

async function checkColumn(supabase: any, table: string, column: string): Promise<'ok' | 'missing_column' | 'missing_table' | 'error'> {
  const { error } = await supabase.from(table).select(column).limit(0)
  if (!error) return 'ok'
  const code = error.code || ''
  const msg = (error.message || '').toLowerCase()
  if (code === '42P01' || msg.includes('does not exist') && msg.includes('relation')) return 'missing_table'
  if (code === '42703' || msg.includes('column') && msg.includes('does not exist')) return 'missing_column'
  if (msg.includes("could not find the") && msg.includes('column')) return 'missing_column'
  if (msg.includes("could not find the") && msg.includes('table')) return 'missing_table'
  return 'error'
}

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const results: Array<ExpectedColumn & { status: string }> = []
  const tableStatus: Record<string, 'ok' | 'missing'> = {}

  for (const exp of EXPECTED) {
    if (tableStatus[exp.table] === 'missing') {
      results.push({ ...exp, status: 'missing_table' })
      continue
    }
    const status = await checkColumn(supabase, exp.table, exp.column)
    if (status === 'missing_table') tableStatus[exp.table] = 'missing'
    results.push({ ...exp, status })
  }

  const missing = results.filter(r => r.status !== 'ok')
  const missingCritical = missing.filter(r => r.critical)
  const byMigration: Record<string, typeof results> = {}
  for (const r of missing) {
    if (!byMigration[r.migration]) byMigration[r.migration] = []
    byMigration[r.migration].push(r)
  }

  return NextResponse.json({
    summary: {
      total_checked: results.length,
      ok: results.length - missing.length,
      missing: missing.length,
      missing_critical: missingCritical.length,
      healthy: missing.length === 0,
    },
    missing_by_migration: Object.entries(byMigration).map(([migration, items]) => ({
      migration,
      sql_file: `sql/${migration}.sql`,
      items: items.map(i => ({
        table: i.table,
        column: i.column,
        status: i.status,
        critical: i.critical,
      })),
    })),
    all_results: results,
  })
}
