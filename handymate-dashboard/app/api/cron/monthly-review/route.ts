import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { generateMonthlyReview, buildMonthlyReviewSms } from '@/lib/matte/monthly-review'

export const maxDuration = 60

/**
 * GET /api/cron/monthly-review
 *   Cron: 1:a varje månad 07:00 — genererar rapport för föregående månad
 *   Verifierar x-cron-secret eller Bearer-token.
 *
 * POST /api/cron/monthly-review
 *   Manuell trigger från dashboard.
 *   Body: { business_id?: string, month?: "YYYY-MM-01" }
 */

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const cronSecret = request.headers.get('x-cron-secret') || ''
  const expected = process.env.CRON_SECRET

  if (!expected || (authHeader !== `Bearer ${expected}` && cronSecret !== expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data: businesses, error } = await supabase
    .from('business_config')
    .select('business_id, business_name, phone_number, assigned_phone_number')
    .eq('subscription_status', 'active')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const results: Array<{ business_id: string; ok: boolean; error?: string }> = []

  for (const biz of businesses || []) {
    try {
      const report = await generateMonthlyReview(supabase, biz.business_id)

      await supabase.from('monthly_reviews').upsert({
        business_id: biz.business_id,
        month: report.data.month,
        data: report.data,
        analysis: report.analysis,
        recommendations: report.recommendations,
        sent_at: new Date().toISOString(),
      }, { onConflict: 'business_id,month' })

      // Skicka SMS-notis till hantverkaren
      const smsTo = biz.phone_number
      if (smsTo && process.env.ELKS_API_USER && process.env.ELKS_API_PASSWORD) {
        const smsText = buildMonthlyReviewSms(report.data, report.recommendations.length)
        const from = (biz.business_name || 'Handymate').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 11)
        try {
          await fetch('https://api.46elks.com/a1/sms', {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + Buffer.from(`${process.env.ELKS_API_USER}:${process.env.ELKS_API_PASSWORD}`).toString('base64'),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ from, to: smsTo, message: smsText }).toString(),
          })
        } catch { /* non-blocking */ }
      }

      // Skapa pending_approval så rapporten dyker upp som notis
      await supabase.from('pending_approvals').insert({
        id: `mrev_${biz.business_id}_${report.data.month}`,
        business_id: biz.business_id,
        approval_type: 'monthly_review',
        title: `📊 Månadsrapport ${report.data.month_label}`,
        description: `${report.recommendations.length} rekommendation${report.recommendations.length === 1 ? '' : 'er'} väntar`,
        payload: { month: report.data.month, recommendations: report.recommendations.slice(0, 3) },
        status: 'pending',
        risk_level: 'low',
      })

      results.push({ business_id: biz.business_id, ok: true })
    } catch (err: any) {
      results.push({ business_id: biz.business_id, ok: false, error: err?.message || 'Okänt fel' })
    }
  }

  return NextResponse.json({ success: true, processed: results.length, results })
}

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const body = await request.json().catch(() => ({}))
  const businessId = body.business_id || business.business_id
  const monthDate = body.month ? new Date(body.month) : undefined

  try {
    const report = await generateMonthlyReview(supabase, businessId, monthDate)

    const { error } = await supabase.from('monthly_reviews').upsert({
      business_id: businessId,
      month: report.data.month,
      data: report.data,
      analysis: report.analysis,
      recommendations: report.recommendations,
      sent_at: null,
    }, { onConflict: 'business_id,month' })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      month: report.data.month,
      month_label: report.data.month_label,
      analysis: report.analysis,
      recommendations: report.recommendations,
      data: report.data,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Kunde inte generera rapport' }, { status: 500 })
  }
}
