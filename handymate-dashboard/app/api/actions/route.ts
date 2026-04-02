import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness, checkSmsRateLimit, checkPhoneApiRateLimit } from '@/lib/auth'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
const ELKS_PHONE_NUMBER = process.env.ELKS_PHONE_NUMBER || '+46766867337'

export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { action, data } = await request.json()

    switch (action) {
      case 'send_sms': {
        // SMS rate limit check
        const smsLimit = checkSmsRateLimit(authBusiness.business_id)
        if (!smsLimit.allowed) {
          return NextResponse.json({ error: smsLimit.error }, { status: 429 })
        }

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
        // Phone API rate limit check
        const phoneLimit = checkPhoneApiRateLimit(authBusiness.business_id)
        if (!phoneLimit.allowed) {
          return NextResponse.json({ error: phoneLimit.error }, { status: 429 })
        }

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
        const { name, phone_number, email, address_line, personal_number, property_designation,
                customer_type, org_number, contact_person, invoice_address, visit_address, reference, apartment_count,
                segment_id, contract_type_id, price_list_id } = data

        const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)

        const insertData: Record<string, any> = {
          customer_id: customerId,
          business_id: authBusiness.business_id,
          name,
          phone_number,
          email: email || null,
          address_line: address_line || null,
          created_at: new Date().toISOString(),
        }

        // Optional fields - only include if they have values
        if (personal_number) insertData.personal_number = personal_number
        if (property_designation) insertData.property_designation = property_designation
        if (customer_type) insertData.customer_type = customer_type
        if (org_number) insertData.org_number = org_number
        if (contact_person) insertData.contact_person = contact_person
        if (invoice_address) insertData.invoice_address = invoice_address
        if (visit_address) insertData.visit_address = visit_address
        if (reference) insertData.reference = reference
        if (apartment_count) insertData.apartment_count = parseInt(apartment_count)
        if (segment_id) insertData.segment_id = segment_id
        if (contract_type_id) insertData.contract_type_id = contract_type_id
        if (price_list_id) insertData.price_list_id = price_list_id
        if (data.default_payment_days) insertData.default_payment_days = parseInt(data.default_payment_days)
        if (data.invoice_email !== undefined) insertData.invoice_email = data.invoice_email

        const { error } = await supabase
          .from('customer')
          .insert(insertData)

        if (error) throw error
        return NextResponse.json({ success: true, customerId })
      }

      case 'update_customer': {
        const { customerId, name, phone_number, email, address_line, personal_number, property_designation,
                customer_type, org_number, contact_person, invoice_address, visit_address, reference, apartment_count,
                segment_id, contract_type_id, price_list_id } = data

        const updateData: Record<string, any> = {
          name,
          phone_number,
          email: email || null,
          address_line: address_line || null,
        }

        // Optional fields - include even if empty to allow clearing
        if (personal_number !== undefined) updateData.personal_number = personal_number || null
        if (property_designation !== undefined) updateData.property_designation = property_designation || null
        if (customer_type !== undefined) updateData.customer_type = customer_type || 'private'
        if (org_number !== undefined) updateData.org_number = org_number || null
        if (contact_person !== undefined) updateData.contact_person = contact_person || null
        if (invoice_address !== undefined) updateData.invoice_address = invoice_address || null
        if (visit_address !== undefined) updateData.visit_address = visit_address || null
        if (reference !== undefined) updateData.reference = reference || null
        if (apartment_count !== undefined) updateData.apartment_count = apartment_count ? parseInt(apartment_count) : null
        if (segment_id !== undefined) updateData.segment_id = segment_id || null
        if (contract_type_id !== undefined) updateData.contract_type_id = contract_type_id || null
        if (price_list_id !== undefined) updateData.price_list_id = price_list_id || null
        if (data.default_payment_days !== undefined) updateData.default_payment_days = data.default_payment_days ? parseInt(data.default_payment_days) : 30
        if (data.invoice_email !== undefined) updateData.invoice_email = data.invoice_email

        const { error } = await supabase
          .from('customer')
          .update(updateData)
          .eq('customer_id', customerId)

        if (error) throw error
        return NextResponse.json({ success: true })
      }

      case 'delete_customer': {
        const { customerId } = data

        // Kontrollera om kunden har kopplad data
        const [dealsCheck, quotesCheck, invoicesCheck] = await Promise.all([
          supabase.from('deal').select('id', { count: 'exact', head: true }).eq('customer_id', customerId),
          supabase.from('quotes').select('quote_id', { count: 'exact', head: true }).eq('customer_id', customerId),
          supabase.from('invoice').select('invoice_id', { count: 'exact', head: true }).eq('customer_id', customerId),
        ])

        const linkedItems = []
        if ((dealsCheck.count || 0) > 0) linkedItems.push(`${dealsCheck.count} ärende(n)`)
        if ((quotesCheck.count || 0) > 0) linkedItems.push(`${quotesCheck.count} offert(er)`)
        if ((invoicesCheck.count || 0) > 0) linkedItems.push(`${invoicesCheck.count} faktura/or`)

        if (linkedItems.length > 0) {
          return NextResponse.json({
            error: `Kunden har ${linkedItems.join(', ')} kopplat. Ta bort dem först eller arkivera kunden istället.`,
          }, { status: 400 })
        }

        // Rensa relaterad data utan FK-constraint
        await supabase.from('customer_document').delete().eq('customer_id', customerId)
        await supabase.from('customer_activity').delete().eq('customer_id', customerId)
        await supabase.from('leads').update({ customer_id: null }).eq('customer_id', customerId)

        const { error } = await supabase
          .from('customer')
          .delete()
          .eq('customer_id', customerId)
          .eq('business_id', authBusiness.business_id)

        if (error) {
          console.error('[delete_customer] Error:', error)
          return NextResponse.json({ error: 'Kunde inte ta bort kunden: ' + error.message }, { status: 500 })
        }
        return NextResponse.json({ success: true })
      }

case 'create_booking': {
  // SMS rate limit check (booking sends confirmation SMS)
  const bookingSmsLimit = checkSmsRateLimit(authBusiness.business_id)
  if (!bookingSmsLimit.allowed) {
    return NextResponse.json({ error: bookingSmsLimit.error }, { status: 429 })
  }

  const { customerId, scheduledStart, scheduledEnd, notes } = data

  const bookingId = 'book_' + Math.random().toString(36).substr(2, 9)

  // Skapa bokning
  const { error } = await supabase
    .from('booking')
    .insert({
      booking_id: bookingId,
      business_id: authBusiness.business_id,
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
    .select('business_name, assigned_phone_number')
    .eq('business_id', authBusiness.business_id)
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

    const suffix = buildSmsSuffix(businessConfig.business_name, businessConfig.assigned_phone_number)
    const message = `Hej${customer.name ? ' ' + customer.name.split(' ')[0] : ''}! Din tid hos ${businessConfig.business_name} är bokad: ${dateStr} kl ${timeStr}. Välkommen! Behöver du ändra tiden?\n${suffix}`

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
