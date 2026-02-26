import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

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
        const { customer_id, description, items } = data

        const invoiceId = `inv-${Date.now()}`
        const invoiceNumber = Math.floor(1000 + Math.random() * 9000)

        const invoiceItems = items || [{
          description: description || 'Arbete',
          quantity: 1,
          unit: 'st',
          unit_price: 0,
          total: 0,
        }]

        const total = invoiceItems.reduce((sum: number, item: any) =>
          sum + (item.total || item.quantity * item.unit_price || 0), 0)

        const { error } = await supabase
          .from('invoice')
          .insert({
            invoice_id: invoiceId,
            business_id: businessId,
            customer_id: customer_id || null,
            invoice_number: invoiceNumber,
            status: 'draft',
            items: invoiceItems,
            total,
            due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
            created_at: new Date().toISOString(),
          })

        if (error) throw error
        return NextResponse.json({
          success: true,
          message: 'Fakturautkast skapad',
          redirect: `/dashboard/invoices/${invoiceId}`,
        })
      }

      case 'create_quote': {
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

        const quoteId = `q-${Date.now()}`
        const quoteItems = items || [{
          description: description || 'Arbete',
          quantity: 1,
          unit: 'st',
          unit_price: 0,
          total: 0,
          type: 'labor',
        }]

        const { error } = await supabase
          .from('quotes')
          .insert({
            quote_id: quoteId,
            business_id: businessId,
            customer_id: customerId || null,
            status: 'draft',
            items: quoteItems,
            labor_total: 0,
            material_total: 0,
            total: 0,
            created_at: new Date().toISOString(),
          })

        if (error) throw error
        return NextResponse.json({
          success: true,
          message: 'Offertutkast skapad',
          redirect: `/dashboard/quotes/${quoteId}/edit`,
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
