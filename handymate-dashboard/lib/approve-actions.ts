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

    const durationMinutes = actionData.duration_minutes || 60
    const scheduledStart = actionData.date && actionData.time
      ? `${actionData.date}T${actionData.time}:00`
      : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const scheduledEnd = new Date(
      new Date(scheduledStart).getTime() + durationMinutes * 60 * 1000
    ).toISOString()

    // Check for booking collisions
    const { data: conflictingBookings } = await supabase
      .from('booking')
      .select('booking_id, scheduled_start, scheduled_end, notes, customer:customer_id(name)')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .lt('scheduled_start', scheduledEnd)
      .gt('scheduled_end', scheduledStart)

    // Also check schedule_entry collisions
    const { data: conflictingSchedule } = await supabase
      .from('schedule_entry')
      .select('id, title, start_datetime, end_datetime')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .lt('start_datetime', scheduledEnd)
      .gt('end_datetime', scheduledStart)

    const hasBookingConflict = conflictingBookings && conflictingBookings.length > 0
    const hasScheduleConflict = conflictingSchedule && conflictingSchedule.length > 0

    if (hasBookingConflict || hasScheduleConflict) {
      // Build conflict description
      const conflicts: string[] = []
      if (hasBookingConflict) {
        for (const c of conflictingBookings!) {
          const cStart = new Date(c.scheduled_start).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
          const cEnd = new Date(c.scheduled_end).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
          const customerName = (c.customer as any)?.name || 'Okänd kund'
          conflicts.push(`Bokning: ${customerName} (${cStart}-${cEnd})`)
        }
      }
      if (hasScheduleConflict) {
        for (const c of conflictingSchedule!) {
          const cStart = new Date(c.start_datetime).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
          const cEnd = new Date(c.end_datetime).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
          conflicts.push(`Schema: ${c.title} (${cStart}-${cEnd})`)
        }
      }

      const requestedDate = new Date(scheduledStart).toLocaleDateString('sv-SE')
      const requestedTime = new Date(scheduledStart).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

      // Create a conflict notification via ai_suggestion
      await supabase.from('ai_suggestion').insert({
        business_id: businessId,
        customer_id: customerId,
        suggestion_type: 'reschedule',
        title: `Bokningskonflikt: ${actionData.service || 'Ny bokning'} ${requestedDate} kl ${requestedTime}`,
        description: `AI försökte boka ${requestedDate} kl ${requestedTime} men det krockar med:\n${conflicts.join('\n')}\n\nVänligen välj en annan tid.`,
        priority: 'high',
        status: 'pending',
        suggested_data: {
          original_suggestion_id: suggestion.suggestion_id,
          requested_start: scheduledStart,
          requested_end: scheduledEnd,
          conflicts: conflicts,
          customer_id: customerId,
          service: actionData.service,
        },
        source_text: suggestion.source_text || '',
      })

      // Create notification for the conflict
      try {
        const { notifyBookingConflict } = await import('@/lib/notifications')
        await notifyBookingConflict({
          businessId,
          customerName: actionData.customer_name || 'Kund',
          requestedDate,
          requestedTime,
          conflicts,
        })
      } catch { /* non-blocking */ }

      return {
        success: false,
        error: `Bokningskonflikt: krockar med ${conflicts.length} befintlig(a) post(er). Konfliktnotis skapad.`,
        conflict: true,
        conflicts,
      }
    }

    const { data: booking, error } = await supabase
      .from('booking')
      .insert({
        business_id: businessId,
        customer_id: customerId,
        scheduled_start: scheduledStart,
        scheduled_end: scheduledEnd,
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

    // Try AI-generated quote with full line items
    let aiQuote: any = null
    try {
      const { data: business } = await supabase
        .from('business_config')
        .select('branch, default_hourly_rate, pricing_settings')
        .eq('business_id', businessId)
        .single()

      const hourlyRate = business?.default_hourly_rate
        || (business?.pricing_settings as any)?.default_hourly_rate
        || 500

      // Fetch price list for this business
      const { data: priceListRows } = await supabase
        .from('price_list')
        .select('name, unit, unit_price, category')
        .eq('business_id', businessId)
        .limit(100)

      // Build description from suggestion context
      const description = [
        actionData.service,
        actionData.description,
        suggestion.description,
        suggestion.source_text,
      ].filter(Boolean).join('\n')

      if (description) {
        // Fetch customer-specific price list if available
        let customerPriceList: any = undefined
        if (customerId) {
          const { data: cust } = await supabase
            .from('customer')
            .select('price_list_id')
            .eq('customer_id', customerId)
            .maybeSingle()
          if (cust?.price_list_id) {
            const { data: pl } = await supabase
              .from('price_lists_v2')
              .select('*, items:price_list_items_v2(*)')
              .eq('id', cust.price_list_id)
              .single()
            if (pl) customerPriceList = pl
          }
        }

        const { generateQuoteFromInput } = await import('@/lib/ai-quote-generator')
        aiQuote = await generateQuoteFromInput({
          businessId,
          branch: business?.branch || 'Bygg',
          hourlyRate: customerPriceList?.hourly_rate_normal || hourlyRate,
          textDescription: description,
          customerId: customerId || undefined,
          priceList: priceListRows || undefined,
          customerPriceList,
        })
      }
    } catch (aiErr: any) {
      console.error('AI quote generation failed, using fallback:', aiErr.message)
    }

    // Build quote data from AI result or fallback
    const quoteData: any = {
      business_id: businessId,
      customer_id: customerId,
      status: 'draft',
      valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      source: 'ai_suggestion',
    }

    if (aiQuote && aiQuote.items && aiQuote.items.length > 0) {
      // Use AI-generated line items
      const items = aiQuote.items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unitPrice,
        total: Math.round(item.quantity * item.unitPrice * 100) / 100,
        type: item.type || 'material',
      }))

      const laborTotal = items
        .filter((i: any) => i.type === 'labor')
        .reduce((sum: number, i: any) => sum + i.total, 0)
      const materialTotal = items
        .filter((i: any) => i.type !== 'labor')
        .reduce((sum: number, i: any) => sum + i.total, 0)
      const subtotal = laborTotal + materialTotal
      const vatRate = 25
      const vat = Math.round(subtotal * (vatRate / 100) * 100) / 100
      const total = subtotal + vat

      // ROT/RUT calculation
      let rotRutType = aiQuote.suggestedDeductionType || 'none'
      let rotRutDeduction = 0
      if (rotRutType === 'rot') {
        rotRutDeduction = Math.min(Math.round(laborTotal * 0.3), 50000)
      } else if (rotRutType === 'rut') {
        rotRutDeduction = Math.min(Math.round(laborTotal * 0.5), 75000)
      }

      quoteData.title = aiQuote.jobTitle || actionData.service || 'Offert'
      quoteData.description = aiQuote.jobDescription || actionData.description || 'AI-genererad offert'
      quoteData.items = items
      quoteData.labor_total = laborTotal
      quoteData.material_total = materialTotal
      quoteData.total = subtotal
      quoteData.vat_rate = vatRate
      quoteData.vat = vat
      quoteData.total_with_vat = total
      quoteData.rot_rut_type = rotRutType !== 'none' ? rotRutType : null
      quoteData.rot_rut_deduction = rotRutDeduction
      quoteData.customer_pays = total - rotRutDeduction
      quoteData.notes = `AI-genererad offert (konfidens: ${aiQuote.confidence}%). ${aiQuote.reasoning || ''}`
    } else {
      // Fallback: basic quote without line items
      quoteData.title = actionData.service || 'Offert'
      quoteData.description = actionData.description || 'Offert skapad från samtalsanalys'
      quoteData.total = actionData.estimated_price ? parseFloat(actionData.estimated_price) : null
    }

    const { data: quote, error } = await supabase
      .from('quotes')
      .insert(quoteData)
      .select()
      .single()

    if (error) throw error
    return {
      success: true,
      quote_id: quote?.quote_id,
      ai_generated: !!aiQuote,
      items_count: aiQuote?.items?.length || 0,
    }
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

    // Notify new lead
    if (customer?.customer_id) {
      try {
        const { notifyNewLead } = await import('@/lib/notifications')
        await notifyNewLead({
          businessId,
          customerName: actionData.customer_name || 'Ny kund',
          customerId: customer.customer_id,
          source: 'samtal',
        })
      } catch { /* non-blocking */ }
    }

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
