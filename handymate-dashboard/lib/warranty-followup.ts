import { getServerSupabase } from '@/lib/supabase'
import { canContactCustomer } from '@/lib/outbound/frequency-guard'
import { logAutomationActivity } from '@/lib/automations'

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
 *
 * VP3 (gap 3, tasks/vilande-pengar-masterplan.md): väckt från död — frågade
 * `projects`/`customers` (heter `project`/`customer`) med en embed som
 * PostgREST avvisar (FK saknas, PGRST200). Nu rätt tabeller, separat
 * kundhämtning, fel LARMAR via logAutomationActivity, VP1:s frekvenstak
 * före kortskapande, och loggen går till v3_automation_logs (den gamla
 * automation_logs-inserten sveps inte av driftlarmet och saknade
 * approval-koppling).
 */
export async function checkWarrantyFollowups(businessId: string): Promise<WarrantyResult> {
  const supabase = getServerSupabase()

  // ═══ SAMMA DÖDA LÄSNING SOM I proactive-care.ts (2026-08-07) ═══
  //
  // `automation_settings.settings` finns inte — tabellen är bred och platt
  // (sql/automation_center.sql), utan JSONB-kolumn. Frågan gav 42703, och
  // eftersom alla tre värdena föll tillbaka på sina defaultar har varken
  // avstängningen, garantilängden eller det egna meddelandet någonsin haft
  // effekt. Tre inställningar som såg konfigurerbara ut och var konstanter.
  //
  // Defaultarna behålls oförändrade — det är exakt det beteende som körts i
  // prod hittills, så den här lagningen ändrar inget för någon kund. Det som
  // ändras är att spärren nu läser den kill-switch som faktiskt finns.
  const { data: killSwitch } = await supabase
    .from('business_config')
    .select('agents_globally_paused')
    .eq('business_id', businessId)
    .maybeSingle()

  const warrantyMonths = 12
  const customMessage = null as string | null

  if (killSwitch?.agents_globally_paused) {
    return { success: true, followupsCreated: 0 }
  }

  // Beräkna datumfönster: warrantyMonths månader sedan ± 3 dagar
  const targetDate = new Date()
  targetDate.setMonth(targetDate.getMonth() - warrantyMonths)
  const fromDate = new Date(targetDate)
  fromDate.setDate(fromDate.getDate() - 3)
  const toDate = new Date(targetDate)
  toDate.setDate(toDate.getDate() + 3)

  // Hämta avslutade projekt i datumfönstret (kunder batch-hämtas separat —
  // ingen embed: project→customer-FK:n saknas i prod, PostgREST ger PGRST200)
  const { data: projects, error: projError } = await supabase
    .from('project')
    .select('project_id, name, status, completed_at, customer_id')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('completed_at', fromDate.toISOString())
    .lte('completed_at', toDate.toISOString())

  if (projError) {
    await logAutomationActivity({
      businessId,
      automationType: 'warranty_followup',
      action: 'fetch_projects',
      description: `Garantiuppföljning kunde inte hämta projekt: ${projError.message}`,
      status: 'failed',
    }).catch(() => { /* best-effort */ })
    return { success: false, followupsCreated: 0, error: projError.message }
  }

  if (!projects || projects.length === 0) {
    return { success: true, followupsCreated: 0 }
  }

  // Batch-hämta kunder för projekten
  const wCustomerIds = Array.from(
    new Set(projects.map(p => p.customer_id).filter((id): id is string => !!id))
  )
  const wCustomerMap = new Map<string, { customer_id: string; name: string | null; phone_number: string | null; email: string | null }>()
  if (wCustomerIds.length > 0) {
    const { data: customers, error: custError } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number, email')
      .eq('business_id', businessId)
      .in('customer_id', wCustomerIds)
    if (custError) {
      await logAutomationActivity({
        businessId,
        automationType: 'warranty_followup',
        action: 'fetch_customers',
        description: `Garantiuppföljning kunde inte hämta kunder: ${custError.message}`,
        status: 'failed',
      }).catch(() => { /* best-effort */ })
      return { success: false, followupsCreated: 0, error: custError.message }
    }
    for (const c of customers || []) wCustomerMap.set(String(c.customer_id), c)
  }

  // Hämta företagsinfo
  const { data: business } = await supabase
    .from('business_config')
    .select('business_name, contact_name')
    .eq('business_id', businessId)
    .single()

  let followupsCreated = 0

  for (const project of projects) {
    const customer = project.customer_id ? wCustomerMap.get(String(project.customer_id)) : undefined
    if (!customer?.phone_number && !customer?.email) continue

    // Kolla att vi inte redan skapat en warranty-approval för detta projekt
    const { count } = await supabase
      .from('pending_approvals')
      .select('*', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('approval_type', 'warranty_followup')
      .contains('payload', { project_id: project.project_id })

    if (count && count > 0) continue

    // VP1:s gemensamma frekvenstak (gap 9) — nu när motorn väckts ska den
    // inte kunna dubbla ovanpå veckans övriga outbound-kort till kunden.
    if (customer.customer_id) {
      const freq = await canContactCustomer(supabase, businessId, String(customer.customer_id))
      if (!freq.allowed) continue
    }

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
        // 'agent' (inte 'agent_id') — exekveringen och VP2-attributionen
        // läser payload.agent. Samma fältnamn som hanna-outbound.
        agent: 'hanna',
        project_id: project.project_id,
        project_name: project.name,
        customer_id: customer.customer_id,
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

    // VP3: v3_automation_logs istället för gamla automation_logs — samma
    // loggtabell som resten av agentflödet (driftlarm/scoreboard/dedupe
    // läser den) och med approval_id-kopplingen VP2 introducerade.
    const { error: logErr } = await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      agent_id: 'hanna',
      rule_name: 'warranty_followup',
      trigger_type: 'cron',
      action_type: 'create_approval',
      status: 'success',
      approval_id: approvalId,
      context: { project_id: project.project_id, customer_id: customer.customer_id, customer_name: customer.name },
    })
    if (logErr) {
      console.warn('[warranty-followup] v3-logg insert misslyckades (icke-blockerande):', logErr.message)
    }

    followupsCreated++
  }

  return { success: true, followupsCreated }
}
