import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { sendExpoPushNotification } from '@/lib/notifications/expo-push'

export const dynamic = 'force-dynamic'

/**
 * POST /api/push/send — Internal helper to send push notifications
 * Body: { business_id, title, body, url?, tag? }
 *
 * This is an INTERNAL route — called by other API routes (approvals, crons).
 * It uses web-push to send to all subscriptions for the business.
 */
export async function POST(request: NextRequest) {
  try {
    const { business_id, title, body, url, tag } = await request.json()

    if (!business_id || !title) {
      return NextResponse.json({ error: 'Missing business_id or title' }, { status: 400 })
    }

    // Check if web-push is configured
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hello@handymate.se'

    if (!vapidPublicKey || !vapidPrivateKey) {
      // VAPID keys not configured yet — log and return success to not break callers
      console.warn('[push/send] VAPID keys not configured, skipping push notification')
      return NextResponse.json({ success: true, sent: 0, reason: 'vapid_not_configured' })
    }

    const supabase = getServerSupabase()

    // Get all subscriptions for this business
    const { data: subscriptions, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('business_id', business_id)

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

    // Also send to Expo (mobile app) — fire and forget
    sendExpoPushNotification(business_id, title, body || '').catch(() => {})

    return NextResponse.json({ success: true, sent })
  } catch (error: any) {
    console.error('[push/send] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
