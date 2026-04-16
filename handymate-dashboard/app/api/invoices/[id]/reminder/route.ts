import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateOCR } from '@/lib/ocr'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

/**
 * POST - Send payment reminder for overdue invoice
 * Creates invoice_reminders record with fee + penalty interest
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: invoiceId } = params

    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Fetch invoice with customer
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

    if (invoice.status === 'paid') {
      return NextResponse.json({ error: 'Fakturan är redan betald' }, { status: 400 })
    }

    if (invoice.status === 'draft') {
      return NextResponse.json({ error: 'Fakturan har inte skickats ännu' }, { status: 400 })
    }

    // Get business config
    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('business_name, display_name, phone_number, bankgiro, swish_number, plusgiro, reminder_sms_template, late_fee_percent, penalty_interest, reminder_fee, max_auto_reminders')
      .eq('business_id', business.business_id)
      .single()

    const maxReminders = businessConfig?.max_auto_reminders || 3
    const currentCount = invoice.reminder_count || 0

    // Check max reminders
    if (currentCount >= maxReminders) {
      return NextResponse.json({
        error: `Max antal påminnelser (${maxReminders}) har nåtts. Inkassohantering rekommenderas.`,
        max_reached: true,
      }, { status: 400 })
    }

    const businessName = businessConfig?.display_name || businessConfig?.business_name || 'Företaget'
    const bankgiro = businessConfig?.bankgiro || ''
    const swishNumber = businessConfig?.swish_number || businessConfig?.phone_number || ''
    const penaltyInterest = businessConfig?.penalty_interest || businessConfig?.late_fee_percent || 8
    const reminderFee = businessConfig?.reminder_fee || 60

    // Calculate days overdue and penalty interest
    const dueDate = new Date(invoice.due_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))

    const amountToPay = invoice.customer_pays || invoice.total || 0
    const penaltyInterestAmount = Math.round(amountToPay * (penaltyInterest / 100) * (daysOverdue / 365) * 100) / 100
    const totalWithFees = amountToPay + (currentCount > 0 ? reminderFee : 0) + penaltyInterestAmount

    // Build reminder message
    const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
    // Hämta kundportal-länk om den finns
    let portalLink = ''
    if (invoice.customer_id) {
      const { data: cust } = await supabase
        .from('customer')
        .select('portal_token')
        .eq('customer_id', invoice.customer_id)
        .single()
      if (cust?.portal_token) {
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
        portalLink = ` Se och betala: ${appUrl}/portal/${cust.portal_token}?tab=invoices`
      }
    }

    const defaultTemplate = `Påminnelse: Faktura {invoice_number} på {amount} kr förföll {due_date}. Betala till ${bankgiro ? `bankgiro ${bankgiro}` : ''}${bankgiro && swishNumber ? ' eller ' : ''}${swishNumber ? `Swish ${swishNumber}` : ''}.${portalLink} OCR: {ocr}. //${businessName}`

    const template = businessConfig?.reminder_sms_template || defaultTemplate

    const message = template
      .replace('{invoice_number}', invoice.invoice_number || '')
      .replace('{amount}', totalWithFees?.toLocaleString('sv-SE') || '0')
      .replace('{due_date}', dueDate.toLocaleDateString('sv-SE'))
      .replace('{ocr}', ocrNumber)
      .replace('{business_name}', businessName)
      .replace('{days_overdue}', String(daysOverdue))
      .replace('{late_fee_percent}', String(penaltyInterest))

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

    const newCount = currentCount + 1

    // Create invoice_reminders record
    const { error: reminderInsertErr } = await supabase
      .from('invoice_reminders')
      .insert({
        business_id: business.business_id,
        invoice_id: invoiceId,
        reminder_number: newCount,
        sent_at: new Date().toISOString(),
        sent_method: smsSent ? 'sms' : 'failed',
        fee_amount: currentCount > 0 ? reminderFee : 0,
        penalty_interest_amount: penaltyInterestAmount,
        total_with_fees: totalWithFees,
        message: message,
      })

    if (reminderInsertErr) {
      console.error('[invoice/reminder] Failed to log reminder:', reminderInsertErr)
      // Fortsätt ändå — SMS har redan skickats, men warna i svaret
    }

    // Update invoice with reminder info
    const { error: invoiceUpdateErr } = await supabase
      .from('invoice')
      .update({
        status: 'overdue',
        last_reminder_at: new Date().toISOString(),
        reminder_count: newCount,
        reminder_fee: currentCount > 0 ? reminderFee : 0,
        penalty_interest: penaltyInterest,
      })
      .eq('invoice_id', invoiceId)

    if (invoiceUpdateErr) {
      console.error('[invoice/reminder] Failed to update invoice:', invoiceUpdateErr)
      // Kritiskt: payment tracking inkonsistent
    }

    // Log SMS
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
      })
    }

    if (!smsSent) {
      return NextResponse.json({
        success: false,
        errors,
        message: 'Påminnelse kunde inte skickas',
        reminderCount: newCount,
      }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      smsSent,
      reminderCount: newCount,
      feeAmount: currentCount > 0 ? reminderFee : 0,
      penaltyInterestAmount,
      totalWithFees,
      message: newCount >= maxReminders
        ? `Påminnelse ${newCount} skickad. Max antal nått – inkassohantering rekommenderas.`
        : `Påminnelse ${newCount} av ${maxReminders} skickad`
    })

  } catch (error: any) {
    console.error('Send reminder error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
