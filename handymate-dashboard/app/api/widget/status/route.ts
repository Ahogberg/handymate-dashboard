import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

type WidgetState = 'not_enabled' | 'enabled_unverified' | 'installed' | 'tested' | 'lead_verified'

const LABELS: Record<WidgetState, string> = {
  not_enabled: 'Inte aktiverad',
  enabled_unverified: 'Aktiverad, ännu inte verifierad',
  installed: 'Installerad',
  tested: 'Testad',
  lead_verified: 'Lead verifierad',
}

/**
 * GET /api/widget/status — autentiserad, tenant-säker sanningsmodell.
 *
 * Prioritet: avstängd → lead+affär → konversation → loader sedd → aktiverad.
 * En flagga kan alltså aldrig ensam ge ett starkare påstående än aktiverad.
 * select('*') på business_config är medvetet: koden fail-softar före v178 i
 * stället för att en explicit, ännu okörd kolumnlista ger 500.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Inte inloggad' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data: config, error: configError } = await supabase
    .from('business_config')
    .select('*')
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (configError || !config) {
    console.error('[widget/status] Kunde inte läsa företagsinställningar:', configError)
    return NextResponse.json({ error: 'Kunde inte läsa widgetens status' }, { status: 500 })
  }

  const [{ data: latestConversation, error: conversationError }, { data: latestVerified, error: verifiedError }] = await Promise.all([
    supabase
      .from('widget_conversation')
      .select('created_at, updated_at')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('widget_conversation')
      .select('created_at, updated_at')
      .eq('business_id', business.business_id)
      .eq('lead_created', true)
      .not('deal_id', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (conversationError || verifiedError) {
    console.error('[widget/status] Kunde inte läsa widgetbevis:', conversationError || verifiedError)
    return NextResponse.json({ error: 'Kunde inte verifiera widgetens status' }, { status: 500 })
  }

  const lastSeenAt = typeof config.widget_last_seen_at === 'string' ? config.widget_last_seen_at : null
  const lastSeenHost = typeof config.widget_last_seen_host === 'string' ? config.widget_last_seen_host : null
  const lastTestedAt = latestConversation?.updated_at || latestConversation?.created_at || null
  const leadVerifiedAt = latestVerified?.updated_at || latestVerified?.created_at || null

  let state: WidgetState
  if (!config.widget_enabled) state = 'not_enabled'
  else if (latestVerified) state = 'lead_verified'
  else if (latestConversation) state = 'tested'
  else if (lastSeenAt) state = 'installed'
  else state = 'enabled_unverified'

  return NextResponse.json({
    state,
    label: LABELS[state],
    last_seen_at: lastSeenAt,
    last_seen_host: lastSeenHost,
    last_tested_at: lastTestedAt,
    lead_verified_at: leadVerifiedAt,
  })
}
