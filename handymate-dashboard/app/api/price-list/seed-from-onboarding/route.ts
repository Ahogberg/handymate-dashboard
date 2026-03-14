import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST - Seed price_list from onboarding step 2 services
 * Creates labor rows for each selected service with the user's hourly rate.
 * Skips if price_list already has entries (idempotent).
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const { services, hourlyRate } = await request.json()

    if (!Array.isArray(services) || services.length === 0 || !hourlyRate) {
      return NextResponse.json({ error: 'Missing services or hourlyRate' }, { status: 400 })
    }

    // Check if price_list already has entries — don't overwrite
    const { data: existing } = await supabase
      .from('price_list')
      .select('id')
      .eq('business_id', businessId)
      .limit(1)

    if (existing && existing.length > 0) {
      return NextResponse.json({ message: 'Price list already exists, skipping seed' })
    }

    // Create one labor row per selected service
    const items = services.map((serviceName: string, idx: number) => ({
      id: `pl_${businessId}_onb_${idx}`,
      business_id: businessId,
      category: 'labor',
      name: serviceName,
      unit: 'timme',
      unit_price: hourlyRate,
      is_active: true,
    }))

    const { error } = await supabase.from('price_list').insert(items)
    if (error) {
      console.error('Seed price_list error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: items.length })
  } catch (error: any) {
    console.error('Seed price_list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
