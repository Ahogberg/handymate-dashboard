import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAuthenticatedBusiness } from '@/lib/auth'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET - Hämta alla leverantörer för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const businessId = business.business_id

    // Hämta leverantörer med antal produkter
    const { data: suppliers, error } = await supabase
      .from('supplier')
      .select(`
        *,
        supplier_product(count)
      `)
      .eq('business_id', businessId)
      .order('name')

    if (error) throw error

    // Formatera response med product count
    const formatted = suppliers?.map((s: any) => ({
      ...s,
      product_count: s.supplier_product?.[0]?.count || 0,
      supplier_product: undefined
    }))

    return NextResponse.json({ suppliers: formatted })

  } catch (error: any) {
    console.error('Get suppliers error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny leverantör
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const { name, customer_number, contact_email, contact_phone } = body

    if (!name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('supplier')
      .insert({
        business_id: business.business_id,
        name,
        customer_number,
        contact_email,
        contact_phone
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ supplier: data })

  } catch (error: any) {
    console.error('Create supplier error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera leverantör
 */
export async function PUT(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const body = await request.json()
    const { supplier_id, name, customer_number, contact_email, contact_phone } = body

    if (!supplier_id) {
      return NextResponse.json({ error: 'Missing supplier_id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('supplier')
      .update({
        name,
        customer_number,
        contact_email,
        contact_phone
      })
      .eq('supplier_id', supplier_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ supplier: data })

  } catch (error: any) {
    console.error('Update supplier error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort leverantör (och alla produkter)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getSupabase()
    const supplierId = request.nextUrl.searchParams.get('supplierId')

    if (!supplierId) {
      return NextResponse.json({ error: 'Missing supplierId' }, { status: 400 })
    }

    const { error } = await supabase
      .from('supplier')
      .delete()
      .eq('supplier_id', supplierId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete supplier error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
