import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/warranties - Hämta garantier
 * Query: customerId, status, expiringSoon (days)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const customerId = request.nextUrl.searchParams.get('customerId')
    const status = request.nextUrl.searchParams.get('status')
    const expiringSoon = request.nextUrl.searchParams.get('expiringSoon')

    let query = supabase
      .from('warranty')
      .select(`
        *,
        customer:customer_id (customer_id, name, phone_number)
      `)
      .eq('business_id', business.business_id)
      .order('end_date', { ascending: true })

    if (customerId) query = query.eq('customer_id', customerId)
    if (status) query = query.eq('status', status)
    if (expiringSoon) {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + parseInt(expiringSoon))
      query = query
        .eq('status', 'active')
        .lte('end_date', futureDate.toISOString().split('T')[0])
        .gte('end_date', new Date().toISOString().split('T')[0])
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ warranties: data || [] })
  } catch (error: any) {
    console.error('Get warranties error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/warranties - Skapa garanti
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { customer_id, booking_id, invoice_id, title, description, start_date, end_date, warranty_type, terms } = body

    if (!customer_id || !title || !start_date || !end_date) {
      return NextResponse.json({ error: 'customer_id, title, start_date och end_date krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('warranty')
      .insert({
        business_id: business.business_id,
        customer_id,
        booking_id: booking_id || null,
        invoice_id: invoice_id || null,
        title,
        description: description || null,
        start_date,
        end_date,
        warranty_type: warranty_type || 'standard',
        terms: terms || null,
        status: 'active',
      })
      .select(`*, customer:customer_id (customer_id, name, phone_number)`)
      .single()

    if (error) throw error

    return NextResponse.json({ warranty: data })
  } catch (error: any) {
    console.error('Create warranty error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/warranties - Uppdatera garanti
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { warranty_id, ...updates } = body

    if (!warranty_id) {
      return NextResponse.json({ error: 'warranty_id krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('warranty')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('warranty_id', warranty_id)
      .eq('business_id', business.business_id)
      .select(`*, customer:customer_id (customer_id, name, phone_number)`)
      .single()

    if (error) throw error

    return NextResponse.json({ warranty: data })
  } catch (error: any) {
    console.error('Update warranty error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/warranties - Ta bort garanti
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const warrantyId = request.nextUrl.searchParams.get('warrantyId')

    if (!warrantyId) {
      return NextResponse.json({ error: 'warrantyId krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('warranty')
      .delete()
      .eq('warranty_id', warrantyId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete warranty error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
