import type { SupabaseClient } from '@supabase/supabase-js'
import { hamta46elksSaldo, type ElksSaldo } from '@/lib/sms/saldo'
import { priceListFor, PRICE_VERSION } from '@/lib/costs/price-list'

export type Channel = 'sms' | 'email' | 'push'
export type ChannelReason = 'saldo' | 'konfiguration' | 'mottagare' | 'kontrollfel'
export type ChannelState = { channel: Channel; ok: boolean; reason?: ChannelReason; message: string; href: string }
export const channelPreflightEnabled = () => process.env.CHANNEL_PREFLIGHT_ENABLED === 'true'
const TTL = 10 * 60_000
// Coalesce in-flight reads, retain only definitive outcomes. A failed old read must not evict a newer entry.
// Provider configuration is global. Recipients are deliberately NEVER cached.
let balanceCache: { key: string; expires: number; value: Promise<ElksSaldo> } | undefined
let domainCache: { key: string; expires: number; value: Promise<Set<string>> } | undefined
export function clearChannelCache() { balanceCache = undefined; domainCache = undefined }

export function channelState(channel: Channel, reason?: ChannelReason): ChannelState {
  const messages: Record<Channel, string> = {
    sms: reason === 'saldo' ? 'SMS är pausat eftersom Handymates SMS-saldo inte räcker. Handymate behöver åtgärda detta.' : 'SMS-tjänsten är inte tillgänglig just nu.',
    email: reason === 'kontrollfel' ? 'E-posttjänsten kunde inte kontrolleras. Utskick är pausade.' : 'E-post är inte inställd för utskick. Handymate behöver kontrollera avsändaren.',
    push: reason === 'kontrollfel' ? 'Notiser kunde inte kontrolleras just nu.' : 'Notiser är inte aktiverade för mottagaren.',
  }
  return { channel, ok: !reason, ...(reason ? { reason } : {}), message: reason ? messages[channel] : 'Tillgänglig', href: channel === 'push' ? '/dashboard/settings' : '/dashboard/help' }
}

export function assessSmsBalance(saldo: ElksSaldo, parts = 1): ChannelState {
  if (!saldo.ok) return channelState('sms', /nycklar saknas/.test(saldo.reason) ? 'konfiguration' : 'kontrollfel')
  if (saldo.currency.toUpperCase() !== 'SEK' || !Number.isSafeInteger(saldo.raw)) return channelState('sms', 'kontrollfel')
  // Same versioned cost estimate as the sender, in 46elks units. Not a reservation.
  const needed = priceListFor(PRICE_VERSION).sms_part_ore * 100 * Math.max(1, Math.ceil(parts))
  return channelState('sms', saldo.raw >= needed ? undefined : 'saldo')
}

async function verifiedDomains(key: string): Promise<Set<string>> {
  const found = new Set<string>()
  let after = ''
  for (let page = 0; page < 10; page++) {
    const response = await fetch(`https://api.resend.com/domains?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`, {
      headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000), cache: 'no-store',
    })
    if (!response.ok) throw new Error('domain_check_failed')
    const body = await response.json()
    if (!Array.isArray(body.data)) throw new Error('domain_check_invalid')
    for (const row of body.data) {
      if (row.status === 'verified' && row.capabilities?.sending !== 'disabled' && typeof row.name === 'string') found.add(row.name.toLowerCase())
    }
    if (!body.has_more) return found
    const next = body.data.at(-1)?.id
    if (typeof next !== 'string' || next === after) throw new Error('domain_pagination_invalid')
    after = next
  }
  throw new Error('domain_pagination_limit')
}

