import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/allowances?startDate=&endDate=&projectId=
 * Lista ersättningsrapporter för perioden
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const projectId = request.nextUrl.searchParams.get('projectId')

    let query = supabase
      .from('allowance_reports')
      .select('*, allowance_type:allowance_type_id(*), project:project_id(name)')
      .eq('business_id', business.business_id)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (startDate) query = query.gte('report_date', startDate)
    if (endDate) query = query.lte('report_date', endDate)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ reports: data || [] })
  } catch (error: any) {
    console.error('GET allowances error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/allowances — Skapa ny ersättningsrapport
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    if (!body.allowance_type_id || !body.quantity) {
      return NextResponse.json({ error: 'Typ och antal krävs' }, { status: 400 })
    }

    // Get the type to calculate amount
    const { data: aType } = await supabase
      .from('allowance_types')
      .select('rate, billable_to_customer')
      .eq('id', body.allowance_type_id)
      .single()

    const rate = aType?.rate || 0
    const amount = body.amount || (rate * body.quantity)

    const { data, error } = await supabase
      .from('allowance_reports')
      .insert({
        business_id: business.business_id,
        business_user_id: body.business_user_id || null,
        allowance_type_id: body.allowance_type_id,
        project_id: body.project_id || null,
        report_date: body.report_date || new Date().toISOString().split('T')[0],
        quantity: body.quantity,
        amount,
        description: body.description || null,
        billable: body.billable ?? aType?.billable_to_customer ?? false,
        from_address: body.from_address || null,
        to_address: body.to_address || null,
        distance_km: body.distance_km || null,
      })
      .select('*, allowance_type:allowance_type_id(*), project:project_id(name)')
      .single()

    if (error) throw error

    return NextResponse.json({ report: data })
  } catch (error: any) {
    console.error('POST allowances error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/allowances?id=xxx — Ta bort ersättningsrapport
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

    // Don't allow deleting invoiced reports
    const { data: existing } = await supabase
      .from('allowance_reports')
      .select('invoiced')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (existing?.invoiced) {
      return NextResponse.json({ error: 'Kan inte ta bort fakturerad ersättning' }, { status: 400 })
    }

    const { error } = await supabase
      .from('allowance_reports')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('DELETE allowances error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
