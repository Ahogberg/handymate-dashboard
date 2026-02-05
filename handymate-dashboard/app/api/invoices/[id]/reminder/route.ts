import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

/**
 * POST - Send payment reminder for overdue invoice
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: invoiceId } = await params

    // Auth check
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Fetch invoice with customer and business details
    const { data: invoice, error: fetchError } = await supabase
      .from('invoice')
      .select(`
        *,
        customer:customer_id (
          customer_id,
          name,
          phone_number,
          email
        )
      `)
      .eq('invoice_id', invoiceId)
      .eq('business_id', business.business_id)
      .single()

    if (fetchError || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    // Check if invoice is overdue
    const dueDate = new Date(invoice.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Fakturan är redan betald' }, { status: 400 })
    }

    if (invoice.status === 'draft') {
      return NextResponse.json({ error: 'Fakturan har inte skickats ännu' }, { status: 400 })
    }

    // Get business config for payment details
    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('business_name, display_name, phone_number, bankgiro, swish_number, reminder_sms_template, late_fee_percent')
      .eq('business_id', business.business_id)
      .single()

    const businessName = businessConfig?.display_name || businessConfig?.business_name || 'Företaget'
    const bankgiro = businessConfig?.bankgiro || ''
    const swishNumber = businessConfig?.swish_number || businessConfig?.phone_number || ''
    const lateFeePercent = businessConfig?.late_fee_percent || 8

    // Calculate days overdue
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))

    // Build reminder message
    const amountToPay = invoice.customer_pays || invoice.total
    const defaultTemplate = `Påminnelse: Faktura {invoice_number} på {amount} kr förföll {due_date}. Betala till ${bankgiro ? `bankgiro ${bankgiro}` : ''}${bankgiro && swishNumber ? ' eller ' : ''}${swishNumber ? `Swish ${swishNumber}` : ''}. OCR: {ocr}. Frågor? Ring ${businessConfig?.phone_number || ''}. //${businessName}`

    const template = businessConfig?.reminder_sms_template || defaultTemplate
    const ocrNumber = invoice.invoice_number?.replace('-', '') + '0'

    const message = template
      .replace('{invoice_number}', invoice.invoice_number || '')
      .replace('{amount}', amountToPay?.toLocaleString('sv-SE') || '0')
      .replace('{due_date}', dueDate.toLocaleDateString('sv-SE'))
      .replace('{ocr}', ocrNumber)
      .replace('{business_name}', businessName)
      .replace('{days_overdue}', String(daysOverdue))
      .replace('{late_fee_percent}', String(lateFeePercent))

    const errors: string[] = []
    let smsSent = false

    // Send SMS reminder
    if (invoice.customer?.phone_number) {
      try {
        const smsResponse = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            from: businessName.substring(0, 11),
            to: invoice.customer.phone_number,
            message: message
          }).toString()
        })

        if (smsResponse.ok) {
          smsSent = true
        } else {
          const errorData = await smsResponse.text()
          console.error('SMS error:', errorData)
          errors.push('SMS kunde inte skickas')
        }
      } catch (smsError) {
        console.error('SMS send error:', smsError)
        errors.push('SMS-tjänsten svarade inte')
      }
    } else {
      errors.push('Kunden saknar telefonnummer')
    }

    // Update invoice with reminder info
    const { error: updateError } = await supabase
      .from('invoice')
      .update({
        status: 'overdue',
        reminder_sent_at: new Date().toISOString(),
        reminder_count: (invoice.reminder_count || 0) + 1
      })
      .eq('invoice_id', invoiceId)

    if (updateError) {
      console.error('Update reminder error:', updateError)
    }

    // Log the SMS
    if (smsSent) {
      await supabase.from('sms_log').insert({
        business_id: business.business_id,
        customer_id: invoice.customer_id,
        direction: 'outgoing',
        phone_number: invoice.customer?.phone_number,
        message: message,
        message_type: 'invoice_reminder',
        related_id: invoiceId,
        status: 'sent'
      }).catch(() => {})
    }

    if (!smsSent) {
      return NextResponse.json({
        success: false,
        errors,
        message: 'Påminnelse kunde inte skickas'
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      smsSent,
      reminderCount: (invoice.reminder_count || 0) + 1,
      message: 'Påminnelse skickad'
    })

  } catch (error: any) {
    console.error('Send reminder error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
