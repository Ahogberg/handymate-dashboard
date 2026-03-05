import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { triggerAgentInternal, makeIdempotencyKey } from '@/lib/agent-trigger'

interface OverdueInvoice {
  invoice_id: string
  invoice_number: string
  due_date: string
  business_id: string
  total: number
  customer_pays: number | null
  customer?: { name: string; phone_number: string } | null
}

/**
 * GET/POST - Check and mark overdue invoices, then trigger agent to notify customers.
 * Keeps: DB status update (simple data op).
 * Delegates: Customer notification to AI agent via send_sms/send_email.
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
      .select('invoice_id, invoice_number, due_date, business_id, total, customer_pays, customer:customer_id(name, phone_number)')
      .eq('status', 'sent')
      .lt('due_date', today)

    if (fetchError) throw fetchError

    if (!overdueInvoices || overdueInvoices.length === 0) {
      return NextResponse.json({ success: true, updated: 0, agent_triggered: 0 })
    }

    // Update status to overdue (simple DB op — keep here)
    const invoiceIds = (overdueInvoices as OverdueInvoice[]).map(inv => inv.invoice_id)
    await supabase.from('invoice').update({ status: 'overdue' }).in('invoice_id', invoiceIds)

    // Group by business and trigger agent per business
    const byBusiness = new Map<string, OverdueInvoice[]>()
    for (const inv of overdueInvoices as OverdueInvoice[]) {
      const list = byBusiness.get(inv.business_id) || []
      list.push(inv)
      byBusiness.set(inv.business_id, list)
    }

    let agentTriggered = 0
    for (const [businessId, invoices] of Array.from(byBusiness)) {
      const invoiceList = invoices.map((inv: OverdueInvoice) => {
        const daysPastDue = Math.floor(
          (new Date(today).getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)
        )
        return `- Faktura ${inv.invoice_number}: ${(inv.customer_pays || inv.total || 0).toLocaleString('sv-SE')} kr, förfallen ${daysPastDue} dagar, kund: ${(inv.customer as any)?.name || 'Okänd'}, telefon: ${(inv.customer as any)?.phone_number || 'saknas'}`
      }).join('\n')

      const result = await triggerAgentInternal(
        businessId,
        'cron',
        {
          cron_type: 'check_overdue',
          instruction: `Följande fakturor har just markerats som förfallna. Kontakta kunderna med en vänlig påminnelse via SMS:\n\n${invoiceList}`,
        },
        makeIdempotencyKey('overdue', businessId, today)
      )
      if (result.success) agentTriggered++
    }

    return NextResponse.json({
      success: true,
      updated: invoiceIds.length,
      agent_triggered: agentTriggered,
    })
  } catch (error: any) {
    console.error('Check overdue error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
