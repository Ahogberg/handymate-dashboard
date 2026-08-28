import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST - Update onboarding status fields
 * Body: { forwarding_confirmed?: boolean, onboarding_dismissed?: boolean }
 *
 * Auth-luckan (Codex-granskning, verifierad 2026-08-28): rutten läste
 * businessId ur bodyn och skrev med service-role utan att verifiera
 * användaren — vem som helst med ett business_id kunde ändra onboarding-
 * status på vilket företag som helst. Nu: sessionens företag, alltid.
 * Ett medskickat businessId som inte matchar avvisas (aldrig tyst ignorerat).
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const businessId = business.business_id
    const supabase = getServerSupabase()
    const body = await request.json().catch(() => ({}))
    const { forwarding_confirmed, onboarding_dismissed } = body
    if (body.businessId && body.businessId !== businessId) {
      return NextResponse.json({ error: 'Fel företag' }, { status: 403 })
    }

    // Build update object
    const updates: Record<string, any> = {}

    if (forwarding_confirmed !== undefined) {
      updates.forwarding_confirmed = forwarding_confirmed
    }

    if (onboarding_dismissed !== undefined) {
      updates.onboarding_dismissed = onboarding_dismissed
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    // Update business_config
    const { error: updateError } = await supabase
      .from('business_config')
      .update(updates)
      .eq('business_id', businessId)

    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({
        error: 'Failed to update onboarding status',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Onboarding status updated'
    })

  } catch (error: any) {
    console.error('Onboarding status error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to update status'
    }, { status: 500 })
  }
}
