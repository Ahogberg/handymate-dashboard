import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAdminSupabase, isAdmin } from '@/lib/admin-auth'
import { lasKreditlage } from '@/lib/observability/credit-watch'

export const dynamic = 'force-dynamic'

const WINDOW_MS = 25 * 60 * 60 * 1000
const ROW_LIMIT_PER_SOURCE = 25

type SourceKey = 'sms' | 'email' | 'billing' | 'automation'
type SourceStatus = 'ok' | 'unavailable'

interface OperationIncident {
  id: string
  kind: SourceKey
  business_id: string
  business_name: string | null
  title: string
  detail: string | null
  occurred_at: string
}

interface OperationSource {
  source: 'sms_log' | 'communication_log' | 'billing_event' | 'automation_activity'
  status: SourceStatus
  count: number
  incidents: OperationIncident[]
  message: string | null
}

function unavailable(source: OperationSource['source'], label: string, error: unknown): OperationSource {
  console.error(`[admin/support-operations] ${source} kunde inte läsas:`, error)
  return {
    source,
    status: 'unavailable',
    count: 0,
    incidents: [],
    message: `${label} kunde inte kontrolleras`,
  }
}

async function readSms(supabase: SupabaseClient, since: string, demoBusinessId: string | null): Promise<OperationSource> {
  try {
    let query = supabase
      .from('sms_log')
      .select('sms_id, business_id, error_message, message_type, created_at', { count: 'exact' })
      .eq('status', 'failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT_PER_SOURCE)
    if (demoBusinessId) query = query.neq('business_id', demoBusinessId)
    const { data, error, count } = await query
    if (error) return unavailable('sms_log', 'SMS-loggen', error)
    const rows = data || []
    return {
      source: 'sms_log',
      status: 'ok',
      count: count ?? rows.length,
      message: null,
      incidents: rows.map((row: any) => ({
        id: `sms:${row.sms_id}`,
        kind: 'sms',
        business_id: row.business_id,
        business_name: null,
        title: 'SMS kunde inte levereras',
        detail: row.error_message || row.message_type || null,
        occurred_at: row.created_at,
      })),
    }
  } catch (error) {
    return unavailable('sms_log', 'SMS-loggen', error)
  }
}

async function readEmail(supabase: SupabaseClient, since: string, demoBusinessId: string | null): Promise<OperationSource> {
  try {
    let query = supabase
      .from('communication_log')
      .select('id, business_id, channel, subject, created_at', { count: 'exact' })
      .eq('status', 'failed')
      .eq('direction', 'outbound')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT_PER_SOURCE)
    if (demoBusinessId) query = query.neq('business_id', demoBusinessId)
    const { data, error, count } = await query
    if (error) return unavailable('communication_log', 'Kommunikationsloggen', error)
    const rows = data || []
    return {
      source: 'communication_log',
      status: 'ok',
      count: count ?? rows.length,
      message: null,
      incidents: rows.map((row: any) => ({
        id: `email:${row.id}`,
        kind: 'email',
        business_id: row.business_id,
        business_name: null,
        title: 'E-post kunde inte levereras',
        detail: row.subject || row.channel || null,
        occurred_at: row.created_at,
      })),
    }
  } catch (error) {
    return unavailable('communication_log', 'Kommunikationsloggen', error)
  }
}

