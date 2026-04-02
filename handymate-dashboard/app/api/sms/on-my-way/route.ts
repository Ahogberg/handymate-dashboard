import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY

/**
 * POST /api/sms/on-my-way
 * Skicka "på väg"-SMS med beräknad ankomsttid.
 *
 * Body: { booking_id?, project_id?, customer_phone, customer_name,
 *         customer_address, lat?, lng?, message? }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { customer_phone, customer_name, customer_address, lat, lng, message } = body

    if (!customer_phone) {
      return NextResponse.json({ error: 'Kundtelefonnummer saknas' }, { status: 400 })
    }

    const supabase = getServerSupabase()
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('business_name, contact_name, phone_number, assigned_phone_number')
      .eq('business_id', business.business_id)
      .single()

    const businessName = bizConfig?.business_name || 'Handymate'
    const contactName = bizConfig?.contact_name || ''
    const contactPhone = bizConfig?.assigned_phone_number || bizConfig?.phone_number || ''

    // Calculate ETA via Google Maps Distance Matrix
    let eta = ''
    if (GOOGLE_MAPS_API_KEY && lat && lng && customer_address) {
      try {
        const origin = `${lat},${lng}`
        const destination = encodeURIComponent(customer_address)
        const res = await fetch(
          `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&language=sv&key=${GOOGLE_MAPS_API_KEY}`
        )
        const data = await res.json()
        const element = data?.rows?.[0]?.elements?.[0]
        if (element?.status === 'OK' && element.duration?.value) {
          const arrivalTime = new Date(Date.now() + element.duration.value * 1000)
          eta = arrivalTime.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })
        }
      } catch {
        // Fallback — no ETA
      }
    }

    // Build SMS text
    const firstName = customer_name?.split(' ')[0] || ''
    const suffix = buildSmsSuffix(businessName, bizConfig?.assigned_phone_number)
    const smsText = message || (
      eta
        ? `Hej ${firstName}! ${contactName} från ${businessName} är nu på väg till dig. Beräknad ankomsttid: ${eta}. Vi ses snart!\n${suffix}`
        : `Hej ${firstName}! ${contactName} från ${businessName} är nu på väg till dig. Vi ses snart!\n${suffix}`
    )

    // Send via 46elks
    let smsSuccess = false
    let smsError = ''

    if (ELKS_API_USER && ELKS_API_PASSWORD) {
      try {
        const smsRes = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: businessName.substring(0, 11),
            to: customer_phone,
            message: smsText,
          }),
        })
        smsSuccess = smsRes.ok
        if (!smsRes.ok) {
          const result = await smsRes.json()
          smsError = result.message || 'SMS misslyckades'
        }
      } catch (err: any) {
        smsError = err.message
      }
    } else {
      smsError = '46elks ej konfigurerad'
    }

    // Log
    try {
      await supabase.from('v3_automation_logs').insert({
        business_id: business.business_id,
        rule_name: 'on_my_way_sms',
        trigger_type: 'manual',
        action_taken: `På väg-SMS till ${customer_name || customer_phone}${eta ? ` (ETA ${eta})` : ''}`,
        success: smsSuccess,
        error_message: smsError || null,
        agent_id: 'lars',
      })
    } catch { /* non-blocking */ }

    if (!smsSuccess) {
      return NextResponse.json({ error: smsError || 'SMS kunde inte skickas' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      eta: eta || null,
      message_preview: smsText.substring(0, 80),
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