export async function preflightChannel(supabase: SupabaseClient, businessId: string, channel: Channel,
  options: { targetUserId?: string | null; fromAddress?: string; smsParts?: number } = {},
): Promise<ChannelState> {
  try {
    if (channel === 'sms') {
      const key = `${process.env.ELKS_API_USER || ''}:${process.env.ELKS_API_PASSWORD || ''}`
      if (!balanceCache || balanceCache.key !== key || balanceCache.expires <= Date.now()) {
        const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(5000), cache: 'no-store' })
        balanceCache = { key, expires: Date.now() + TTL, value: hamta46elksSaldo(boundedFetch) }
      }
      const entry = balanceCache
      try {
        const state = assessSmsBalance(await entry.value, options.smsParts)
        if (state.reason === 'kontrollfel' && balanceCache === entry) balanceCache = undefined
        return state
      } catch (error) {
        if (balanceCache === entry) balanceCache = undefined
        throw error
      }
    }
    if (channel === 'email') {
      if (!process.env.RESEND_API_KEY) return channelState(channel, 'konfiguration')
      // A separate read credential supports a sending-only production key.
      const key = process.env.RESEND_PREFLIGHT_API_KEY || process.env.RESEND_API_KEY
      if (!domainCache || domainCache.key !== key || domainCache.expires <= Date.now()) {
        domainCache = { key, expires: Date.now() + TTL, value: verifiedDomains(key) }
      }
      const entry = domainCache
      try {
        const domains = await entry.value
        const domain = (options.fromAddress || 'noreply@handymate.se').split('@')[1]?.toLowerCase()
        return channelState(channel, domain && domains.has(domain) ? undefined : 'konfiguration')
      } catch (error) {
        if (domainCache === entry) domainCache = undefined
        throw error
      }
    }
    let expo = supabase.from('push_tokens').select('token').eq('business_id', businessId)
    let web = supabase.from('push_subscriptions').select('endpoint, p256dh, auth').eq('business_id', businessId)
    if (options.targetUserId) { expo = expo.eq('user_id', options.targetUserId); web = web.eq('user_id', options.targetUserId) }
    const [e, w] = await Promise.all([expo, web])
    const hasExpo = !e.error && e.data?.some(r => typeof r.token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(r.token))
    const hasWeb = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && !w.error && w.data?.some(r => r.endpoint && r.p256dh && r.auth)
    return channelState(channel, hasExpo || hasWeb ? undefined : e.error || w.error ? 'kontrollfel' : 'mottagare')
  } catch { return channelState(channel, 'kontrollfel') }
}

/** Only the proposed action's channel. Missing notification push must never block a useful decision. */
export function channelForApproval(type: string, payload: Record<string, unknown> = {}): Channel | null {
  const action = type === 'automation' ? payload.rule_action_type : type
  if (action === 'send_sms' || action === 'review_request' || action === 'invoice_reminder') return 'sms'
  if (action === 'send_email') return 'email'
  if (action === 'notify_owner' || action === 'send_push') return 'push'
  return null
}

export async function recordChannelNotice(supabase: SupabaseClient, businessId: string, state: ChannelState): Promise<void> {
  if (state.ok) return
  const { error } = await supabase.rpc('record_channel_notice', { p_business_id: businessId, p_channel: state.channel, p_reason: state.reason, p_message: state.message })
  if (error) throw new Error(`channel_notice: ${error.code || 'persistence_failed'}`)
}

export async function gateChannel(supabase: SupabaseClient, businessId: string, channel: Channel,
  options: Parameters<typeof preflightChannel>[3] = {},
): Promise<ChannelState> {
  const state = await preflightChannel(supabase, businessId, channel, options)
  if (!state.ok) {
    try { await recordChannelNotice(supabase, businessId, state) }
    catch (err) { console.error('[channel-preflight] notice persistence failed', err) }
  }
  return state
}

export async function gateApprovalChannels(supabase: SupabaseClient, businessId: string, type: string, payload: Record<string, any> = {}): Promise<ChannelState | null> {
  if (type === 'invoice_reminder' && payload.delivery) {
    const d = payload.delivery
    const required: Channel[] = [...(d.customerPhone ? ['sms' as const] : []), ...(d.emailToo && d.customerEmail ? ['email' as const] : [])]
    if (!required.length) return channelState('sms', 'mottagare')
    for (const channel of required) {
      const state = await gateChannel(supabase, businessId, channel, { fromAddress: `faktura@${process.env.RESEND_DOMAIN || 'handymate.se'}` })
      if (!state.ok) return state
    }
    return null
  }
  const channel = channelForApproval(type, payload)
  if (!channel) return null
  let targetUserId: string | undefined
  if (channel === 'push') {
    const owner = await supabase.from('business_config').select('user_id').eq('business_id', businessId).single()
    if (owner.error || !owner.data?.user_id) return channelState(channel, 'mottagare')
    targetUserId = owner.data.user_id
  }
  const state = await gateChannel(supabase, businessId, channel, { targetUserId })
  return state.ok ? null : state
}
