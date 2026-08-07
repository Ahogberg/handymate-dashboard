import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '30')
    const type = searchParams.get('type')

    const supabase = getServerSupabase()

    let query = supabase
      .from('automation_activity')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (type) {
      query = query.eq('automation_type', type)
    }

    const { data, error } = await query

    if (error) throw error

    // Also fetch recent pipeline activities and communication logs as activity
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data: pipelineActivities } = await supabase
      .from('pipeline_activity')
      .select('id, activity_type, description, triggered_by, ai_confidence, ai_reason, created_at')
      .eq('business_id', business.business_id)
      .in('triggered_by', ['ai', 'system'])
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    const { data: commLogs } = await supabase
      .from('communication_log')
      .select('id, channel, message, ai_reason, status, created_at')
      .eq('business_id', business.business_id)
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(20)

    // ═══ v3_automation_logs — där regelmotorn FAKTISKT skriver ═══
    //
    // Rutten läste tidigare inte den här tabellen alls, trots att
    // lib/automation-engine.ts:logExecution är enda vägen regelmotorn loggar.
    // "Klart idag" visade alltså inte det mesta av vad automationerna gjort.
    //
    // `approval_id` är dessutom det enda fältet i hela kodbasen som skiljer
    // "gjort helt automatiskt" från "gjort efter ditt OK". Utan det var
    // AUTO-märket i gränssnittet en klientgissning — se `auto` nedan.
    const { data: ruleLogs, error: ruleErr } = await supabase
      .from('v3_automation_logs')
      .select('id, rule_name, action_type, status, approval_id, agent_id, created_at')
      .eq('business_id', business.business_id)
      .eq('status', 'success')
      .gte('created_at', weekAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(30)

    if (ruleErr) {
      // Tabellen kan saknas på äldre konton. Loggen är en bekvämlighet —
      // resten av svaret ska inte falla med den.
      console.warn('[automations/activity] v3_automation_logs hoppades över:', ruleErr.message)
    }

    // Merge and sort all activities
    //
    // `auto` = utfördes UTAN att någon godkände. Bara v3_automation_logs kan
    // svara på det säkert (approval_id), så där härleds det. För de tre
    // äldre källorna finns inget godkännande-fält alls — men de skrivs bara
    // av automationsvägar, så true är sant för dem. Gränssnittet ska aldrig
    // gissa: bocken är reserverad för mänskliga beslut.
    const merged = [
      ...(data || []).map((a: any) => ({
        id: a.id,
        type: a.automation_type,
        action: a.action,
        description: a.description,
        status: a.status,
        created_at: a.created_at,
        source: 'automation' as const,
        auto: true,
      })),
      ...(ruleLogs || []).map((a: any) => ({
        id: a.id,
        type: a.action_type,
        action: a.action_type,
        description: a.rule_name,
        status: a.status,
        created_at: a.created_at,
        source: 'rule' as const,
        agent_id: a.agent_id || undefined,
        auto: !a.approval_id,
      })),
      ...(pipelineActivities || []).map((a: any) => ({
        id: a.id,
        type: 'pipeline',
        action: a.activity_type,
        description: a.description || a.ai_reason,
        status: 'success' as const,
        created_at: a.created_at,
        source: 'pipeline' as const,
        auto: true,
      })),
      ...(commLogs || []).map((a: any) => ({
        id: a.id,
        type: 'sms',
        action: a.channel,
        description: a.ai_reason || a.message?.substring(0, 80),
        status: a.status === 'sent' || a.status === 'delivered' ? 'success' : a.status === 'failed' ? 'failed' : 'skipped',
        created_at: a.created_at,
        source: 'communication' as const,
        auto: true,
      })),
    ]

    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ data: merged.slice(0, limit) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
