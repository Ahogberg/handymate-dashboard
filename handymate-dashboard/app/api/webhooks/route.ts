import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const body = await request.json()

    console.log('Webhook received:', body)

    // Hantera olika event-typer
    const { event, data } = body

    switch (event) {
      case 'call_ended':
        // Spara samtalsdata
        await handleCallEnded(supabase, data)
        break

      case 'booking_created':
        // Ny bokning skapad
        await handleBookingCreated(supabase, data)
        break

      case 'booking_confirmed':
        // Bokning bekräftad - skicka SMS
        await handleBookingConfirmed(supabase, data)
        break

      default:
        console.log('Unknown event type:', event)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook failed' }, { status: 500 })
  }
}

async function handleCallEnded(supabase: SupabaseClient, data: any) {
  // Logga eventet
  await supabase.from('events').insert({
    business_id: data.business_id || 'elexperten_sthlm',
    event_type: 'call_ended',
    entity_type: 'call',
    entity_id: data.call_id,
    data: data,
  })
}

async function handleBookingCreated(supabase: SupabaseClient, data: any) {
  // Logga eventet
  await supabase.from('events').insert({
    business_id: data.business_id,
    event_type: 'booking_created',
    entity_type: 'booking',
    entity_id: data.booking_id,
    data: data,
  })
}

async function handleBookingConfirmed(supabase: SupabaseClient, data: any) {
  // Logga eventet
  await supabase.from('events').insert({
    business_id: data.business_id,
    event_type: 'booking_confirmed',
    entity_type: 'booking',
    entity_id: data.booking_id,
    data: data,
  })

  // TODO: Trigga SMS-bekräftelse via n8n eller direkt
}
