import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { harAktivtTeam } from '@/lib/billing/aktiva-konton'
import { svDateStr } from '@/lib/dates'
import { deriveQuoteHandoff } from '@/lib/quotes/handoff'
import { parseQuoteFollowupRound, quoteFollowupApprovalId, followupProviderAccepted, latestQuoteFollowupReceipt } from '@/lib/quotes/followup-round'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Logga in.' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user)) return NextResponse.json({ error: 'Endast ägare och administratörer kan läsa teamets överlämning.' }, { status: 403 })
  const db = getServerSupabase()
  const quote = await db.from('quotes').select('quote_id, status, sent_at, valid_until, follow_up_count, customer_id')
    .eq('business_id', business.business_id).eq('quote_id', params.id).maybeSingle()
  if (quote.error) return NextResponse.json({ error: 'Kunde inte läsa offerten.' }, { status: 503 })
  if (!quote.data) return NextResponse.json({ error: 'Offerten hittades inte.' }, { status: 404 })
  const quoteData = quote.data
  const scope = parseQuoteFollowupRound({ quote_id: params.id, sent_at: quoteData.sent_at,
    round: (quoteData.follow_up_count ?? 0) + 1, channel: quoteData.follow_up_count === 1 ? 'email' : 'sms' })
  const scopes = quoteData.sent_at ? [1, 2, 3].map(round => parseQuoteFollowupRound({
    quote_id: params.id, sent_at: quoteData.sent_at, round, channel: round === 2 ? 'email' : 'sms',
  })).filter((value): value is NonNullable<typeof value> => !!value) : []
  const roundCardsPromise = Promise.all(scopes.map(value => db.from('pending_approvals').select('id,status,payload,expires_at')
    .eq('business_id', business.business_id).eq('id', quoteFollowupApprovalId(business.business_id, value)).maybeSingle()))
    .then(results => ({ data: results.flatMap(result => result.data ? [result.data] : []), error: results.find(result => result.error)?.error || null }))
  const [config, rules, settings, related, direct, entity, logs, legacyLogs, customer, roundCards] = await Promise.all([
    db.from('business_config').select('business_id, agents_globally_paused, subscription_status, trial_ends_at, onboarding_completed_at').eq('business_id', business.business_id).single(),
    db.from('v3_automation_rules').select('id, name, action_type, trigger_config, last_run_at, last_run_status').eq('business_id', business.business_id)
      .eq('trigger_type', 'threshold').eq('is_active', true).contains('trigger_config', { entity: 'quote' }),
    db.from('v3_automation_settings').select('quote_followup_days').eq('business_id', business.business_id).maybeSingle(),
    db.from('pending_approvals').select('id').eq('business_id', business.business_id).eq('status', 'pending')
      .contains('payload', { related_id: params.id }).order('created_at', { ascending: false }).limit(1),
    db.from('pending_approvals').select('id').eq('business_id', business.business_id).eq('status', 'pending')
      .contains('payload', { quote_id: params.id }).order('created_at', { ascending: false }).limit(1),
    db.from('pending_approvals').select('id').eq('business_id', business.business_id).eq('status', 'pending')
      .contains('payload', { entity_id: params.id }).order('created_at', { ascending: false }).limit(1),
    db.from('v3_automation_logs').select('rule_id, status, created_at').eq('business_id', business.business_id)
      .contains('context', { entity_id: params.id }).order('created_at', { ascending: false }).limit(100),
    db.from('v3_automation_logs').select('rule_id, status, created_at').eq('business_id', business.business_id)
      .contains('context', { quote_id: params.id }).order('created_at', { ascending: false }).limit(100),
    db.from('customer').select('phone_number, email').eq('business_id', business.business_id).eq('customer_id', quote.data.customer_id ?? '').maybeSingle(),
    roundCardsPromise,
  ])
  if ([config, rules, settings, related, direct, entity, logs, legacyLogs, customer, roundCards].some(result => result.error) || !config.data) {
    return NextResponse.json({ error: 'Kunde inte kontrollera överlämningen. Ingen aktiv bevakning kan bekräftas just nu.' }, { status: 503 })
  }
  const now = new Date()
  const cards = roundCards.data || []
  const currentCard = scope ? cards.find(card => card.id === quoteFollowupApprovalId(business.business_id, scope)) : null
  const latestReceipt = latestQuoteFollowupReceipt(cards, scopes, business.business_id, now.getTime())
  const summary = deriveQuoteHandoff({ quote: quoteData,
    latestReceipt,
    followupRound: currentCard && scope ? { id: currentCard.id, status: currentCard.status,
      sendClaimed: !!currentCard.payload?.quote_followup_send_claimed_at,
      providerAccepted: followupProviderAccepted(currentCard, scope), expired: !!currentCard.expires_at && Date.parse(currentCard.expires_at) <= now.getTime() } : null,
    paused: config.data.agents_globally_paused === true, teamActive: harAktivtTeam(config.data),
    hasPhone: !!customer.data?.phone_number, hasEmail: !!customer.data?.email,
    historyIncomplete: (logs.data?.length ?? 0) >= 100 || (legacyLogs.data?.length ?? 0) >= 100,
    rules: rules.data || [], logs: [...(logs.data || []), ...(legacyLogs.data || [])].sort((a, b) => b.created_at.localeCompare(a.created_at)), pendingId: entity.data?.[0]?.id || direct.data?.[0]?.id || related.data?.[0]?.id || null,
    intervalDays: settings.data?.quote_followup_days ?? null, today: svDateStr(now), now: now.getTime(),
  })
  return NextResponse.json({ checkedAt: now.toISOString(), summary: { ...summary, latestReceipt } }, { headers: { 'Cache-Control': 'no-store' } })
}
