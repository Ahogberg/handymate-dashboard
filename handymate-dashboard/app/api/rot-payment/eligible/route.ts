import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { validateInvoiceForSkv } from '@/lib/skv/validate-rot-request'
import { defaultCategoryForIndustry } from '@/lib/skv/categories'
import { CUSTOMER_SETTLED_STATUSES } from '@/lib/invoices/status'

export const dynamic = 'force-dynamic'

/**
 * GET /api/rot-payment/eligible
 * Listar betalda ROT/RUT-fakturor som ännu inte rapporterats via denna fil-väg,
 * med per-faktura-valideringsstatus så UI kan visa vad som saknas innan export.
 * Exkluderar redan skickade via vår egen XML-fil (rot_payment_request_id satt).
 *
 * Fakturor som Fortnox bokfört med skattereduktion (rot_application_status=
 * 'submitted' men rot_payment_request_id fortfarande null) INKLUDERAS numera,
 * men flaggas med likely_reported_by_fortnox — vi kan inte från kod verifiera
 * att Fortnox faktiskt har den automatiska Skatteverket-anslutningen aktiverad
 * för det specifika kontot, så en tyst uteslutning riskerade att låta ROT/RUT-
 * ansökan aldrig nå Skatteverket alls om den inte var. Beslut 2026-08-21.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const currentUser = await getCurrentUser(request)
  if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
    return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
  }

  const supabase = getServerSupabase()

  const { data: config } = await supabase
    .from('business_config')
    .select('org_number, branch, default_rot_work_category')
    .eq('business_id', business.business_id)
    .single()

  const { data: invoices, error } = await supabase
    .from('invoice')
    .select('*, customer:customer_id (name, personal_number, property_designation)')
    .eq('business_id', business.business_id)
    // customer_paid = kunden har betalat SIN del (Skatteverkets del väntar)
    // — det är exakt det tillstånd som gör fakturan ROT/RUT-berättigad.
    .in('status', [...CUSTOMER_SETTLED_STATUSES])
    .in('rot_rut_type', ['rot', 'rut'])
    .is('rot_payment_request_id', null)
    .order('paid_at', { ascending: false })

  if (error) {
    console.error('[rot-payment/eligible] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const defaultCategory = config?.default_rot_work_category || defaultCategoryForIndustry(config?.branch)

  const rows = (invoices || [])
    .map((inv: any) => {
      const customer = inv.customer || {}
      // Förvald kategori om ingen satt på fakturan (override sker i UI/generate).
      const effectiveCategory = inv.rot_work_category || defaultCategory || null
      const taxYear = inv.paid_at ? new Date(inv.paid_at).getFullYear() : new Date().getFullYear()
      const validation = validateInvoiceForSkv({
        invoice: { ...inv, rot_work_category: effectiveCategory },
        customerPersonalNumber: customer.personal_number,
        customerPropertyDesignation: customer.property_designation,
        businessOrgNumber: config?.org_number,
        taxYear,
      })
      return {
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        customer_name: customer.name || null,
        personal_number: customer.personal_number || null,
        status: inv.status,
        paid_at: inv.paid_at,
        paid_amount: inv.paid_amount ?? null,
        tax_year: taxYear,
        rot_rut_type: inv.rot_rut_type,
        work_cost: Math.round((inv.rot_rut_type === 'rut' ? inv.rut_work_cost : inv.rot_work_cost) || 0),
        deduction: Math.round((inv.rot_rut_type === 'rut' ? inv.rut_deduction : inv.rot_deduction) || 0),
        category: effectiveCategory,
        category_explicit: !!inv.rot_work_category,
        hours: inv.rot_hours,
        material_cost: inv.rot_material_cost,
        property_type: inv.rot_property_type || 'smahus',
        property_designation: inv.rot_property_designation || customer.property_designation || null,
        brf_org_number: inv.rot_brf_org_number || null,
        apartment_number: inv.rot_apartment_number || null,
        // rot_application_status='submitted' här betyder Fortnox har bokfört
        // fakturan med skattereduktion (rot_payment_request_id är null, annars
        // hade queryn ovan redan uteslutit raden) — inte att vi vet den nått
        // Skatteverket. Flaggas i UI, utesluts inte tyst.
        likely_reported_by_fortnox: inv.rot_application_status === 'submitted',
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
      }
    })

  return NextResponse.json({
    org_number: config?.org_number || null,
    default_category: defaultCategory,
    rot: rows.filter(r => r.rot_rut_type === 'rot'),
    rut: rows.filter(r => r.rot_rut_type === 'rut'),
  })
}
