import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('price_lists_v2')
    .select(`
      *,
      segment:customer_segments(id, name, color),
      contract_type:contract_types(id, name, type)
    `)
    .eq('business_id', business.business_id)
    .order('is_default', { ascending: false })
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ priceLists: data || [] })
}

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  const { data, error } = await supabase
    .from('price_lists_v2')
    .insert({
      business_id: business.business_id,
      name: body.name || 'Ny prislista',
      description: body.description || null,
      segment_id: body.segment_id || null,
      contract_type_id: body.contract_type_id || null,
      is_default: body.is_default || false,
      hourly_rate_normal: body.hourly_rate_normal || null,
      hourly_rate_ob1: body.hourly_rate_ob1 || null,
      hourly_rate_ob2: body.hourly_rate_ob2 || null,
      hourly_rate_emergency: body.hourly_rate_emergency || null,
      material_markup_pct: body.material_markup_pct ?? 20,
      callout_fee: body.callout_fee ?? 0,
    })
    .select(`
      *,
      segment:customer_segments(id, name, color),
      contract_type:contract_types(id, name, type)
    `)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ priceList: data })
}
