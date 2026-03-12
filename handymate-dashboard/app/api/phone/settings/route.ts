import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness, checkPhoneApiRateLimit } from '@/lib/auth'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

async function updateElksWebhooks(elksNumberId: string) {
  const res = await fetch(`https://api.46elks.com/a1/numbers/${elksNumberId}`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      voice_start: `${APP_URL}/api/voice/incoming`,
      sms_url: `${APP_URL}/api/sms/incoming`,
    }).toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`46elks update failed: ${text}`)
  }
  return res.json()
}

/**
 * GET - Hämta telefoninställningar för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    // Auth check
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('business_config')
      .select(`
        assigned_phone_number,
        forward_phone_number,
        call_recording_enabled,
        call_recording_consent_message,
        elks_number_id
      `)
      .eq('business_id', authBusiness.business_id)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    return NextResponse.json(data)

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH - Uppdatera telefoninställningar
 * Body: { forward_phone_number?, call_recording_enabled?, call_recording_consent_message? }
 */
export async function PATCH(request: NextRequest) {
  try {
    // Auth check
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Rate limit check (46elks API may be called for updates)
    const rateLimit = checkPhoneApiRateLimit(authBusiness.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const {
      forward_phone_number,
      call_recording_enabled,
      call_recording_consent_message
    } = body

    // Bygg update-objekt med endast angivna fält
    const updateData: any = {}

    if (forward_phone_number !== undefined) {
      updateData.forward_phone_number = forward_phone_number
    }

    if (call_recording_enabled !== undefined) {
      updateData.call_recording_enabled = call_recording_enabled
    }

    if (call_recording_consent_message !== undefined) {
      updateData.call_recording_consent_message = call_recording_consent_message
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('business_config')
      .update(updateData)
      .eq('business_id', authBusiness.business_id)
      .select(`
        assigned_phone_number,
        forward_phone_number,
        call_recording_enabled,
        call_recording_consent_message
      `)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      settings: data
    })

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Synka webhook-URL:er på 46elks med den nuvarande APP_URL.
 * Används när numret provisionerats med fel URL, eller när domänen ändrats.
 */
export async function POST(request: NextRequest) {
  try {
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = checkPhoneApiRateLimit(authBusiness.business_id)
    if (!rateLimit.allowed) {
      return NextResponse.json({ error: rateLimit.error }, { status: 429 })
    }

    const supabase = getServerSupabase()
    const { data: business } = await supabase
      .from('business_config')
      .select('elks_number_id, assigned_phone_number')
      .eq('business_id', authBusiness.business_id)
      .single()

    if (!business?.elks_number_id) {
      return NextResponse.json({ error: 'No phone number provisioned' }, { status: 400 })
    }

    const updated = await updateElksWebhooks(business.elks_number_id)

    console.log('[Phone Settings] Webhooks resynced:', updated)

    return NextResponse.json({
      success: true,
      sms_url: `${APP_URL}/api/sms/incoming`,
      voice_start: `${APP_URL}/api/voice/incoming`,
      elks_response: updated,
    })

  } catch (error: any) {
    console.error('[Phone Settings] Resync error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