async function readBilling(supabase: SupabaseClient, since: string, demoBusinessId: string | null): Promise<OperationSource> {
  try {
    let query = supabase
      .from('billing_event')
      .select('id, business_id, data, created_at', { count: 'exact' })
      .eq('event_type', 'payment_failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT_PER_SOURCE)
    if (demoBusinessId) query = query.neq('business_id', demoBusinessId)
    const { data, error, count } = await query
    if (error) return unavailable('billing_event', 'Betalningsloggen', error)
    const rows = data || []
    return {
      source: 'billing_event',
      status: 'ok',
      count: count ?? rows.length,
      message: null,
      incidents: rows.map((row: any) => {
        const amountDue = row.data?.amount_due
        return {
          id: `billing:${row.id}`,
          kind: 'billing',
          business_id: row.business_id,
          business_name: null,
          title: 'Betalning misslyckades',
          detail: typeof amountDue === 'number'
            ? `${(amountDue / 100).toLocaleString('sv-SE')} kr kunde inte debiteras`
            : null,
          occurred_at: row.created_at,
        }
      }),
    }
  } catch (error) {
    return unavailable('billing_event', 'Betalningsloggen', error)
  }
}

async function readAutomation(supabase: SupabaseClient, since: string, demoBusinessId: string | null): Promise<OperationSource> {
  try {
    let query = supabase
      .from('automation_activity')
      .select('id, business_id, automation_type, action, description, created_at', { count: 'exact' })
      .eq('status', 'failed')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(ROW_LIMIT_PER_SOURCE)
    if (demoBusinessId) query = query.neq('business_id', demoBusinessId)
    const { data, error, count } = await query
    if (error) return unavailable('automation_activity', 'Automationsloggen', error)
    const rows = data || []
    return {
      source: 'automation_activity',
      status: 'ok',
      count: count ?? rows.length,
      message: null,
      incidents: rows.map((row: any) => ({
        id: `automation:${row.id}`,
        kind: 'automation',
        business_id: row.business_id,
        business_name: null,
        title: `${row.automation_type}: ${row.action}`,
        detail: row.description || null,
        occurred_at: row.created_at,
      })),
    }
  } catch (error) {
    return unavailable('automation_activity', 'Automationsloggen', error)
  }
}

async function addBusinessNames(supabase: SupabaseClient, sources: OperationSource[]): Promise<void> {
  const ids = Array.from(new Set(
    sources.flatMap(source => source.incidents.map(incident => incident.business_id)).filter(Boolean),
  ))
  if (ids.length === 0) return

  try {
    const { data, error } = await supabase
      .from('business_config')
      .select('business_id, business_name')
      .in('business_id', ids)
    if (error) {
      console.error('[admin/support-operations] företagsnamn kunde inte läsas:', error)
      return
    }

    const names = new Map((data || []).map((row: any) => [row.business_id, row.business_name || null]))
    for (const source of sources) {
      source.incidents = source.incidents.map(incident => ({
        ...incident,
        business_name: names.get(incident.business_id) ?? null,
      }))
    }
  } catch (error) {
    // Företagsnamnet är en läsbar etikett, aldrig ett villkor för att ett
    // verkligt driftfel ska få visas. business_id ligger kvar som reserv.
    console.error('[admin/support-operations] företagsnamnsuppslag kastade:', error)
  }
}

/**
 * GET /api/admin/support-operations
 *
 * Läsande driftöversikt för den befintliga Support-fliken. Inga incidenter
 * skapas och inga källrader skrivs om: källornas faktiska utfall visas direkt.
 */
export async function GET(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const supabase = getAdminSupabase()
  const generatedAt = new Date()
  const since = new Date(generatedAt.getTime() - WINDOW_MS).toISOString()
  const demoBusinessId = process.env.DEMO_BUSINESS_ID || null

  const [sms, email, billing, automation, health] = await Promise.all([
    readSms(supabase, since, demoBusinessId),
    readEmail(supabase, since, demoBusinessId),
    readBilling(supabase, since, demoBusinessId),
    readAutomation(supabase, since, demoBusinessId),
    lasKreditlage(supabase),
  ])
  const sources = [sms, email, billing, automation]
  await addBusinessNames(supabase, sources)

  const totalIncidents = sources.reduce((sum, source) => sum + source.count, 0)
  const hasUnavailableSource = sources.some(source => source.status === 'unavailable')

  return NextResponse.json({
    generated_at: generatedAt.toISOString(),
    window_started_at: since,
    total_incidents: totalIncidents,
    has_unavailable_source: hasUnavailableSource,
    sources: { sms, email, billing, automation },
    health,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
