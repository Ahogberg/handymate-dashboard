import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/customers/[id]/facts
 *
 * Customer Facts V1 (2026-08-12): "säg-det-en-gång-minnet" — godkända
 * kundfakta (customer_fact, superseded_by IS NULL) för kundkortets
 * "Det här vet Handymate"-sektion.
 *
 * Fail-safe: en saknad tabell (sql/v122 körs senare) eller ett DB-fel ger
 * tom lista i stället för en trasig sida — samma mönster som referrals.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: customerId } = await params
  const supabase = getServerSupabase()

  // Tenant-koll: kunden måste tillhöra det inloggade företaget.
  const { data: customerRow, error: customerError } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('customer_id', customerId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (customerError) {
    console.error('[customer facts] customer lookup error:', customerError)
    return NextResponse.json({ facts: [] })
  }

  if (!customerRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const { data, error } = await supabase
      .from('customer_fact')
      .select('id, fact_type, content, evidence_quote, confidence, created_at, confirmed_at')
      .eq('business_id', business.business_id)
      .eq('customer_id', customerId)
      .is('superseded_by', null)
      .order('confirmed_at', { ascending: false, nullsFirst: false })
      .limit(20)

    if (error) {
      // Tabellen kan sakna (v122 körs senare) — logga och svara tomt.
      console.error('[customer facts] query error:', error)
      return NextResponse.json({ facts: [] })
    }

    return NextResponse.json({ facts: data || [] })
  } catch (error) {
    console.error('[customer facts] unexpected error:', error)
    return NextResponse.json({ facts: [] })
  }
}

/**
 * DELETE /api/customers/[id]/facts?factId=cfact_xxx
 *
 * "Ta bort"-vägen (PRELAUNCH_WAVE kandidat 5, 2026-08-12): ingen hård DELETE
 * — hela systemet bygger på att superseded_by IS NULL betyder "aktivt
 * faktum" (v122-kommentaren, resolvern, kundkortet, tidslinjen). Konventionen
 * här: superseded_by sätts till radens EGET id, dvs "manuellt borttagen".
 * Ingen ny kolumn behövs och alla befintliga läsvägar filtrerar redan bort
 * raden. Samma konvention som supersede-uppdateringen i
 * app/api/approvals/[id]/route.ts (case 'customer_fact'), fast där sätts
 * superseded_by till en ANNAN (nyare) rads id.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: customerId } = await params
  const factId = request.nextUrl.searchParams.get('factId')
  if (!factId) {
    return NextResponse.json({ error: 'factId saknas' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Villkoren (business_id + customer_id + superseded_by IS NULL) säkerställer
  // att man bara kan ta bort ett aktivt faktum som faktiskt hör till den
  // inloggades företag och till just den här kunden — aldrig en gissning.
  const { data: removed, error } = await supabase
    .from('customer_fact')
    .update({ superseded_by: factId })
    .eq('id', factId)
    .eq('business_id', business.business_id)
    .eq('customer_id', customerId)
    .is('superseded_by', null)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[customer facts] delete error:', error)
    return NextResponse.json({ error: 'Kunde inte ta bort — försök igen om en stund' }, { status: 500 })
  }
  if (!removed) {
    return NextResponse.json({ error: 'Hittades inte' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
