import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { approvalArtifactId, insertApprovalArtifact } from './artifact-write'
import { interpolateApprovalTemplate } from './automation-message'

const purpose = 'pipeline:execution'
type Plan = { leadId: string; leadName: string; customerId: string | null; previous: string | null; next: string;
  fromLabel: string; toLabel: string; proposals: Array<{ key: string; approvalType: string; title: string; description: string; payload: Record<string, any> }> }
type Outcome = { id: string; ok: boolean; message: string }
async function journal(db: SupabaseClient, businessId: string, approvalId: string) {
  return db.from('v3_automation_logs').select('*').eq('id', approvalArtifactId(businessId, approvalId, purpose)).eq('business_id', businessId).maybeSingle()
}
function reviewFor(plan: Plan, outcomes: Outcome[] = []): ApprovalReview {
  return { title: `Granska pipelinebyte — ${plan.leadName}`, confirmLabel: outcomes.length ? 'Återförsök återstående delar' : 'Flytta och skapa granskningsförslag', messages: [],
    effect: 'Flyttar leaden till det visade steget och skapar nedanstående separata granskningsförslag. Följdförslagen utförs först efter egna beslut. Inga meddelanden skickas och inget projekt eller Fortnox-objekt skapas av detta beslut.',
    details: [{ label: 'Lead', text: plan.leadName }, { label: 'Från', text: plan.fromLabel }, { label: 'Till', text: plan.toLabel },
      ...plan.proposals.map(p => ({ label: 'Separat granskningsförslag', text: `${p.title}: ${p.description}` })),
      ...outcomes.map(o => ({ label: o.id, text: `${o.ok ? 'Klart, körs inte igen' : 'Återstår'}: ${o.message}` })),
    ] }
}
export async function preparePipelineReview(db: SupabaseClient, businessId: string, approvalId: string, payload: Record<string, any>) {
  const previous = await journal(db, businessId, approvalId)
  if (previous.error) throw new Error('Pipelinejournalen kunde inte läsas.')
  if (previous.data) {
    const plan = previous.data.context?.plan as Plan
    if (!plan?.leadId || !Array.isArray(plan.proposals)) throw new Error('Pipelinejournalens underlag saknas.')
    return { review: reviewFor(plan, previous.data.result?.outcomes || []), snapshot: { journal: previous.data }, executionPayload: { plan }, executionEvidence: { plan } }
  }
  const leadId = payload.lead_id || payload.entity_id, next = payload.rule_action_config?.stage_key
  if (typeof leadId !== 'string' || !leadId || typeof next !== 'string' || !next) throw new Error('Lead eller målsteg saknas.')
  const { data: lead, error } = await db.from('leads').select('*').eq('lead_id', leadId).eq('business_id', businessId).maybeSingle()
  if (error || !lead) throw new Error('Leaden kunde inte verifieras i företaget.')
  if (lead.pipeline_stage_key === next) throw new Error('Leaden är redan i målsteget och det finns ingen tidigare journal för detta beslut. Ingen ny följdhandling skapas.')
  if (lead.customer_id) {
    const customer = await db.from('customer').select('customer_id').eq('customer_id', lead.customer_id).eq('business_id', businessId).maybeSingle()
    if (customer.error || !customer.data) throw new Error('Leadens kundkoppling kunde inte verifieras i företaget.')
  }
  const stages = await db.from('pipeline_stages').select('*').eq('business_id', businessId)
  if (stages.error || !stages.data) throw new Error('Pipeline-stegen kunde inte verifieras.')
  stages.data.sort((a, b) => String(a.key).localeCompare(String(b.key)))
  const from = stages.data.find(s => s.key === (lead.pipeline_stage_key || 'new_lead')), to = stages.data.find(s => s.key === next)
  if (!from || !to) throw new Error('Nuvarande steg eller målsteg saknas.')
  if (next !== 'lost' && to.sort_order < from.sort_order) throw new Error('Automationen får inte flytta leaden bakåt.')
  const rules = await db.from('v3_automation_rules').select('*').eq('business_id', businessId).eq('is_active', true).eq('trigger_type', 'event')
  if (rules.error || !rules.data) throw new Error('Pipeline-reglerna kunde inte verifieras.')
  rules.data.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  const context = { lead_id: leadId, entity_id: leadId, customer_id: lead.customer_id || null, customer_name: lead.name || '',
    from_stage: lead.pipeline_stage_key || 'new_lead', to_stage: next, triggered_by: 'automation', parent_approval_id: approvalId }
  const plan: Plan = { leadId, leadName: lead.name || lead.title || leadId, customerId: lead.customer_id || null,
    previous: lead.pipeline_stage_key ?? null, next, fromLabel: from.label, toLabel: to.label,
    proposals: rules.data.filter(r => r.trigger_config?.event_name === 'pipeline_stage_changed').map(r => ({
      key: `rule:${r.id}`, approvalType: r.action_type === 'create_approval' ? r.action_config?.approval_type || 'automation' : 'automation',
      title: r.action_type === 'create_approval' ? interpolateApprovalTemplate(r.action_config?.title || r.name, context) : r.name,
      description: r.action_type === 'create_approval' ? interpolateApprovalTemplate(r.action_config?.description || r.description || '', context) : r.description || `Automation: ${r.action_type}`,
      payload: { ...context, rule_id: r.id, rule_action_type: r.action_type, rule_action_config: r.action_config || {} },
    })) }
  if (to.creates_project) plan.proposals.push({ key: 'project', approvalType: 'automation', title: `Skapa projekt — ${plan.leadName}`,
    description: 'Granska projektunderlag och projektets följdhandlingar före projektskapandet.',
    payload: { ...context, rule_action_type: 'create_project', rule_action_config: {} } })
  return { review: reviewFor(plan), snapshot: { lead, stages: stages.data, rules: rules.data, plan }, executionPayload: { plan }, executionEvidence: { plan } }
}

