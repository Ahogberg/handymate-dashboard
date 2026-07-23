import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { executeTool as executeSharedTool } from '@/app/api/agent/trigger/tool-router'

export async function POST(request: NextRequest) {
  try {
    const authBusiness = await getAuthenticatedBusiness(request)
    if (!authBusiness) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action_type, data } = await request.json()
    const supabase = getServerSupabase()
    const businessId = authBusiness.business_id

    switch (action_type) {
      case 'log_time': {
        const { customer_id, duration_minutes, description } = data
        const now = new Date()
        const startTime = new Date(now.getTime() - (duration_minutes || 60) * 60000)

        const { error } = await supabase
          .from('time_entry')
          .insert({
            time_entry_id: `te-${Date.now()}`,
            business_id: businessId,
            customer_id: customer_id || null,
            work_date: now.toISOString().split('T')[0],
            start_time: startTime.toTimeString().slice(0, 5),
            end_time: now.toTimeString().slice(0, 5),
            duration_minutes: duration_minutes || 60,
            description: description || null,
            is_billable: true,
            created_at: now.toISOString(),
          })

        if (error) throw error
        return NextResponse.json({ success: true, message: 'Tid loggad' })
      }

      case 'create_invoice': {
        // Fas 0 (tasks/ui-ux-audit.md): den här grenen satte tidigare
        // fakturanummer med Math.random() — en egen, sämre räknare som kunde
        // krocka med den riktiga (business_config.next_invoice_number).
        // Routar nu genom den DELADE tool-router:n (samma implementation som
        // riktiga Matte kör) så alla fakturor delar samma räknare, VAT- och
        // ROT/RUT-beräkning. Se app/api/agent/trigger/tool-router.ts.
        const { customer_id, description, items } = data
        const invoiceItems = (items && items.length > 0 ? items : [{
          description: description || 'Arbete',
          quantity: 1,
          unit: 'st',
          unit_price: 0,
          total: 0,
          type: 'labor',
        }]).map((item: any) => ({ ...item, type: item.type || 'labor' }))

        const result: any = await executeSharedTool(
          'create_invoice',
          { customer_id: customer_id || null, items: invoiceItems },
          supabase,
          businessId,
          { businessName: authBusiness.business_name || 'Handymate', contactEmail: '', googleConnection: null, triggerSource: 'user' }
        )

        if (!result.success) {
          return NextResponse.json({ error: result.error || 'Kunde inte skapa fakturan' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: result.data?.message || 'Fakturautkast skapad',
          redirect: `/dashboard/invoices/${result.data?.invoice_id}`,
        })
      }

      case 'create_quote': {
        // Fas 0: samma motivering som create_invoice ovan — routar genom den
        // delade tool-router:n istället för en lokal dubblett (som dessutom
        // aldrig skrev quote_items-raderna PDF/utskick läser).
        const { customer_name, description, items } = data

        // Try to find customer by name
        let customerId = data.customer_id
        if (!customerId && customer_name) {
          const { data: found } = await supabase
            .from('customer')
            .select('customer_id')
            .eq('business_id', businessId)
            .ilike('name', `%${customer_name}%`)
            .limit(1)
            .single()
          customerId = found?.customer_id
        }

        const quoteItems = (items && items.length > 0 ? items : [{
          description: description || 'Arbete',
          quantity: 1,
          unit: 'st',
          unit_price: 0,
          total: 0,
          type: 'labor',
        }]).map((item: any) => ({ ...item, type: item.type || 'labor' }))

        const result: any = await executeSharedTool(
          'create_quote',
          { customer_id: customerId || null, title: description || 'Offert från Jobbkompisen', items: quoteItems },
          supabase,
          businessId,
          { businessName: authBusiness.business_name || 'Handymate', contactEmail: '', googleConnection: null, triggerSource: 'user' }
        )

        if (!result.success) {
          return NextResponse.json({ error: result.error || 'Kunde inte skapa offerten' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: result.data?.message || 'Offertutkast skapad',
          redirect: `/dashboard/quotes/${result.data?.quote_id}/edit`,
        })
      }

      case 'update_project': {
        const { project_id, update } = data

        if (project_id && update) {
          // Add a log entry to the project
          await supabase
            .from('project_log')
            .insert({
              log_id: `log-${Date.now()}`,
              project_id,
              business_id: businessId,
              entry_type: 'note',
              title: 'Uppdatering via Jobbkompisen',
              description: update,
              created_at: new Date().toISOString(),
            })
        }

        return NextResponse.json({ success: true, message: 'Projekt uppdaterat' })
      }

      case 'send_sms': {
        const { customer_id, message } = data

        if (!customer_id || !message) {
          return NextResponse.json({ error: 'customer_id and message required' }, { status: 400 })
        }

        // Get customer phone
        const { data: customer } = await supabase
          .from('customer')
          .select('phone_number, name')
          .eq('customer_id', customer_id)
          .eq('business_id', businessId)
          .single()

        if (!customer?.phone_number) {
          return NextResponse.json({ error: 'Customer phone not found' }, { status: 404 })
        }

        // Send via internal SMS API
        const smsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/sms/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Cookie': request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            to: customer.phone_number,
            message,
            customer_id,
          }),
        })

        if (!smsResponse.ok) {
          return NextResponse.json({ error: 'SMS failed' }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: `SMS skickat till ${customer.name}` })
      }

      case 'order_material': {
        const { items, notes } = data

        if (!items || !Array.isArray(items) || items.length === 0) {
          return NextResponse.json({ error: 'Items required for material order' }, { status: 400 })
        }

        const orderItems = items.map((item: any) => ({
          name: item.name || item.description || 'Material',
          sku: item.sku || null,
          quantity: item.quantity || 1,
          unit: item.unit || 'st',
          unit_price: item.unit_price || 0,
          total: (item.quantity || 1) * (item.unit_price || 0),
          supplier_name: item.supplier || null,
        }))

        const total = orderItems.reduce((sum: number, item: any) => sum + (item.total || 0), 0)

        const { error } = await supabase
          .from('material_order')
          .insert({
            business_id: businessId,
            items: orderItems,
            total,
            status: 'draft',
            notes: notes || 'Skapad via Jobbkompisen',
          })

        if (error) throw error
        return NextResponse.json({
          success: true,
          message: `Materialbeställning skapad (${orderItems.length} artiklar)`,
          redirect: '/dashboard/orders',
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action type: ${action_type}` }, { status: 400 })
    }
  } catch (error) {
    console.error('Jobbuddy action error:', error)
    return NextResponse.json(
      { error: 'Internal error' },
      { status: 500 }
    )
  }
}
