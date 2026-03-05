import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista alla kunder för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const search = request.nextUrl.searchParams.get('search')
    const type = request.nextUrl.searchParams.get('type')

    let query = supabase
      .from('customer')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (type) {
      query = query.eq('customer_type', type)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%,email.ilike.%${search}%`)
    }

    const { data: customers, error } = await query

    if (error) throw error

    return NextResponse.json({ customers: customers || [] })
  } catch (error: any) {
    console.error('Get customers error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny kund
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { name, phone_number, email, address_line } = body

    if (!name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 })
    }

    const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)

    const insertData: Record<string, any> = {
      customer_id: customerId,
      business_id: business.business_id,
      name,
      phone_number: phone_number || null,
      email: email || null,
      address_line: address_line || null,
      created_at: new Date().toISOString(),
    }

    if (body.personal_number) insertData.personal_number = body.personal_number
    if (body.property_designation) insertData.property_designation = body.property_designation
    if (body.customer_type) insertData.customer_type = body.customer_type
    if (body.org_number) insertData.org_number = body.org_number
    if (body.contact_person) insertData.contact_person = body.contact_person
    if (body.invoice_address) insertData.invoice_address = body.invoice_address
    if (body.visit_address) insertData.visit_address = body.visit_address
    if (body.reference) insertData.reference = body.reference
    if (body.apartment_count) insertData.apartment_count = parseInt(body.apartment_count)

    const { data: customer, error } = await supabase
      .from('customer')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ customer })
  } catch (error: any) {
    console.error('Create customer error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera kund
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { customer_id } = body

    if (!customer_id) {
      return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 })
    }

    const updateData: Record<string, any> = {}

    if (body.name !== undefined) updateData.name = body.name
    if (body.phone_number !== undefined) updateData.phone_number = body.phone_number || null
    if (body.email !== undefined) updateData.email = body.email || null
    if (body.address_line !== undefined) updateData.address_line = body.address_line || null
    if (body.personal_number !== undefined) updateData.personal_number = body.personal_number || null
    if (body.property_designation !== undefined) updateData.property_designation = body.property_designation || null
    if (body.customer_type !== undefined) updateData.customer_type = body.customer_type || 'private'
    if (body.org_number !== undefined) updateData.org_number = body.org_number || null
    if (body.contact_person !== undefined) updateData.contact_person = body.contact_person || null
    if (body.invoice_address !== undefined) updateData.invoice_address = body.invoice_address || null
    if (body.visit_address !== undefined) updateData.visit_address = body.visit_address || null
    if (body.reference !== undefined) updateData.reference = body.reference || null
    if (body.apartment_count !== undefined) updateData.apartment_count = body.apartment_count ? parseInt(body.apartment_count) : null
    if (body.customer_rating !== undefined) updateData.customer_rating = body.customer_rating

    const { data: customer, error } = await supabase
      .from('customer')
      .update(updateData)
      .eq('customer_id', customer_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ customer })
  } catch (error: any) {
    console.error('Update customer error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort kund
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const customerId = request.nextUrl.searchParams.get('customerId')

    if (!customerId) {
      return NextResponse.json({ error: 'Missing customerId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('customer')
      .delete()
      .eq('customer_id', customerId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete customer error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
