import { getServerSupabase } from '@/lib/supabase'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

interface WarrantyResult {
  success: boolean
  followupsCreated: number
  error?: string
}

/**
 * Kontrollerar om jobb avslutades ~12 månader sedan
 * och skapar pending_approval för uppföljning.
 * Körs dagligen via agent-context cron.
 */
export async function checkWarrantyFollowups(businessId: string): Promise<WarrantyResult> {
  const supabase = getServerSupabase()

  // Kolla om warranty_followup är aktiverad
  const { data: settings } = await supabase
    .from('automation_settings')
    .select('settings')
    .eq('business_id', businessId)
    .maybeSingle()

  const warrantyEnabled = settings?.settings?.warranty_followup_enabled !== false // default true
  const warrantyMonths = settings?.settings?.warranty_followup_months || 12
  const customMessage = settings?.settings?.warranty_followup_message || null

  if (!warrantyEnabled) {
    return { success: true, followupsCreated: 0 }
  }

  // Beräkna datumfönster: warrantyMonths månader sedan ± 3 dagar
  const targetDate = new Date()
  targetDate.setMonth(targetDate.getMonth() - warrantyMonths)
  const fromDate = new Date(targetDate)
  fromDate.setDate(fromDate.getDate() - 3)
  const toDate = new Date(targetDate)
  toDate.setDate(toDate.getDate() + 3)

  // Hämta avslutade projekt i datumfönstret
  const { data: projects, error: projError } = await supabase
    .from('projects')
    .select(`
      id,
      name,
      status,
      completed_at,
      customer_id,
      customer:customers(id, name, phone_number, email)
    `)
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('completed_at', fromDate.toISOString())
    .lte('completed_at', toDate.toISOString())

  if (projError) {
    return { success: false, followupsCreated: 0, error: projError.message }
  }

  if (!projects || projects.length === 0) {
    return { success: true, followupsCreated: 0 }
  }

  // Hämta företagsinfo
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name')
    .eq('business_id', businessId)
    .single()

  let followupsCreated = 0

  for (const project of projects) {
    const customer = project.customer as any
    if (!customer?.phone_number && !customer?.email) continue

    // Kolla att vi inte redan skapat en warranty-approval för detta projekt
    const { count } = await supabase
      .from('pending_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('approval_type', 'warranty_followup')
      .contains('payload', { project_id: project.id })

    if (count && count > 0) continue

    // Generera SMS-text
    const completedDate = new Date(project.completed_at)
    const monthsAgo = warrantyMonths
    const smsText = customMessage
      ? customMessage
        .replace('{namn}', customer.name || 'kund')
        .replace('{jobb}', project.name || 'jobbet')
        .replace('{företag}', business?.business_name || '')
      : `Hej ${customer.name || ''}! Det är ${monthsAgo} månader sedan vi avslutade ${project.name || 'jobbet'} hos dig. Allt fungerar som det ska? Vi erbjuder gärna en kostnadsfri kontroll. Hör av dig! /${business?.business_name || ''}`

    const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    await supabase.from('pending_approvals').insert({
      id: approvalId,
      business_id: businessId,
      approval_type: 'warranty_followup',
      title: `🔧 Garantiuppföljning — ${customer.name}`,
      description: `${project.name} avslutades ${completedDate.toLocaleDateString('sv-SE')}. Skicka uppföljning?`,
      payload: {
        project_id: project.id,
        project_name: project.name,
        customer_id: customer.id,
        customer_name: customer.name,
        customer_phone: customer.phone_number,
        customer_email: customer.email,
        completed_at: project.completed_at,
        months_since: monthsAgo,
        suggested_sms: smsText,
      },
      status: 'pending',
      risk_level: 'low',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })

    // Logga i automation_logs
    await supabase.from('automation_logs').insert({
      business_id: businessId,
      rule_name: 'warranty_followup',
      trigger_type: 'cron',
      status: 'pending_approval',
      input: { project_id: project.id, customer_name: customer.name },
      output: { approval_id: approvalId },
    }).catch(() => {}) // Ignorera om tabellen inte finns

    followupsCreated++
  }

  return { success: true, followupsCreated }
}
