import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { fetchPropertySales } from '@/lib/leads/api/lantmateriet'
import { generateLetter } from '@/lib/leads/generate-letter'
import { getSegmentForBranch } from '@/lib/leads/segmentation'

/** GET — Lista outbound-leads */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status')
  const limit = parseInt(searchParams.get('limit') || '50')

  let query = supabase
    .from('leads_outbound')
    .select('*')
    .eq('business_id', business.business_id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ leads: data || [] })
}

/** POST — Skanna och generera nya leads */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const biz = business as any

  if (!biz.leads_addon) {
    return NextResponse.json({ error: 'Leads-tillägget är inte aktiverat' }, { status: 403 })
  }

  const segment = getSegmentForBranch(biz.branch)
  const properties = await fetchPropertySales(biz.service_area, segment)

  if (properties.length === 0) {
    return NextResponse.json({ leads: [], message: 'Inga matchande fastigheter hittades' })
  }

  const batchId = `batch-${Date.now()}`
  const leads = []

  for (const prop of properties) {
    const { content } = await generateLetter(prop, {
      business_name: biz.business_name,
      contact_name: biz.contact_name,
      phone_number: biz.phone_number,
      branch: biz.branch,
      website: biz.website,
    }, segment.letterAngle)

    leads.push({
      business_id: business.business_id,
      property_address: prop.address,
      property_type: prop.propertyType,
      built_year: prop.builtYear,
      energy_class: prop.energyClass,
      purchase_date: prop.purchaseDate,
      owner_name: prop.ownerName,
      letter_content: content,
      status: 'draft',
      batch_id: batchId,
    })
  }

  const { data, error } = await supabase
    .from('leads_outbound')
    .insert(leads)
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ leads: data, batch_id: batchId, count: data?.length || 0 })
}
