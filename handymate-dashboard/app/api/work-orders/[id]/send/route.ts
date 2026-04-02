import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { fireEvent } from '@/lib/automation-engine'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

/**
 * POST /api/work-orders/[id]/send — Skicka arbetsorder via SMS
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Fetch work order
    const { data: wo, error: fetchErr } = await supabase
      .from('work_orders')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (fetchErr || !wo) {
      return NextResponse.json({ error: 'Arbetsorder hittades inte' }, { status: 404 })
    }

    if (!wo.assigned_phone) {
      return NextResponse.json({ error: 'Telefonnummer saknas' }, { status: 400 })
    }

    // Fetch project name
    const { data: project } = await supabase
      .from('project')
      .select('name')
      .eq('project_id', wo.project_id)
      .single()

    // Build SMS message
    const lines: string[] = []
    lines.push(`Hej ${wo.assigned_to || ''}! Arbetsorder för ${project?.name || 'projekt'}:`)
    lines.push('')

    if (wo.scheduled_date) {
      const dateStr = new Date(wo.scheduled_date + 'T00:00:00').toLocaleDateString('sv-SE', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
      let timePart = ''
      if (wo.scheduled_start) {
        timePart = ` kl ${wo.scheduled_start.substring(0, 5)}`
        if (wo.scheduled_end) timePart += `–${wo.scheduled_end.substring(0, 5)}`
      }
      lines.push(`${dateStr}${timePart}`)
    }

    if (wo.address) lines.push(`${wo.address}`)
    if (wo.access_info) lines.push(`${wo.access_info}`)
    if (wo.contact_name) {
      let contactLine = `Kontakt: ${wo.contact_name}`
      if (wo.contact_phone) contactLine += ` ${wo.contact_phone}`
      lines.push(contactLine)
    }

    if (wo.description) {
      lines.push('')
      lines.push(`Uppdrag: ${wo.description.substring(0, 300)}`)
    }

    if (wo.materials_needed) {
      lines.push('')
      lines.push(`Material: ${wo.materials_needed.substring(0, 200)}`)
    }

    if (wo.tools_needed) {
      lines.push('')
      lines.push(`Verktyg: ${wo.tools_needed.substring(0, 200)}`)
    }

    // Hämta assigned_phone_number för svarsnummer
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('assigned_phone_number')
      .eq('business_id', business.business_id)
      .single()

    const suffix = buildSmsSuffix(business.business_name || 'Handymate', bizConfig?.assigned_phone_number)
    lines.push('')
    lines.push(suffix)

    const message = lines.join('\n')

    // Send SMS via 46elks
    const elkUser = process.env.ELKS_API_USER
    const elkPass = process.env.ELKS_API_PASSWORD

    if (!elkUser || !elkPass) {
      return NextResponse.json({ error: 'SMS-konfiguration saknas' }, { status: 500 })
    }

    const senderName = (business.business_name || 'Handymate').substring(0, 11)

    const smsRes = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${elkUser}:${elkPass}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: senderName,
        to: wo.assigned_phone,
        message,
      }),
    })

    if (!smsRes.ok) {
      const errText = await smsRes.text()
      console.error('46elks SMS error:', errText)
      return NextResponse.json({ error: 'Kunde inte skicka SMS' }, { status: 500 })
    }

    // Update status to 'sent'
    await supabase
      .from('work_orders')
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)

    // Fire event for automation engine
    try {
      await fireEvent(supabase, 'work_order_sent', business.business_id, {
        work_order_id: wo.id,
        project_id: wo.project_id,
        assigned_to: wo.assigned_to,
        assigned_phone: wo.assigned_phone,
      })
    } catch (e) {
      console.error('fireEvent error:', e)
    }

    return NextResponse.json({ success: true, message: 'SMS skickat' })
  } catch (error: any) {
    console.error('Send work order error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
