import type { SupabaseClient } from '@supabase/supabase-js'
import { sendExpoPushNotification } from './expo-push'

export interface PushDeliveryInput {
  businessId: string; title: string; body: string; url: string; tag: string
  targetUserId?: string | null; data?: Record<string, unknown>
  ttlSeconds: number; priority: 'high' | 'normal'
}
export interface PushChannelResult { attempted: number; accepted: number; rejected: number; reason?: string; tickets?: string[] }
export interface PushDeliveryResult {
  delivered: boolean; sent: number; reason?: string
  channels: { expo: PushChannelResult; web: PushChannelResult }
}

/** One logical recipient. Any provider acceptance is terminal success for the
 * logical push; partial rejection is diagnostic metadata, not a manual resend
 * case. Unknown is reserved for zero-acceptance transport/query uncertainty. */
export async function deliverPush(db: SupabaseClient, input: PushDeliveryInput): Promise<PushDeliveryResult> {
  const expoData = { ...(input.data || {}), url: input.url, tag: input.tag }
  const expo = await sendExpoPushNotification(input.businessId, input.title, input.body, expoData, input.targetUserId, {
    ttlSeconds: input.ttlSeconds, priority: input.priority,
  })
  let web: PushChannelResult = { attempted: 0, accepted: 0, rejected: 0, reason: 'not_attempted' }
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT || 'mailto:hello@handymate.se'
  if (!publicKey || !privateKey) web = { attempted: 0, accepted: 0, rejected: 0, reason: 'vapid_not_configured' }
  else {
    let query = db.from('push_subscriptions').select('endpoint,p256dh,auth').eq('business_id', input.businessId)
    if (input.targetUserId) query = query.eq('user_id', input.targetUserId)
    const subscriptions = await query
    if (subscriptions.error) web = { attempted: 0, accepted: 0, rejected: 0, reason: 'subscription_query_failed' }
    else if (!subscriptions.data?.length) web = { attempted: 0, accepted: 0, rejected: 0, reason: 'no_subscriptions' }
    else {
      let provider: typeof import('web-push') | null = null
      try { provider = await import('web-push') } catch { /* reported below */ }
      if (!provider) web = { attempted: subscriptions.data.length, accepted: 0, rejected: subscriptions.data.length, reason: 'web_push_not_installed' }
      else {
        provider.setVapidDetails(subject, publicKey, privateKey)
        const stale: string[] = [], refs: string[] = []
        let accepted = 0
        await Promise.allSettled(subscriptions.data.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
          try {
            const receipt = await provider!.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify({ title: input.title, body: input.body, url: input.url, tag: input.tag }),
              { TTL: input.ttlSeconds, urgency: input.priority === 'high' ? 'high' : 'normal' })
            accepted++
            const location = receipt?.headers?.location
            if (typeof location === 'string') refs.push(location)
          } catch (error: any) {
            if ([404, 410].includes(error?.statusCode)) stale.push(sub.endpoint)
          }
        }))
        web = { attempted: subscriptions.data.length, accepted, rejected: subscriptions.data.length - accepted,
          ...(accepted < subscriptions.data.length ? { reason: 'provider_error' } : {}), ...(refs.length ? { tickets: refs } : {}) }
        if (stale.length) await db.from('push_subscriptions').delete().in('endpoint', stale)
      }
    }
  }
  const sent = expo.accepted + web.accepted
  const attempted = expo.attempted + web.attempted
  return {
    delivered: sent > 0, sent,
    ...(sent ? {} : { reason: expo.reason === 'no_matching_token' ? 'no_matching_token' : attempted === 0 ? 'no_recipients' : 'provider_rejected' }),
    channels: { expo, web },
  }
}

export function pushProviderOutcome(result: PushDeliveryResult): import('@/lib/outbound/promise').ProviderOutcome {
  const rows = [result.channels.expo, result.channels.web]
  const attempted = rows.reduce((n, row) => n + row.attempted, 0)
  const accepted = rows.reduce((n, row) => n + row.accepted, 0)
  const rejected = rows.reduce((n, row) => n + row.rejected, 0)
  const refs = rows.flatMap(row => row.tickets || [])
  if (accepted > 0) return {
    status: 'sent',
    providerRef: refs.join(',') || `accepted:${accepted}`,
    ...(rejected > 0 ? { error: 'Delvis accepterat av notistjänsterna' } : {}),
  }
  if (attempted === 0) return { status: 'skipped', error: result.reason || 'no_recipients' }
  const uncertain = rows.find(row => ['network_error', 'subscription_query_failed'].includes(row.reason || ''))?.reason
  if (uncertain) return { status: 'unknown', error: uncertain }
  return { status: 'failed', error: result.reason || 'provider_rejected' }
}
