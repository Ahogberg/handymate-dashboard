import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { purchaseAndAssignNumber } from '@/lib/phone/purchase-number'

/**
 * POST - Provisionera telefonnummer under onboarding
 * Body: { businessId: string, forward_phone_number: string, call_mode: string, phone_setup_type: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getServerSupabase()
    const { businessId, forward_phone_number, call_mode, phone_setup_type } = await request.json()

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    // Authenticate the user via Supabase auth token
    const authHeader = request.headers.get('authorization')
    const cookieHeader = request.headers.get('cookie')
    let accessToken: string | null = null

    if (authHeader?.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7)
    } else if (cookieHeader) {
      const sbCookie = cookieHeader.match(/sb-[^=]+-auth-token=([^;]+)/)
      if (sbCookie) {
        try {
          const decoded = decodeURIComponent(sbCookie[1])
          const parsed = JSON.parse(decoded)
          accessToken = parsed[0]
        } catch {
          // Ignore parse errors
        }
      }
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken)
    if (userError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verifiera att businessId finns och belongs to the authenticated user
    const { data: business, error: fetchError } = await supabase
      .from('business_config')
      .select('business_id, assigned_phone_number, business_name, user_id')
      .eq('business_id', businessId)
      .single()

    if (fetchError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    // Verify that the authenticated user owns this business
    if (business.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (business.assigned_phone_number) {
      // Redan har ett nummer, uppdatera bara inställningar
      const { error: updateError } = await supabase
        .from('business_config')
        .update({
          forward_phone_number: forward_phone_number || null,
          call_mode: call_mode || 'human_first',
          phone_setup_type: phone_setup_type || 'keep_existing',
        })
        .eq('business_id', businessId)

      if (updateError) {
        return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
      }

      return NextResponse.json({
        success: true,
        number: business.assigned_phone_number,
        message: 'Inställningar uppdaterade'
      })
    }

    // Köp nummer från 46elks via delad hjälpare (lib/phone/purchase-number)
    const result = await purchaseAndAssignNumber(supabase, businessId)

    if (!result.ok) {
      const message = result.error === 'db_save_failed'
        ? 'Failed to save number to database'
        : 'Failed to purchase number from 46elks'
      return NextResponse.json({
        error: message,
        details: result.details
      }, { status: 500 })
    }

    // Spara samtalsinställningarna (hjälparen sätter enbart nummer-fälten)
    const { error: settingsError } = await supabase
      .from('business_config')
      .update({
        forward_phone_number: forward_phone_number || null,
        call_mode: call_mode || 'human_first',
        phone_setup_type: phone_setup_type || 'keep_existing',
      })
      .eq('business_id', businessId)

    if (settingsError) {
      return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      number: result.phone_number,
      number_id: result.number_id,
      forward_to: forward_phone_number,
      message: `Telefonnummer ${result.phone_number} har tilldelats ${business.business_name}`
    })

  } catch (error: any) {
    console.error('Onboarding phone error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to provision number'
    }, { status: 500 })
  }
}
