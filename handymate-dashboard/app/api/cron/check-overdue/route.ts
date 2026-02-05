import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET/POST - Check and mark overdue invoices
 * Can be called by Vercel Cron or manually
 */
export async function GET(request: NextRequest) {
  return checkOverdueInvoices()
}

export async function POST(request: NextRequest) {
  return checkOverdueInvoices()
}

async function checkOverdueInvoices() {
  try {
    const supabase = getSupabase()
    const today = new Date().toISOString().split('T')[0]

    // Find all sent invoices where due_date has passed
    const { data: overdueInvoices, error: fetchError } = await supabase
      .from('invoice')
      .select('invoice_id, invoice_number, due_date')
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
    const invoiceIds = overdueInvoices.map(inv => inv.invoice_id)

    const { error: updateError } = await supabase
      .from('invoice')
      .update({ status: 'overdue' })
      .in('invoice_id', invoiceIds)

    if (updateError) {
      console.error('Update overdue error:', updateError)
      throw updateError
    }

    console.log(`Marked ${invoiceIds.length} invoices as overdue`)

    return NextResponse.json({
      success: true,
      message: `${invoiceIds.length} fakturor markerade som förfallna`,
      updated: invoiceIds.length,
      invoices: overdueInvoices.map(inv => ({
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
