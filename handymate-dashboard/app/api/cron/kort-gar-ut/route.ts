import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { getServerSupabase } from '@/lib/supabase'
import { sendInternalPush } from '@/lib/notifications/push-internal'
import { nyligenSkickad, bokforPush } from '@/lib/notifications/push-dispatch-log'
import { PUSH_POLICY } from '@/lib/notifications/push-policy'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * GET /api/cron/kort-gar-ut
 *
 * Pass B, del 2 (docs/audits/AUTOPILOT_REVISION_2026-09-04.md, avsnitt 2 —
 * "Arbetet försvinner, korten går ut i tysthet"): en enda push dagen innan
 * ett väntande kort går ut, så kunden hinner ta ställning innan
 * maintenance-cronen (03:00 UTC) sätter det till 'expired'.
 *
 * Körs en gång per dag (Vercel Hobby: max en körning/dag). Plan-utkastet
 * föreslog samma minut som communication-check (0 16 * * *) — det kolliderar
 * med en befintlig rad i vercel.json, så den här rutten ligger i stället på
 * 30 16 * * * (avvikelse, se rapport).
 *
 * Ett konto får HÖGST en push per dygn, oavsett hur många kort som går ut —
 * dedupe via push_dispatch_log (sql/v191) med nyckeln
 * `kort_gar_ut:<business_id>:<datum>` (samma helpers som sendApprovalPush
 * och push-morgon redan använder: nyligenSkickad/bokforPush).
 */
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const now = new Date()
  const om24h = new Date(now.getTime() + 24 * 3600_000).toISOString()
  const om48h = new Date(now.getTime() + 48 * 3600_000).toISOString()

  const { data: kort, error } = await supabase
    .from('pending_approvals')
    .select('id, business_id')
    .eq('status', 'pending')
    .gte('expires_at', om24h)
    .lt('expires_at', om48h)

  if (error) {
    console.error('[cron/kort-gar-ut] kunde inte läsa pending_approvals:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const perKonto = new Map<string, number>()
  for (const rad of kort || []) {
    perKonto.set(rad.business_id, (perKonto.get(rad.business_id) || 0) + 1)
  }

  if (perKonto.size === 0) {
    return NextResponse.json({ ok: true, konton: 0, resultat: [] })
  }

  // Pausade agenter ska vara tysta — samma spärr som karin-deadlines m.fl.
  const { data: bizRows, error: bizErr } = await supabase
    .from('business_config')
    .select('business_id, agents_globally_paused')
    .in('business_id', Array.from(perKonto.keys()))
  if (bizErr) console.error('[cron/kort-gar-ut] business_config-uppslag misslyckades (fortsätter oskyddat):', bizErr.message)
  const pausade = new Set((bizRows || []).filter(r => r.agents_globally_paused === true).map(r => r.business_id))

  const datum = now.toISOString().slice(0, 10)
  const policy = PUSH_POLICY.beslut
  const resultat: Array<{ business_id: string; antal: number; utfall: string }> = []

  for (const [businessId, antal] of Array.from(perKonto)) {
    if (pausade.has(businessId)) {
      resultat.push({ business_id: businessId, antal, utfall: 'pausad' })
      continue
    }

    const dedupeKey = `kort_gar_ut:${businessId}:${datum}`
    if (await nyligenSkickad(supabase, businessId, dedupeKey, policy.dedupeWindowSeconds)) {
      resultat.push({ business_id: businessId, antal, utfall: 'dedupe' })
      continue
    }

    const res = await sendInternalPush({
      business_id: businessId,
      title: `${antal} förslag går ut i morgon`,
      body: 'Öppna Handymate för att ta ställning.',
      url: '/dashboard/approvals',
      ttl_seconds: policy.ttlSeconds,
      priority: policy.priority,
    })

    const ingenMottagare = res.reason === 'no_recipients' || res.reason === 'no_matching_token'
    // "Ingen mottagare" bokförs inte — samma regel som sendApprovalPush och
    // push-morgon, så morgondagens försök inte spärras av dagens miss.
    if (!ingenMottagare) {
      await bokforPush(supabase, {
        business_id: businessId,
        dedupe_key: dedupeKey,
        approval_type: 'kort_gar_ut',
        push_class: policy.klass,
        target_user_id: null,
        delivered: res.delivered,
      })
    }
    resultat.push({
      business_id: businessId,
      antal,
      utfall: res.delivered ? 'skickad' : ingenMottagare ? 'ingen_mottagare' : 'misslyckad',
    })
  }

  return NextResponse.json({ ok: true, konton: perKonto.size, resultat })
}
