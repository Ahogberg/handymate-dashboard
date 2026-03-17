import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/field-reports/public?token=X — Hämta rapport via signerings-token (publik)
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ error: 'Token krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  const { data: report, error } = await supabase
    .from('field_reports')
    .select(`
      id, title, description, work_performed, materials_used,
      report_number, status, signed_at, signed_by, signature_token,
      customer_note, created_at,
      photos:field_report_photos(id, url, caption, type)
    `)
    .eq('signature_token', token)
    .single()

  if (error || !report) {
    return NextResponse.json({ error: 'Rapport hittades inte' }, { status: 404 })
  }

  // Hämta företagsinfo separat
  const { data: fullReport } = await supabase
    .from('field_reports')
    .select('business_id')
    .eq('id', report.id)
    .single()

  let business = null
  if (fullReport?.business_id) {
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name, contact_name, org_number, f_skatt_registered, logo_url')
      .eq('business_id', fullReport.business_id)
      .single()
    business = biz
  }

  return NextResponse.json({
    report: { ...report, business },
  })
}
