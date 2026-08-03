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

// V80: handleQuoteAccepted (tyst auto-skapa-projekt-och-flytta-till-won när
// en deal manuellt drogs till 'quote_accepted') är borttagen tillsammans med
// steget självt. Ersatt medvetet av WonModal (app/dashboard/pipeline/
// components/WonModal.tsx) — hantverkaren FRÅGAS nu istället för att ett
// projekt skapas tyst, oavsett om flytten går via drag-and-drop eller
// DealModal-stegväljaren. Se sql/v80_merge_accepted_into_won.sql.

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
