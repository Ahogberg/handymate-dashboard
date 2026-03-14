import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getLeadPipelineStages } from '@/lib/pipeline-stages'
import { getServerSupabase } from '@/lib/supabase'

// GET /api/leads/pipeline-stages — fetch lead pipeline stages
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stages = await getLeadPipelineStages(business.business_id)
  return NextResponse.json({ stages })
}

// PATCH /api/leads/pipeline-stages — update stage label (system stages can be renamed)
export async function PATCH(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { stage_id, label, creates_project } = body

  if (!stage_id) {
    return NextResponse.json({ error: 'Missing stage_id' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {}
  if (label !== undefined) updates.label = label
  if (creates_project !== undefined) updates.creates_project = creates_project

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('pipeline_stages')
    .update(updates)
    .eq('id', stage_id)
    .eq('business_id', business.business_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ stage: data })
}
