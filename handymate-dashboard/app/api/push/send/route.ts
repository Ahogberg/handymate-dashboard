import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { verifyCronSecret } from '@/lib/cron/verify-secret'
import { sendExpoPushNotification } from '@/lib/notifications/expo-push'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push/send — Internal helper to send push notifications
 * Body: { business_id, title, body, url?, tag?, target_user_id? }
 *
 * This is an INTERNAL route — called by other API routes (approvals, crons).
 * Sends via BOTH web-push (all/targeted push_subscriptions) and Expo
 * (mobile app, push_tokens) — the two channels are independent; a missing/
 * unconfigured web-push setup never blocks the Expo/mobile send (P1-1/P1-2,
 * 2026-09-01).
 *
 * Etapp 4 (multi-employee-parity-plan.md): valfri `target_user_id` —
 * en auth-uuid som MÅSTE matcha vad push_subscriptions.user_id faktiskt
 * lagrar (satt i app/api/push/subscribe/route.ts). När den skickas med
 * riktas web-pushen mot bara den personens prenumerationer istället för
 * att blasta till hela businessen. Utelämnad = oförändrat beteende
 * (blast, som idag).
 *
 * Bugg fixad 2026-08-19: Expo/mobile-push (push_tokens,
 * lib/notifications/expo-push.ts) blastade tidigare ALLTID till hela
 * businessen oavsett target_user_id — push_tokens hade ingen per-user-
 * kolumn. push_tokens.user_id (sql/v159_push_tokens_user_id.sql) +
 * selectExpoTargets() gör nu Expo-leveransen target_user_id-medveten på
 * samma sätt som web-push, med fail-safe-blast (och en loggrad) när
 * target_user_id finns men ingen push_tokens-rad matchar den.
 */
export async function POST(request: NextRequest) {
  try {
    const { business_id, title, body, url, tag, target_user_id } = await request.json()

    if (!business_id || !title) {
      return NextResponse.json({ error: 'Missing business_id or title' }, { status: 400 })
    }

    // Auth (Etapp 0, 2026-08-27): rutten var helt öppen — vem som helst
    // kunde posta en push till valfritt business_id. Nu: intern signatur
    // (x-internal-secret = CRON_SECRET, se lib/notifications/push-internal.ts)
    // ELLER en inloggad session som tillhör business_id.
    const internalOk = verifyCronSecret(request)
    if (!internalOk) {
      const business = await getAuthenticatedBusiness(request)
      if (!business || business.business_id !== business_id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const supabase = getServerSupabase()

    // P1-2 (2026-09-01): Expo/mobile-push trådas nu FÖRE web-push-grenens
    // egna early-returns (saknad VAPID-konfig, inga push_subscriptions,
    // web-push-paketet ej installerat). Tidigare stoppade alla tre en
    // apputvecklares mobilpush bara för att businessen aldrig installerat
    // PWA:n — Expo har inget beroende av VAPID/web-push och ska aldrig
    // gatas av dem. Fire-and-forget pga serverless-kontext (oförändrat).
    const expoData: Record<string, unknown> = {
      url: url || '/dashboard',
      tag: tag || 'handymate',
    }
    sendExpoPushNotification(business_id, title, body || '', expoData, target_user_id)
      .catch((err: unknown) => {
        console.error('[push/send] Expo push error:', {
          business_id,
          title,
          error: err instanceof Error ? err.message : String(err),
        })
      })

    // Check if web-push is configured
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hello@handymate.se'

    if (!vapidPublicKey || !vapidPrivateKey) {
      // VAPID keys not configured yet — log and return success to not break callers
      console.warn('[push/send] VAPID keys not configured, skipping push notification')
      return NextResponse.json({ success: true, sent: 0, reason: 'vapid_not_configured' })
    }

    // Get all subscriptions for this business — riktad mot en enskild
    // person om target_user_id skickades med (Etapp 4), annars alla.
    let subscriptionsQuery = supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('business_id', business_id)

    if (target_user_id) {
      subscriptionsQuery = subscriptionsQuery.eq('user_id', target_user_id)
    }

    const { data: subscriptions, error } = await subscriptionsQuery

    if (error || !subscriptions?.length) {
      return NextResponse.json({ success: true, sent: 0 })
    }

    // Lazy-load web-push to avoid issues if not installed
    let webpush: typeof import('web-push')
    try {
      webpush = await import('web-push')
    } catch {
      console.warn('[push/send] web-push not installed')
      return NextResponse.json({ success: true, sent: 0, reason: 'web_push_not_installed' })
    }

    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    const payload = JSON.stringify({ title, body: body || '', url: url || '/dashboard', tag: tag || 'handymate' })

    let sent = 0
    const staleEndpoints: string[] = []

    await Promise.allSettled(
      subscriptions.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          )
          sent++
        } catch (err: any) {
          // 410 Gone = subscription expired
          if (err.statusCode === 410 || err.statusCode === 404) {
            staleEndpoints.push(sub.endpoint)
          }
        }
      })
    )

    // Clean up stale subscriptions
    if (staleEndpoints.length > 0) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .in('endpoint', staleEndpoints)
    }

    return NextResponse.json({ success: true, sent })
  } catch (error: any) {
    console.error('[push/send] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
