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

    // Prisinsikter
    try {
      const { data: pricingData } = await supabase
        .from('pricing_intelligence')
        .select('job_type, win_rate, price_trend, total_quotes')
        .eq('business_id', businessId)
        .order('total_quotes', { ascending: false })
        .limit(3)

      if (pricingData && pricingData.length > 0) {
        const rising = pricingData.filter((p: any) => p.price_trend === 'rising')
        const lowWin = pricingData.filter((p: any) => p.win_rate !== null && p.win_rate < 0.3)

        if (rising.length > 0) {
          message += `Priserna ökar för ${rising.map((r: any) => r.job_type).join(', ')}.\n`
        }
        if (lowWin.length > 0) {
          message += `Låg vinstfrekvens på ${lowWin.map((l: any) => l.job_type).join(', ')} — överväg prisjustering.\n`
        }
      }
    } catch { /* pricing_intelligence kanske inte finns ännu */ }

    // Top insight
    const actionInsight = insights.find((i: any) => i.action_needed)
    if (actionInsight) {
      message += `\n${(actionInsight as any).message}\n`
    }

    // Referral-påminnelse (max 1 gång/månad)
    try {
      const { data: settings } = await supabase
        .from('v3_automation_settings')
        .select('referral_reminder_last_sent, referral_reminder_count')
        .eq('business_id', businessId)
        .single()

      const { data: bizConfig } = await supabase
        .from('business_config')
        .select('referral_code')
        .eq('business_id', businessId)
        .single()

      if (bizConfig?.referral_code) {
        const lastSent = settings?.referral_reminder_last_sent
          ? new Date(settings.referral_reminder_last_sent)
          : null
        const daysSince = lastSent
          ? Math.floor((Date.now() - lastSent.getTime()) / (1000 * 60 * 60 * 24))
          : 999 // Aldrig skickad
        const reminderCount = settings?.referral_reminder_count ?? 0

        const { hasAnyReferralConverted } = await import('@/lib/referral/codes')
        const hasConverted = await hasAnyReferralConverted(businessId)

        const shouldRemind = daysSince >= 30 && (hasConverted || reminderCount < 3)

        if (shouldRemind) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
          const referralUrl = `${appUrl}/registrera?ref=${bizConfig.referral_code}`

          message += hasConverted
            ? `\nDina kollegor du bjudit in sparar tid med Handymate. Känner du fler? ${referralUrl}\n`
            : `\nTips: Bjud in en kollega och få 50% rabatt på nästa månads faktura: ${referralUrl}\n`

          // Uppdatera reminder-spårning
          if (settings) {
            await supabase
              .from('v3_automation_settings')
              .update({
                referral_reminder_last_sent: new Date().toISOString(),
                referral_reminder_count: reminderCount + 1,
              })
              .eq('business_id', businessId)
          }
        }
      }
    } catch { /* referral-påminnelse är non-blocking */ }

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
