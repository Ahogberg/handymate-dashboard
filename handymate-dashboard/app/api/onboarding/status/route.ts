import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST - Update onboarding status fields
 * Body: { businessId: string, forwarding_confirmed?: boolean, onboarding_dismissed?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()
    const { businessId, forwarding_confirmed, onboarding_dismissed } = body

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
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
