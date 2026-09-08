import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { approvalArtifactId, insertApprovalArtifact } from './artifact-write'
import { getChecklistsForBranch } from '@/lib/checklist-defaults'
import { interpolateApprovalTemplate } from './automation-message'

type Artifact = { title: string; table: string; key: string; owner: string; purpose: string; values: Record<string, any> }
type Plan = { projectId: string; name: string; artifacts: Artifact[]; details: { label: string; text: string }[] }
const journalId = (business: string, approval: string) => approvalArtifactId(business, approval, 'project:create:journal')
function makeReview(plan: Plan): ApprovalReview {
  return { title: `Granska projekt — ${plan.name}`, confirmLabel: 'Skapa projekt och visade förslag', messages: [],
    effect: 'Skapar projekt och delmål enligt underlaget. Meddelanden, kontrollista och regler blir separata granskningsförslag. Inget SMS, mejl eller Fortnox-anrop görs nu.',
    details: plan.details }
}
export async function prepareProjectCreationReview(db: SupabaseClient, businessId: string, approvalId: string, payload: Record<string, any>) {
  const previous = await db.from('v3_automation_logs').select('*').eq('id', journalId(businessId, approvalId)).eq('business_id', businessId).maybeSingle()
  if (previous.error) throw new Error('Projektjournalen kunde inte läsas.')
  if (previous.data) {
    const plan = previous.data.context?.plan as Plan
    if (!plan?.projectId || !Array.isArray(plan.artifacts)) throw new Error('Projektjournalens underlag saknas.')
    const review = makeReview(plan)
    review.confirmLabel = 'Återförsök återstående delar'
    review.details = [...plan.details, ...(previous.data.result?.outcomes || []).map((o: any) => ({ label: o.title, text: o.ok ? 'Finns redan; körs inte igen' : o.error || 'Återstår' }))]
    return { review, snapshot: { journal: previous.data }, executionPayload: { plan }, executionEvidence: { plan } }
  }
  const leadId = payload.lead_id || payload.entity_id
  if (typeof leadId !== 'string' || !leadId) throw new Error('Lead saknas.')
  const leadResult = await db.from('leads').select('*').eq('lead_id', leadId).eq('business_id', businessId).maybeSingle()
  if (leadResult.error || !leadResult.data) throw new Error('Leaden kunde inte verifieras i företaget.')
  const lead = leadResult.data
  const existing = await db.from('project').select('*').eq('lead_id', leadId).eq('business_id', businessId).limit(1).maybeSingle()
  if (existing.error) throw new Error('Befintligt projekt kunde inte kontrolleras.')
  if (existing.data) {
    const plan: Plan = { projectId: existing.data.project_id, name: existing.data.name, artifacts: [], details: [{ label: 'Befintligt projekt', text: existing.data.name }] }
    return { review: { ...makeReview(plan), confirmLabel: 'Bekräfta befintligt projekt', effect: 'Projektet finns redan. Ingen ny registrering eller följdhandling görs.' }, snapshot: { existing: existing.data }, executionPayload: { plan }, executionEvidence: { plan } }
  }
  const customerResult = lead.customer_id ? await db.from('customer').select('*').eq('customer_id', lead.customer_id).eq('business_id', businessId).maybeSingle() : { data: null, error: null }
  if (customerResult.error || (lead.customer_id && !customerResult.data)) throw new Error('Kundkopplingen kunde inte verifieras i företaget.')
  const customer = customerResult.data
  const quoteResult = await db.from('quotes').select('*').eq('lead_id', leadId).eq('business_id', businessId)
    .in('status', ['signed', 'accepted', 'sent']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (quoteResult.error) throw new Error('Offertunderlaget kunde inte läsas.')
  const quote = quoteResult.data
  if (quote?.customer_id && quote.customer_id !== lead.customer_id) throw new Error('Offerten och leaden tillhör olika kunder.')
  const businessResult = await db.from('business_config').select('business_name, branch, personal_phone, fortnox_connected').eq('business_id', businessId).maybeSingle()
  if (businessResult.error || !businessResult.data) throw new Error('Företagsinställningarna kunde inte läsas.')
  const business = businessResult.data
  const items = quote?.items ?? []
  if (!Array.isArray(items) || items.some(i => !i || !Number.isFinite(Number(i.total)) || Number(i.total) < 0 || !Number.isFinite(Number(i.quantity)) || Number(i.quantity) < 0)) throw new Error('Offertens budgetrader är ofullständiga.')
  const labor = items.filter(i => i.type === 'labor'), hours = labor.reduce((n, i) => n + Number(i.quantity), 0)
  const amount = items.length ? items.reduce((n, i) => n + Number(i.total), 0) : lead.estimated_value == null ? null : Number(lead.estimated_value)
  if (amount != null && (!Number.isFinite(amount) || amount < 0)) throw new Error('Projektbudgeten är ogiltig.')
  const owner = `lead:${leadId}`, projectId = approvalArtifactId(businessId, owner, 'project')
  const name = quote?.title || lead.title || lead.description || 'Nytt projekt'
  const plan: Plan = { projectId, name, artifacts: [], details: [
    { label: 'Projekt', text: name }, { label: 'Kund', text: customer?.name || 'Ingen kundkoppling' },
    { label: 'Offert', text: quote ? `${quote.title || quote.quote_id} (${quote.status})` : 'Ingen offert' },
    { label: 'Budget exklusive moms', text: amount == null ? 'Inte angiven' : `${amount} kr` }, { label: 'Budget timmar', text: String(hours) },
    { label: 'Ansvarig och kalender', text: 'Ingen person tilldelas och ingen kalenderbokning skapas' },
    { label: 'Projektstatus', text: 'Aktivt, utan påstådd kontraktssignering' },
    { label: 'Fortnox', text: business.fortnox_connected ? 'Ett separat granskningskort för projektsynk skapas. Ingen synk utförs av detta beslut.' : 'Inte anslutet; ingen synk' },
  ] }
  plan.artifacts.push({ title: 'Projekt', table: 'project', key: 'project_id', owner, purpose: 'project', values: {
    name, customer_id: lead.customer_id || null, lead_id: leadId, quote_id: quote?.quote_id || null,
    project_type: hours ? items.some(i => i.type === 'material') ? 'mixed' : 'hourly' : items.length ? 'fixed_price' : 'hourly',
    budget_hours: hours || null, budget_amount: amount, status: 'active', current_workflow_stage_id: null, workflow_stage_entered_at: null, workflow_stage_history: [],
    source_lead_data: { lead_title: lead.title, lead_value: lead.estimated_value, lead_source: lead.source, lead_address: lead.address || null, created_from: 'reviewed_automation' },
  } })
  if (labor.length > 1) labor.forEach((i, index) => {
    const title = i.name || i.description || `Moment ${index + 1}`
    plan.details.push({ label: 'Delmål', text: `${title}: ${i.quantity} timmar, ${i.total} kr` })
    plan.artifacts.push({ title, table: 'project_milestone', key: 'milestone_id', owner, purpose: `milestone:${index}`, values: {
      project_id: projectId, name: title, budget_hours: Number(i.quantity), budget_amount: Number(i.total), sort_order: index, status: 'pending',
    } })
  })
  const proposal = (purpose: string, title: string, type: string, p: any, description = 'Förberett vid projektskapande; handlingen kräver eget beslut.') => {
    plan.details.push({ label: 'Separat granskningsförslag', text: title })
    plan.artifacts.push({ title, table: 'pending_approvals', key: 'id', owner: approvalId, purpose, values: {
      approval_type: type, title, description, status: 'pending', risk_level: 'medium',
      payload: { ...p, project_id: projectId, parent_approval_id: approvalId },
    } })
  }
  if (business.fortnox_connected) proposal('fortnox_project', 'Granska projektsynk till Fortnox', 'automation', { rule_action_type: 'sync_to_fortnox', rule_action_config: { entity_type: 'project' }, entity_id: projectId })
  const checklist = getChecklistsForBranch(business.branch || '')[0]
  if (checklist) proposal('checklist', `Checklista: ${checklist.name}`, 'checklist_forslag', { template_name: checklist.name, template_category: checklist.category, template_items: checklist.items })
  if (business.personal_phone) {
    const text = `Projekt skapat: "${name}" för ${customer?.name || lead.name || 'okänd kund'}.`
    plan.details.push({ label: 'Internnotis som ska granskas separat', text: `${business.personal_phone}: ${text}` })
    proposal('internal_sms', 'Granska internnotis om nytt projekt', 'send_sms', { recipient: 'internal', to: business.personal_phone, message: text })
  }
  if (customer?.phone_number && customer.portal_token && customer.portal_enabled) {
    const text = `Hej ${customer.name || ''}! Ditt projekt hos ${business.business_name} har startats. Följ projektets gång här: ${process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'}/portal/${customer.portal_token}?tab=projects`
    plan.details.push({ label: 'Kundbesked som ska granskas separat', text: `${customer.phone_number}: ${text}` })
    proposal('customer_sms', 'Granska kundbesked om nytt projekt', 'send_sms', { customer_id: customer.customer_id, to: customer.phone_number, message: text })
  }
  const rules = await db.from('v3_automation_rules').select('*').eq('business_id', businessId).eq('is_active', true).eq('trigger_type', 'event')
  if (rules.error || !rules.data) throw new Error('Projektreglerna kunde inte läsas.')
  rules.data.sort((a, b) => String(a.id).localeCompare(String(b.id)))
  for (const rule of rules.data.filter(r => r.trigger_config?.event_name === 'project_created')) {
    const context = { lead_id: leadId, project_id: projectId, entity_id: projectId, customer_id: lead.customer_id || null, customer_name: customer?.name || lead.name || '',
      rule_id: rule.id, rule_action_type: rule.action_type, rule_action_config: rule.action_config }
    proposal(`rule:${rule.id}`, rule.action_type === 'create_approval' ? interpolateApprovalTemplate(rule.action_config?.title || rule.name, context) : rule.name,
      rule.action_type === 'create_approval' ? rule.action_config?.approval_type || 'automation' : 'automation', context,
      rule.action_type === 'create_approval' ? interpolateApprovalTemplate(rule.action_config?.description || rule.description || '', context) : rule.description || 'Regelåtgärden kräver eget beslut.')
  }
  return { review: makeReview(plan), snapshot: { lead, customer, quote, business, rules: rules.data, plan }, executionPayload: { plan }, executionEvidence: { plan } }
}

export async function executeProjectCreationReview(db: SupabaseClient, businessId: string, approvalId: string, reviewed: any) {
  const base = { action: 'automation', action_type: 'project_create_review' }
  if (!reviewed?.plan?.projectId || !Array.isArray(reviewed.plan.artifacts)) return { ...base, ok: false, error: 'Projektunderlaget saknas.' }
  const stored = await insertApprovalArtifact(db, 'v3_automation_logs', 'id', businessId, approvalId, 'project:create:journal', {
    rule_name: 'Granskat projektskapande', trigger_type: 'manual', action_type: 'create_project', approval_id: approvalId, status: 'pending_approval', context: { plan: reviewed.plan }, result: { outcomes: [] },
  })
  if (stored.error || !stored.data) return { ...base, ok: false, error: 'Projektjournalen kunde inte sparas.' }
  const plan = stored.data.context.plan as Plan, outcomes: any[] = [...(stored.data.result?.outcomes || [])]
  try {
    if (!plan.artifacts.length) {
      const existing = await db.from('project').select('project_id').eq('project_id', plan.projectId).eq('business_id', businessId).maybeSingle()
      if (existing.error || !existing.data) throw new Error('Det befintliga projektet kunde inte verifieras.')
    }
    for (const artifact of plan.artifacts) {
      if (outcomes.some(o => o.purpose === artifact.purpose && o.ok)) continue
      const saved = await insertApprovalArtifact(db, artifact.table, artifact.key, businessId, artifact.owner, artifact.purpose, artifact.values)
      const outcome = { purpose: artifact.purpose, title: artifact.title, ok: !saved.error && !!saved.data, error: saved.error?.message || (!saved.data ? 'Sparad rad kunde inte verifieras' : null) }
      const index = outcomes.findIndex(o => o.purpose === artifact.purpose)
      if (index >= 0) outcomes[index] = outcome; else outcomes.push(outcome)
      const updated = await db.from('v3_automation_logs').update({ result: { outcomes }, status: outcomes.some(o => !o.ok) ? 'failed' : outcomes.length === plan.artifacts.length ? 'success' : 'pending_approval' })
        .eq('id', stored.data.id).eq('business_id', businessId).select('id')
      if (updated.error || !updated.data?.length) throw new Error('Delkvittensen kunde inte sparas. Återförsök återanvänder befintliga rader.')
      if (!outcome.ok && artifact.table === 'project') break
    }
    const ok = outcomes.every(o => o.ok) && outcomes.length === plan.artifacts.length
    return { ...base, ok, partial: !ok && outcomes.some(o => o.ok), project_id: plan.projectId, outcomes, ...(ok ? {} : { error: 'Någon projektdel återstår.' }) }
  } catch (error) { return { ...base, ok: false, partial: outcomes.some(o => o.ok), project_id: plan.projectId, outcomes, error: error instanceof Error ? error.message : 'Projektfel' } }
}
