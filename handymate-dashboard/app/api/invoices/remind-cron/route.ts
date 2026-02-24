import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { generateOCR } from '@/lib/ocr'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const CRON_SECRET = process.env.CRON_SECRET

/**
 * GET - Cron job: Auto-send reminders for overdue invoices
 * Runs daily at 08:00 via Vercel cron
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization')
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  // Fetch all overdue invoices that haven't hit max reminders
  const { data: overdueInvoices, error: fetchError } = await supabase
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
    .in('status', ['sent', 'overdue'])
    .lt('due_date', todayStr)
    .order('due_date', { ascending: true })

  if (fetchError) {
    console.error('Cron: Failed to fetch overdue invoices:', fetchError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  if (!overdueInvoices || overdueInvoices.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No overdue invoices' })
  }

  const results: { invoiceId: string; invoiceNumber: string; success: boolean; error?: string }[] = []

  for (const invoice of overdueInvoices) {
    try {
      // Get business config for this invoice's business
      const { data: businessConfig } = await supabase
        .from('business_config')
        .select('business_name, display_name, phone_number, bankgiro, swish_number, plusgiro, reminder_sms_template, penalty_interest, late_fee_percent, reminder_fee, max_auto_reminders')
        .eq('business_id', invoice.business_id)
        .single()

      const maxReminders = businessConfig?.max_auto_reminders || 3
      const currentCount = invoice.reminder_count || 0

      // Skip if max reminders reached
      if (currentCount >= maxReminders) {
        continue
      }

      // Check minimum days between reminders (7 days)
      if (invoice.last_reminder_at) {
        const lastReminder = new Date(invoice.last_reminder_at)
        const daysSinceLastReminder = Math.floor((today.getTime() - lastReminder.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSinceLastReminder < 7) {
          continue
        }
      } else {
        // First reminder: wait at least 3 days after due date
        const dueDate = new Date(invoice.due_date)
        const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysOverdue < 3) {
          continue
        }
      }

      const businessName = businessConfig?.display_name || businessConfig?.business_name || 'Företaget'
      const bankgiro = businessConfig?.bankgiro || ''
      const swishNumber = businessConfig?.swish_number || businessConfig?.phone_number || ''
      const penaltyInterest = businessConfig?.penalty_interest || businessConfig?.late_fee_percent || 8
      const reminderFee = businessConfig?.reminder_fee || 60

      // Calculate penalty interest
      const dueDate = new Date(invoice.due_date)
      const daysOverdue = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
      const amountToPay = invoice.customer_pays || invoice.total || 0
      const penaltyInterestAmount = Math.round(amountToPay * (penaltyInterest / 100) * (daysOverdue / 365) * 100) / 100
      const totalWithFees = amountToPay + (currentCount > 0 ? reminderFee : 0) + penaltyInterestAmount

      // Build SMS message
      const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
      const defaultTemplate = `Påminnelse: Faktura {invoice_number} på {amount} kr förföll {due_date}. Betala till ${bankgiro ? `bankgiro ${bankgiro}` : ''}${bankgiro && swishNumber ? ' eller ' : ''}${swishNumber ? `Swish ${swishNumber}` : ''}. OCR: {ocr}. Frågor? Ring ${businessConfig?.phone_number || ''}. //${businessName}`

      const template = businessConfig?.reminder_sms_template || defaultTemplate

      const message = template
        .replace('{invoice_number}', invoice.invoice_number || '')
        .replace('{amount}', totalWithFees?.toLocaleString('sv-SE') || '0')
        .replace('{due_date}', dueDate.toLocaleDateString('sv-SE'))
        .replace('{ocr}', ocrNumber)
        .replace('{business_name}', businessName)
        .replace('{days_overdue}', String(daysOverdue))
        .replace('{late_fee_percent}', String(penaltyInterest))

      let smsSent = false

      // Send SMS
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

          smsSent = smsResponse.ok
          if (!smsResponse.ok) {
            const errorData = await smsResponse.text()
            console.error(`Cron: SMS error for invoice ${invoice.invoice_number}:`, errorData)
          }
        } catch (smsError) {
          console.error(`Cron: SMS send error for invoice ${invoice.invoice_number}:`, smsError)
        }
      }

      const newCount = currentCount + 1

      // Create invoice_reminders record
      await supabase
        .from('invoice_reminders')
        .insert({
          business_id: invoice.business_id,
          invoice_id: invoice.invoice_id,
          reminder_number: newCount,
          sent_at: new Date().toISOString(),
          sent_method: smsSent ? 'sms' : 'failed',
          fee_amount: currentCount > 0 ? reminderFee : 0,
          penalty_interest_amount: penaltyInterestAmount,
          total_with_fees: totalWithFees,
          message: message,
        })

      // Update invoice
      await supabase
        .from('invoice')
        .update({
          status: 'overdue',
          last_reminder_at: new Date().toISOString(),
          reminder_count: newCount,
          reminder_fee: currentCount > 0 ? reminderFee : 0,
          penalty_interest: penaltyInterest,
        })
        .eq('invoice_id', invoice.invoice_id)

      // Log SMS
      if (smsSent) {
        await supabase.from('sms_log').insert({
          business_id: invoice.business_id,
          customer_id: invoice.customer_id,
          direction: 'outgoing',
          phone_number: invoice.customer?.phone_number,
          message: message,
          message_type: 'invoice_reminder',
          related_id: invoice.invoice_id,
          status: 'sent'
        }).catch(() => {})
      }

      results.push({
        invoiceId: invoice.invoice_id,
        invoiceNumber: invoice.invoice_number,
        success: smsSent,
        error: smsSent ? undefined : 'SMS failed',
      })
    } catch (err: any) {
      console.error(`Cron: Error processing invoice ${invoice.invoice_id}:`, err)
      results.push({
        invoiceId: invoice.invoice_id,
        invoiceNumber: invoice.invoice_number,
        success: false,
        error: err.message,
      })
    }
  }

  return NextResponse.json({
    processed: results.length,
    sent: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    results,
  })
}
