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
