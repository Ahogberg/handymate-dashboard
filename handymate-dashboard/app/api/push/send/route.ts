import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { normaliseraPrioritet, normaliseraTtl, PUSH_POLICY } from '@/lib/notifications/push-policy'
import { deliverPush, pushProviderOutcome, type PushDeliveryResult } from '@/lib/notifications/push-delivery'
import type { OutboundSource } from '@/lib/outbound/intents'
import type { PushEnvelope } from '@/lib/outbound/source'

export const dynamic = 'force-dynamic'
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function outboundIdentity(value: unknown): { source: OutboundSource; sourceId: string; dedupeKey: string; template: string; autonomyKey?: any } | null {
  if (!isRecord(value) || !['approval','automation_log','autonomy','cron','manual'].includes(String(value.source))) return null
  const read = (key: string) => typeof value[key] === 'string' && String(value[key]).trim() ? String(value[key]).trim() : null
  const sourceId = read('source_id'), dedupeKey = read('dedupe_key'), template = read('template')
  if (!sourceId || !dedupeKey || !template) return null
  return { source: value.source as OutboundSource, sourceId, dedupeKey, template,
    ...(read('autonomy_key') ? { autonomyKey: read('autonomy_key') } : {}) }
}

/** Authenticated logical-recipient push. H3b treats a mixed device/provider
 * result as unknown, so an accepted device is never notified twice by sweep. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_id, title, target_user_id } = body
    if (!business_id || !title) return NextResponse.json({ error: 'Missing business_id or title' }, { status: 400 })
    if (!verifyCronSecret(request)) {
      const business = await getAuthenticatedBusiness(request)
      if (!business || business.business_id !== business_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const db = getServerSupabase()
    const input = {
      businessId: business_id, title, body: typeof body.body === 'string' ? body.body : '',
      url: typeof body.url === 'string' ? body.url : '/dashboard', tag: typeof body.tag === 'string' ? body.tag : 'handymate',
      ...(target_user_id ? { targetUserId: target_user_id } : {}), ...(isRecord(body.data) ? { data: body.data } : {}),
      ttlSeconds: normaliseraTtl(body.ttl_seconds, PUSH_POLICY.beslut.ttlSeconds),
      priority: normaliseraPrioritet(body.priority, PUSH_POLICY.beslut.priority),
    } as const
    if (process.env.OUTBOUND_INTENTS_ENABLED === 'true') {
      const identity = outboundIdentity(body.outbound)
      if (!identity) return NextResponse.json({ error: 'Durable push identity required' }, { status: 400 })
      const { withOutboundSource } = await import('@/lib/outbound/source')
      let providerResult: PushDeliveryResult | null = null
      const outcome = await withOutboundSource<PushEnvelope>(db, {
        promise: { businessId: business_id, kind: 'push', source: identity.source, sourceId: identity.sourceId,
          dedupeKey: identity.dedupeKey, recipient: target_user_id || `business:${business_id}`,
          template: identity.template, autonomyKey: identity.autonomyKey,
          context: target_user_id ? { targetUserId: target_user_id } : undefined },
        envelope: { title: input.title, body: input.body, url: input.url, tag: input.tag,
          targetUserId: target_user_id || null, data: input.data, ttlSeconds: input.ttlSeconds, priority: input.priority },
      }, async (_intent, envelope) => {
        providerResult = await deliverPush(db, { businessId: business_id, ...envelope })
        return pushProviderOutcome(providerResult)
      })
      if (providerResult) return NextResponse.json({ success: true, ...(providerResult as PushDeliveryResult), intent_status: outcome.status })
      return NextResponse.json({ success: true, delivered: outcome.status === 'sent', sent: outcome.status === 'sent' ? 1 : 0,
        status: outcome.status, ...(outcome.status === 'pending' ? { reason: 'deferred' } : {}) })
    }
    if (process.env.CHANNEL_PREFLIGHT_ENABLED === 'true') {
      const { gateChannel } = await import('@/lib/channels/preflight')
      const check = await gateChannel(db, business_id, 'push', { targetUserId: target_user_id })
      if (!check.ok) return NextResponse.json({ success: true, delivered: false, sent: 0, status: 'skipped', reason: check.reason === 'mottagare' ? 'no_recipients' : check.reason })
    }
    return NextResponse.json({ success: true, ...(await deliverPush(db, input)) })
  } catch (error: any) {
    console.error('[push/send] Error:', error)
    return NextResponse.json({ error: error?.message || 'Push failed' }, { status: 500 })
  }
}
