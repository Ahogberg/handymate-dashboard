import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('inventory_locations')
      .select('*')
      .eq('business_id', business.business_id)
      .order('is_default', { ascending: false })
      .order('name')

    if (error) throw error
    return NextResponse.json({ locations: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { name, description } = await request.json()
    if (!name) return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('inventory_locations')
      .insert({ business_id: business.business_id, name, description: description || null })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ location: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
