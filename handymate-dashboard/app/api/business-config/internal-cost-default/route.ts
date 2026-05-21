import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

/**
 * Endpoint för business-default intern timkostnad (v53, Etapp 2.0).
 *
 * Rollskydd: ENDAST owner/admin. Skarpare än `see_financials` —
 * Andreas spec 2026-05-21: employee/PM/kalkylator ser ALDRIG intern
 * lönekostnad, även om de har can_see_financials.
 */
function canSeeInternalCosts(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}

/**
 * GET /api/business-config/internal-cost-default
 * Returnerar default_internal_hourly_cost för affären, eller null om
 * inte satt. Returnerar 403 för icke-owner/admin.
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!canSeeInternalCosts(currentUser?.role)) {
      return NextResponse.json({ error: 'Endast owner/admin' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('business_config')
      .select('default_internal_hourly_cost')
      .eq('business_id', business.business_id)
      .single()

    if (error) throw error

    return NextResponse.json({
      default_internal_hourly_cost: data?.default_internal_hourly_cost ?? null,
    })
  } catch (error: any) {
    console.error('GET internal-cost-default error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/business-config/internal-cost-default
 * Body: { default_internal_hourly_cost: number | null }
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!canSeeInternalCosts(currentUser?.role)) {
      return NextResponse.json({ error: 'Endast owner/admin' }, { status: 403 })
    }

    const body = await request.json()
    const raw = body?.default_internal_hourly_cost

    let value: number | null = null
    if (raw !== null && raw !== undefined && raw !== '') {
      const num = Number(raw)
      if (!Number.isFinite(num) || num < 0) {
        return NextResponse.json({ error: 'Ogiltigt värde (måste vara ≥ 0 eller null)' }, { status: 400 })
      }
      value = num
    }

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('business_config')
      .update({ default_internal_hourly_cost: value })
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ default_internal_hourly_cost: value })
  } catch (error: any) {
    console.error('PUT internal-cost-default error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
