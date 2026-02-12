import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getAutomationSettings } from '@/lib/pipeline'

/**
 * GET - Hämta automationsinställningar för pipeline
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const settings = await getAutomationSettings(business.business_id)

    return NextResponse.json(settings)
  } catch (error: any) {
    console.error('Get pipeline settings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Uppdatera automationsinställningar
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Ensure settings exist first
    await getAutomationSettings(business.business_id)

    const { data: settings, error } = await supabase
      .from('pipeline_automation')
      .update(body)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(settings)
  } catch (error: any) {
    console.error('Update pipeline settings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
