import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { slugifyJobType, migrateServicesOfferedToJobTypes } from '@/lib/job-types'

/**
 * GET /api/job-types
 * Returnerar alla aktiva jobbtyper. Kör lazy-migration från
 * services_offered vid första anrop om tabellen är tom.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()

  // Kolla om tabellen är tom → lazy-migrera från services_offered
  const { data: existing } = await supabase
    .from('job_types')
    .select('id')
    .eq('business_id', business.business_id)
    .limit(1)

  if (!existing || existing.length === 0) {
    await migrateServicesOfferedToJobTypes(supabase, business.business_id)
  }

  const { data, error } = await supabase
    .from('job_types')
    .select('*')
    .eq('business_id', business.business_id)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ job_types: data || [] })
}

/**
 * POST /api/job-types
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const slug = body.slug || slugifyJobType(body.name)

  const { data, error } = await supabase
    .from('job_types')
    .insert({
      business_id: business.business_id,
      name: body.name.trim(),
      slug,
      color: body.color || '#0F766E',
      icon: body.icon || null,
      default_hourly_rate: body.default_hourly_rate || null,
      sort_order: body.sort_order ?? 0,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ job_type: data })
}
