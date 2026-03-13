import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/automation/rules — Lista alla V3 automationsregler
 * Query params: trigger_type, enabled (true/false)
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const { searchParams } = new URL(request.url)

  let query = supabase
    .from('v3_automation_rules')
    .select('*')
    .eq('business_id', businessId)
    .order('is_system', { ascending: false })
    .order('created_at', { ascending: true })

  const triggerType = searchParams.get('trigger_type')
  if (triggerType) {
    query = query.eq('trigger_type', triggerType)
  }

  const enabled = searchParams.get('enabled')
  if (enabled === 'true') query = query.eq('is_active', true)
  if (enabled === 'false') query = query.eq('is_active', false)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data || [])
}

/**
 * POST /api/automation/rules — Skapa ny automationsregel
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const body = await request.json()

  const {
    name,
    description,
    trigger_type,
    trigger_config,
    action_type,
    action_config,
    requires_approval,
    respects_work_hours,
    respects_night_mode,
  } = body

  if (!name || !trigger_type || !action_type) {
    return NextResponse.json(
      { error: 'name, trigger_type och action_type krävs' },
      { status: 400 }
    )
  }

  const { data, error } = await supabase
    .from('v3_automation_rules')
    .insert({
      business_id: businessId,
      name,
      description: description || null,
      is_system: false,
      is_active: true,
      trigger_type,
      trigger_config: trigger_config || {},
      action_type,
      action_config: action_config || {},
      requires_approval: requires_approval ?? false,
      respects_work_hours: respects_work_hours ?? true,
      respects_night_mode: respects_night_mode ?? true,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
