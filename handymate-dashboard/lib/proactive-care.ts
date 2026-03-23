/**
 * Proactive Customer Care Engine
 *
 * Reaches out to past customers based on job type lifecycle.
 * Each job type has a natural "time to next contact" cycle.
 */

import { getServerSupabase } from '@/lib/supabase'

// Job type → months until proactive contact
const JOB_LIFECYCLE: Record<string, {
  months: number
  reason: string
  suggestedService: string
}> = {
  // Badrum
  'badrum': { months: 24, reason: 'Fogarna kan behöva kontroll efter 2 år', suggestedService: 'Fog- och tätskiktskontroll' },
  'badrumrenovering': { months: 24, reason: 'Fogarna kan behöva kontroll efter 2 år', suggestedService: 'Fog- och tätskiktskontroll' },

  // El
  'elinstallation': { months: 36, reason: 'Elbesiktning rekommenderas vart 3:e år', suggestedService: 'Elbesiktning' },
  'elcentral': { months: 36, reason: 'Elcentralen bör kontrolleras regelbundet', suggestedService: 'Elbesiktning' },
  'laddbox': { months: 12, reason: 'Årlig service rekommenderas', suggestedService: 'Laddbox-service' },

  // VVS
  'vvs': { months: 18, reason: 'VVS-system bör kontrolleras regelbundet', suggestedService: 'VVS-kontroll' },
  'varmvattenberedare': { months: 12, reason: 'Årlig service förlänger livslängden', suggestedService: 'Varmvattenberedare-service' },
  'golvvarme': { months: 24, reason: 'Golvvärme bör kontrolleras vartannat år', suggestedService: 'Golvvärme-kontroll' },
  'värmepump': { months: 12, reason: 'Årlig service krävs för garanti', suggestedService: 'Värmepump-service' },

  // Bygg
  'tak': { months: 36, reason: 'Taket bör inspekteras vart 3:e år', suggestedService: 'Takinspektion' },
  'fasad': { months: 60, reason: 'Fasaden kan behöva underhåll efter 5 år', suggestedService: 'Fasadkontroll' },
  'altan': { months: 24, reason: 'Altanen kan behöva oljning/behandling', suggestedService: 'Altan-underhåll' },
  'malning': { months: 36, reason: 'Ommålning brukar behövas efter 3-5 år', suggestedService: 'Ommålning' },

  // Generellt
  'renovering': { months: 36, reason: 'Dags att följa upp renoveringen', suggestedService: 'Uppföljning' },
  'default': { months: 18, reason: 'Vi vill säkerställa att allt fortfarande fungerar bra', suggestedService: 'Uppföljning och kontroll' },
}

/**
 * Match a project name/description to a job lifecycle key.
 * Returns the best matching key, or 'default' if no match.
 */
function matchJobType(projectName: string, projectDescription?: string | null): string {
  const text = `${projectName || ''} ${projectDescription || ''}`.toLowerCase()

  // Normalize Swedish characters for matching
  const normalized = text
    .replace(/ä/g, 'a')
    .replace(/å/g, 'a')
    .replace(/ö/g, 'o')

  // Check each lifecycle key against the text (longest match first for specificity)
  const sortedKeys = Object.keys(JOB_LIFECYCLE)
    .filter(k => k !== 'default')
    .sort((a, b) => b.length - a.length)

  for (const key of sortedKeys) {
    // Also normalize the key for matching
    const normalizedKey = key
      .replace(/ä/g, 'a')
      .replace(/å/g, 'a')
      .replace(/ö/g, 'o')

    if (text.includes(key) || normalized.includes(normalizedKey)) {
      return key
    }
  }

  return 'default'
}

/**
 * Generate a suggested SMS using Claude Haiku.
 * Falls back to a template-based message if API is unavailable.
 */
