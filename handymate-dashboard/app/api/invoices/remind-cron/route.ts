import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'
import { generateOCR } from '@/lib/ocr'

/**
 * GET - Cron job: Auto-send reminders for overdue invoices via AI agent.
 * Keeps: Finding candidates, penalty interest calculation, invoice_reminders tracking.
 * Delegates: SMS composition and sending to AI agent.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const { data: overdueInvoices, error: fetchError } = await supabase
    .from('invoice')
    .select(`*, customer:customer_id (customer_id, name, phone_number, email)`)
    .in('status', ['sent', 'overdue'])
    .lt('due_date', todayStr)
    .order('due_date', { ascending: true })

  if (fetchError) return NextResponse.json({ error: 'Database error' }, { status: 500 })
  if (!overdueInvoices || overdueInvoices.length === 0) {
    return NextResponse.json({ processed: 0, message: 'No overdue invoices' })
  }

  // Group eligible invoices by business
  const byBusiness = new Map<string, Array<{ invoice: any; businessConfig: any; totalWithFees: number; ocrNumber: string; daysOverdue: number; reminderNumber: number }>>()

  for (const invoice of overdueInvoices) {
    const { data: businessConfig } = await supabase
      .from('business_config')
      .select('business_name, display_name, phone_number, bankgiro, swish_number, plusgiro, penalty_interest, late_fee_percent, reminder_fee, max_auto_reminders')
      .eq('business_id', invoice.business_id)
      .single()

    const maxReminders = businessConfig?.max_auto_reminders || 3
    const currentCount = invoice.reminder_count || 0
    if (currentCount >= maxReminders) continue

    // Check minimum days between reminders (7 days)
    if (invoice.last_reminder_at) {
      const daysSinceLastReminder = Math.floor((today.getTime() - new Date(invoice.last_reminder_at).getTime()) / (1000 * 60 * 60 * 24))
      if (daysSinceLastReminder < 7) continue
    } else {
      const daysOverdue = Math.floor((today.getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24))
      if (daysOverdue < 3) continue
    }

    // Calculate penalty interest
    const penaltyInterest = businessConfig?.penalty_interest || businessConfig?.late_fee_percent || 8
    const reminderFee = businessConfig?.reminder_fee || 60
    const daysOverdue = Math.max(0, Math.floor((today.getTime() - new Date(invoice.due_date).getTime()) / (1000 * 60 * 60 * 24)))
    const amountToPay = invoice.customer_pays || invoice.total || 0
    const penaltyInterestAmount = Math.round(amountToPay * (penaltyInterest / 100) * (daysOverdue / 365) * 100) / 100
    const totalWithFees = amountToPay + (currentCount > 0 ? reminderFee : 0) + penaltyInterestAmount
    const ocrNumber = invoice.ocr_number || generateOCR(invoice.invoice_number || '')
    const newCount = currentCount + 1

    // Track invoice_reminders and update invoice (keep this data logic here)
    await supabase.from('invoice_reminders').insert({
      business_id: invoice.business_id,
      invoice_id: invoice.invoice_id,
      reminder_number: newCount,
      sent_at: new Date().toISOString(),
      sent_method: 'agent',
      fee_amount: currentCount > 0 ? reminderFee : 0,
      penalty_interest_amount: penaltyInterestAmount,
      total_with_fees: totalWithFees,
    })

    await supabase.from('invoice').update({
      status: 'overdue',
      last_reminder_at: new Date().toISOString(),
      reminder_count: newCount,
      reminder_fee: currentCount > 0 ? reminderFee : 0,
      penalty_interest: penaltyInterest,
    }).eq('invoice_id', invoice.invoice_id)

    const list = byBusiness.get(invoice.business_id) || []
    list.push({ invoice, businessConfig, totalWithFees, ocrNumber, daysOverdue, reminderNumber: newCount })
    byBusiness.set(invoice.business_id, list)
  }

  // Trigger agent per business
  let agentTriggered = 0
  for (const [businessId, items] of Array.from(byBusiness)) {
    const bc = items[0].businessConfig
    const bankgiro = bc?.bankgiro || ''
    const swish = bc?.swish_number || bc?.phone_number || ''
    const paymentInfo = [bankgiro ? `Bankgiro: ${bankgiro}` : '', swish ? `Swish: ${swish}` : ''].filter(Boolean).join(', ')

    const invoiceList = items.map((item: any) => {
      const c = item.invoice.customer as any
      return `- Faktura ${item.invoice.invoice_number} till ${c?.name || 'Okänd'} (${c?.phone_number || 'inget nummer'}): ${item.totalWithFees.toLocaleString('sv-SE')} kr inkl avgifter, ${item.daysOverdue} dagar förfallen, OCR: ${item.ocrNumber}, påminnelse nr ${item.reminderNumber}`
    }).join('\n')

    const result = await triggerAgentInternal(
      businessId,
      'cron',
      {
        cron_type: 'invoice_reminder',
        instruction: `Skicka fakturapåminnelse via SMS till följande kunder. Betalningsinformation: ${paymentInfo}.\n\n${invoiceList}\n\nVarje SMS ska innehålla fakturanummer, belopp, OCR-nummer och betalningsinformation. Var professionell men vänlig.`,
      },
      makeIdempotencyKey('remind', businessId, todayStr)
    )
    if (result.success) agentTriggered++
  }

  return NextResponse.json({
    processed: Array.from(byBusiness.values()).flat().length,
    agent_triggered: agentTriggered,
  })
}
