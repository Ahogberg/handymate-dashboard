import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'

/**
 * POST - Provisionera telefonnummer under onboarding
 * Body: { businessId: string, forward_phone_number: string, call_mode: string, phone_setup_type: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { businessId, forward_phone_number, call_mode, phone_setup_type } = await request.json()

    if (!businessId) {
      return NextResponse.json({ error: 'Missing businessId' }, { status: 400 })
    }

    // Verifiera att businessId finns och skapades nyligen (inom 1 timme)
    const { data: business, error: fetchError } = await supabase
      .from('business_config')
      .select('business_id, assigned_phone_number, business_name, created_at')
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
      }).catch(() => {})

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
