import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST - Godkänn ett AI-förslag och utför åtgärden
 * Body: { suggestion_id: string, action_data?: object }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabase()
    const { suggestion_id, action_data } = await request.json()

    if (!suggestion_id) {
      return NextResponse.json({ error: 'Missing suggestion_id' }, { status: 400 })
    }

    // Hämta förslaget
    const { data: suggestion, error: fetchError } = await supabase
      .from('ai_suggestion')
      .select(`
        *,
        call_recording (
          phone_number,
          customer_id,
          customer (
            customer_id,
            name,
            phone_number,
            email,
            address
          )
        )
      `)
      .eq('suggestion_id', suggestion_id)
      .single()

    if (fetchError || !suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
    }

    if (suggestion.status !== 'pending') {
      return NextResponse.json({ error: 'Suggestion already processed' }, { status: 400 })
    }

    // Merge action_data om det skickades med
    const finalActionData = action_data || suggestion.action_data || {}

    // Utför åtgärden baserat på typ
    let result: any = { success: true }
    let message = 'Förslag godkänt'

    switch (suggestion.suggestion_type) {
      case 'booking':
        result = await createBooking(supabase, suggestion, finalActionData)
        message = result.success ? 'Bokning skapad!' : result.error
        break

      case 'quote':
        result = await createQuote(supabase, suggestion, finalActionData)
        message = result.success ? 'Offert skapad!' : result.error
        break

      case 'follow_up':
      case 'callback':
        result = await createFollowUp(supabase, suggestion, finalActionData)
        message = result.success ? 'Uppföljning schemalagd!' : result.error
        break

      case 'sms':
        result = await sendSMS(suggestion, finalActionData)
        message = result.success ? 'SMS skickat!' : result.error
        break

      case 'reminder':
        result = await createReminder(supabase, suggestion, finalActionData)
        message = result.success ? 'Påminnelse skapad!' : result.error
        break

      case 'reschedule':
        result = await rescheduleBooking(supabase, suggestion, finalActionData)
        message = result.success ? 'Bokning flyttad!' : result.error
        break

      default:
        // Markera bara som godkänt
        break
    }

    // Uppdatera förslaget
    const newStatus = result.success ? 'completed' : 'approved'

    await supabase
      .from('ai_suggestion')
      .update({
        status: newStatus,
        approved_at: new Date().toISOString(),
        completed_at: result.success ? new Date().toISOString() : null,
        action_data: { ...finalActionData, result }
      })
      .eq('suggestion_id', suggestion_id)

    return NextResponse.json({
      success: result.success,
      message,
      result
    })

  } catch (error: any) {
    console.error('Approve suggestion error:', error)
    return NextResponse.json({
      error: error.message || 'Failed to approve suggestion'
    }, { status: 500 })
  }
}

/**
 * Skapa en bokning
 */
