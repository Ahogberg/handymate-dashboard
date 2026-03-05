import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/agent/data?type=runs|stats|chart|settings
 * Server-side reads for agent dashboard (bypasses RLS via service role)
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const type = request.nextUrl.searchParams.get('type')
  const businessId = business.business_id

  switch (type) {
    case 'runs': {
      const filter = request.nextUrl.searchParams.get('filter') || 'all'
      let q = supabase
        .from('agent_runs')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filter !== 'all') {
        q = q.eq('trigger_type', filter)
      }

      const { data, error } = await q
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ runs: data || [] })
    }

    case 'stats': {
      const { data, count } = await supabase
        .from('agent_runs')
        .select('status, tool_calls, tokens_used, duration_ms', { count: 'exact' })
        .eq('business_id', businessId)

      if (!data) return NextResponse.json({ stats: null })

      const completed = data.filter((r: any) => r.status === 'completed').length
      const failed = data.filter((r: any) => r.status === 'failed').length
      const totalToolCalls = data.reduce((s: number, r: any) => s + (r.tool_calls || 0), 0)
      const totalTokens = data.reduce((s: number, r: any) => s + (r.tokens_used || 0), 0)
      const avgDuration = data.length > 0
        ? Math.round(data.reduce((s: number, r: any) => s + (r.duration_ms || 0), 0) / data.length)
        : 0

      return NextResponse.json({
        stats: {
          total_runs: count || 0,
          completed,
          failed,
          total_tool_calls: totalToolCalls,
          total_tokens: totalTokens,
          avg_duration_ms: avgDuration,
        },
      })
    }

    case 'chart': {
      const days = []
      const dayNames = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör']
      for (let i = 6; i >= 0; i--) {
        const d = new Date()
        d.setDate(d.getDate() - i)
        days.push({
          date: d.toISOString().split('T')[0],
          day: dayNames[d.getDay()],
        })
      }

      const weekAgo = days[0].date
      const { data } = await supabase
        .from('agent_runs')
        .select('created_at, tool_calls')
        .eq('business_id', businessId)
        .gte('created_at', `${weekAgo}T00:00:00`)

      const chart = days.map(d => {
        const dayRuns = (data || []).filter((r: any) =>
          r.created_at.startsWith(d.date)
        )
        return {
          day: d.day,
          runs: dayRuns.length,
          tools: dayRuns.reduce((s: number, r: any) => s + (r.tool_calls || 0), 0),
        }
      })

      return NextResponse.json({ chart })
    }

    case 'settings': {
      const { data } = await supabase
        .from('agent_settings')
        .select('settings')
        .eq('business_id', businessId)
        .single()

      return NextResponse.json({ settings: data?.settings || null })
    }

    default:
      return NextResponse.json({ error: 'Invalid type parameter' }, { status: 400 })
  }
}

/**
 * POST /api/agent/data — Update agent settings
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const body = await request.json()

  if (body.action === 'update_settings') {
    const { error } = await supabase
      .from('agent_settings')
      .upsert(
        {
          business_id: business.business_id,
          settings: body.settings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id' }
      )

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
