import type { SupabaseClient } from '@supabase/supabase-js'
import type { ApprovalReview } from './review-contract'
import { approvalArtifactId, insertApprovalArtifact } from './artifact-write'
import { FortnoxRequestNotSentError, fortnoxRequest, createFortnoxProject, fortnoxProjectNumberFor, fortnoxProjectStatus, type FortnoxProject } from '@/lib/fortnox'

type Plan = { projectId: string; document: FortnoxProject; alreadyLinked: string | null }
const purpose = 'fortnox:project:review'
// JSONB may reorder object keys; compare content, never transport key order.
function canonical(value: any): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
}
async function inspectRemoteProject(businessId: string, expected: FortnoxProject): Promise<FortnoxProject> {
  const response = await fortnoxRequest<{ Project: FortnoxProject }>(businessId, 'GET', `/projects/${encodeURIComponent(expected.ProjectNumber)}`)
  const actual = response?.Project
  if (!actual || actual.ProjectNumber !== expected.ProjectNumber) throw new Error('Fortnox-projektet kunde inte verifieras.')
  // A matching number alone is not proof of the intended project. Never overwrite
  // or silently adopt a different register entry after a lost response.
  for (const key of ['Description', 'StartDate', 'EndDate', 'Status'] as const) {
    if ((actual[key] || '') !== (expected[key] || '')) throw new Error(`Fortnox-projektets ${key} skiljer sig från det granskade underlaget. Ingen koppling ändrades.`)
  }
  return actual
}
function reviewFor(plan: Plan, state?: string): ApprovalReview {
  const uncertain = state === 'sending' || state === 'unknown'
  return { title: 'Granska projektsynk till Fortnox', confirmLabel: uncertain ? 'Kontrollera sparad synkstatus' : state === 'saved' ? 'Verifiera sparad koppling' : plan.alreadyLinked ? 'Bekräfta befintlig koppling' : state === 'accepted' ? 'Spara projektkopplingen' : 'Synka projekt till Fortnox',
    effect: uncertain ? 'Kontrollerar journalen utan nytt Fortnox-anrop. Ett osäkert leverantörsutfall måste stämmas av innan ett nytt skapande kan tillåtas.' : state === 'accepted' || state === 'saved' ? 'Verifierar och sparar den lokala kopplingen till det redan bekräftade Fortnox-projektet. Inget nytt Fortnox-anrop görs.' : plan.alreadyLinked ? 'Kontrollerar den befintliga lokala Fortnox-kopplingen. Inget nytt projekt skapas i Fortnox.' : 'Skapar endast det visade projektet i Fortnox projektregister och sparar kopplingen. Ingen offert, faktura, betalning eller kundsändning skapas.',
    messages: [], details: [
      { label: 'Fortnox-projektnummer', text: plan.document.ProjectNumber },
      { label: 'Beskrivning', text: plan.document.Description },
      { label: 'Startdatum', text: plan.document.StartDate || 'Inte angivet' },
      { label: 'Slutdatum', text: plan.document.EndDate || 'Inte angivet' },
      { label: 'Status i Fortnox', text: plan.document.Status || 'Inte angiven' },
      ...(state ? [{ label: 'Tidigare försök', text: state === 'accepted' ? 'Fortnox bekräftade projektet. Endast lokal lagring återstår.' : state === 'saved' ? 'Kopplingen är sparad; inget nytt anrop görs.' : state === 'sending' || state === 'unknown' ? 'Fortnox-utfallet är osäkert. Inget nytt skapande tillåts innan avstämning.' : 'Inget Fortnox-anrop har påbörjats.' }] : []),
    ] }
}
export async function prepareProjectSyncReview(db: SupabaseClient, businessId: string, payload: Record<string, any>) {
  const projectId = payload.project_id || payload.entity_id || payload.rule_action_config?.entity_id
  if (typeof projectId !== 'string' || !projectId) throw new Error('Projekt saknas för Fortnox-synk.')
  const current = await db.from('project').select('*').eq('project_id', projectId).eq('business_id', businessId).maybeSingle()
  if (current.error || !current.data) throw new Error('Projektet kunde inte verifieras i företaget.')
  const previous = await db.from('v3_automation_logs').select('*').eq('id', approvalArtifactId(businessId, projectId, purpose)).eq('business_id', businessId).maybeSingle()
  if (previous.error) throw new Error('Fortnox-journalen kunde inte läsas.')
  if (previous.data) {
    const plan = previous.data.context?.plan as Plan
    if (!plan?.document?.ProjectNumber || plan.projectId !== projectId) throw new Error('Fortnox-journalens underlag är ofullständigt.')
    if (['sending', 'unknown'].includes(previous.data.status)) {
      // Read-only reconciliation becomes a concrete, signed decision. A failed
      // lookup is not proof that POST failed and never enables another POST.
      const remote = await inspectRemoteProject(businessId, plan.document)
      const review = reviewFor(plan, previous.data.status)
      review.confirmLabel = 'Koppla det hittade Fortnox-projektet'
      review.effect = 'Fortnox-projektet finns och motsvarar underlaget nedan. Beslutet sparar kopplingen till detta befintliga projekt. Inget nytt projekt eller kundutskick skapas.'
      review.details = [...(review.details || []).filter(d => d.label !== 'Tidigare försök'), { label: 'Avstämning', text: 'Projektnummer, beskrivning, datum och status har lästs från Fortnox och matchar underlaget. Kopplingen kontrolleras igen vid beslut.' }]
      return { review, snapshot: { journal: previous.data, current: current.data, remote }, executionPayload: { plan, reconcile: true }, executionEvidence: { plan, remote, reconcile: true } }
    }
    return { review: reviewFor(plan, previous.data.status), snapshot: { journal: previous.data, current: current.data }, executionPayload: { plan }, executionEvidence: { plan } }
  }
  if (payload.execution_result?.receipt?.state === 'partial') throw new Error('Det tidigare försöket saknar en verifierbar synkjournal. Ett nytt Fortnox-anrop får inte göras.')
  const config = await db.from('business_config').select('fortnox_connected').eq('business_id', businessId).maybeSingle()
  if (config.error || !config.data?.fortnox_connected) throw new Error('En aktiv Fortnox-anslutning kunde inte verifieras.')
  const p = current.data, number = p.fortnox_project_number || fortnoxProjectNumberFor(p.project_number)
  if (typeof number !== 'string' || !number.trim()) throw new Error('Projektet saknar ett giltigt projektnummer.')
  const plan: Plan = { projectId, alreadyLinked: p.fortnox_project_number || null, document: {
    ProjectNumber: number, Description: `${p.name || 'Projekt'} (${p.project_number})`.slice(0, 50),
    ...(p.start_date ? { StartDate: p.start_date } : {}), ...(p.end_date ? { EndDate: p.end_date } : {}), Status: fortnoxProjectStatus(p.status),
  } }
  return { review: reviewFor(plan), snapshot: { current: p, config: config.data, plan }, executionPayload: { plan }, executionEvidence: { plan } }
}

