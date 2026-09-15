import type { SupabaseClient } from '@supabase/supabase-js'
import type { MorningBrief } from '@/lib/matte/morning-brief'
import { svDateStr } from '@/lib/dates'

export const morningReliabilityEnabled = () => process.env.MORNING_REPORT_RELIABILITY_ENABLED === 'true'
const SEED_INSTRUCTION = 'Generera morgonrapport med dagens bokningar, utestående offerter, försenade fakturor och insikter.'
export function isMorningReportRule(rule: { is_system?: boolean; trigger_type: string; action_type: string; action_config?: Record<string, unknown> }) {
  return rule.is_system === true && rule.trigger_type === 'cron' && rule.action_type === 'run_agent' && rule.action_config?.instruction === SEED_INSTRUCTION
}
export type MorningFailure = 'ko' | 'kredit' | 'konfiguration' | 'underlag' | 'orkestrator' | 'leverans' | 'okant'
export function classifyAgentFailure(error: unknown): MorningFailure {
  const s = String(error instanceof Error ? error.message : error).toLowerCase()
  if (/credit|balance|budget|kostnadsvakt|bränsle|fuel|saldo/.test(s)) return 'kredit'
  if (/api.key|auth|config|nyck|paused/.test(s)) return 'konfiguration'
  if (/queue|kö|claim|lease/.test(s)) return 'ko'
  if (/underlag|context|business.*not found|cache|database/.test(s)) return 'underlag'
  if (/push|recipient|mottagar|leverans/.test(s)) return 'leverans'
  if (/orchestrat|agent|model|anthropic|timeout|fetch/.test(s)) return 'orkestrator'
  return 'okant'
}
export interface MorningRun {
 business_id: string; day: string; rule_id: string; attempts: number; attempt_token: string
 report: MorningBrief | null; notice_push_accepted: boolean; status: string; failure_class?: MorningFailure | null
}
export type MorningResult = { success: boolean; data?: Record<string, unknown>; error?: string }
export async function runMorningReport(supabase: SupabaseClient, businessId: string, ruleId: string): Promise<MorningResult> {
  const claim = await supabase.rpc('claim_morning_report', { p_business_id: businessId, p_rule_id: ruleId })
  if (claim.error) return { success: false, error: '[ko] Morgonrapporten kunde inte reserveras' }
  const run = claim.data?.[0] as MorningRun | undefined
  if (!run) return { success: true, data: { skipped: true, reason: 'Morgonrapporten är redan hanterad, väntar eller pausad' } }
  const { arTystTid } = await import('@/lib/notifications/tyst-tid')
  if (arTystTid(new Date())) {
    const held = await supabase.rpc('finish_morning_report', { p_business_id: businessId, p_day: run.day, p_token: run.attempt_token,
      p_outcome: 'deferred', p_failure_class: null, p_report: run.report,
      p_notice: 'Morgonrapporten väntar tills tyst tid är slut.', p_notice_push_accepted: false })
    if (held.error || held.data !== true) return { success: false, error: '[ko] Morgonrapportens vänteläge kunde inte sparas' }
    return { success: true, data: { skipped: true, reason: 'tyst_tid' } }
  }
  let report = run.report
  let failure: MorningFailure = 'underlag'
  let outcome = 'failed'
  let noticeAccepted = false
  let notice = run.attempts === 1 ? 'Morgonrapporten är försenad. Vi försöker igen om cirka tio minuter.' : 'Morgonrapporten är fortfarande försenad. Handymate behöver kontrollera felet.'
  try {
    if (!report) {
      const { generateMorningBrief } = await import('@/lib/matte/morning-brief')
      report = await generateMorningBrief(businessId, { strict: true })
    }
    failure = 'leverans'
    // Only the business owner: no sensitive report in a company-wide broadcast.
    const owner = await supabase.from('business_config').select('user_id, agents_globally_paused').eq('business_id', businessId).single()
    if (owner.error || !owner.data?.user_id) throw new Error('Mottagare saknas')
    if (owner.data.agents_globally_paused === true) {
      outcome = 'cancelled'; notice = 'Morgonrapportens avisering är pausad.'
    } else {
      const { sendInternalPush } = await import('@/lib/notifications/push-internal')
      const push = await sendInternalPush({ business_id: businessId, target_user_id: owner.data.user_id,
        title: 'Din morgonrapport är klar', body: 'Öppna Handymate för dagens sammanfattning.', url: '/dashboard', tag: `morning-report-${run.day}` })
      if (push.delivered) { outcome = 'delivered'; notice = '' }
      else if (push.reason === 'network' || /^http_5/.test(push.reason || '')) {
        outcome = 'unknown'; notice = 'Morgonrapporten är klar, men aviseringen kunde inte bekräftas.'
      } else throw new Error('Push kunde inte levereras')
    }
  } catch (err) {
    if (failure !== 'leverans') failure = classifyAgentFailure(err)
    if (report) notice = run.attempts === 1 ? 'Morgonrapporten är klar, men kunde inte aviseras. Vi försöker igen om cirka tio minuter.' : 'Morgonrapporten är klar, men kunde inte aviseras efter två försök.'
    // A delay notice is attempted once, and only after a generation failure;
    // retrying a broken push with different copy cannot fix the channel.
    if (!report && !run.notice_push_accepted) {
      try {
        const owner = await supabase.from('business_config').select('user_id, agents_globally_paused').eq('business_id', businessId).single()
        if (owner.data?.user_id && !owner.data.agents_globally_paused) {
          const { sendInternalPush } = await import('@/lib/notifications/push-internal')
          const p = await sendInternalPush({ business_id: businessId, target_user_id: owner.data.user_id, title: 'Morgonrapporten är försenad', body: notice, url: '/dashboard', tag: `morning-report-delay-${run.day}` })
          noticeAccepted = p.delivered
        }
      } catch { /* durable notice below remains visible even with no push */ }
    }
  }
  const finish = await supabase.rpc('finish_morning_report', { p_business_id: businessId, p_day: run.day, p_token: run.attempt_token,
    p_outcome: outcome, p_failure_class: outcome === 'delivered' || outcome === 'cancelled' ? null : failure,
    p_report: report, p_notice: notice || null, p_notice_push_accepted: noticeAccepted })
  if (finish.error || finish.data !== true) return { success: false, error: '[ko] Morgonrapportens utfall kunde inte sparas' }
  if (outcome === 'delivered') return { success: true, data: { report_ready: true, push_accepted: true, attempt: run.attempts } }
  if (outcome === 'cancelled') return { success: true, data: { skipped: true, reason: notice } }
  return { success: false, error: `[${failure}] ${notice}`, data: { report_ready: !!report, delivery_state: outcome, attempt: run.attempts } }
}

