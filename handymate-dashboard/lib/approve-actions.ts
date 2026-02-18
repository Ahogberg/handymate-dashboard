import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Shared action execution for AI suggestion approval.
 * Used by both manual approve (/api/suggestions/approve) and auto-approve (lib/auto-approve.ts).
 */

export async function executeApproveAction(
  supabase: SupabaseClient,
  suggestion: any,
  actionData: any
): Promise<{ success: boolean; error?: string; [key: string]: any }> {
  switch (suggestion.suggestion_type) {
    case 'booking':
      return createBooking(supabase, suggestion, actionData)
    case 'quote':
      return createQuote(supabase, suggestion, actionData)
    case 'follow_up':
    case 'callback':
      return createFollowUp(supabase, suggestion, actionData)
    case 'sms':
      return sendSMS(suggestion, actionData)
    case 'reminder':
      return createReminder(supabase, suggestion, actionData)
    case 'reschedule':
      return rescheduleBooking(supabase, suggestion, actionData)
    case 'create_customer':
      return createCustomer(supabase, suggestion, actionData)
    default:
      return { success: true }
  }
}

async function createBooking(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const businessId = suggestion.business_id
    let customerId = suggestion.customer_id

    if (!customerId && actionData.customer_name) {
      const { data: newCustomer } = await supabase
        .from('customer')
        .insert({
          business_id: businessId,
          name: actionData.customer_name,
          phone_number: actionData.phone_number || suggestion.call_recording?.phone_number,
          email: actionData.email || null,
          address: actionData.address || null,
        })
        .select('customer_id')
        .single()
      customerId = newCustomer?.customer_id
    }

    const scheduledStart = actionData.date && actionData.time
      ? `${actionData.date}T${actionData.time}:00`
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    const { data: booking, error } = await supabase
      .from('booking')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        scheduled_start: scheduledStart,
        scheduled_end: new Date(new Date(scheduledStart).getTime() + 60 * 60 * 1000).toISOString(),
        status: 'pending',
        notes: `${actionData.service || 'Tjänst'} - Skapad från AI-förslag`,
        source: 'ai_suggestion',
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, booking_id: booking?.booking_id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function createQuote(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const businessId = suggestion.business_id
    let customerId = suggestion.customer_id

    if (!customerId && (actionData.customer_name || suggestion.call_recording?.phone_number)) {
      const { data: newCustomer } = await supabase
        .from('customer')
        .insert({
          business_id: businessId,
          name: actionData.customer_name || 'Ny kund',
          phone_number: actionData.phone_number || suggestion.call_recording?.phone_number,
          address: actionData.address || null,
        })
        .select('customer_id')
        .single()
      customerId = newCustomer?.customer_id
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        status: 'draft',
        title: actionData.service || 'Offert',
        description: actionData.description || 'Offert skapad från samtalsanalys',
        total_amount: actionData.estimated_price ? parseFloat(actionData.estimated_price) : null,
        valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        source: 'ai_suggestion',
      })
      .select()
      .single()

    if (error) throw error
    return { success: true, quote_id: quote?.quote_id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

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
        queued_at: new Date().toISOString(),
      })
    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function sendSMS(suggestion: any, actionData: any) {
  try {
    const phoneNumber = actionData.phone_number ||
      suggestion.call_recording?.phone_number ||
      suggestion.call_recording?.customer?.phone_number

    if (!phoneNumber) return { success: false, error: 'Inget telefonnummer' }

    const message = actionData.message_template || actionData.message || suggestion.description
    if (!message) return { success: false, error: 'Inget meddelande' }

    const ELKS_API_USER = process.env.ELKS_API_USER
    const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
    if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
      return { success: false, error: '46elks inte konfigurerat' }
    }

    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: 'Handymate',
        to: phoneNumber,
        message: message,
      }).toString(),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`SMS failed: ${errorText}`)
    }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function createReminder(supabase: SupabaseClient, suggestion: any, actionData: any) {
  return createFollowUp(supabase, suggestion, {
    ...actionData,
    reason: actionData.reason || `Påminnelse: ${suggestion.title}`,
  })
}

async function createCustomer(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const businessId = suggestion.business_id
    const phone = actionData.phone_number || suggestion.call_recording?.phone_number

    // Check if customer already exists
    if (phone) {
      const { data: existing } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', businessId)
        .eq('phone_number', phone)
        .single()

      if (existing) {
        return { success: true, customer_id: existing.customer_id, already_exists: true }
      }
    }

    const { data: customer, error } = await supabase
      .from('customer')
      .insert({
        business_id: businessId,
        name: actionData.customer_name || 'Ny kund',
        phone_number: phone || null,
        email: actionData.email || null,
        address_line: actionData.address || null,
      })
      .select('customer_id')
      .single()

    if (error) throw error
    return { success: true, customer_id: customer?.customer_id }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

async function rescheduleBooking(supabase: SupabaseClient, suggestion: any, actionData: any) {
  try {
    const businessId = suggestion.business_id
    const customerId = suggestion.customer_id
    let bookingId = actionData.booking_id

    if (!bookingId && customerId) {
      const { data: existingBooking } = await supabase
        .from('booking')
        .select('booking_id, scheduled_start')
        .eq('business_id', businessId)
        .eq('customer_id', customerId)
        .in('status', ['pending', 'confirmed'])
        .order('scheduled_start', { ascending: true })
        .limit(1)
        .single()

      if (existingBooking) bookingId = existingBooking.booking_id
    }

    if (!bookingId) return { success: false, error: 'Ingen bokning hittades att flytta' }

    const newDate = actionData.requested_date || actionData.date
    const newTime = actionData.requested_time || actionData.time
    if (!newDate && !newTime) return { success: false, error: 'Inget nytt datum/tid angivet' }

    const { data: currentBooking } = await supabase
      .from('booking')
      .select('scheduled_start, scheduled_end')
      .eq('booking_id', bookingId)
      .single()

    if (!currentBooking) return { success: false, error: 'Kunde inte hitta bokningen' }

    const oldStart = new Date(currentBooking.scheduled_start)
    const oldEnd = new Date(currentBooking.scheduled_end)
    const durationMs = oldEnd.getTime() - oldStart.getTime()

    let newScheduledStart: Date
    if (newDate && newTime) {
      newScheduledStart = new Date(`${newDate}T${newTime}:00`)
    } else if (newDate) {
      newScheduledStart = new Date(newDate)
      newScheduledStart.setHours(oldStart.getHours(), oldStart.getMinutes(), 0, 0)
    } else {
      newScheduledStart = new Date(oldStart)
      const [hours, minutes] = newTime!.split(':').map(Number)
      newScheduledStart.setHours(hours, minutes, 0, 0)
    }

    const newScheduledEnd = new Date(newScheduledStart.getTime() + durationMs)

    const { error: updateError } = await supabase
      .from('booking')
      .update({
        scheduled_start: newScheduledStart.toISOString(),
        scheduled_end: newScheduledEnd.toISOString(),
        notes: actionData.reason ? `Ombokad: ${actionData.reason}` : 'Ombokad via AI-förslag',
      })
      .eq('booking_id', bookingId)

    if (updateError) throw updateError

    // Send confirmation SMS
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
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: 'Handymate',
            to: phoneNumber,
            message: `Din bokning har flyttats till ${formattedDate} kl ${formattedTime}. Välkommen!`,
          }).toString(),
        })
      }
    }

    return { success: true, booking_id: bookingId, new_time: newScheduledStart.toISOString() }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
