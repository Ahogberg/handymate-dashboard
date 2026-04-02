import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET/POST - Check and mark overdue invoices (DB status only).
 *
 * VIKTIGT: Denna cron uppdaterar BARA invoice.status till 'overdue'.
 * Kundkommunikation (SMS/email) hanteras av:
 *   - /api/cron/send-reminders (respekterar auto_reminder_enabled)
 *   - V3 automation rules "Fakturapåminnelse dag 1/7" (respekterar is_active)
 *
 * Tidigare skickade denna cron SMS via agent UTAN att kolla toggles — det
 * innebar att kunder fick påminnelser även om auto-reminders var avstängt.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return checkOverdueInvoices()
}

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return checkOverdueInvoices()
}

async function checkOverdueInvoices() {
  try {
    const supabase = getServerSupabase()
    const today = new Date().toISOString().split('T')[0]

    // Find all sent invoices where due_date has passed
    const { data: overdueInvoices, error: fetchError } = await supabase
      .from('invoice')
      .select('invoice_id')
      .eq('status', 'sent')
      .lt('due_date', today)

    if (fetchError) throw fetchError

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ success: true, updated: 0 })
    }

    // Update status to overdue — kommunikation sker via send-reminders/V3 regler
    const invoiceIds = overdueInvoices.map(inv => inv.invoice_id)
    await supabase.from('invoice').update({ status: 'overdue' }).in('invoice_id', invoiceIds)

    console.log(`[check-overdue] Markerade ${invoiceIds.length} fakturor som förfallna`)

    return NextResponse.json({
      success: true,
      updated: invoiceIds.length,
    })
  } catch (error: any) {
    console.error('Check overdue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
