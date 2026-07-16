import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { verifyOwnership } from '@/lib/auth/verify-ownership'

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

    // allowance_type_id → allowance_types har en riktig FK (behålls som
    // embed). project_id → project saknar bekräftat körd FK i prod (v71
    // lägger till den men är inte verifierad) — hämtas separat i batch.
    let query = supabase
      .from('allowance_reports')
      .select('*, allowance_type:allowance_type_id(*)')
      .eq('business_id', business.business_id)
      .order('report_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (startDate) query = query.gte('report_date', startDate)
    if (endDate) query = query.lte('report_date', endDate)
    if (projectId) query = query.eq('project_id', projectId)

    const { data, error } = await query

    if (error) throw error

    const reports = data || []
    const projectIds = Array.from(new Set(reports.map((r: any) => r.project_id).filter(Boolean)))
    const projectMap: Record<string, string> = {}
    if (projectIds.length > 0) {
      const { data: projects, error: projectErr } = await supabase
        .from('project')
        .select('project_id, name')
        .in('project_id', projectIds)
      if (projectErr) {
        console.error('[allowances GET] project batch fetch error:', projectErr)
      } else {
        for (const p of projects || []) projectMap[p.project_id] = p.name
      }
    }
    const enrichedReports = reports.map((r: any) => ({
      ...r,
      project: r.project_id ? { name: projectMap[r.project_id] || null } : null,
    }))

    return NextResponse.json({ reports: enrichedReports })
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

    // Cross-business-skydd (pilot-fix-plan Steg 3, audit 1 B1)
    const ownership = await verifyOwnership(supabase, business.business_id, [
      { table: 'project', idColumn: 'project_id', idValue: body.project_id, label: 'projekt' },
    ])
    if (!ownership.ok) {
      return NextResponse.json(
        { error: `Du har inte tillgång till: ${ownership.missing.join(', ')}` },
        { status: 403 },
      )
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
      .select('*, allowance_type:allowance_type_id(*)')
      .single()

    if (error) throw error

    // project_id → project saknar bekräftat körd FK i prod — hämta separat.
    let project: { name: string } | null = null
    if (data.project_id) {
      const { data: projectData, error: projectErr } = await supabase
        .from('project')
        .select('name')
        .eq('project_id', data.project_id)
        .maybeSingle()
      if (projectErr) {
        console.error('[allowances POST] project fetch error (non-blocking):', projectErr)
      } else {
        project = projectData
      }
    }
    data.project = project

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
