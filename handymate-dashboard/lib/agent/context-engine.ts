/**
 * V5 Context Engine — nattlig analys av företagsstatus
 *
 * Hämtar rådata från Supabase, skickar till Claude Sonnet,
 * och upserar tolkad insikt till agent_context-tabellen.
 */

import { getServerSupabase } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const MODEL = 'claude-sonnet-4-20250514'
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

interface AgentContextResult {
  business_health: 'strong' | 'attention' | 'critical'
  key_insights: Array<{ type: string; message: string; action_needed: boolean }>
  recommended_priorities: Array<{ priority: number; description: string; lead_id?: string }>
}

export async function generateAgentContext(businessId: string): Promise<{
  success: boolean
  tokens_used?: number
  error?: string
}> {
  const supabase = getServerSupabase()

  try {
    // 1. Hämta rådata parallellt
    const today = new Date().toISOString().split('T')[0]
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const [
      leadsRes,
      overdueRes,
      bookingsRes,
      approvalsRes,
      logsRes,
      settingsRes,
      configRes,
    ] = await Promise.all([
      // Öppna leads
      supabase
        .from('leads')
        .select('lead_id, name, phone, pipeline_stage_key, score, urgency, estimated_value, created_at')
        .eq('business_id', businessId)
        .not('pipeline_stage_key', 'in', '("completed","lost")')
        .order('created_at', { ascending: false })
        .limit(20),

      // Förfallna fakturor
      supabase
        .from('invoice')
        .select('invoice_id, invoice_number, total, due_date, customer_id, status')
        .eq('business_id', businessId)
        .in('status', ['sent', 'overdue'])
        .lt('due_date', today),

      // Dagens bokningar
      supabase
        .from('booking')
        .select('booking_id, customer_name, address, start_time, end_time, status')
        .eq('business_id', businessId)
        .gte('start_time', `${today}T00:00:00`)
        .lte('start_time', `${today}T23:59:59`)
        .order('start_time'),

      // Väntande approvals
      supabase
        .from('pending_approvals')
        .select('approval_id', { count: 'exact', head: true })
        .eq('business_id', businessId)
        .eq('status', 'pending'),

      // Senaste 30 dagarnas automation-loggar
      supabase
        .from('v3_automation_logs')
        .select('action_type, status, created_at')
        .eq('business_id', businessId)
        .gte('created_at', thirtyDaysAgo)
        .order('created_at', { ascending: false })
        .limit(50),

      // Automation settings
      supabase
        .from('v3_automation_settings')
        .select('*')
        .eq('business_id', businessId)
        .maybeSingle(),

      // Business config
      supabase
        .from('business_config')
        .select('business_name, contact_name, branch, personal_phone')
        .eq('business_id', businessId)
        .single(),
    ])

    const leads = leadsRes.data || []
    const overdueInvoices = overdueRes.data || []
    const todaysBookings = bookingsRes.data || []
    const pendingApprovalsCount = approvalsRes.count || 0
    const recentLogs = logsRes.data || []
    const settings = settingsRes.data
    const config = configRes.data

    // 2. Bygg sammanfattning för Claude
    const dataSnapshot = {
      business_name: config?.business_name || 'Okänt',
      branch: config?.branch || 'other',
      open_leads: leads.map((l: any) => ({
        name: l.name,
        stage: l.pipeline_stage_key,
        score: l.score,
        urgency: l.urgency,
        value: l.estimated_value,
        days_old: Math.floor((Date.now() - new Date(l.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      overdue_invoices: overdueInvoices.map((i: any) => ({
        number: i.invoice_number,
        total: i.total,
        days_overdue: Math.floor((Date.now() - new Date(i.due_date).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      todays_bookings: todaysBookings.map((b: any) => ({
        customer: b.customer_name,
        address: b.address,
        time: b.start_time,
      })),
      pending_approvals: pendingApprovalsCount,
      recent_automation_actions: recentLogs.length,
      has_personal_phone: !!config?.personal_phone,
      automation_settings: settings ? {
        work_start: settings.work_start,
        work_end: settings.work_end,
        lead_response_target: settings.lead_response_target_minutes,
      } : null,
    }

    // 3. Skicka till Claude
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: `Du är Handymates analysmotor. Analysera detta företags nuläge och returnera ENDAST giltig JSON utan markdown.
Schema: { "business_health": "strong"|"attention"|"critical", "key_insights": [{ "type": string, "message": string, "action_needed": boolean }], "recommended_priorities": [{ "priority": number, "description": string, "lead_id": string|null }] }
business_health: "strong" om allt flödar, "attention" om något kräver handling inom 24h, "critical" om intäkter är i fara.
Var konkret och handlingsorienterad. Skriv på svenska. Max 3 insights, max 3 priorities.
Om det inte finns data att analysera, returnera health "strong" med tom insights/priorities.`,
      messages: [
        {
          role: 'user',
          content: `Analysera detta företags nuläge:\n${JSON.stringify(dataSnapshot, null, 2)}`,
        },
      ],
    })

    const tokensUsed = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)

    // 4. Parsa svar
    const textContent = response.content.find(b => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return { success: false, error: 'No text response from Claude' }
    }

    let analysis: AgentContextResult
    try {
      analysis = JSON.parse(textContent.text)
    } catch {
      console.error('[ContextEngine] Failed to parse Claude response:', textContent.text)
      return { success: false, error: 'Invalid JSON from Claude', tokens_used: tokensUsed }
    }

    // 5. Hämta säsongsdata
    let slowMonths: number[] = []
    let peakMonths: number[] = []
    try {
      const { data: seasonData } = await supabase
        .from('seasonality_insights')
        .select('month, is_slow_month, is_peak_month')
        .eq('business_id', businessId)
      if (seasonData) {
        slowMonths = seasonData.filter((s: any) => s.is_slow_month).map((s: any) => s.month)
        peakMonths = seasonData.filter((s: any) => s.is_peak_month).map((s: any) => s.month)
      }
    } catch { /* non-blocking */ }

    // 6. Upserta till agent_context
    const { error: upsertError } = await supabase
      .from('agent_context')
      .upsert(
        {
          business_id: businessId,
          generated_at: new Date().toISOString(),
          open_leads_count: leads.length,
          overdue_invoices_count: overdueInvoices.length,
          todays_jobs: todaysBookings.map((b: any) => ({
            booking_id: b.booking_id,
            customer_name: b.customer_name,
            address: b.address,
            time: b.start_time,
          })),
          pending_approvals_count: pendingApprovalsCount,
          business_health: analysis.business_health,
          key_insights: analysis.key_insights,
          recommended_priorities: analysis.recommended_priorities,
          slow_months: slowMonths,
          peak_months: peakMonths,
          model_used: MODEL,
          tokens_used: tokensUsed,
        },
        { onConflict: 'business_id' }
      )

    if (upsertError) {
      console.error('[ContextEngine] Upsert error:', upsertError)
      return { success: false, error: upsertError.message, tokens_used: tokensUsed }
    }

    return { success: true, tokens_used: tokensUsed }
  } catch (err: any) {
    console.error('[ContextEngine] Error:', err)
    return { success: false, error: err.message }
  }
}

/**
 * Nattlig preferensanalys — analyserar learning_events och
 * upserar tolkade preferenser till business_preferences.
 */
export async function updateBusinessPreferences(businessId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = getServerSupabase()

  try {
    // Hämta senaste 50 learning_events
    const { data: events, error: fetchError } = await supabase
      .from('learning_events')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (fetchError) {
      console.error('[Preferences] Fetch error:', fetchError)
      return { success: false, error: fetchError.message }
    }

    if (!events || events.length < 3) {
      // Otillräcklig data för att dra slutsatser
      return { success: true }
    }

    // Skicka till Claude Haiku för analys
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    })

    const response = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 512,
      system: `Analysera dessa inlärningshändelser och identifiera mönster i hur hantverkaren vill att agenten ska agera.
Returnera ENDAST giltig JSON utan markdown:
{
  "communication_tone": "formal"|"casual"|"brief"|null,
  "pricing_tendency": "premium"|"competitive"|"flexible"|null,
  "lead_response_style": "immediate"|"considered"|"selective"|null,
  "preferred_sms_length": "short"|"medium"|"detailed"|null,
  "custom_preferences": [{ "key": string, "value": string, "confidence": number }]
}
Basera svaret enbart på faktiska mönster. Om otillräcklig data — returnera null för det fältet.`,
      messages: [
        {
          role: 'user',
          content: `Analysera dessa ${events.length} inlärningshändelser:\n${JSON.stringify(events, null, 2)}`,
        },
      ],
    })

    const textContent = response.content.find(b => b.type === 'text')
    if (!textContent || textContent.type !== 'text') {
      return { success: false, error: 'No text response from Claude' }
    }

    let preferences: {
      communication_tone: string | null
      pricing_tendency: string | null
      lead_response_style: string | null
      preferred_sms_length: string | null
      custom_preferences: Array<{ key: string; value: string; confidence: number }> | null
    }

    try {
      preferences = JSON.parse(textContent.text)
    } catch {
      console.error('[Preferences] Failed to parse Claude response:', textContent.text)
      return { success: false, error: 'Invalid JSON from Claude' }
    }

    // Upserta till business_preferences
    const { error: upsertError } = await supabase
      .from('business_preferences')
      .upsert(
        {
          business_id: businessId,
          updated_at: new Date().toISOString(),
          communication_tone: preferences.communication_tone,
          pricing_tendency: preferences.pricing_tendency,
          lead_response_style: preferences.lead_response_style,
          preferred_sms_length: preferences.preferred_sms_length,
          custom_preferences: preferences.custom_preferences,
        },
        { onConflict: 'business_id' }
      )

    if (upsertError) {
      console.error('[Preferences] Upsert error:', upsertError)
      return { success: false, error: upsertError.message }
    }

    return { success: true }
  } catch (err: any) {
    console.error('[Preferences] Error:', err)
    return { success: false, error: err.message }
  }
}
