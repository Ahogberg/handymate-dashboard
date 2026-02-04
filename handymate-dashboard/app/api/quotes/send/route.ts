import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

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
  try {
    const { quoteId, method } = await request.json()

    // Hämta offert med kundinfo och företagsinfo
    const { data: quote } = await supabase
      .from('quotes')
      .select('*, customer(*)')
      .eq('quote_id', quoteId)
      .single()

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 })
    }

    const { data: business } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', quote.business_id)
      .single()

    if (!quote.customer) {
      return NextResponse.json({ error: 'No customer on quote' }, { status: 400 })
    }

    const formatCurrency = (amount: number) => {
      return new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(amount)
    }

    // Skapa offertlänk (för framtida digital acceptans)
    const quoteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://handymate.se'}/quote/${quoteId}`

    const customerPays = quote.rot_rut_type ? quote.customer_pays : quote.total
    const rotText = quote.rot_rut_type ? ` (efter ${quote.rot_rut_type.toUpperCase()}-avdrag)` : ''

    // SMS
    if (method === 'sms' || method === 'both') {
      const smsMessage = `Hej ${quote.customer.name}!

Här kommer din offert från ${business.business_name}:

${quote.title || 'Offert'}
Totalt: ${formatCurrency(customerPays)} kr${rotText}

Vi kontaktar dig inom kort. Har du frågor? Ring ${business.phone_number || 'oss'}.

//${business.business_name}`

      await sendSMS(quote.customer.phone_number, smsMessage, business.business_name)

      // Logga aktivitet
      await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).substr(2, 9),
        customer_id: quote.customer_id,
        business_id: quote.business_id,
        activity_type: 'sms_sent',
        title: 'Offert skickad via SMS',
        description: `Offert "${quote.title}" skickad till kund`,
        created_by: 'user'
      })
    }

    // Email (placeholder - kan implementeras med SendGrid/Resend etc.)
    if (method === 'email' || method === 'both') {
      // TODO: Implementera email-sändning
      console.log('Email sending not yet implemented')
    }

    // Uppdatera offert-status
    await supabase
      .from('quotes')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('quote_id', quoteId)

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Send quote error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
