import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

interface Booking {
  booking_id: string
  scheduled_start: string
  business_id: string
  customer: {
    name: string
    phone_number: string
  }
  business_config: {
    business_name: string
  }
}

async function sendSMS(to: string, message: string, from: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: from.substring(0, 11),
        to: to,
        message: message,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  // Verifiera att anropet kommer från en cron job (enkel API-nyckel)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET || 'handymate-cron-secret'
  
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Hitta bokningar som är 24h fram (med 1h marginal)
    const now = new Date()
    const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000)
    const in25Hours = new Date(now.getTime() + 25 * 60 * 60 * 1000)

    const { data: bookings, error } = await supabase
      .from('booking')
      .select(`
        booking_id,
        scheduled_start,
        business_id,
        reminder_sent,
        customer (
          name,
          phone_number
        ),
        business_config:business_id (
          business_name
        )
      `)
      .eq('status', 'confirmed')
      .is('reminder_sent', null)
      .gte('scheduled_start', in23Hours.toISOString())
      .lte('scheduled_start', in25Hours.toISOString())

    if (error) throw error

    let sent = 0
    let failed = 0

    for (const booking of (bookings || []) as unknown as Booking[]) {
      const customer = booking.customer
      const business = booking.business_config

      if (!customer?.phone_number || !business?.business_name) continue

      const bookingDate = new Date(booking.scheduled_start)
      const timeStr = bookingDate.toLocaleTimeString('sv-SE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      })

      const message = `Påminnelse: Du har en tid hos ${business.business_name} imorgon kl ${timeStr}. Välkommen! Behöver du ändra tiden? Svara på detta SMS.`

      const success = await sendSMS(customer.phone_number, message, business.business_name)

      if (success) {
        // Markera som skickad
        await supabase
          .from('booking')
          .update({ reminder_sent: new Date().toISOString() })
          .eq('booking_id', booking.booking_id)
        sent++
      } else {
        failed++
      }
    }

    return NextResponse.json({ 
      success: true, 
      sent, 
      failed,
      checked: bookings?.length || 0
    })

  } catch (error: any) {
    console.error('Reminder error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET för manuell test
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    message: 'Use POST with Bearer token to trigger reminders',
    endpoint: '/api/reminders'
  })
}
