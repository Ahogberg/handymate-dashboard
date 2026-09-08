import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { loadBranding } from '@/lib/branding/get-branding'

export const dynamic = 'force-dynamic'

/**
 * GET /api/field-reports/public?token=X — Hämta rapport via signerings-token (publik)
 *
 * Svaret bär hantverkarens varumärke (lib/branding/get-branding.ts, samma
 * sanning som offertsidan och kundmailen) och attributionsstämpeln, så att
 * signeringssidan ser ut som resten av kundresan. Kundens egna uppgifter
 * lämnas aldrig ut här — bara rapporten och företaget.
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
      id, business_id, title, description, work_performed, materials_used,
      report_number, status, signed_at, signed_by, signature_token,
      customer_note, created_at,
      photos:field_report_photos(id, url, caption, type)
    `)
    .eq('signature_token', token)
    .maybeSingle()

  if (error || !report) {
    return NextResponse.json({ error: 'Rapport hittades inte' }, { status: 404 })
  }

  const { business_id: businessId, ...publicReport } = report

  const [branding, fskatt] = await Promise.all([
    loadBranding(supabase, businessId),
    supabase
      .from('business_config')
      .select('f_skatt_registered')
      .eq('business_id', businessId)
      .maybeSingle(),
  ])

  return NextResponse.json({
    report: publicReport,
    business: {
      name: branding.businessName,
      contact_name: branding.contactName ?? null,
      phone: branding.contactPhone ?? null,
      email: branding.contactEmail ?? null,
      org_number: branding.orgNumber ?? null,
      f_skatt: fskatt.data?.f_skatt_registered === true,
      logo_url: branding.logoUrl ?? null,
      accent_color: branding.accentColor,
    },
    attribution: branding.attribution,
  })
}
