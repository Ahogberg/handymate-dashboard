import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/subcontractors - Hämta underleverantörer
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const status = request.nextUrl.searchParams.get('status')

    let query = supabase
      .from('subcontractor')
      .select('*')
      .eq('business_id', business.business_id)
      .order('name')

    if (status) query = query.eq('status', status)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ subcontractors: data || [] })
  } catch (error: any) {
    console.error('Get subcontractors error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/subcontractors - Skapa underleverantör
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { name, company_name, org_number, phone_number, email, specialization, hourly_rate, notes } = body

    if (!name) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('subcontractor')
      .insert({
        business_id: business.business_id,
        name,
        company_name: company_name || null,
        org_number: org_number || null,
        phone_number: phone_number || null,
        email: email || null,
        specialization: specialization || null,
        hourly_rate: hourly_rate || null,
        notes: notes || null,
        status: 'active',
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ subcontractor: data })
  } catch (error: any) {
    console.error('Create subcontractor error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/subcontractors - Uppdatera underleverantör
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { subcontractor_id, ...updates } = body

    if (!subcontractor_id) {
      return NextResponse.json({ error: 'subcontractor_id krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('subcontractor')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('subcontractor_id', subcontractor_id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ subcontractor: data })
  } catch (error: any) {
    console.error('Update subcontractor error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/subcontractors - Ta bort underleverantör
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('subcontractor')
      .delete()
      .eq('subcontractor_id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete subcontractor error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
