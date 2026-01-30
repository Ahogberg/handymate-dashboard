import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
const ELKS_PHONE_NUMBER = process.env.ELKS_PHONE_NUMBER || '+46766867337'

async function getBusinessId(providedId?: string): Promise<string> {
  if (providedId) return providedId
  const cookieStore = await cookies()
  const businessId = cookieStore.get('business_id')?.value
  if (!businessId) throw new Error('Inte inloggad')
  return businessId
}

export async function POST(request: NextRequest) {
  try {
    const { action, data } = await request.json()

    switch (action) {
      case 'send_sms': {
        const { to, message } = data
        
        const response = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: 'Handymate',
            to: to,
            message: message,
          }),
        })

        const result = await response.json()
        if (!response.ok) throw new Error(result.message || 'Failed to send SMS')
        return NextResponse.json({ success: true, smsId: result.id })
      }

      case 'initiate_call': {
        const { to } = data
        
        const response = await fetch('https://api.46elks.com/a1/calls', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: ELKS_PHONE_NUMBER,
            to: to,
            voice_start: JSON.stringify({ connect: '+46708379552' }),
          }),
        })

        const result = await response.json()
        if (!response.ok) throw new Error(result.message || 'Failed to initiate call')
        return NextResponse.json({ success: true, callId: result.id })
      }

      case 'mark_resolved': {
        const { queueId, notes } = data
        
        const { error } = await supabase
          .from('human_followup_queue')
          .update({
            resolved_at: new Date().toISOString(),
            resolution_notes: notes || 'Markerad som klar',
          })
          .eq('queue_id', queueId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'update_case_status': {
        const { caseId, status } = data
        
        const { error } = await supabase
          .from('case_record')
          .update({
            status: status,
            updated_at: new Date().toISOString(),
          })
          .eq('case_id', caseId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'create_customer': {
        const { name, phone_number, email, address_line, businessId } = data
        const business_id = await getBusinessId(businessId)
        
        const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
        
        const { error } = await supabase
          .from('customer')
          .insert({
            customer_id: customerId,
            business_id: business_id,
            name,
            phone_number,
            email: email || null,
            address_line: address_line || null,
            created_at: new Date().toISOString(),
          })

        if (error) throw error
        return NextResponse.json({ success: true, customerId })
      }

      case 'update_customer': {
        const { customerId, name, phone_number, email, address_line } = data
        
        const { error } = await supabase
          .from('customer')
          .update({
            name,
            phone_number,
            email: email || null,
            address_line: address_line || null,
          })
          .eq('customer_id', customerId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'delete_customer': {
        const { customerId } = data
        
        const { error } = await supabase
          .from('customer')
          .delete()
          .eq('customer_id', customerId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

case 'create_booking': {
  const { customerId, scheduledStart, scheduledEnd, notes, businessId } = data
  const business_id = await getBusinessId(businessId)
  
  const bookingId = 'book_' + Math.random().toString(36).substr(2, 9)
  
  // Skapa bokning
  const { error } = await supabase
    .from('booking')
    .insert({
      booking_id: bookingId,
      business_id: business_id,
      customer_id: customerId,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      status: 'confirmed',
      notes: notes || null,
      created_at: new Date().toISOString(),
    })

  if (error) throw error

  // Hämta kund och företagsinfo för SMS
  const { data: customer } = await supabase
    .from('customer')
    .select('name, phone_number')
    .eq('customer_id', customerId)
    .single()

  const { data: businessConfig } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', business_id)
    .single()

  // Skicka bekräftelse-SMS
  if (customer?.phone_number && businessConfig?.business_name) {
    const bookingDate = new Date(scheduledStart)
    const dateStr = bookingDate.toLocaleDateString('sv-SE', { 
      weekday: 'long', 
      day: 'numeric', 
      month: 'long' 
    })
    const timeStr = bookingDate.toLocaleTimeString('sv-SE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })

    const message = `Hej${customer.name ? ' ' + customer.name.split(' ')[0] : ''}! Din tid hos ${businessConfig.business_name} är bokad: ${dateStr} kl ${timeStr}. Välkommen! Svara på detta SMS om du behöver ändra tiden.`

    try {
      await fetch('https://api.46elks.com/a1/sms', {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: businessConfig.business_name.substring(0, 11),
          to: customer.phone_number,
          message: message,
        }),
      })
    } catch (smsError) {
      console.error('Failed to send confirmation SMS:', smsError)
      // Fortsätt ändå - bokningen är skapad
    }
  }

  return NextResponse.json({ success: true, bookingId })
}

      case 'update_booking': {
        const { bookingId, scheduledStart, scheduledEnd, status, notes } = data
        
        const { error } = await supabase
          .from('booking')
          .update({
            scheduled_start: scheduledStart,
            scheduled_end: scheduledEnd,
            status,
            notes,
            updated_at: new Date().toISOString(),
          })
          .eq('booking_id', bookingId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'delete_booking': {
        const { bookingId } = data
        
        const { error } = await supabase
          .from('booking')
          .delete()
          .eq('booking_id', bookingId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('Action error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
