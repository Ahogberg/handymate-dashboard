import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'


// force-dynamic: läser auth via en helper (t.ex. getAuthenticatedBusiness)
// som läser request.headers direkt, inte cookies()/headers() från next/headers —
// Next ser bara route-filens egen kod och cachar annars denna GET-rutt statiskt,
// så samma frusna svar går till alla anropare oavsett vem som faktiskt frågar.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('customer_segments')
    .select('*')
    .eq('business_id', business.business_id)
    .order('sort_order')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segments: data || [] })
}

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  // Get max sort_order
  const { data: existing } = await supabase
    .from('customer_segments')
    .select('sort_order')
    .eq('business_id', business.business_id)
    .order('sort_order', { ascending: false })
    .limit(1)

  const nextOrder = ((existing?.[0]?.sort_order as number) || 0) + 1

  const { data, error } = await supabase
    .from('customer_segments')
    .insert({
      business_id: business.business_id,
      name: body.name || 'Ny kundtyp',
      description: body.description || null,
      color: body.color || '#0F766E',
      is_default: false,
      sort_order: nextOrder,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ segment: data })
}