export async function executeProjectSyncReview(db: SupabaseClient, businessId: string, approvalId: string, reviewed: any) {
  const base = { action: 'automation', action_type: 'project_sync_review' }
  if (!reviewed?.plan?.projectId || !reviewed.plan.document?.ProjectNumber) return { ...base, ok: false, error: 'Granskat projektunderlag saknas.' }
  const plan = reviewed.plan as Plan
  // Recheck tenant and existing linkage before any provider call, including replay.
  const current = await db.from('project').select('project_id, fortnox_project_number').eq('project_id', plan.projectId).eq('business_id', businessId).maybeSingle()
  if (current.error || !current.data) return { ...base, ok: false, error: 'Projektet kunde inte verifieras.' }
  if (current.data.fortnox_project_number && current.data.fortnox_project_number !== plan.document.ProjectNumber) return { ...base, ok: false, error: 'Projektet har en annan Fortnox-koppling. Inget ändrades.' }
  if (plan.alreadyLinked) return current.data.fortnox_project_number === plan.alreadyLinked
    ? { ...base, ok: true, already_linked: true, project_number: plan.alreadyLinked }
    : { ...base, ok: false, error: 'Den tidigare Fortnox-kopplingen har ändrats.' }
  const saved = await insertApprovalArtifact(db, 'v3_automation_logs', 'id', businessId, plan.projectId, purpose, {
    rule_name: 'Granskad Fortnox-projektsynk', trigger_type: 'manual', action_type: 'sync_to_fortnox', approval_id: approvalId,
    status: 'prepared', context: { plan }, result: {},
  })
  if (saved.error || !saved.data) return { ...base, ok: false, error: 'Fortnox-journalen kunde inte sparas.' }
  const journal = saved.data
  if (canonical(journal.context?.plan) !== canonical(plan)) return { ...base, ok: false, error: 'En annan projektversion finns i synkjournalen. Öppna granskningen igen.' }
  if (journal.status === 'sending' || journal.status === 'unknown') {
    if (reviewed.reconcile !== true) return { ...base, ok: false, partial: true, error: 'Öppna granskningen för att stämma av projektet mot Fortnox. Inget nytt projekt skapades.' }
    try {
      const remote = await inspectRemoteProject(businessId, plan.document)
      const accepted = await db.from('v3_automation_logs').update({ status: 'accepted', result: { project_number: remote.ProjectNumber, reconciled: true } })
        .eq('id', journal.id).eq('business_id', businessId).eq('status', journal.status).select('id')
      if (accepted.error || !accepted.data?.length) return { ...base, ok: false, partial: true, error: 'Avstämningskvittensen kunde inte sparas. Öppna granskningen igen; inget nytt projekt skapas.' }
      journal.status = 'accepted'
      journal.result = { project_number: remote.ProjectNumber, reconciled: true }
    } catch (error) { return { ...base, ok: false, partial: true, error: error instanceof Error ? error.message : 'Fortnox-avstämningen misslyckades.' } }
  }
  if (['prepared', 'not_sent'].includes(journal.status) && current.data.fortnox_project_number === plan.document.ProjectNumber) {
    return { ...base, ok: true, already_linked: true, project_number: plan.document.ProjectNumber }
  }
  const maySend = ['prepared', 'not_sent'].includes(journal.status)
  if (maySend) {
    const claim = await db.from('v3_automation_logs').update({ status: 'sending' }).eq('id', journal.id).eq('business_id', businessId).eq('status', journal.status).select('id')
    if (claim.error || !claim.data?.length) return { ...base, ok: false, error: 'Ett annat försök kan ha påbörjat synken. Öppna kvittensen igen.' }
    try {
      const created = await createFortnoxProject(businessId, plan.document)
      if (!created || created.ProjectNumber !== plan.document.ProjectNumber) throw new Error('Fortnox-svaret innehåller inte det begärda projektnumret.')
      const accepted = await db.from('v3_automation_logs').update({ status: 'accepted', result: { project_number: created.ProjectNumber } })
        .eq('id', journal.id).eq('business_id', businessId).eq('status', 'sending').select('id')
      if (accepted.error || !accepted.data?.length) return { ...base, ok: false, partial: true, project_number: created.ProjectNumber, error: 'Fortnox bekräftade projektet men kvittensen kunde inte sparas. Öppna igen för att kontrollera journalen; skapa inte om projektet.' }
    } catch (error) {
      if (error instanceof FortnoxRequestNotSentError) {
        const recorded = await db.from('v3_automation_logs').update({ status: 'not_sent', error_message: error.message })
          .eq('id', journal.id).eq('business_id', businessId).eq('status', 'sending').select('id')
        return { ...base, ok: false, partial: !!recorded.error || !recorded.data?.length, error: recorded.error || !recorded.data?.length
          ? 'Inget projektanrop gjordes, men journalen kunde inte uppdateras. Öppna granskningen igen för att kontrollera läget.'
          : 'Inget projektanrop gjordes eftersom Fortnox-anslutningen inte kunde användas. Återställ anslutningen och försök igen med samma underlag.' }
      }
      // Never treat a thrown response as proof that Fortnox did not create it.
      await db.from('v3_automation_logs').update({ status: 'unknown', error_message: error instanceof Error ? error.message : 'Okänt Fortnox-svar' })
        .eq('id', journal.id).eq('business_id', businessId).eq('status', 'sending')
      return { ...base, ok: false, partial: true, error: 'Fortnox kunde ha skapat projektet. Avstämning krävs innan ett nytt anrop.' }
    }
  } else if (!['accepted', 'saved'].includes(journal.status)) return { ...base, ok: false, error: 'Synkjournalens status kunde inte verifieras.' }
  if (!maySend && journal.result?.project_number !== plan.document.ProjectNumber) return { ...base, ok: false, error: 'Fortnox-kvittensen saknar rätt projektnummer.' }
  const updated = await db.from('project').update({ fortnox_project_number: plan.document.ProjectNumber, fortnox_synced_at: new Date().toISOString(), fortnox_sync_error: null })
    .eq('project_id', plan.projectId).eq('business_id', businessId).is('fortnox_project_number', null).select('project_id')
  const verified = await db.from('project').select('fortnox_project_number').eq('project_id', plan.projectId).eq('business_id', businessId).maybeSingle()
  if (verified.error || verified.data?.fortnox_project_number !== plan.document.ProjectNumber) return { ...base, ok: false, partial: true, project_number: plan.document.ProjectNumber, error: updated.error?.message || 'Fortnox-projektet är bekräftat. Endast den lokala kopplingen återstår; återförsök skickar inte igen.' }
  const completed = await db.from('v3_automation_logs').update({ status: 'saved' }).eq('id', journal.id).eq('business_id', businessId).select('id')
  return { ...base, ok: !completed.error && !!completed.data?.length, partial: !!completed.error || !completed.data?.length, project_number: plan.document.ProjectNumber,
    ...(completed.error || !completed.data?.length ? { error: 'Projektkopplingen är sparad men slutkvittensen återstår. Återförsök gör inget nytt Fortnox-anrop.' } : {}) }
}
