import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { automationSmsText } from './automation-message'

export async function prepareAutomationRejectLeadReview(db: SupabaseClient, businessId: string, payload: Record<string, any>, overrides?: Record<string, string>) {
  const leadId = payload.lead_id || payload.entity_id
  if (typeof leadId !== 'string' || !leadId) throw new Error('Automationen saknar lead.')
  const { data: lead, error } = await db.from('leads').select('lead_id, business_id, customer_id, name, phone, email, status, updated_at')
    .eq('lead_id', leadId).eq('business_id', businessId).maybeSingle()
  if (error || !lead) throw new Error('Leaden kunde inte verifieras i företaget.')
  if (lead.status === 'lost') throw new Error('Leaden är redan markerad som förlorad.')
  const config = payload.rule_action_config || {}
  let sms: { to: string; message: string; customerId: string | null } | null = null
  if (config.sms_template) {
    const { data: business } = await db.from('business_config').select('business_name').eq('business_id', businessId).maybeSingle()
    if (lead.phone && /^\+?[0-9 ()-]{7,20}$/.test(lead.phone)) {
      sms = { to: lead.phone, message: automationSmsText({ template: config.sms_template }, { ...payload, phone: lead.phone, customer_name: lead.name }, business?.business_name || 'Handymate'), customerId: lead.customer_id || null }
    }
  }
  const choices = [{ id: 'prepare_rejection_sms', label: 'Förbered kund-SMS', description: sms ? `Skapar ett separat granskningskort till ${sms.to}; inget SMS skickas nu.` : 'Ingen verifierad SMS-mottagare eller mall finns.', defaultSelected: !!sms }]
  const selected = !!sms && overrides?.prepare_rejection_sms !== 'rejected'
  const executionPayload = { actionType: 'reject_lead', leadId: lead.lead_id, prepareRejectionSms: selected, sms }
  const evidence = { kind: 'automation_reject_lead', lead, executionPayload }
  const review: ApprovalReview = {
    title: `Granska förlorad lead — ${lead.name || lead.lead_id}`,
    effect: 'Markerar leaden som förlorad. Ett valt kund-SMS blir ett separat granskningskort och skickas inte av detta beslut.',
    confirmLabel: 'Markera förlorad med valda följder', choices, messages: [],
    details: [
      { label: 'Lead', text: lead.name || lead.lead_id },
      { label: 'Nuvarande status', text: lead.status },
      { label: 'Ny status', text: 'Förlorad' },
      { label: 'Telefon', text: lead.phone || 'Saknas' },
      { label: 'Kund-SMS', text: sms?.message || 'Inget SMS förbereds' },
      { label: 'Utskick nu', text: 'Inget kundutskick' },
    ],
  }
  return { review, snapshot: { automationRejectLead: evidence }, executionPayload, executionEvidence: evidence }
}
