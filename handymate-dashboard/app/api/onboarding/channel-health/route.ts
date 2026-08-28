import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { deriveChannelHealth } from '@/lib/onboarding/channel-health'
import type { ChannelProof } from '@/lib/onboarding/channel-health'
import type { TestCallState } from '@/lib/onboarding/test-call'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type DbError = { message?: string } | null

function newestIso(...values: Array<string | null | undefined>): string | null {
  let newest: { value: string; time: number } | null = null
  for (const value of values) {
    if (!value) continue
    const time = new Date(value).getTime()
    if (!Number.isFinite(time)) continue
    if (!newest || time > newest.time) newest = { value, time }
  }
  return newest?.value || null
}

function failOnReadError(errors: Array<{ area: string; error: DbError }>): NextResponse | null {
  const failed = errors.find(item => item.error)
  if (!failed) return null
  console.error(`[onboarding/channel-health] Kunde inte läsa ${failed.area}:`, failed.error)
  return NextResponse.json(
    { error: 'Kunde inte verifiera kundinflödets status' },
    { status: 500 },
  )
}

/**
 * GET /api/onboarding/channel-health
 *
 * Tenant-säker läsmodell för telefon, e-post och webb. Service-role används
 * bara efter auth och varje tabellfråga är explicit business_id-filtrerad.
 * Om ett nödvändigt bevis inte kan läsas svarar rutten med fel i stället för
 * att degradera till ett påhittat "inte aktiverat".
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
  }

  const businessId = business.business_id
  const supabase = getServerSupabase()

  const [
    configResult,
    emailRouteResult,
    gmailConnectionResult,
    gmailImportResult,
    storefrontResult,
    widgetConversationResult,
    emailDealResult,
    webDealResult,
  ] = await Promise.all([
    supabase
      .from('business_config')
      .select('assigned_phone_number, onboarding_data, widget_enabled, widget_last_seen_at')
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('email_inbound_route')
      .select('address, active, last_received_at, created_at')
      .eq('business_id', businessId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('calendar_connection')
      .select('gmail_scope_granted, gmail_lead_import_enabled, created_at')
      .eq('business_id', businessId)
      .eq('provider', 'google')
      .eq('gmail_scope_granted', true)
      .eq('gmail_lead_import_enabled', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('gmail_imported_message')
      .select('imported_at, lead_id, was_lead')
      .eq('business_id', businessId)
      .order('imported_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('storefront')
      .select('is_published')
      .eq('business_id', businessId)
      .maybeSingle(),
    supabase
      .from('widget_conversation')
      .select('created_at, updated_at')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('deal')
      .select('id, lead_id, source, created_at')
      .eq('business_id', businessId)
      .in('source', ['email_forward', 'email_lead'])
      .not('lead_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('deal')
      .select('id, lead_id, source, created_at')
      .eq('business_id', businessId)
      .eq('source', 'website_form')
      .not('lead_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const baseFailure = failOnReadError([
    { area: 'företagsinställningar', error: configResult.error },
    { area: 'inkommande e-post', error: emailRouteResult.error },
    { area: 'Gmail-koppling', error: gmailConnectionResult.error },
    { area: 'Gmail-bevis', error: gmailImportResult.error },
    { area: 'Handymate-sida', error: storefrontResult.error },
    { area: 'widgetbevis', error: widgetConversationResult.error },
    { area: 'e-postaffär', error: emailDealResult.error },
    { area: 'webbaffär', error: webDealResult.error },
  ])
  if (baseFailure) return baseFailure

  if (!configResult.data) {
    console.error(`[onboarding/channel-health] business_config saknas för ${businessId}`)
    return NextResponse.json({ error: 'Kunde inte läsa företagets inställningar' }, { status: 500 })
  }

  const onboardingData = (configResult.data.onboarding_data || {}) as Record<string, unknown>
  const testCall = (onboardingData.test_call || {}) as TestCallState

  // Testtelefonen måste bevisas mot de exakta id:n som testflödet skrev.
  // Ett annat lead i företaget får aldrig råka göra testet grönt.
  const phoneDealPromise = testCall.deal_id && testCall.lead_id
    ? supabase
        .from('deal')
        .select('id, lead_id, created_at')
        .eq('business_id', businessId)
        .eq('id', testCall.deal_id)
        .eq('lead_id', testCall.lead_id)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null })

  const emailLeadId = emailDealResult.data?.lead_id || null
  const webLeadId = webDealResult.data?.lead_id || null
  const leadIds = Array.from(new Set([
    testCall.lead_id || null,
    emailLeadId,
    webLeadId,
  ].filter((id): id is string => typeof id === 'string' && id.length > 0)))

  const leadsPromise = leadIds.length > 0
    ? supabase
        .from('leads')
        .select('lead_id, source, created_at')
        .eq('business_id', businessId)
        .in('lead_id', leadIds)
    : Promise.resolve({ data: [], error: null })

  const [phoneDealResult, leadsResult] = await Promise.all([phoneDealPromise, leadsPromise])
  const proofFailure = failOnReadError([
    { area: 'provsamtalets affär', error: phoneDealResult.error },
    { area: 'leadbevis', error: leadsResult.error },
  ])
  if (proofFailure) return proofFailure

  const verifiedLeadIds = new Set((leadsResult.data || []).map(row => row.lead_id))
  const phoneLeadExists = Boolean(testCall.lead_id && verifiedLeadIds.has(testCall.lead_id))
  const phoneDealExists = Boolean(phoneDealResult.data)
  const emailLeadExists = Boolean(emailLeadId && verifiedLeadIds.has(emailLeadId))
  const emailDealExists = Boolean(emailDealResult.data)
  const webLeadExists = Boolean(webLeadId && verifiedLeadIds.has(webLeadId))
  const webDealExists = Boolean(webDealResult.data)

  const emailReceivedAt = newestIso(
    emailRouteResult.data?.last_received_at,
    gmailImportResult.data?.imported_at,
  )
  const emailProof: ChannelProof | null = emailReceivedAt ? 'email_received' : null

  const widgetConversationAt = newestIso(
    widgetConversationResult.data?.updated_at,
    widgetConversationResult.data?.created_at,
  )
  const widgetSeenAt = configResult.data.widget_enabled
    ? newestIso(widgetConversationAt, configResult.data.widget_last_seen_at)
    : null
  const widgetProof: ChannelProof | null = widgetSeenAt
    ? widgetConversationAt === widgetSeenAt
      ? 'widget_conversation'
      : 'widget_loaded'
    : null

  const channels = [
    deriveChannelHealth('phone', {
      enabled: Boolean(configResult.data.assigned_phone_number),
      channel_verified_at: testCall.called_at || null,
      channel_proof: testCall.called_at ? 'call_received' : null,
      lead_exists: phoneLeadExists,
      deal_exists: phoneDealExists,
      lead_verified_at: phoneDealResult.data?.created_at || null,
    }),
    deriveChannelHealth('email', {
      enabled: Boolean(emailRouteResult.data || gmailConnectionResult.data),
      channel_verified_at: emailReceivedAt,
      channel_proof: emailProof,
      lead_exists: emailLeadExists,
      deal_exists: emailDealExists,
      lead_verified_at: emailDealResult.data?.created_at || null,
    }),
    deriveChannelHealth('web', {
      enabled: Boolean(configResult.data.widget_enabled || storefrontResult.data?.is_published),
      channel_verified_at: widgetSeenAt,
      channel_proof: webLeadExists && webDealExists ? 'web_form_received' : widgetProof,
      lead_exists: webLeadExists,
      deal_exists: webDealExists,
      lead_verified_at: webDealResult.data?.created_at || null,
    }),
  ]

  return NextResponse.json({
    channels,
    any_channel_verified: channels.some(channel =>
      channel.state === 'channel_verified' || channel.state === 'lead_verified'),
    any_lead_verified: channels.some(channel => channel.state === 'lead_verified'),
  })
}