async function generateProactiveSms(params: {
  customerName: string
  businessName: string
  jobType: string
  monthsSince: number
  reason: string
  suggestedService: string
  projectName: string
}): Promise<string> {
  const fallbackSms = `Hej ${params.customerName}! Det har gått ${params.monthsSince} månader sedan vi utförde ${params.projectName} hos dig. ${params.reason} — vi erbjuder gärna en kostnadsfri kontroll. /${params.businessName}`

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return fallbackSms
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Skriv ett kort, vänligt SMS (max 160 tecken) på svenska från ett hantverksföretag till en befintlig kund.

Kontext:
- Kundnamn: ${params.customerName}
- Företagsnamn: ${params.businessName}
- Jobbtyp: ${params.projectName}
- Månader sedan jobbet: ${params.monthsSince}
- Anledning till kontakt: ${params.reason}
- Föreslaget erbjudande: ${params.suggestedService}

Tonen ska vara personlig och omtänksam, inte säljig. Avsluta med /${params.businessName}.
Svara ENBART med SMS-texten, inget annat.`,
        }],
      }),
    })

    if (!response.ok) {
      console.warn('[proactive-care] Haiku API error, using fallback SMS')
      return fallbackSms
    }

    const data = await response.json()
    const content = data?.content?.[0]?.text?.trim()
    return content || fallbackSms
  } catch (err) {
    console.warn('[proactive-care] Failed to generate SMS via Haiku:', err)
    return fallbackSms
  }
}

export async function checkProactiveCare(businessId: string): Promise<{
  success: boolean
  contactsCreated: number
  error?: string
}> {
  const supabase = getServerSupabase()
  let contactsCreated = 0

  try {
    // Kolla om proactive care är aktiverat (default: true)
    const { data: settings } = await supabase
      .from('automation_settings')
      .select('settings')
      .eq('business_id', businessId)
      .maybeSingle()

    const proactiveEnabled = settings?.settings?.proactive_care_enabled !== false
    if (!proactiveEnabled) {
      return { success: true, contactsCreated: 0 }
    }

    // Hämta företagsinfo
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, contact_name')
      .eq('business_id', businessId)
      .single()

    if (!business) {
      return { success: false, contactsCreated: 0, error: 'Business not found' }
    }

    // Hämta alla avslutade projekt med kund
    const { data: projects, error: projError } = await supabase
      .from('projects')
      .select(`
        id,
        name,
        description,
        status,
        completed_at,
        customer_id,
        customer:customers(id, name, phone_number, email)
      `)
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)

    if (projError) {
      return { success: false, contactsCreated: 0, error: projError.message }
    }

    if (!projects || projects.length === 0) {
      return { success: true, contactsCreated: 0 }
    }

    const now = new Date()
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString()

    for (const project of projects) {
      // Max 3 proactive contacts per business per day
      if (contactsCreated >= 3) break

      const customer = project.customer as any
      if (!customer?.phone_number) continue
      if (!project.completed_at) continue

      // Determine job type by keyword matching
      const jobType = matchJobType(project.name, project.description)
      const lifecycle = JOB_LIFECYCLE[jobType] || JOB_LIFECYCLE['default']

      // Calculate months since completion
      const completedDate = new Date(project.completed_at)
      const monthsSince = Math.floor(
        (now.getTime() - completedDate.getTime()) / (30.44 * 24 * 60 * 60 * 1000)
      )

      // Check if enough months have passed
      if (monthsSince < lifecycle.months) continue

      // Also skip if too far past (more than 6 months over cycle — avoid ancient contacts)
      if (monthsSince > lifecycle.months + 6) continue

      // Dedup: check pending_approvals for this customer+project in last 60 days
      const { count: existingApprovalCount } = await supabase
        .from('pending_approvals')
        .select('*', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('approval_type', 'proactive_care')
        .gte('created_at', sixtyDaysAgo)
        .contains('payload', { project_id: project.id, customer_id: customer.id })

      if (existingApprovalCount && existingApprovalCount > 0) continue

      // Also check v3_automation_logs for dedup
      const { data: existingLog } = await supabase
        .from('v3_automation_logs')
        .select('id')
        .eq('business_id', businessId)
        .eq('rule_name', 'proactive_customer_care')
        .gte('created_at', sixtyDaysAgo)
        .contains('context', { project_id: project.id })
        .limit(1)

      if (existingLog && existingLog.length > 0) continue

      // Generate suggested SMS
      const suggestedSms = await generateProactiveSms({
        customerName: customer.name || 'kund',
        businessName: business.business_name || '',
        jobType,
        monthsSince,
        reason: lifecycle.reason,
        suggestedService: lifecycle.suggestedService,
        projectName: project.name || 'jobbet',
      })

      // Create pending_approval
      const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

      await supabase.from('pending_approvals').insert({
        id: approvalId,
        business_id: businessId,
        approval_type: 'proactive_care',
        title: `Proaktiv kontakt: ${customer.name} — ${lifecycle.suggestedService}`,
        description: `${lifecycle.reason}. Senaste jobb: ${project.name} (${monthsSince} månader sedan)`,
        payload: {
          customer_id: customer.id,
          customer_name: customer.name,
          customer_phone: customer.phone_number,
          project_id: project.id,
          project_name: project.name,
          months_since: monthsSince,
          job_type: jobType,
          suggested_service: lifecycle.suggestedService,
          suggested_sms: suggestedSms,
        },
        status: 'pending',
        risk_level: 'medium',
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      })

      // Log to v3_automation_logs
      await supabase.from('v3_automation_logs').insert({
        business_id: businessId,
        rule_name: 'proactive_customer_care',
        trigger_type: 'cron',
        action_type: 'create_approval',
        status: 'success',
        context: {
          customer_id: customer.id,
          customer_name: customer.name,
          project_id: project.id,
          project_name: project.name,
          job_type: jobType,
          months_since: monthsSince,
          suggested_service: lifecycle.suggestedService,
        },
      })

      contactsCreated++
    }

    return { success: true, contactsCreated }
  } catch (err: any) {
    console.error('[proactive-care] Error:', err)
    return { success: false, contactsCreated, error: err.message }
  }
}
