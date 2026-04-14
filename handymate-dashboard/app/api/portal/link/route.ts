import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getOrCreatePortalLink, type PortalTab } from '@/lib/portal-link'

/**
 * GET /api/portal/link?customer_id=X&tab=Y
 * Resolverar (eller skapar) kundens portal-URL, valfritt med djuplänk till specifik tab.
 * Används av dashboard-UI för att ge hantverkaren "kopiera kundlänk"-funktion.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customer_id')
    const tab = searchParams.get('tab') as PortalTab | null

    if (!customerId) {
      return NextResponse.json({ error: 'customer_id krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    // Bekräfta att kunden tillhör företaget innan vi returnerar portal-länk
    const { data: customer } = await supabase
      .from('customer')
      .select('business_id')
      .eq('customer_id', customerId)
      .maybeSingle()

    if (!customer || customer.business_id !== business.business_id) {
      return NextResponse.json({ error: 'Kunden hittades inte' }, { status: 404 })
    }

    const url = await getOrCreatePortalLink(supabase, customerId, tab || undefined)
    if (!url) {
      return NextResponse.json({ error: 'Kunde inte skapa portal-länk' }, { status: 500 })
    }

    return NextResponse.json({ url })
  } catch (error: any) {
    console.error('portal-link error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