async function createBooking(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const businessId = suggestion.business_id
    let customerId = suggestion.customer_id

    // Skapa kund om det inte finns
    if (!customerId && actionData.customer_name) {
      const { data: newCustomer } = await supabase
        .from('customer')
        .insert({
          business_id: businessId,
          name: actionData.customer_name,
          phone_number: actionData.phone_number || suggestion.call_recording?.phone_number,
          email: actionData.email || null,
          address: actionData.address || null
        })
        .select('customer_id')
        .single()

      customerId = newCustomer?.customer_id
    }

    // Skapa bokning
    const scheduledStart = actionData.date && actionData.time
      ? `${actionData.date}T${actionData.time}:00`
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Default: imorgon

    const { data: booking, error } = await supabase
      .from('booking')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        scheduled_start: scheduledStart,
        scheduled_end: new Date(new Date(scheduledStart).getTime() + 60 * 60 * 1000).toISOString(), // +1 timme
        status: 'pending',
        notes: `${actionData.service || 'Tjänst'} - Skapad från AI-förslag`,
        source: 'ai_suggestion'
      })
      .select()
      .single()

    if (error) throw error

    return { success: true, booking_id: booking?.booking_id }

  } catch (error: any) {
    console.error('Create booking error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Skapa en offert
 */
async function createQuote(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const businessId = suggestion.business_id
    let customerId = suggestion.customer_id

    // Skapa kund om det inte finns
    if (!customerId && (actionData.customer_name || suggestion.call_recording?.phone_number)) {
      const { data: newCustomer } = await supabase
        .from('customer')
        .insert({
          business_id: businessId,
          name: actionData.customer_name || 'Ny kund',
          phone_number: actionData.phone_number || suggestion.call_recording?.phone_number,
          address: actionData.address || null
        })
        .select('customer_id')
        .single()

      customerId = newCustomer?.customer_id
    }

    // Skapa offert
    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        status: 'draft',
        title: actionData.service || 'Offert',
        description: actionData.description || `Offert skapad från samtalsanalys`,
        total_amount: actionData.estimated_price ? parseFloat(actionData.estimated_price) : null,
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 dagar
        source: 'ai_suggestion'
      })
      .select()
      .single()

    if (error) throw error

    return { success: true, quote_id: quote?.quote_id }

  } catch (error: any) {
    console.error('Create quote error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Skapa en uppföljning
 */
async function createFollowUp(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const { error } = await supabase
      .from('human_followup_queue')
      .insert({
        business_id: suggestion.business_id,
        case_id: null,
        customer_id: suggestion.customer_id,
        reason: actionData.reason || suggestion.title || 'Uppföljning från AI-förslag',
        priority: suggestion.priority || 'normal',
        notes: suggestion.description,
        queued_at: new Date().toISOString()
      })

    if (error) throw error

    return { success: true }

  } catch (error: any) {
    console.error('Create follow-up error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Skicka SMS
 */
async function sendSMS(suggestion: any, actionData: any) {
  try {
    const phoneNumber = actionData.phone_number ||
      suggestion.call_recording?.phone_number ||
      suggestion.call_recording?.customer?.phone_number

    if (!phoneNumber) {
      return { success: false, error: 'Inget telefonnummer' }
    }

    const message = actionData.message_template || actionData.message || suggestion.description

    if (!message) {
      return { success: false, error: 'Inget meddelande' }
    }

    // Skicka via 46elks
    const ELKS_API_USER = process.env.ELKS_API_USER
    const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

    if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
      return { success: false, error: '46elks inte konfigurerat' }
    }

    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        from: 'Handymate',
        to: phoneNumber,
        message: message
      }).toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`SMS failed: ${errorText}`)
    }

    return { success: true }

  } catch (error: any) {
    console.error('Send SMS error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Skapa påminnelse
 */
async function createReminder(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    // För nu, skapa som uppföljning
    return await createFollowUp(supabase, suggestion, {
      ...actionData,
      reason: actionData.reason || `Påminnelse: ${suggestion.title}`
    })

  } catch (error: any) {
    console.error('Create reminder error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Flytta/omboka en bokning
 */
async function rescheduleBooking(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const businessId = suggestion.business_id
    const customerId = suggestion.customer_id

    // Hitta befintlig bokning för kunden
    let bookingId = actionData.booking_id

    if (!bookingId && customerId) {
      // Hitta senaste aktiva bokning för denna kund
      const { data: existingBooking } = await supabase
        .from('booking')
        .select('booking_id, scheduled_start')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .in('status', ['pending', 'confirmed'])
        .order('scheduled_start', { ascending: true })
        .limit(1)
        .single()

      if (existingBooking) {
        bookingId = existingBooking.booking_id
      }
    }

    if (!bookingId) {
      return { success: false, error: 'Ingen bokning hittades att flytta' }
    }

    // Beräkna ny tid
    const newDate = actionData.requested_date || actionData.date
    const newTime = actionData.requested_time || actionData.time

    if (!newDate && !newTime) {
      return { success: false, error: 'Inget nytt datum/tid angivet' }
    }

    // Hämta befintlig bokning för att behålla duration
    const { data: currentBooking } = await supabase
      .from('booking')
      .select('scheduled_start, scheduled_end')
      .eq('booking_id', bookingId)
      .single()

    if (!currentBooking) {
      return { success: false, error: 'Kunde inte hitta bokningen' }
    }

    const oldStart = new Date(currentBooking.scheduled_start)
    const oldEnd = new Date(currentBooking.scheduled_end)
    const durationMs = oldEnd.getTime() - oldStart.getTime()

    // Bygg ny starttid
    let newScheduledStart: Date
    if (newDate && newTime) {
      newScheduledStart = new Date(`${newDate}T${newTime}:00`)
    } else if (newDate) {
      // Behåll samma tid, nytt datum
      newScheduledStart = new Date(newDate)
      newScheduledStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0)
    } else {
      // Behåll samma datum, ny tid
      newScheduledStart = new Date(oldStart)
      const [hours, minutes] = newTime!.split(':').map(Number)
      newScheduledStart.setHours(hours, minutes, 0, 0)
    }

    const newScheduledEnd = new Date(newScheduledStart.getTime() + durationMs)

    // Uppdatera bokningen
    const { error: updateError } = await supabase
      .from('booking')
      .update({
        scheduled_start: newScheduledStart.toISOString(),
        scheduled_end: newScheduledEnd.toISOString(),
        notes: `${actionData.reason ? `Ombokad: ${actionData.reason}` : 'Ombokad via AI-förslag'}`
      })
      .eq('booking_id', bookingId)

    if (updateError) throw updateError

    // Skicka bekräftelse-SMS om vi har telefonnummer
    const phoneNumber = actionData.phone_number ||
      suggestion.call_recording?.phone_number ||
      suggestion.call_recording?.customer?.phone_number

    if (phoneNumber) {
      const ELKS_API_USER = process.env.ELKS_API_USER
      const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

      if (ELKS_API_USER && ELKS_API_PASSWORD) {
        const formattedDate = newScheduledStart.toLocaleDateString('sv-SE')
        const formattedTime = newScheduledStart.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

        await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            from: 'Handymate',
            to: phoneNumber,
            message: `Din bokning har flyttats till ${formattedDate} kl ${formattedTime}. Välkommen!`
          }).toString()
        })
      }
    }

    return {
      success: true,
      booking_id: bookingId,
      new_time: newScheduledStart.toISOString()
    }

  } catch (error: any) {
    console.error('Reschedule booking error:', error)
    return { success: false, error: error.message }
  }
}
