import { NextRequest, NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { checkSmsRateLimitDb } from '@/lib/rate-limit-db'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { createQuote as createCanonicalQuote } from '@/lib/quotes/create-quote'

/**
 * POST - Godkänn ett AI-förslag och utför åtgärden
 * Body: { suggestion_id: string, action_data?: object }
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver owner eller admin
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !isOwnerOrAdmin(currentUser)) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const { suggestion_id, action_data } = await request.json()

    if (!suggestion_id) {
      return NextResponse.json({ error: 'Missing suggestion_id' }, { status: 400 })
    }

    // Hämta förslaget och verifiera ägarskap
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
      .eq('business_id', authBusiness.business_id)
      .single()

    if (fetchError || !suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 })
    }

    if (suggestion.status !== 'pending') {
      return NextResponse.json({ error: 'Suggestion already processed' }, { status: 400 })
    }

    // Check SMS rate limit if the action involves sending SMS
    if (suggestion.suggestion_type === 'sms' || suggestion.suggestion_type === 'reschedule') {
      const smsLimit = await checkSmsRateLimitDb(authBusiness.business_id)
      if (!smsLimit.allowed) {
        return NextResponse.json({ error: smsLimit.error }, { status: 429 })
      }
    }

    // Merge action_data om det skickades med
    const finalActionData = action_data || suggestion.suggested_data || {}

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
        result = await sendSMS(supabase, suggestion, finalActionData)
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

    const { error: suggestionUpdateError } = await supabase
      .from('ai_suggestion')
      .update({
        status: newStatus,
        actioned_at: new Date().toISOString(),
        suggested_data: { ...finalActionData, result }
      })
      .eq('suggestion_id', suggestion_id)
      .eq('business_id', authBusiness.business_id)

    if (suggestionUpdateError) {
      console.error('[suggestions/approve] status update failed:', suggestionUpdateError.message)
      return NextResponse.json({ error: 'Åtgärden utfördes men förslagsstatus kunde inte sparas' }, { status: 500 })
    }

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

    // Skapa offert via den kanoniska byggaren — utan den saknade utkastet
    // både nummer och sign_token och gick inte att länka i något utskick.
    const skapad = await createCanonicalQuote(supabase, businessId, {
      customerId: customerId ?? null,
      title: actionData.service || 'Offert',
      description: actionData.description || `Offert skapad från samtalsanalys`,
      source: 'system',
      extra: {
        total: actionData.estimated_price ? parseFloat(actionData.estimated_price) : null,
        source: 'ai_suggestion',
      },
    })

    if (!skapad.success) throw new Error(skapad.error)

    return { success: true, quote_id: skapad.quoteId }

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
    // Samma regel som i lib/approve-actions.ts (den här filen är en kopia):
    // uppföljningen landar i tasksystemet där någon tittar — aldrig i den
    // gamla kön utan läsare (bekräftad tyst läcka, se
    // tasks/rapport-human-followup-queue.md). visibility 'team' är
    // obligatoriskt: en rad utan skapare/tilldelad med 'private' syns inte
    // för någon (v42-regeln). Låses av tests/followup-landar.spec.ts.
    const prioritet =
      suggestion.priority === 'high' || suggestion.priority === 'urgent' ? 'high'
      : suggestion.priority === 'low' ? 'low'
      : 'medium'

    const { error } = await supabase
      .from('task')
      .insert({
        business_id: suggestion.business_id,
        title: actionData.reason || suggestion.title || 'Uppföljning från AI-förslag',
        description: suggestion.description || null,
        status: 'pending',
        priority: prioritet,
        customer_id: suggestion.customer_id || null,
        visibility: 'team',
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
async function sendSMS(supabase: SupabaseClient, suggestion: any, actionData: any) {
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

    // ═══ GENOM STRYPUNKTEN (etapp 0 batch 2, 2026-08-08) ═══
    //
    // OBS: den här funktionen är en KOPIA av sendSMS i lib/approve-actions.ts,
    // som i sitt filhuvud påstår sig användas av både manuell och automatisk
    // godkännande — men rutten anropar den inte. Manuell och automatisk väg
    // har alltså varsin implementation av samtliga sex handlers och kan glida
    // isär. Sammanslagningen hör inte hemma i en SMS-batch; den är noterad.
    //
    // Avsändaren var hårdkodad till 'Handymate' — kunden såg vår produkt som
    // avsändare i stället för sin hantverkare.
    const { data: biz } = await supabase
      .from('business_config')
      .select('business_name')
      .eq('business_id', suggestion.business_id)
      .maybeSingle()

    const { sendSmsViaElks } = await import('@/lib/sms-send')
    const r = await sendSmsViaElks({
      supabase,
      businessId: suggestion.business_id,
      businessName: biz?.business_name,
      to: phoneNumber,
      message,
      customerId: suggestion.call_recording?.customer?.customer_id || null,
      messageType: 'suggestion_sms',
      recipient: 'customer',
      purpose: 'conversational',
    })

    if (!r.success) {
      const errorText = r.error || 'okänt fel'
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
      // Genom strypunkten (etapp 0 batch 2) — se noten i sendSMS ovan om att
      // den här filen är en kopia av lib/approve-actions.ts.
      const formattedDate = newScheduledStart.toLocaleDateString('sv-SE')
      const formattedTime = newScheduledStart.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })

      const { data: biz } = await supabase
        .from('business_config')
        .select('business_name')
        .eq('business_id', suggestion.business_id)
        .maybeSingle()

      const { sendSmsViaElks } = await import('@/lib/sms-send')
      const r = await sendSmsViaElks({
        supabase,
        businessId: suggestion.business_id,
        businessName: biz?.business_name,
        to: phoneNumber,
        message: `Din bokning har flyttats till ${formattedDate} kl ${formattedTime}. Välkommen!`,
        customerId: suggestion.call_recording?.customer?.customer_id || null,
        relatedId: bookingId,
        messageType: 'reschedule',
        recipient: 'customer',
        purpose: 'transactional',
      })
      // Icke-blockerande: ombokningen är redan skriven i databasen.
      if (!r.success) console.error('[suggestions/approve] ombokningsbekräftelse misslyckades:', r.error)
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
