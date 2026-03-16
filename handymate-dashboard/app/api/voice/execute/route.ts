import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/voice/execute
 * Tar emot en godkänd action → skapar posten i databasen.
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body?.action?.type) {
    return NextResponse.json({ error: 'Ingen action angiven' }, { status: 400 })
  }

  const { action } = body
  const supabase = getServerSupabase()
  const businessId = business.business_id

  try {
    switch (action.type) {

      case 'time_report': {
        const customer = await findOrCreateCustomer(supabase, businessId, action.data.customer_name)

        // Find active project for this customer
        const { data: project } = await supabase
          .from('project')
          .select('project_id')
          .eq('business_id', businessId)
          .eq('customer_id', customer.customer_id)
          .eq('status', 'active')
          .limit(1)
          .maybeSingle()

        const hours = Number(action.data.hours) || 0
        const entryId = 'te_' + Math.random().toString(36).substr(2, 9)

        await supabase.from('time_entry').insert({
          time_entry_id: entryId,
          business_id: businessId,
          customer_id: customer.customer_id,
          project_id: project?.project_id || null,
          description: action.data.description || '',
          duration_minutes: Math.round(hours * 60),
          work_date: action.data.date || new Date().toISOString().split('T')[0],
          is_billable: true,
        })

        return NextResponse.json({
          success: true,
          message: `Tidrapport skapad: ${hours} tim`,
          data: { time_entry_id: entryId, customer_id: customer.customer_id },
        })
      }

      case 'work_log': {
        // Find project by name
        const { data: project } = await supabase
          .from('project')
          .select('project_id')
          .eq('business_id', businessId)
          .ilike('name', `%${action.data.project_name || ''}%`)
          .limit(1)
          .maybeSingle()

        const logId = 'pl_' + Math.random().toString(36).substr(2, 9)

        await supabase.from('project_log').insert({
          id: logId,
          order_id: project?.project_id || null,
          business_id: businessId,
          date: new Date().toISOString().split('T')[0],
          work_performed: action.data.description || '',
        })

        return NextResponse.json({
          success: true,
          message: 'Arbetslogg skapad',
          data: { log_id: logId },
        })
      }

      case 'material': {
        // Log as a note with material tag since there's no dedicated material table
        const noteId = 'note_' + Math.random().toString(36).substr(2, 9)
        const content = `Material: ${action.data.description || ''}\nBelopp: ${action.data.amount_sek || 0} kr`

        // Try to insert into notes if table exists, otherwise use project_log
        const { error } = await supabase.from('project_log').insert({
          id: noteId,
          business_id: businessId,
          date: new Date().toISOString().split('T')[0],
          work_performed: content,
          materials_used: action.data.description || '',
        })

        if (error) {
          console.error('[voice/execute] Material log error:', error)
        }

        return NextResponse.json({
          success: true,
          message: `Material loggat: ${action.data.amount_sek || 0} kr`,
        })
      }

      case 'invoice': {
        // Create a draft quote that can be converted to invoice
        const customer = await findOrCreateCustomer(supabase, businessId, action.data.customer_name)
        const quoteId = 'q_' + Math.random().toString(36).substr(2, 9)

        await supabase.from('quotes').insert({
          quote_id: quoteId,
          business_id: businessId,
          customer_id: customer.customer_id,
          title: action.data.description || 'Faktura (röstkommando)',
          status: 'draft',
          created_at: new Date().toISOString(),
        })

        return NextResponse.json({
          success: true,
          message: 'Offert/faktura-utkast skapat',
          data: { quote_id: quoteId, customer_id: customer.customer_id },
        })
      }

      case 'quote': {
        const customer = await findOrCreateCustomer(supabase, businessId, action.data.customer_name)
        const quoteId = 'q_' + Math.random().toString(36).substr(2, 9)
        const amount = Number(action.data.estimated_amount) || 0

        await supabase.from('quotes').insert({
          quote_id: quoteId,
          business_id: businessId,
          customer_id: customer.customer_id,
          title: action.data.description || 'Offert (röstkommando)',
          status: 'draft',
          total: amount,
          subtotal: amount,
          vat_rate: 25,
          vat_amount: Math.round(amount * 0.25),
          valid_until: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: new Date().toISOString(),
        })

        return NextResponse.json({
          success: true,
          message: `Offert skapad: ${amount > 0 ? amount + ' kr' : 'utkast'}`,
          data: { quote_id: quoteId, customer_id: customer.customer_id },
        })
      }

      case 'note': {
        // Store as project_log entry (no dedicated notes table)
        const noteId = 'note_' + Math.random().toString(36).substr(2, 9)

        await supabase.from('project_log').insert({
          id: noteId,
          business_id: businessId,
          date: new Date().toISOString().split('T')[0],
          work_performed: action.data.title || 'Anteckning',
          description: action.data.content || '',
        })

        return NextResponse.json({
          success: true,
          message: 'Anteckning sparad',
          data: { note_id: noteId },
        })
      }

      case 'sms': {
        // Find customer phone number
        const { data: customer } = await supabase
          .from('customer')
          .select('customer_id, phone_number, name')
          .eq('business_id', businessId)
          .ilike('name', `%${action.data.recipient_name || ''}%`)
          .limit(1)
          .maybeSingle()

        if (!customer?.phone_number) {
          return NextResponse.json({
            success: false,
            error: `Kunde inte hitta telefonnummer för "${action.data.recipient_name}"`,
          }, { status: 404 })
        }

        const ELKS_API_USER = process.env.ELKS_API_USER
        const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

        if (!ELKS_API_USER || !ELKS_API_PASSWORD) {
          return NextResponse.json({
            success: false,
            error: 'SMS-tjänst ej konfigurerad',
          }, { status: 500 })
        }

        const smsRes = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: (business.business_name || 'Handymate').substring(0, 11),
            to: customer.phone_number,
            message: action.data.message || '',
          }),
        })

        if (!smsRes.ok) {
          return NextResponse.json({ success: false, error: 'SMS kunde inte skickas' }, { status: 500 })
        }

        return NextResponse.json({
          success: true,
          message: `SMS skickat till ${customer.name}`,
        })
      }

      case 'calendar': {
        // Create calendar event via Google Calendar if connected
        try {
          const { data: googleAuth } = await supabase
            .from('business_config')
            .select('google_access_token, google_calendar_id')
            .eq('business_id', businessId)
            .single()

          if (!googleAuth?.google_access_token || !googleAuth?.google_calendar_id) {
            return NextResponse.json({
              success: false,
              error: 'Google Calendar ej kopplad',
            }, { status: 400 })
          }

          const { createGoogleEvent } = await import('@/lib/google-calendar')

          const dateStr = action.data.date || new Date().toISOString().split('T')[0]
          const timeStr = action.data.time || '09:00'
          const durationHours = Number(action.data.duration_hours) || 1

          const start = new Date(`${dateStr}T${timeStr}:00`)
          const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000)

          const eventId = await createGoogleEvent(
            googleAuth.google_access_token,
            googleAuth.google_calendar_id,
            {
              summary: action.data.title || 'Händelse (röstkommando)',
              start,
              end,
            }
          )

          return NextResponse.json({
            success: true,
            message: `Kalenderhändelse skapad: ${action.data.title}`,
            data: { event_id: eventId },
          })
        } catch (calErr) {
          console.error('[voice/execute] Calendar error:', calErr)
          return NextResponse.json({
            success: false,
            error: 'Kunde inte skapa kalenderhändelse',
          }, { status: 500 })
        }
      }

      default:
        return NextResponse.json({ error: `Okänd action: ${action.type}` }, { status: 400 })
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Okänt fel'
    console.error('[voice/execute] Error:', message)
    return NextResponse.json({ error: 'Kunde inte utföra action' }, { status: 500 })
  }
}

/**
 * Hitta befintlig kund eller skapa ny baserat på namn.
 */
async function findOrCreateCustomer(
  supabase: ReturnType<typeof getServerSupabase>,
  businessId: string,
  name: string
): Promise<{ customer_id: string }> {
  if (!name) {
    // Return a placeholder — will still create a customer record
    name = 'Okänd kund'
  }

  const { data: existing } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('business_id', businessId)
    .ilike('name', `%${name}%`)
    .limit(1)
    .maybeSingle()

  if (existing) return existing

  const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
  const { data: created } = await supabase
    .from('customer')
    .insert({
      customer_id: customerId,
      business_id: businessId,
      name,
      created_at: new Date().toISOString(),
    })
    .select('customer_id')
    .single()

  return created || { customer_id: customerId }
}
