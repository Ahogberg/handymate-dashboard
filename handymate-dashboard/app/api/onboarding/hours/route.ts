import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * POST - Uppdatera öppettider under onboarding
 * Body: { businessId?: string, working_hours: object }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const body = await request.json()
    const { working_hours } = body

    if (!working_hours) {
      return NextResponse.json({ error: 'Missing working_hours' }, { status: 400 })
    }

    // Try authenticated business first, fall back to businessId for fresh signups
    let businessId: string | null = null

    const auth = await getAuthenticatedBusiness(request)
    if (auth) {
      businessId = auth.business_id
    } else if (body.businessId) {
      // Fallback for fresh signup (no session yet — verify business exists and is recent)
      const { data: business } = await supabase
        .from('business_config')
        .select('business_id, created_at')
        .eq('business_id', body.businessId)
        .single()

      if (business) {
        const createdAt = new Date(business.created_at)
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)
        if (createdAt >= twoHoursAgo) {
          businessId = business.business_id
        }
      }
    }

    if (!businessId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only update working_hours — do NOT mark onboarding as complete here
    const { error: updateError } = await supabase
      .from('business_config')
      .update({ working_hours })
      .eq('business_id', businessId)

    if (updateError) {
      console.error('Database update error:', updateError)
      return NextResponse.json({
        error: 'Failed to update working hours',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Öppettider sparade'
    })

  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save working hours'
    console.error('Onboarding hours error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
