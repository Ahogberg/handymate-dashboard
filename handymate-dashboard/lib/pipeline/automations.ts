/**
 * V28 — Pipeline automation handlers
 * Triggered when a deal moves between stages.
 */

import { getServerSupabase } from '@/lib/supabase'
import type { PipelineStageId } from './stages'

export async function onDealStageChanged(
  dealId: string,
  newStage: PipelineStageId,
  oldStage: PipelineStageId,
  businessId: string
) {
  // Cancel all pending automation tasks for this deal
  await cancelPendingTasks(dealId)

  switch (newStage) {
    case 'new_inquiry':
      await handleNewInquiry(dealId, businessId)
      break
    case 'contacted':
      await handleContacted(dealId, businessId)
      break
    case 'quote_sent':
      await handleQuoteSent(dealId, businessId)
      break
    case 'quote_accepted':
      await handleQuoteAccepted(dealId, businessId)
      break
    case 'lost':
      await handleLost(dealId, businessId)
      break
  }
}

async function cancelPendingTasks(dealId: string) {
  const supabase = getServerSupabase()
  await supabase
    .from('deal_automation_tasks')
    .update({ cancelled_at: new Date().toISOString() })
    .eq('deal_id', dealId)
    .is('executed_at', null)
    .is('cancelled_at', null)
}

async function scheduleTask(businessId: string, dealId: string, taskType: string, delayHours: number, payload: Record<string, unknown> = {}) {
  const supabase = getServerSupabase()
  const scheduledAt = new Date(Date.now() + delayHours * 3600000).toISOString()
  await supabase.from('deal_automation_tasks').insert({
    business_id: businessId,
    deal_id: dealId,
    task_type: taskType,
    scheduled_at: scheduledAt,
    payload,
  })
}

async function handleNewInquiry(dealId: string, businessId: string) {
  // Schedule 24h reminder if not contacted
  await scheduleTask(businessId, dealId, 'reminder_no_contact', 24, {
    message: 'Du har ett obesvarat lead',
  })
}

async function handleContacted(dealId: string, businessId: string) {
  const supabase = getServerSupabase()

  // Log first contact time
  await supabase.from('deal').update({
    first_response_at: new Date().toISOString(),
  }).eq('id', dealId).is('first_response_at', null)

  // Schedule 72h reminder to send quote
  await scheduleTask(businessId, dealId, 'reminder_send_quote', 72, {
    message: 'Påminnelse: Skicka offert',
  })
}

async function handleQuoteSent(dealId: string, businessId: string) {
  // Schedule follow-up sequence
  await scheduleTask(businessId, dealId, 'followup_quote_3d', 72, {
    message: 'Har du haft chans att titta på offerten?',
  })
  await scheduleTask(businessId, dealId, 'followup_quote_7d', 168, {
    message: 'Uppföljning: offert väntar på svar',
  })
  await scheduleTask(businessId, dealId, 'followup_quote_14d', 336, {
    message: 'Sista påminnelse om offerten',
  })
}

async function handleQuoteAccepted(dealId: string, businessId: string) {
  // Auto-create project from deal + quote
  const supabase = getServerSupabase()

  try {
    const { data: deal } = await supabase
      .from('deal')
      .select('*, customer:customer(*)')
      .eq('id', dealId)
      .single()

    if (!deal) return

    // Check if project already exists for this deal
    const { data: existingProject } = await supabase
      .from('project')
      .select('project_id')
      .eq('deal_id', dealId)
      .single()

    if (!existingProject) {
      // Hämta offerttitel som fallback om dealen saknar titel
      let quoteTitle: string | null = null
      if (deal.quote_id) {
        const { data: q } = await supabase
          .from('quotes')
          .select('title')
          .eq('quote_id', deal.quote_id)
          .single()
        quoteTitle = q?.title ?? null
      }

      // Projektnumret matchar deal-numret så att hantverkaren ser samma
      // ärende-id i säljtratten och i projektlistan (deal #1003 → P-1003).
      const projectNumber = deal.deal_number ? `P-${deal.deal_number}` : null
      const projectName = deal.title || quoteTitle || 'Projekt'

      await supabase.from('project').insert({
        project_id: 'proj_' + Math.random().toString(36).substring(2, 14),
        business_id: businessId,
        customer_id: deal.customer_id,
        deal_id: dealId,
        quote_id: deal.quote_id,
        project_number: projectNumber,
        name: projectName,
        description: deal.description,
        budget_amount: deal.value,
        status: 'active',
      })

      // Synka räknaren så framtida fristående projekt inte återanvänder samma nummer
      if (deal.deal_number) {
        await supabase.rpc('bump_counter', {
          p_business_id: businessId,
          p_counter_type: 'project',
          p_min_value: deal.deal_number,
        })
      }
    }

    // Move deal to 'won'
    const { data: wonStage } = await supabase
      .from('pipeline_stage')
      .select('id')
      .eq('business_id', businessId)
      .eq('slug', 'won')
      .single()

    if (wonStage) {
      await supabase.from('deal').update({
        stage_id: wonStage.id,
        won_at: new Date().toISOString(),
        closed_at: new Date().toISOString(),
      }).eq('id', dealId)
    }
  } catch (err) {
    console.error('[Pipeline Automation] handleQuoteAccepted error:', err)
  }
}

async function handleLost(dealId: string, businessId: string) {
  const supabase = getServerSupabase()

  // Set lost_at
  await supabase.from('deal').update({
    lost_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
  }).eq('id', dealId)

  // Schedule reactivation reminder in 90 days
  await scheduleTask(businessId, dealId, 'reactivation_90d', 2160, {
    message: 'Kunden tackade nej för 3 månader sedan. Dags att höra av sig igen?',
  })
}
