import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const ELKS_API_USER = process.env.ELKS_API_USER!
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://handymate-dashboard.vercel.app'

/**
 * GET /api/cron/sync-phone-webhooks
 *
 * Runs on every deploy (via Vercel cron) to ensure all provisioned 46elks
 * numbers have sms_url and voice_start pointing to the current APP_URL.
 * This fixes numbers that were provisioned with an old or incorrect URL.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const elksAuth = 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64')
  const targetSmsUrl = `${APP_URL}/api/sms/incoming`
  const targetVoiceUrl = `${APP_URL}/api/voice/incoming`

  // Fetch all businesses with a provisioned 46elks number
  const { data: numbers, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, elks_number_id, assigned_phone_number')
    .not('elks_number_id', 'is', null)

  if (error) {
    console.error('[sync-phone-webhooks] DB error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!numbers || numbers.length === 0) {
    return NextResponse.json({ ok: true, synced: 0, message: 'No provisioned numbers' })
  }

  const results: { number: string; status: 'ok' | 'error'; detail?: string }[] = []

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

      if (res.ok) {
        console.log(`[sync-phone-webhooks] OK: ${biz.assigned_phone_number} (${biz.business_name})`)
        results.push({ number: biz.assigned_phone_number, status: 'ok' })
      } else {
        const text = await res.text()
        console.error(`[sync-phone-webhooks] FAIL: ${biz.assigned_phone_number}:`, text)
        results.push({ number: biz.assigned_phone_number, status: 'error', detail: text })
      }
    } catch (err: any) {
      console.error(`[sync-phone-webhooks] ERROR: ${biz.assigned_phone_number}:`, err.message)
      results.push({ number: biz.assigned_phone_number, status: 'error', detail: err.message })
    }
  }

  const synced = results.filter(r => r.status === 'ok').length
  console.log(`[sync-phone-webhooks] Done: ${synced}/${numbers.length} synced to ${APP_URL}`)

  return NextResponse.json({
    ok: true,
    synced,
    total: numbers.length,
    app_url: APP_URL,
    results,
  })
}
