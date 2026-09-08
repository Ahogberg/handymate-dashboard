import type { SupabaseClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import type { ApprovalReview } from './review-contract'
import { approvalArtifactId, insertApprovalArtifact } from './artifact-write'
import { interpolateApprovalTemplate } from './automation-message'
import { sendReviewedPush } from './owner-push-send'

type Target = { id: string; table: 'push_tokens' | 'push_subscriptions'; userId: string; owner: string; fingerprint: string }
type Plan = { title: string; body: string; url: string; targets: Target[] }
const purpose = 'owner_push:plan'
const fingerprint = (r: any, table: string) => createHash('sha256').update(JSON.stringify(table === 'push_tokens' ? [r.token] : [r.endpoint, r.p256dh, r.auth])).digest('hex')
function review(plan: Plan): ApprovalReview {
  return { title: 'Granska ägarnotisen', confirmLabel: 'Skicka visade ägarnotiser', messages: [],
    effect: 'Skickar exakt denna pushnotis till ägarnas visade registrerade enheter. Ingen kund kontaktas. Acceptans hos pushtjänsten är inte bevis på att ägaren har läst notisen.',
    details: [{ label: 'Rubrik', text: plan.title }, { label: 'Notistext', text: plan.body }, { label: 'Öppnar', text: plan.url },
      ...plan.targets.map((t, index) => ({ label: `Mottagare ${index + 1}`, text: `${t.owner} — ${t.table === 'push_tokens' ? 'Mobilpush' : 'Webbpush'}` }))] }
}
export async function prepareOwnerPushReview(db: SupabaseClient, business: string, approval: string, payload: any) {
  const previous = await db.from('v3_automation_logs').select('*').eq('id', approvalArtifactId(business, approval, purpose)).eq('business_id', business).maybeSingle()
  if (previous.error) throw new Error('Pushjournalen kunde inte läsas.')
  let plan: Plan
  if (previous.data) {
    plan = previous.data.context?.plan
    if (!plan?.title || !Array.isArray(plan.targets) || !plan.targets.length) throw new Error('Pushjournalens underlag saknas.')
  } else {
    if (payload.execution_result) throw new Error('Det tidigare försöket saknar en verifierbar pushjournal. Kontrollera utfallet innan en ny notis skapas.')
    const config = payload.rule_action_config || {}
    const title = interpolateApprovalTemplate(String(config.title || 'Notis'), payload)
    const body = interpolateApprovalTemplate(String(config.body || ''), payload)
    if (!title.trim()) throw new Error('Notisen saknar en rubrik.')
    const url = String(config.url || '/dashboard')
    if (!url.startsWith('/dashboard') || url.startsWith('//') || /[\\\r\n]/.test(url)) throw new Error('Notisens länk måste gå till Handymates dashboard.')
    const owners = await db.from('business_users').select('id, user_id, name').eq('business_id', business).eq('role', 'owner').eq('is_active', true)
    if (owners.error || !owners.data?.length || owners.data.some(o => !o.user_id)) throw new Error('Aktiva ägare kunde inte verifieras.')
    plan = { title, body, url, targets: [] }
    for (const owner of Array.from(new Map(owners.data.map(o => [o.user_id, o])).values())) {
      for (const table of ['push_tokens', 'push_subscriptions'] as const) {
        const rows = await db.from(table).select('*').eq('business_id', business).eq('user_id', owner.user_id)
        if (rows.error || !rows.data) throw new Error('Ägarens registrerade enheter kunde inte läsas.')
        for (const row of rows.data) {
          if (!row.id || (table === 'push_tokens' ? !row.token : !row.endpoint || !row.p256dh || !row.auth)) throw new Error('En pushregistrering är ofullständig.')
          plan.targets.push({ id: row.id, table, userId: owner.user_id, owner: owner.name || 'Ägare', fingerprint: fingerprint(row, table) })
        }
      }
    }
    plan.targets.sort((a,b) => `${a.table}:${a.id}`.localeCompare(`${b.table}:${b.id}`))
    if (!plan.targets.length) throw new Error('Ägarna saknar registrerade pushenheter. Ingen notis kan skickas.')
  }
  const r = review(plan), states: any[] = []
  if (previous.data) {
    for (const target of plan.targets) {
      const row = await db.from('v3_automation_logs').select('status, result').eq('id', approvalArtifactId(business, approval, `owner_push:${target.table}:${target.id}`)).eq('business_id', business).maybeSingle()
      if (row.error) throw new Error('Ett pushdelresultat kunde inte läsas.')
      const state = row.data?.status || 'prepared'
      states.push({ id: target.id, table: target.table, state })
      r.details!.push({ label: target.owner, text: state === 'accepted' ? 'Accepterad; skickas inte igen' : ['sending','unknown'].includes(state) ? 'Osäkert utfall; skickas inte igen' : 'Återstår; kan återförsökas' })
    }
    r.confirmLabel = 'Återförsök återstående pushförsök'
    if (!states.some(s => ['prepared','failed'].includes(s.state))) r.confirmLabel = 'Kontrollera pushkvittensen'
    r.effect = 'Återför endast försök som inte accepterats och som är säkra att upprepa. Accepterade och osäkra försök skickas inte igen.'
  }
  return { review: r, snapshot: { plan, states }, executionPayload: { plan }, executionEvidence: { plan } }
}
export async function executeOwnerPushReview(db: SupabaseClient, business: string, approval: string, reviewed: any) {
  const base = { action: 'automation', action_type: 'owner_push_review' }
  if (!reviewed?.plan?.targets?.length) return { ...base, ok: false, error: 'Granskat pushunderlag saknas.' }
  const saved = await insertApprovalArtifact(db, 'v3_automation_logs', 'id', business, approval, purpose, {
    rule_name: 'Granskad ägarnotis', trigger_type: 'manual', action_type: 'notify_owner', approval_id: approval,
    status: 'prepared', context: { plan: reviewed.plan }, result: {},
  })
  if (saved.error || !saved.data) return { ...base, ok: false, error: 'Pushjournalen kunde inte sparas.' }
  const plan = saved.data.context.plan as Plan, outcomes: any[] = []
  const comparable = (p: Plan) => JSON.stringify([p.title, p.body, p.url, p.targets.map(t => [t.id,t.table,t.userId,t.owner,t.fingerprint])])
  if (comparable(plan) !== comparable(reviewed.plan)) return { ...base, ok: false, error: 'Pushjournalen skiljer sig från granskningen. Öppna underlaget igen.' }
  for (let index = 0; index < plan.targets.length; index++) {
    const target = plan.targets[index]
    const label = `${target.owner} — ${target.table === 'push_tokens' ? 'Mobilpush' : 'Webbpush'} (mottagare ${index + 1})`
    const part = await insertApprovalArtifact(db, 'v3_automation_logs', 'id', business, approval, `owner_push:${target.table}:${target.id}`, {
      rule_name: 'Ägarnotis till en enhet', trigger_type: 'manual', action_type: 'notify_owner', approval_id: approval,
      status: 'prepared', context: { target }, result: {},
    })
    if (part.error || !part.data) { outcomes.push({ owner: label, state: 'failed', error: 'Deljournalen kunde inte sparas' }); continue }
    const journal = part.data
    if (['accepted','sending','unknown'].includes(journal.status)) { outcomes.push({ owner: label, ...journal.result, state: journal.status }); continue }
    if (!['prepared','failed'].includes(journal.status)) { outcomes.push({ owner: label, state: 'unknown' }); continue }
    const claimed = await db.from('v3_automation_logs').update({ status: 'sending' }).eq('id', journal.id).eq('business_id', business).eq('status', journal.status).select('id')
    if (claimed.error || !claimed.data?.length) { outcomes.push({ owner: label, state: 'unknown', error: 'Ett annat försök kan pågå' }); continue }
    let result: { state: string; error?: string; reference?: string }
    try {
      const owner = await db.from('business_users').select('id').eq('business_id', business).eq('user_id', target.userId).eq('role', 'owner').eq('is_active', true).limit(1).maybeSingle()
      const current = await db.from(target.table).select('*').eq('id', target.id).eq('business_id', business).eq('user_id', target.userId).maybeSingle()
      if (owner.error || !owner.data || current.error || !current.data || fingerprint(current.data, target.table) !== target.fingerprint) {
        result = { state: 'failed', error: 'Ägare eller registrerad enhet har ändrats. Ingen push skickades.' }
      } else result = await sendReviewedPush(target.table, current.data, plan, approval)
    } catch { result = { state: 'unknown', error: 'Utfallet kunde inte verifieras. Försöket skickas inte igen.' } }
    const persisted = await db.from('v3_automation_logs').update({ status: result.state, result }).eq('id', journal.id).eq('business_id', business).eq('status','sending').select('id')
    outcomes.push({ owner: label, ...result, ...(persisted.error || !persisted.data?.length ? { state: 'unknown', error: 'Delkvittensen kunde inte sparas. Öppna igen för att läsa journalen.' } : {}) })
  }
  const ok = outcomes.every(o => o.state === 'accepted')
  return { ...base, ok, partial: !ok && outcomes.some(o => ['accepted','unknown','sending'].includes(o.state)), outcomes }
}
