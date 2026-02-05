import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST - Uppdatera öppettider under onboarding
 * Body: { businessId: string, working_hours: object }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { businessId, working_hours } = await request.json()

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    if (!working_hours) {
      return NextResponse.json({ error: 'Missing working_hours' }, { status: 400 })
    }

    // Verifiera att businessId finns och skapades nyligen (inom 1 timme)
    const { data: business, error: fetchError } = await supabase
      .from('business_config')
      .select('business_id, created_at')
      .eq('business_id', businessId)
      .single()

    if (fetchError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Kolla att kontot skapades nyligen (inom 1 timme)
    const createdAt = new Date(business.created_at)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    if (createdAt < oneHourAgo) {
      return NextResponse.json({ error: 'Onboarding session expired' }, { status: 403 })
    }

    // Uppdatera working_hours
    const { error: updateError } = await supabase
      .from('business_config')
      .update({
        working_hours: working_hours,
        onboarding_completed_at: new Date().toISOString(),
      })
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

  } catch (error: any) {
    console.error('Onboarding hours error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to save working hours'
    }, { status: 500 })
  }
}
