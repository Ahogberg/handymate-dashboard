import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const { token } = params

    // Find customer by portal token
    const { data: customer, error } = await supabase
      .from('customer')
      .select('customer_id, business_id, name, phone_number, email, address_line, portal_enabled, portal_welcomed')
      .eq('portal_token', token)
      .single()

    if (error || !customer) {
      return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })
    }

    if (!customer.portal_enabled) {
      return NextResponse.json({ error: 'Portalen är inte aktiv' }, { status: 403 })
    }

    // Get business info
    const { data: business } = await supabase
      .from('business_config')
      .select(`
        business_name, contact_name, contact_email, phone_number,
        google_review_url, assigned_phone_number,
        address, org_number, f_skatt_registered, working_hours,
        accent_color, logo_url, swish_number, bankgiro
      `)
      .eq('business_id', customer.business_id)
      .single()

    // Update last visited
    await supabase
      .from('customer')
      .update({ portal_last_visited_at: new Date().toISOString() })
      .eq('customer_id', customer.customer_id)

    // Welcome SMS — skickas en gång vid första portalinteraktion
    if (!customer.portal_welcomed && customer.phone_number && business?.business_name) {
      // Atomisk flag-sätt: endast om fortfarande false — ger oss race-skydd
      const { data: claimed } = await supabase
        .from('customer')
        .update({ portal_welcomed: true, portal_welcomed_at: new Date().toISOString() })
        .eq('customer_id', customer.customer_id)
        .eq('portal_welcomed', false)
        .select('customer_id')
        .maybeSingle()

      if (claimed) {
        try {
          const firstName = (customer.name || '').split(' ')[0]
          const bizName = business.business_name
          const suffix = buildSmsSuffix(bizName, business.assigned_phone_number)
          const message =
            `Hej${firstName ? ' ' + firstName : ''}! Välkommen till din kundportal hos ${bizName}. ` +
            `Här ser du offerter, fakturor, projektstatus och kan chatta med oss direkt.\n${suffix}`

          await fetch('https://api.46elks.com/a1/sms', {
            method: 'POST',
            headers: {
              Authorization: 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              from: bizName.substring(0, 11),
              to: customer.phone_number,
              message,
            }).toString(),
          })

          await supabase.from('sms_log').insert({
            business_id: customer.business_id,
            customer_id: customer.customer_id,
            direction: 'outgoing',
            phone_number: customer.phone_number,
            message_type: 'portal_welcome',
            status: 'sent',
          })
        } catch (err) {
          console.error('[portal] welcome SMS failed:', err)
        }
      }
    }

    // Count unread messages
    const { count: unreadCount } = await supabase
      .from('customer_message')
      .select('*', { count: 'exact', head: true })
      .eq('customer_id', customer.customer_id)
      .eq('direction', 'outbound')
      .is('read_at', null)

    return NextResponse.json({
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone_number,
        customerId: customer.customer_id
      },
      business: {
        name: business?.business_name || '',
        contactName: business?.contact_name || '',
        email: business?.contact_email || '',
        phone: business?.phone_number || '',
        googleReviewUrl: business?.google_review_url || null,
        // Utökade fält för Claude Design redesign
        accentColor: business?.accent_color || null,
        logoUrl: business?.logo_url || null,
        address: business?.address || null,
        orgNumber: business?.org_number || null,
        fSkatt: !!business?.f_skatt_registered,
        workingHours: business?.working_hours || null,
        swish: business?.swish_number || null,
        bankgiro: business?.bankgiro || null,
      },
      unreadMessages: unreadCount || 0
    })
  } catch (error: any) {
    console.error('Portal error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}
