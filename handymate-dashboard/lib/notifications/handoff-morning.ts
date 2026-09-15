import type { SupabaseClient } from '@supabase/supabase-js'
import { sendInternalPush } from './push-internal'
import { arTystTid } from './tyst-tid'
import { expirySummary } from './morning-decisions'
import { autonomyDigest } from './autonomy-digest'
export async function sendHandoffMorning(
  db: SupabaseClient,
  force = false,
): Promise<number> {
  if (
    process.env.HANDOFF_INBOX_ENABLED !== 'true' ||
    (!force && arTystTid(new Date()))
  )
    return 0
  // Process all tenants in stable pages; no extra cron. Budget bounds the existing morning job.
  const started = Date.now()
  let offset = 0,
    sent = 0
  while (Date.now() - started < 40000) {
    const { data, error } = await db
      .from('business_config')
      .select('business_id,user_id')
      .order('business_id')
      .range(offset, offset + 49)
    if (error) throw Error('handoff_business_read_failed')
    for (const biz of data || []) {
      if (Date.now() - started >= 40000) return sent
      const claim = await db.rpc('claim_handoff_digest', {
        p_business_id: biz.business_id,
      })
      if (claim.error) throw Error('handoff_claim_failed')
      if (!claim.data) continue
      const s = claim.data
      const expired = expirySummary(
        s.items.map((i: { kind: string; title: string }) => ({
          ...i,
          title: i.title.slice(0, 80),
        })),
      )
      const autonomous = autonomyDigest(s.items)
      const decisions = s.decisions
        .map((d: { title: string }) => d.title.slice(0, 80))
        .join(' · ')
      // At most three decision and expiry titles; complete receipts remain on the authenticated page.
      const lines = [
        s.decisions.length
          ? `${s.decisions.length} beslut: ${decisions}${s.remaining ? ` (${s.remaining} till i kön)` : ''}.`
          : '',
        expired ? `${expired}.` : '',
        autonomous.length
          ? `${autonomous.length} uppdateringar från teamet finns i morgonkvittot.`
          : '',
      ].filter(Boolean)
      const result = biz.user_id
        ? await sendInternalPush(
            {
              business_id: biz.business_id,
              target_user_id: biz.user_id,
              title: 'Ditt morgonkvitto',
              body: lines.join(' '),
              url: '/dashboard/approvals?inbox=1',
              tag: `handoff-${s.day}`,
              priority: 'normal',
              ttl_seconds: 86400,
            },
            { timeoutMs: 5000 },
          )
        : { delivered: false, reason: 'no_recipients' }
      const status = result.delivered
        ? 'delivered'
        : ['network', 'http_500', 'http_502', 'http_503', 'http_504'].includes(
              result.reason || '',
            )
          ? 'unknown'
          : 'failed'
      const finished = await db.rpc('finish_handoff_digest', {
        p_business_id: biz.business_id,
        p_day: s.day,
        p_token: s.attempt_token,
        p_status: status,
      })
      if (finished.error || finished.data !== true)
        throw Error('handoff_finish_failed')
      if (result.delivered) sent++
    }
    if ((data || []).length < 50) break
    offset += 50
  }
  return sent
}
