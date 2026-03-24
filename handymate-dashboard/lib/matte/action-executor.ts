/**
 * Matte Action Executor — exekverar beslut direkt eller via approvals.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { MatteDecision, MatteAction, IncomingSignal } from './intent-agent'
import type { ResolvedEntity } from './resolver'
import type { TimeSlot } from './calendar-slots'

export async function executeMatteActions(
  decision: MatteDecision,
  entity: ResolvedEntity,
  signal: IncomingSignal,
  businessId: string,
  supabase: SupabaseClient,
  availableSlots?: TimeSlot[]
): Promise<void> {
  for (const action of decision.actions) {
    try {
      if (action.autonomous) {
        await executeDirectAction(action, entity, signal, businessId, supabase)
      } else {
        await createApproval(action, decision, entity, businessId, supabase, availableSlots)
      }
    } catch (err) {
      console.error(`[Matte] Action ${action.type} failed:`, err)
    }
  }

  // Skicka kundsvar om alla actions är autonoma
  if (
    decision.customerReply?.send &&
    decision.actions.every(a => a.autonomous) &&
    entity.phone
  ) {
    await sendCustomerReply(decision.customerReply.message, entity, businessId)
  }

  // Logga
  await logMatteAction(decision, entity, signal, businessId, supabase)
}

async function executeDirectAction(
  action: MatteAction,
  entity: ResolvedEntity,
  signal: IncomingSignal,
  businessId: string,
  supabase: SupabaseClient
): Promise<void> {
  switch (action.type) {
    case 'update_project_notes': {
      if (action.params.booking_id) {
        await supabase
          .from('booking')
          .update({ notes: action.params.notes as string })
          .eq('booking_id', action.params.booking_id as string)
          .eq('business_id', businessId)
      }
      break
    }

    case 'mark_invoice_paid': {
      if (action.params.invoice_id) {
        await supabase
          .from('invoice')
          .update({ status: 'paid', paid_at: new Date().toISOString() })
          .eq('invoice_id', action.params.invoice_id as string)
          .eq('business_id', businessId)
      }
      break
    }

    case 'create_lead': {
      const phone = entity.phone || ''
      if (!phone) break

      const { data: existing } = await supabase
        .from('leads')
        .select('lead_id')
        .eq('business_id', businessId)
        .eq('phone', phone)
        .maybeSingle()

      if (!existing) {
        await supabase.from('leads').insert({
          lead_id: `lead_${Math.random().toString(36).substr(2, 12)}`,
          business_id: businessId,
          phone,
          email: entity.email || null,
          name: entity.customerName || null,
          source: `${signal.channel}_inbound`,
          status: 'new',
          pipeline_stage: 'new_inquiry',
          created_at: new Date().toISOString(),
        })
      }
      break
    }

    case 'add_project_event': {
      try {
        await supabase.from('project_events').insert({
          project_id: action.params.booking_id as string,
          business_id: businessId,
          type: (action.params.event_type as string) || 'note',
          description: action.params.description as string,
          created_by: 'matte',
        })
      } catch {
        // Tabell kanske inte finns ännu
      }
      break
    }

    default:
      console.warn(`[Matte] Unhandled autonomous action: ${action.type}`)
  }
}

async function createApproval(
  action: MatteAction,
  decision: MatteDecision,
  entity: ResolvedEntity,
  businessId: string,
  supabase: SupabaseClient,
  availableSlots?: TimeSlot[]
): Promise<void> {
  const id = `appr_matte_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`

  await supabase.from('pending_approvals').insert({
    id,
    business_id: businessId,
    approval_type: action.type,
    title: action.description,
    description: `${entity.customerName ?? 'Okänd kund'}: "${decision.reasoning}"`,
    payload: {
      ...action.params,
      customer_reply_pending: decision.customerReply?.message,
      available_slots: availableSlots || [],
      entity: {
        customerId: entity.customerId,
        leadId: entity.leadId,
        customerName: entity.customerName,
        phone: entity.phone,
        email: entity.email,
      },
    },
    status: 'pending',
    risk_level: 'high',
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  })

  // Push-notis
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  fetch(`${appUrl}/api/push/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      title: `Matte: ${action.description}`,
      body: `${entity.customerName ?? 'Kund'} — ${decision.reasoning.slice(0, 80)}`,
      url: '/dashboard/approvals',
    }),
  }).catch(() => {})
}

async function sendCustomerReply(
  message: string,
  entity: ResolvedEntity,
  businessId: string
): Promise<void> {
  if (!entity.phone) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  await fetch(`${appUrl}/api/sms/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_id: businessId,
      to: entity.phone,
      message,
    }),
  }).catch(err => console.error('[Matte] Reply SMS failed:', err))
}

async function logMatteAction(
  decision: MatteDecision,
  entity: ResolvedEntity,
  signal: IncomingSignal,
  businessId: string,
  supabase: SupabaseClient
): Promise<void> {
  try {
    await supabase.from('v3_automation_logs').insert({
      business_id: businessId,
      rule_name: `matte_${signal.channel}_intelligence`,
      trigger_type: `${signal.channel}_received`,
      action_type: decision.intent,
      status: 'completed',
      context: {
        intent: decision.intent,
        confidence: decision.confidence,
        customer: entity.customerName,
        reasoning: decision.reasoning,
        actions_count: decision.actions.length,
        autonomous_count: decision.actions.filter(a => a.autonomous).length,
        approval_count: decision.actions.filter(a => !a.autonomous).length,
        channel: signal.channel,
      },
      result: {
        actions: decision.actions.map(a => ({ type: a.type, autonomous: a.autonomous })),
        reply_sent: decision.customerReply?.send ?? false,
      },
    })
  } catch (err) {
    console.error('[Matte] Log error:', err)
  }
}
