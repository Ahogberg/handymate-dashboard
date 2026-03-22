import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

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

    // Köp nummer från 46elks
    console.log('Purchasing number from 46elks for onboarding...')

    const purchaseResponse = await fetch('https://api.46elks.com/a1/numbers', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        country: 'se',
        voice_start: `${APP_URL}/api/voice/incoming`,
        sms_url: `${APP_URL}/api/sms/incoming`
      }).toString()
    })

    if (!purchaseResponse.ok) {
      const errorText = await purchaseResponse.text()
      console.error('46elks purchase error:', errorText)
      return NextResponse.json({
        error: 'Failed to purchase number from 46elks',
        details: errorText
      }, { status: 500 })
    }

    const numberData = await purchaseResponse.json()
    console.log('Number purchased:', numberData)

    // Spara numret i business_config
    const { error: updateError } = await supabase
      .from('business_config')
      .update({
        assigned_phone_number: numberData.number,
        forward_phone_number: forward_phone_number || null,
        elks_number_id: numberData.id,
        call_recording_enabled: true,
        call_recording_consent_message: 'Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål.',
        call_mode: call_mode || 'human_first',
        phone_setup_type: phone_setup_type || 'keep_existing',
      })
      .eq('business_id', businessId)

    if (updateError) {
      console.error('Database update error:', updateError)
      // Försök ta bort numret från 46elks
      await fetch(`https://api.46elks.com/a1/numbers/${numberData.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64')
        }
      })

      return NextResponse.json({
        error: 'Failed to save number to database',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      number: numberData.number,
      number_id: numberData.id,
      forward_to: forward_phone_number,
      message: `Telefonnummer ${numberData.number} har tilldelats ${business.business_name}`
    })

  } catch (error: any) {
    console.error('Onboarding phone error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to provision number'
    }, { status: 500 })
  }
}
