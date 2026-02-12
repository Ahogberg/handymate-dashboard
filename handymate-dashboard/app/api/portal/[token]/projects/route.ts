import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

async function getCustomerFromToken(token: string) {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('customer')
    .select('customer_id, business_id, portal_enabled')
    .eq('portal_token', token)
    .single()
  if (!data || !data.portal_enabled) return null
  return data
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const customer = await getCustomerFromToken(params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const supabase = getServerSupabase()

    // Get projects for this customer
    const { data: projects } = await supabase
      .from('project')
      .select('project_id, name, status, description, progress, created_at, updated_at')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .order('created_at', { ascending: false })

    // For each project, get milestones and latest log
    const enriched = await Promise.all((projects || []).map(async (p: any) => {
      const [milestonesRes, logsRes, scheduleRes] = await Promise.all([
        supabase
          .from('project_milestone')
          .select('name, status, sort_order')
          .eq('project_id', p.project_id)
          .order('sort_order', { ascending: true }),
        supabase
          .from('project_log')
          .select('description, created_at')
          .eq('project_id', p.project_id)
          .order('created_at', { ascending: false })
          .limit(1),
        supabase
          .from('schedule_entry')
          .select('title, start_time, end_time')
          .eq('customer_id', customer.customer_id)
          .gte('start_time', new Date().toISOString())
          .order('start_time', { ascending: true })
          .limit(1)
      ])

      return {
        ...p,
        milestones: milestonesRes.data || [],
        latestLog: logsRes.data?.[0] || null,
        nextVisit: scheduleRes.data?.[0] || null
      }
    }))

    return NextResponse.json({ projects: enriched })
  } catch (error: any) {
    console.error('Portal projects error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
