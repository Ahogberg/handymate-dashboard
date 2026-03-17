import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/field-reports?project_id=X — Lista fältrapporter
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const projectId = request.nextUrl.searchParams.get('project_id')

  let query = supabase
    .from('field_reports')
    .select('*, photos:field_report_photos(id, url, caption, type)')
    .eq('business_id', business.business_id)
    .order('created_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ reports: data || [] })
}

/**
 * POST /api/field-reports — Skapa ny fältrapport
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const supabase = getServerSupabase()

  // Auto-generera rapport-nummer
  const year = new Date().getFullYear()
  const { count } = await supabase
    .from('field_reports')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', business.business_id)
    .gte('created_at', `${year}-01-01`)

  const seq = (count || 0) + 1
  const reportNumber = `FR-${year}-${String(seq).padStart(3, '0')}`

  const { data: report, error } = await supabase
    .from('field_reports')
    .insert({
      business_id: business.business_id,
      project_id: body.project_id || null,
      customer_id: body.customer_id || null,
      title: body.title || 'Fältrapport',
      description: body.description || null,
      work_performed: body.work_performed || null,
      materials_used: body.materials_used || null,
      report_number: reportNumber,
      status: body.status || 'draft',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert photos if provided
  if (body.photo_urls && Array.isArray(body.photo_urls)) {
    for (const url of body.photo_urls) {
      await supabase.from('field_report_photos').insert({
        report_id: report.id,
        business_id: business.business_id,
        url,
        type: 'after',
      })
    }
  }

  return NextResponse.json({ report })
}
