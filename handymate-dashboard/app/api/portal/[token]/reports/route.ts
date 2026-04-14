import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

async function getCustomerFromToken(token: string) {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('customer')
    .select('customer_id, business_id, portal_enabled')
    .eq('portal_token', token)
    .single()
  if (!data || !data.portal_enabled) return null
  return data
}

/**
 * GET /api/portal/[token]/reports
 * Listar fältrapporter för kunden — alla projekt.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const customer = await getCustomerFromToken(params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const supabase = getServerSupabase()

    const { data: reports } = await supabase
      .from('field_reports')
      .select('id, report_number, title, work_performed, materials_used, status, signature_token, signed_at, signed_by, created_at, project_id')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ reports: reports || [] })
  } catch (error: any) {
    console.error('portal/reports error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
