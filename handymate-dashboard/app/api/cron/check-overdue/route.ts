import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

interface OverdueInvoice {
  invoice_id: string
  invoice_number: string
  due_date: string
  business_id: string
  total: number
  customer?: { name: string } | null
}

/**
 * GET/POST - Check and mark overdue invoices
 * Can be called by Vercel Cron or manually
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
      .select('invoice_id, invoice_number, due_date, business_id, total, customer:customer_id(name)')
      .eq('status', 'sent')
      .lt('due_date', today)

    if (fetchError) {
      console.error('Fetch overdue error:', fetchError)
      throw fetchError
    }

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'Inga förfallna fakturor hittades',
        updated: 0
      })
    }

    // Update status to overdue
    const invoiceIds = (overdueInvoices as OverdueInvoice[]).map(inv => inv.invoice_id)

    const { error: updateError } = await supabase
      .from('invoice')
      .update({ status: 'overdue' })
      .in('invoice_id', invoiceIds)

    if (updateError) {
      console.error('Update overdue error:', updateError)
      throw updateError
    }

    console.log(`Marked ${invoiceIds.length} invoices as overdue`)

    // Create notifications for each overdue invoice
    try {
      const { notifyInvoiceOverdue } = await import('@/lib/notifications')
      for (const inv of overdueInvoices as OverdueInvoice[]) {
        const daysPastDue = Math.floor(
          (new Date(today).getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
        )
        await notifyInvoiceOverdue({
          businessId: inv.business_id,
          invoiceNumber: inv.invoice_number,
          customerName: (inv.customer as any)?.name || 'Okänd kund',
          total: inv.total || 0,
          daysPastDue,
        })
      }
    } catch (notifErr: any) {
      console.error('Notification error (non-blocking):', notifErr.message)
    }

    return NextResponse.json({
      success: true,
      message: `${invoiceIds.length} fakturor markerade som förfallna`,
      updated: invoiceIds.length,
      invoices: (overdueInvoices as OverdueInvoice[]).map(inv => ({
        invoice_id: inv.invoice_id,
        invoice_number: inv.invoice_number,
        due_date: inv.due_date
      }))
    })

  } catch (error: any) {
    console.error('Check overdue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
