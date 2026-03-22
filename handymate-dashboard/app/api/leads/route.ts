import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

// GET /api/leads — fetch leads with pipeline stats
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id
  const { searchParams } = new URL(request.url)

  const status = searchParams.get('status')
  const urgency = searchParams.get('urgency')
  const minScore = searchParams.get('min_score')
  const maxScore = searchParams.get('max_score')

  // Fetch leads
  let query = supabase
    .from('leads')
    .select('*')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status && status !== 'all') query = query.eq('status', status)
  if (urgency) query = query.eq('urgency', urgency)
  if (minScore) query = query.gte('score', parseInt(minScore))
  if (maxScore) query = query.lte('score', parseInt(maxScore))

  // Fetch pipeline stats and leads in parallel
  const [leadsRes, statsRes] = await Promise.all([
    query,
    supabase
      .from('leads')
      .select('status, pipeline_stage_key, estimated_value, score, created_at, converted_at')
      .eq('business_id', businessId),
  ])

  // Calculate pipeline stats — use pipeline_stage_key (V4) with status fallback
  const allLeads = statsRes.data || []
  const statusCounts: Record<string, number> = {}
  const statusValues: Record<string, number> = {}
  let wonCount = 0
  let totalCount = allLeads.length
  let totalConversionTime = 0
  let conversionCount = 0

  for (const l of allLeads) {
    const stageKey = l.pipeline_stage_key || l.status || 'new_lead'
    statusCounts[stageKey] = (statusCounts[stageKey] || 0) + 1
    statusValues[stageKey] = (statusValues[stageKey] || 0) + (l.estimated_value || 0)
    if (stageKey === 'completed' || l.status === 'won') {
      wonCount++
      if (l.converted_at && l.created_at) {
        totalConversionTime += new Date(l.converted_at).getTime() - new Date(l.created_at).getTime()
        conversionCount++
      }
    }
  }

  const conversionRate = totalCount > 0 ? ((wonCount / totalCount) * 100).toFixed(1) : '0'
  const avgConversionDays = conversionCount > 0
    ? Math.round(totalConversionTime / conversionCount / (1000 * 60 * 60 * 24))
    : 0

  const totalPipelineValue = Object.entries(statusValues)
    .filter(([s]) => !['completed', 'lost', 'won'].includes(s))
    .reduce((sum, [, v]) => sum + v, 0)

  return NextResponse.json({
    leads: leadsRes.data || [],
    stats: {
      status_counts: statusCounts,
      status_values: statusValues,
      total_pipeline_value: totalPipelineValue,
      conversion_rate: parseFloat(conversionRate),
      avg_conversion_days: avgConversionDays,
      total_leads: totalCount,
    },
  })
}

// PATCH /api/leads — update lead status/fields
export async function PATCH(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { lead_id, ...updates } = body

  if (!lead_id) {
    return NextResponse.json({ error: 'Missing lead_id' }, { status: 400 })
  }

  const allowedFields = ['status', 'pipeline_stage_key', 'notes', 'urgency', 'assigned_to', 'lost_reason', 'customer_id']
  const safeUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  for (const key of allowedFields) {
    if (key in updates) {
      safeUpdates[key] = updates[key]
    }
  }

  if (updates.status === 'won') {
    safeUpdates.converted_at = new Date().toISOString()
  }

  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('leads')
    .update(safeUpdates)
    .eq('lead_id', lead_id)
    .eq('business_id', business.business_id)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Log the activity
  if (updates.status) {
    const actId = 'la_' + Math.random().toString(36).substring(2, 14)
    await supabase.from('lead_activities').insert({
      activity_id: actId,
      lead_id,
      business_id: business.business_id,
      activity_type: 'status_changed',
      description: `Status ändrad till ${updates.status}`,
      created_at: new Date().toISOString(),
    })
  }

  return NextResponse.json({ lead: data })
}

// POST /api/leads — seed scoring rules
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  const { error } = await supabase.rpc('seed_lead_scoring_rules', {
    p_business_id: business.business_id,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
