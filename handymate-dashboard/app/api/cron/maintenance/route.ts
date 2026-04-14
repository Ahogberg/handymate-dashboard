import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * GET /api/cron/maintenance
 * Daglig underhållskörning — konsoliderar expire-approvals + sync-phone-webhooks.
 * Körs 03:00 UTC via vercel.json cron.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const results: Record<string, any> = {}

  // ── 1. Expire old approvals ────────────────────────────────
  try {
    const { data, error } = await supabase
      .from('pending_approvals')
      .update({ status: 'expired' })
      .eq('status', 'pending')
      .neq('approval_type', 'scheduled_review_request') // Hanteras i steg 3
      .lt('expires_at', new Date().toISOString())
      .select('id')

    if (error) throw error
    results.expired_approvals = data?.length || 0
    console.log(`[maintenance] Expired ${results.expired_approvals} approvals`)
  } catch (err: any) {
    console.error('[maintenance] expire-approvals error:', err.message)
    results.expired_approvals_error = err.message
  }

  // ── 2. Sync 46elks phone webhooks ─────────────────────────
  try {
    const { data: numbers, error } = await supabase
      .from('business_config')
      .select('business_id, business_name, elks_number_id, assigned_phone_number')
      .not('elks_number_id', 'is', null)

    if (error) throw error

    if (!numbers || numbers.length === 0) {
      results.phone_sync = { synced: 0, message: 'No provisioned numbers' }
    } else {
      const elksAuth = 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64')
      const targetSmsUrl = `${APP_URL}/api/sms/incoming`
      const targetVoiceUrl = `${APP_URL}/api/voice/incoming`

      let synced = 0
      for (const biz of numbers) {
        try {
          const res = await fetch(`https://api.46elks.com/a1/numbers/${biz.elks_number_id}`, {
            method: 'POST',
            headers: {
              Authorization: elksAuth,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              sms_url: targetSmsUrl,
              voice_start: targetVoiceUrl,
            }).toString(),
          })
          if (res.ok) synced++
          else console.error(`[maintenance] phone sync FAIL: ${biz.assigned_phone_number}:`, await res.text())
        } catch (err: any) {
          console.error(`[maintenance] phone sync ERROR: ${biz.assigned_phone_number}:`, err.message)
        }
      }

      results.phone_sync = { synced, total: numbers.length }
      console.log(`[maintenance] Phone webhooks: ${synced}/${numbers.length} synced to ${APP_URL}`)
    }
  } catch (err: any) {
    console.error('[maintenance] sync-phone-webhooks error:', err.message)
    results.phone_sync_error = err.message
  }

  // ── 3. Skicka schemalagda recensionsförfrågningar ────────────
  try {
    const { data: dueReviews } = await supabase
      .from('pending_approvals')
      .select('id, business_id, payload')
      .eq('approval_type', 'scheduled_review_request')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    // Pre-fetch assigned_phone_number för alla berörda företag
    const reviewBizIds = Array.from(new Set((dueReviews || []).map((r: any) => r.business_id as string)))
    const reviewPhoneMap = new Map<string, string | null>()
    if (reviewBizIds.length > 0) {
      const { data: bizPhones } = await supabase
        .from('business_config')
        .select('business_id, assigned_phone_number')
        .in('business_id', reviewBizIds)
      for (const b of bizPhones || []) {
        reviewPhoneMap.set(b.business_id, b.assigned_phone_number)
      }
    }

    let reviewsSent = 0
    for (const review of dueReviews || []) {
      const p = review.payload as any
      if (!p?.customer_phone || !p?.google_review_url) {
        await supabase.from('pending_approvals').update({ status: 'expired' }).eq('id', review.id)
        continue
      }

      try {
        const firstName = (p.customer_name || '').split(' ')[0]
        const bizName = p.business_name || 'Handymate'
        const suffix = buildSmsSuffix(bizName, reviewPhoneMap.get(review.business_id))

        // Portal-länk istället för extern Google-URL — kunden landar i sin kundportal
        const { getOrCreatePortalLink } = await import('@/lib/portal-link')
        const portalUrl = p.customer_id
          ? await getOrCreatePortalLink(supabase, p.customer_id, 'review')
          : null
        const reviewLink = portalUrl || p.google_review_url

        const smsRes = await fetch('https://api.46elks.com/a1/sms', {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            from: bizName.substring(0, 11),
            to: p.customer_phone,
            message: `Hej${firstName ? ' ' + firstName : ''}! Tack igen för att du valde oss. Om du är nöjd skulle vi uppskatta en recension — det hjälper oss enormt! ${reviewLink}\n${suffix}`,
          }).toString(),
        })

        if (smsRes.ok) {
          reviewsSent++
          await supabase.from('pending_approvals').update({ status: 'approved' }).eq('id', review.id)
          await supabase.from('sms_log').insert({
            business_id: review.business_id,
            customer_id: p.customer_id,
            direction: 'outgoing',
            phone_number: p.customer_phone,
            message_type: 'review_request',
            related_id: p.invoice_id,
            status: 'sent',
          })
        } else {
          await supabase.from('pending_approvals').update({ status: 'expired' }).eq('id', review.id)
        }
      } catch {
        await supabase.from('pending_approvals').update({ status: 'expired' }).eq('id', review.id)
      }
    }

    results.reviews_sent = reviewsSent
    if (reviewsSent > 0) console.log(`[maintenance] Sent ${reviewsSent} review requests`)
  } catch (err: any) {
    console.error('[maintenance] review-request error:', err.message)
    results.reviews_error = err.message
  }

  return NextResponse.json({ ok: true, ...results })
}
