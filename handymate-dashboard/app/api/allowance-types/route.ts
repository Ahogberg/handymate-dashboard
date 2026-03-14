import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

const SYSTEM_TYPES = [
  { name: 'Milersättning', type: 'mileage', rate: 25, unit: 'km', is_taxable: false, is_system: true },
  { name: 'Traktamente Sverige', type: 'daily', rate: 290, unit: 'dag', is_taxable: false, is_system: true },
  { name: 'OB Kväll (18–22)', type: 'hourly', rate: 0, unit: 'tim', is_taxable: true, is_system: true },
  { name: 'OB Natt (22–06)', type: 'hourly', rate: 0, unit: 'tim', is_taxable: true, is_system: true },
]

/**
 * GET /api/allowance-types — Lista ersättningstyper
 * Seedar systemtyper automatiskt om inga finns.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    // Check if types exist, seed if not
    const { data: existing } = await supabase
      .from('allowance_types')
      .select('id')
      .eq('business_id', businessId)
      .limit(1)

    if (!existing || existing.length === 0) {
      // Seed system types
      await supabase.from('allowance_types').insert(
        SYSTEM_TYPES.map(t => ({
          business_id: businessId,
          ...t,
          billable_to_customer: false,
          is_active: true,
        }))
      )
    }

    const { data, error } = await supabase
      .from('allowance_types')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('is_system', { ascending: false })
      .order('name')

    if (error) throw error

    return NextResponse.json({ types: data || [] })
  } catch (error: any) {
    console.error('GET allowance-types error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/allowance-types — Skapa ny ersättningstyp
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.name || !body.type || body.rate === undefined) {
      return NextResponse.json({ error: 'Namn, typ och sats krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('allowance_types')
      .insert({
        business_id: business.business_id,
        name: body.name,
        type: body.type,
        rate: body.rate,
        unit: body.unit || 'st',
        is_taxable: body.is_taxable !== false,
        billable_to_customer: body.billable_to_customer || false,
        is_active: true,
        is_system: false,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ type: data })
  } catch (error: any) {
    console.error('POST allowance-types error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/allowance-types — Uppdatera ersättningstyp
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.rate !== undefined) updates.rate = body.rate
    if (body.unit !== undefined) updates.unit = body.unit
    if (body.is_taxable !== undefined) updates.is_taxable = body.is_taxable
    if (body.billable_to_customer !== undefined) updates.billable_to_customer = body.billable_to_customer
    if (body.is_active !== undefined) updates.is_active = body.is_active

    const { data, error } = await supabase
      .from('allowance_types')
      .update(updates)
      .eq('id', body.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ type: data })
  } catch (error: any) {
    console.error('PUT allowance-types error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
