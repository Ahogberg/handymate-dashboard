import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

// GET /api/automation — fetch rules + queue summary for the business
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id

  // Fetch rules + pending queue counts + recent history in parallel
  const [rulesRes, pendingRes, historyRes] = await Promise.all([
    supabase
      .from('automation_rules')
      .select('*')
      .eq('business_id', businessId)
      .order('rule_type'),
    supabase
      .from('automation_queue')
      .select('rule_type, status')
      .eq('business_id', businessId)
      .eq('status', 'pending'),
    supabase
      .from('automation_queue')
      .select('queue_id, rule_type, target_label, customer_name, status, scheduled_at, executed_at, error_message, attempt_number')
      .eq('business_id', businessId)
      .neq('status', 'pending')
      .order('executed_at', { ascending: false })
      .limit(20),
  ])

  // Count pending per rule_type
  const pendingCounts: Record<string, number> = {}
  for (const item of pendingRes.data || []) {
    pendingCounts[item.rule_type] = (pendingCounts[item.rule_type] || 0) + 1
  }

  return NextResponse.json({
    rules: rulesRes.data || [],
    pending_counts: pendingCounts,
    history: historyRes.data || [],
    total_pending: (pendingRes.data || []).length,
  })
}

// PATCH /api/automation — update a specific rule
export async function PATCH(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { rule_id, ...updates } = body

  if (!rule_id) {
    return NextResponse.json({ error: 'Missing rule_id' }, { status: 400 })
  }

  // Only allow safe fields to be updated
  const allowedFields = ['enabled', 'delay_hours', 'max_attempts', 'channel', 'message_template']
  const safeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in updates) {
      safeUpdates[key] = updates[key]
    }
  }

  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('automation_rules')
    .update(safeUpdates)
    .eq('rule_id', rule_id)
    .eq('business_id', business.business_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ rule: data })
}

// POST /api/automation — seed default rules for the business
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { error } = await supabase.rpc('seed_automation_rules', {
    p_business_id: business.business_id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Return the newly created rules
  const { data: rules } = await supabase
    .from('automation_rules')
    .select('*')
    .eq('business_id', business.business_id)
    .order('rule_type')

  return NextResponse.json({ rules: rules || [] })
}
