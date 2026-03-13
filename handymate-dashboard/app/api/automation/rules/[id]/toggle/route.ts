import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/automation/rules/[id]/toggle — Växla PÅ/AV för regel
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()

  // Fetch current state
  const { data: rule, error: fetchErr } = await supabase
    .from('v3_automation_rules')
    .select('id, is_active')
    .eq('id', id)
    .eq('business_id', business.business_id)
    .single()

  if (fetchErr || !rule) {
    return NextResponse.json({ error: 'Regel hittades inte' }, { status: 404 })
  }

  // Toggle
  const { data, error } = await supabase
    .from('v3_automation_rules')
    .update({
      is_active: !rule.is_active,
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
