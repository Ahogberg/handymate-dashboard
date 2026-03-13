/**
 * V5 Morning Report — proaktiv dagsbriefing via SMS
 *
 * Kallas från cron efter att agent_context är genererat.
 * Skickar ett kort SMS till hantverkarens personal_phone.
 */

import { getServerSupabase } from '@/lib/supabase'

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!

export async function sendMorningReport(businessId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = getServerSupabase()

  try {
    // Hämta business config + agent_context
    const [configRes, contextRes] = await Promise.all([
      supabase
        .from('business_config')
        .select('contact_name, personal_phone, business_name')
        .eq('business_id', businessId)
        .single(),
      supabase
        .from('agent_context')
        .select('*')
        .eq('business_id', businessId)
        .single(),
    ])

    const config = configRes.data
    const context = contextRes.data

    if (!config?.personal_phone) {
      return { success: false, error: 'Inget personal_phone konfigurerat' }
    }

    if (!context) {
      return { success: false, error: 'Ingen agent_context genererad' }
    }

    // Bygg SMS
    const name = config.contact_name?.split(' ')[0] || 'du'
    const todaysJobs = Array.isArray(context.todays_jobs) ? context.todays_jobs : []
    const insights = Array.isArray(context.key_insights) ? context.key_insights : []

    let message = `God morgon ${name}!\n\n`

    // Dagens jobb
    if (todaysJobs.length > 0) {
      message += `Idag: ${todaysJobs.length} bokning${todaysJobs.length > 1 ? 'ar' : ''}\n`
    } else {
      message += `Inga bokningar idag.\n`
    }

    // Öppna leads
    if (context.open_leads_count > 0) {
      message += `${context.open_leads_count} öppna leads\n`
    }

    // Förfallna fakturor
    if (context.overdue_invoices_count > 0) {
      message += `\u26a0\ufe0f ${context.overdue_invoices_count} faktur${context.overdue_invoices_count > 1 ? 'or' : 'a'} förfalln${context.overdue_invoices_count > 1 ? 'a' : ''}\n`
    }

    // Top insight
    const actionInsight = insights.find((i: any) => i.action_needed)
    if (actionInsight) {
      message += `\n${(actionInsight as any).message}\n`
    }

    message += `\nAgenten hanterar resten. Ha en bra dag!\n\u2014 Handymate`

    // Skicka via 46elks
    const smsResponse = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: (config.business_name || 'Handymate').substring(0, 11),
        to: config.personal_phone,
        message,
      }),
    })

    if (!smsResponse.ok) {
      const errData = await smsResponse.json().catch(() => ({}))
      return { success: false, error: `46elks error: ${(errData as any).message || smsResponse.status}` }
    }

    // Fire event
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'morning_report_sent', businessId, {
        personal_phone: config.personal_phone,
        health: context.business_health,
      })
    } catch { /* non-blocking */ }

    return { success: true }
  } catch (err: any) {
    console.error('[MorningReport] Error:', err)
    return { success: false, error: err.message }
  }
}
