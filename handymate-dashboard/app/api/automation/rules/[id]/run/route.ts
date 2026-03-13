import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { executeRule } from '@/lib/automation-engine'

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * POST /api/automation/rules/[id]/run — Manuell körning av regel
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const supabase = getServerSupabase()

  // Verify rule belongs to business
  const { data: rule } = await supabase
    .from('v3_automation_rules')
    .select('id, name')
    .eq('id', id)
    .eq('business_id', business.business_id)
    .single()

  if (!rule) {
    return NextResponse.json({ error: 'Regel hittades inte' }, { status: 404 })
  }

  // Parse optional context from body
  let context: Record<string, unknown> = { trigger: 'manual' }
  try {
    const body = await request.json()
    if (body && typeof body === 'object') {
      context = { ...context, ...body }
    }
  } catch {
    // No body — use default context
  }

  const result = await executeRule(supabase, id, context)

  return NextResponse.json({
    rule_name: rule.name,
    ...result,
  })
}