export async function executePipelineReview(db: SupabaseClient, businessId: string, approvalId: string, reviewed: any) {
  const base = { action: 'automation', action_type: 'pipeline_review' }
  if (!reviewed?.plan?.leadId || !Array.isArray(reviewed.plan.proposals)) return { ...base, ok: false, error: 'Det granskade pipelineunderlaget saknas.' }
  const stored = await insertApprovalArtifact(db, 'v3_automation_logs', 'id', businessId, approvalId, purpose, {
    rule_name: 'Granskat pipelinebyte', trigger_type: 'manual', action_type: 'update_status', status: 'pending_approval',
    approval_id: approvalId, context: { plan: reviewed.plan }, result: { outcomes: [] },
  })
  if (stored.error || !stored.data) return { ...base, ok: false, error: 'Pipelinejournalen kunde inte sparas.' }
  const plan = stored.data.context.plan as Plan
  const outcomes: Outcome[] = [...(stored.data.result?.outcomes || [])]
  const save = async (outcome: Outcome) => {
    const old = outcomes.findIndex(o => o.id === outcome.id)
    if (old >= 0) outcomes[old] = outcome; else outcomes.push(outcome)
    const updated = await db.from('v3_automation_logs').update({ result: { outcomes }, error_message: null,
      status: outcomes.some(o => !o.ok) ? 'failed' : outcomes.length === plan.proposals.length + 1 ? 'success' : 'pending_approval' })
      .eq('id', stored.data.id).eq('business_id', businessId).select('id')
    if (updated.error || !updated.data?.length) throw new Error('Delkvittensen kunde inte sparas. Återförsök kontrollerar tidigare handlingar före ny skrivning.')
  }
  try {
    if (!outcomes.some(o => o.id === 'stage' && o.ok)) {
      const before = await db.from('leads').select('lead_id, pipeline_stage_key').eq('lead_id', plan.leadId).eq('business_id', businessId).maybeSingle()
      if (before.error || !before.data) throw new Error('Leaden kunde inte verifieras.')
      if (before.data.pipeline_stage_key !== plan.next) {
        if ((before.data.pipeline_stage_key ?? null) !== plan.previous) throw new Error('Leaden har flyttats till ett annat steg. Det gamla beslutet kan inte återföras.')
        let update = db.from('leads').update({ pipeline_stage_key: plan.next, updated_at: new Date().toISOString() }).eq('lead_id', plan.leadId).eq('business_id', businessId)
        update = plan.previous == null ? update.is('pipeline_stage_key', null) : update.eq('pipeline_stage_key', plan.previous)
        const changed = await update.select('lead_id')
        if (changed.error || !changed.data?.length) throw new Error('Flytten kunde inte verifieras. Inga följdförslag skapades.')
      }
      await save({ id: 'stage', ok: true, message: `Status verifierad: ${plan.toLabel}` })
    }
    for (const proposal of plan.proposals) {
      if (outcomes.some(o => o.id === proposal.key && o.ok)) continue
      const child = await insertApprovalArtifact(db, 'pending_approvals', 'id', businessId, approvalId, `pipeline:${proposal.key}`, {
        approval_type: proposal.approvalType, title: proposal.title, description: proposal.description, payload: proposal.payload,
        status: 'pending', risk_level: 'medium', expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      })
      await save({ id: proposal.key, ok: !child.error && !!child.data,
        message: child.error?.message || (child.data ? `Granskningsförslag ${child.data.id} finns; handlingen är inte utförd` : 'Förslaget kunde inte verifieras') })
    }
    return { ...base, ok: !outcomes.some(o => !o.ok), partial: outcomes.some(o => !o.ok), outcomes,
      ...(outcomes.some(o => !o.ok) ? { error: 'En eller flera följdförslag kunde inte sparas.' } : {}) }
  } catch (error) {
    await db.from('v3_automation_logs').update({ status: 'failed', error_message: error instanceof Error ? error.message : 'Pipelinefel' })
      .eq('id', stored.data.id).eq('business_id', businessId).then(() => undefined, () => undefined)
    return { ...base, ok: false, partial: outcomes.some(o => o.ok), outcomes, error: error instanceof Error ? error.message : 'Pipelinebeslutet kunde inte slutföras' }
  }
}
