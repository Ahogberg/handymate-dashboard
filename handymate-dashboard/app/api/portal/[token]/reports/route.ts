import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'

/**
 * GET /api/portal/[token]/reports
 * Listar fältrapporter för kunden — alla projekt.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { data: reports, error: reportsError } = await supabase
      .from('field_reports')
      .select('id, report_number, title, work_performed, materials_used, status, signature_token, signed_at, signed_by, created_at, project_id')
      .eq('business_id', customer.business_id)
      .eq('customer_id', customer.customer_id)
      .order('created_at', { ascending: false })

    // TD-22: tidigare bara `{ data: reports }` — en kolumnmissmatch eller
    // RLS-miss gav en tyst tom lista med HTTP 200, ingen spår i loggen.
    if (reportsError) {
      console.error('[portal/reports] query error:', reportsError)
      return NextResponse.json({ error: 'Kunde inte hämta rapporterna just nu' }, { status: 500 })
    }

    return NextResponse.json({ reports: reports || [] })
  } catch (error: any) {
    console.error('portal/reports error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
