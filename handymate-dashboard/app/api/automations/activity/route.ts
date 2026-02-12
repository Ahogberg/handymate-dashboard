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

    // Merge and sort all activities
    const merged = [
      ...(data || []).map((a: any) => ({
        id: a.id,
        type: a.automation_type,
        action: a.action,
        description: a.description,
        status: a.status,
        created_at: a.created_at,
        source: 'automation' as const,
      })),
      ...(pipelineActivities || []).map((a: any) => ({
        id: a.id,
        type: 'pipeline',
        action: a.activity_type,
        description: a.description || a.ai_reason,
        status: 'success' as const,
        created_at: a.created_at,
        source: 'pipeline' as const,
      })),
      ...(commLogs || []).map((a: any) => ({
        id: a.id,
        type: 'sms',
        action: a.channel,
        description: a.ai_reason || a.message?.substring(0, 80),
        status: a.status === 'sent' || a.status === 'delivered' ? 'success' : a.status === 'failed' ? 'failed' : 'skipped',
        created_at: a.created_at,
        source: 'communication' as const,
      })),
    ]

    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return NextResponse.json({ data: merged.slice(0, limit) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
