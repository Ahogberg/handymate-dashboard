import { NextRequest, NextResponse } from 'next/server'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { isAdmin } from '@/lib/admin-auth'
import { getServerSupabase } from '@/lib/supabase'
import { sendInternalPush } from '@/lib/notifications/push-internal'
import { PUSH_POLICY } from '@/lib/notifications/push-policy'
import { bokforPush } from '@/lib/notifications/push-dispatch-log'
import { hamtaHallna, markeraSlappta, type SlappUtfall } from '@/lib/notifications/push-held'
import {
  arTystTid,
  byggMorgonsammanfattning,
  delaUppHallna,
  grupperaPerMottagare,
  type HallenPush,
} from '@/lib/notifications/tyst-tid'

export const dynamic = 'force-dynamic'

/**
 * GET/POST /api/cron/push-morgon — släpper pushar som hölls under tyst tid
 * (lib/notifications/tyst-tid.ts, push_held sql/v197) som EN
 * morgonsammanfattning per mottagare.
 *
 * Schemalagd två gånger (05:10 och 06:10 UTC) så morgonen träffas 07:10
 * svensk tid både sommar (CEST) och vinter (CET): körningen som fortfarande
 * ligger inom tyst tid hoppar över, den andra släpper. En körning utan
 * hållna rader gör ingenting.
 *
 * Auth: cron-hemligheten (fail-closed) ELLER inloggad plattformsadmin
 * (manuell körning). ?force=1 (bara admin) släpper även under tyst tid —
 * för test, aldrig från schemat.
 */
export async function GET(request: NextRequest) {
  return korOmBehorig(request)
}

export async function POST(request: NextRequest) {
  return korOmBehorig(request)
}

async function korOmBehorig(request: NextRequest) {
  let admin = false
  if (!verifyCronSecret(request)) {
    const a = await isAdmin(request)
    if (!a.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    admin = true
  }
  const force = admin && request.nextUrl.searchParams.get('force') === '1'
  return slappHallna(force)
}

async function slappHallna(force: boolean) {
  const now = new Date()
  if (!force && arTystTid(now)) {
    return NextResponse.json({ success: true, skipped: 'tyst_tid', released: 0 })
  }

  const supabase = getServerSupabase()
  let rader: HallenPush[]
  try {
    rader = await hamtaHallna(supabase)
  } catch (err) {
    console.error('[push-morgon] kunde inte läsa hållna pushar:', err)
    return NextResponse.json({ error: 'push_held kunde inte läsas' }, { status: 500 })
  }

  const { skicka, utgangna } = delaUppHallna(rader, now)
  await markeraSlappta(supabase, utgangna.map(r => r.id), 'utgangen', now.toISOString())

  const utfall: Array<{ business_id: string; target_user_id: string | null; antal: number; utfall: SlappUtfall }> = []
  for (const grupp of Array.from(grupperaPerMottagare(skicka).values())) {
    const sammanfattning = byggMorgonsammanfattning(grupp)
    if (!sammanfattning) continue
    const { business_id, target_user_id } = grupp[0]
    const policy = PUSH_POLICY.teamuppdatering
    const result = await sendInternalPush({
      business_id,
      title: sammanfattning.title,
      body: sammanfattning.body,
      url: sammanfattning.url,
      tag: sammanfattning.tag,
      target_user_id,
      ttl_seconds: policy.ttlSeconds,
      priority: policy.priority,
    })
    const ingenMottagare = result.reason === 'no_recipients' || result.reason === 'no_matching_token'
    const slapp: SlappUtfall = result.delivered ? 'skickad' : ingenMottagare ? 'ingen_mottagare' : 'misslyckad'
    await markeraSlappta(supabase, grupp.map(r => r.id), slapp, now.toISOString())
    // Bokförs i push_dispatch_log som de enskilda pushar de var, så samma
    // händelse inte skickas igen inom sitt dedupefönster. "Ingen mottagare"
    // bokförs inte — samma regel som sendApprovalPush.
    if (!ingenMottagare) {
      for (const rad of grupp) {
        await bokforPush(supabase, {
          business_id: rad.business_id,
          dedupe_key: rad.dedupe_key,
          approval_type: rad.approval_type,
          push_class: rad.push_class,
          target_user_id: rad.target_user_id,
          delivered: result.delivered,
        })
      }
    }
    utfall.push({ business_id, target_user_id, antal: grupp.length, utfall: slapp })
  }

  return NextResponse.json({
    success: true,
    forced: force,
    held: rader.length,
    expired: utgangna.length,
    released: skicka.length,
    groups: utfall,
  })
}