export function morningDriftLine(rows: Array<Pick<MorningRun, 'business_id' | 'status' | 'failure_class'>>) {
  const businesses = new Map(rows.map(r => [r.business_id, r]))
  const failed = [...businesses.values()].filter(r => !['delivered','cancelled','waiting'].includes(r.status))
  const counts = new Map<string, number>()
  for (const r of failed) { const key = r.failure_class || (r.status === 'running' ? 'ko' : 'okant'); counts.set(key, (counts.get(key) || 0) + 1) }
  return { count: failed.length, total: businesses.size, line: `Morgonrapportens avisering saknas för ${failed.length} av ${businesses.size} företag${failed.length ? ': ' + [...counts].map(([k,n]) => `${k} ${n}`).join(', ') : ''}.` }
}

export async function retryMorningReports(supabase: SupabaseClient, deadline = Date.now() + 45_000) {
  const today = svDateStr()
  const rows = await supabase.from('morning_report_runs').select('business_id, rule_id, status').eq('day', today)
    .or(`and(status.in.(retry,waiting),next_attempt_at.lte.${new Date().toISOString()}),and(status.eq.running,claimed_at.lt.${new Date(Date.now()-5*60_000).toISOString()})`).order('updated_at').limit(25)
  if (rows.error) throw new Error('morning retry queue read failed')
  let attempted = 0
  for (const row of rows.data || []) {
    if (Date.now() >= deadline) break
    const rule = await supabase.from('v3_automation_rules').select('*').eq('id', row.rule_id).eq('business_id', row.business_id).single()
    if (rule.error) continue
    if (!rule.data || !isMorningReportRule(rule.data) || !rule.data.is_active) {
      await supabase.rpc('claim_morning_report', { p_business_id: row.business_id, p_rule_id: row.rule_id })
      continue
    }
    const { executeRule } = await import('@/lib/automation-engine')
    await executeRule(supabase, row.rule_id, { morning_retry: true })
    attempted++
  }
  return { attempted }
}
