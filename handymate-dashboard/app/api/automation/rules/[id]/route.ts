import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * GET /api/automation/rules/[id] — Hämta enskild regel
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('v3_automation_rules')
    .select('*')
    .eq('id', id)
    .eq('business_id', business.business_id)
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Regel hittades inte' }, { status: 404 })
  }

  return NextResponse.json(data)
}

/**
 * PUT /api/automation/rules/[id] — Uppdatera regel
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()
  const body = await request.json()

  // Remove protected fields
  const { id: _id, business_id: _bid, is_system: _sys, created_at: _ca, run_count: _rc, ...updates } = body

  const { data, error } = await supabase
    .from('v3_automation_rules')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('business_id', business.business_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

/**
 * DELETE /api/automation/rules/[id] — Radera regel (ej systemregler)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()

  // Check if system rule
  const { data: rule } = await supabase
    .from('v3_automation_rules')
    .select('is_system')
    .eq('id', id)
    .eq('business_id', business.business_id)
    .single()

  if (!rule) {
    return NextResponse.json({ error: 'Regel hittades inte' }, { status: 404 })
  }

  if (rule.is_system) {
    return NextResponse.json(
      { error: 'Systemregler kan inte raderas. Du kan stänga av dem istället.' },
      { status: 403 }
    )
  }

  const { error } = await supabase
    .from('v3_automation_rules')
    .delete()
    .eq('id', id)
    .eq('business_id', business.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
