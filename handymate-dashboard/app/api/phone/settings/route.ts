import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

/**
 * GET - Hämta telefoninställningar för ett företag
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const business_id = searchParams.get('business_id')

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('business_config')
      .select(`
        assigned_phone_number,
        forward_phone_number,
        call_recording_enabled,
        call_recording_consent_message,
        elks_number_id
      `)
      .eq('business_id', business_id)
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
 * Body: { business_id, forward_phone_number?, call_recording_enabled?, call_recording_consent_message? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      business_id,
      forward_phone_number,
      call_recording_enabled,
      call_recording_consent_message
    } = body

    if (!business_id) {
      return NextResponse.json({ error: 'Missing business_id' }, { status: 400 })
    }

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
      .eq('business_id', business_id)
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
