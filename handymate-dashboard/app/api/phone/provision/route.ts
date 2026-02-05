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
 * POST - Köp och tilldela ett telefonnummer till ett företag
 * Body: { business_id: string, forward_phone_number: string, country?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { business_id, forward_phone_number, country = 'se' } = await request.json()

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    if (!forward_phone_number) {
      return NextResponse.json({ error: 'Missing forward_phone_number' }, { status: 400 })
    }

    // Kolla om företaget redan har ett nummer
    const { data: business, error: fetchError } = await supabase
      .from('business_config')
      .select('business_id, assigned_phone_number, business_name')
      .eq('business_id', business_id)
      .single()

    if (fetchError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (business.assigned_phone_number) {
      return NextResponse.json({
        error: 'Business already has an assigned phone number',
        existing_number: business.assigned_phone_number
      }, { status: 400 })
    }

    // Köp nummer från 46elks
    console.log('Purchasing number from 46elks...')

    const purchaseResponse = await fetch('https://api.46elks.com/a1/numbers', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        country: country,
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

    /*
    46elks response format:
    {
      "id": "nxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
      "number": "+46766861234",
      "country": "se",
      "voice_start": "https://...",
      "sms_url": "https://...",
      "active": "yes"
    }
    */

    // Spara numret i business_config
    const { error: updateError } = await supabase
      .from('business_config')
      .update({
        assigned_phone_number: numberData.number,
        forward_phone_number: forward_phone_number,
        elks_number_id: numberData.id,
        call_recording_enabled: true,
        call_recording_consent_message: 'Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål.'
      })
      .eq('business_id', business_id)

    if (updateError) {
      console.error('Database update error:', updateError)
      // Försök ta bort numret från 46elks om vi inte kunde spara
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
    console.error('Provision error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to provision number'
    }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort/avaktivera ett telefonnummer
 * Query: ?business_id=xxx
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { searchParams } = new URL(request.url)
    const business_id = searchParams.get('business_id')

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    // Hämta numret
    const { data: business, error: fetchError } = await supabase
      .from('business_config')
      .select('elks_number_id, assigned_phone_number')
      .eq('business_id', business_id)
      .single()

    if (fetchError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    if (!business.elks_number_id) {
      return NextResponse.json({ error: 'No phone number assigned' }, { status: 400 })
    }

    // Avaktivera numret hos 46elks (sätter active=no)
    const deactivateResponse = await fetch(`https://api.46elks.com/a1/numbers/${business.elks_number_id}`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'active=no'
    })

    if (!deactivateResponse.ok) {
      console.error('Failed to deactivate number at 46elks')
    }

    // Ta bort från databasen
    const { error: updateError } = await supabase
      .from('business_config')
      .update({
        assigned_phone_number: null,
        elks_number_id: null
      })
      .eq('business_id', business_id)

    if (updateError) {
      return NextResponse.json({
        error: 'Failed to update database',
        details: updateError.message
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Telefonnummer ${business.assigned_phone_number} har tagits bort`
    })

  } catch (error: any) {
    console.error('Deprovision error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to remove number'
    }, { status: 500 })
  }
}
